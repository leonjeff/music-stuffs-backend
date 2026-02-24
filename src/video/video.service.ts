import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Video } from './entities/video.entity';
import { VideoProcessingService, WaveformResult } from './video-processing.service';

const ALLOWED_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/x-matroska'];
const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.mkv'];
const DEFAULT_MAX_SIZE = 500 * 1024 * 1024; // 500 MB
const MAX_PROCESSING_ATTEMPTS = 3;

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly videoProcessingService: VideoProcessingService,
    private readonly configService: ConfigService,
  ) {}

  async handleUpload(file: Express.Multer.File, teacherId?: string) {
    this.validateFile(file);

    const safeFilename = path.basename(file.originalname);
    const tempPath = await this.saveTemp(file, safeFilename);

    const video = await this.videoRepository.save({
      status: 'processing' as const,
      originalFilename: safeFilename,
      size: file.size,
      mimeType: file.mimetype,
      createdBy: teacherId,
    });

    this.logger.log(`Video ${video.id} recibido, iniciando procesamiento`);

    // Fire-and-forget — reemplazar con BullMQ en producción
    void this.processInBackground(video.id, tempPath);

    return { id: video.id };
  }

  async findById(id: string) {
    return this.videoRepository.findOneByOrFail({ id });
  }

  async getStatus(id: string) {
    const video = await this.videoRepository.findOneByOrFail({ id });
    return {
      id: video.id,
      status: video.status,
      hlsPath: video.hlsPath,
      thumbnailPath: video.thumbnailPath,
      audioMp3Path: video.audioMp3Path,
      audioWavPath: video.audioWavPath,
      waveformPath: video.waveformPath,
      waveformLowPath: video.waveformLowPath,
      duration: video.duration,
      resolution: video.resolution,
      processingAttempts: video.processingAttempts,
    };
  }

  async getWaveformFile(id: string, resolution: 'high' | 'low'): Promise<StreamableFile> {
    const video = await this.videoRepository.findOneByOrFail({ id });

    if (video.status !== 'ready') {
      throw new BadRequestException(`Video no disponible (estado: ${video.status})`);
    }

    const relativePath = resolution === 'low' ? video.waveformLowPath : video.waveformPath;

    if (!relativePath) {
      throw new NotFoundException(
        resolution === 'low'
          ? 'Waveform low-res no disponible (el video puede ser menor a 1 hora)'
          : 'Waveform no disponible',
      );
    }

    const baseDir = this.configService.get<string>('VIDEO_BASE_DIR') ?? 'videos';
    const fullPath = path.join(baseDir, relativePath);

    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException(`Archivo waveform no encontrado en disco: ${relativePath}`);
    }

    return new StreamableFile(fs.createReadStream(fullPath), {
      type: 'application/json',
      disposition: 'inline',
    });
  }

  async getStream(id: string): Promise<StreamableFile> {
    const video = await this.videoRepository.findOneByOrFail({ id });

    if (video.status !== 'ready') {
      throw new BadRequestException(`Video no disponible (estado: ${video.status})`);
    }

    const baseDir = this.configService.get<string>('VIDEO_BASE_DIR') ?? 'videos';
    const fullPath = path.join(baseDir, video.hlsPath);

    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Archivo HLS no encontrado en disco');
    }

    return new StreamableFile(fs.createReadStream(fullPath), {
      type: 'application/vnd.apple.mpegurl',
      disposition: 'inline',
    });
  }

  private validateFile(file: Express.Multer.File): void {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo MIME no permitido: ${file.mimetype}. Permitidos: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `Extensión no permitida: ${ext}. Permitidas: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }

    const maxSize = Number(this.configService.get('MAX_FILE_SIZE')) || DEFAULT_MAX_SIZE;
    if (file.size > maxSize) {
      throw new BadRequestException(
        `Archivo demasiado grande: ${(file.size / 1024 / 1024).toFixed(1)} MB (máximo: ${(maxSize / 1024 / 1024).toFixed(0)} MB)`,
      );
    }
  }

  private async processInBackground(videoId: string, tempPath: string): Promise<void> {
    // 6️ Bloquear re-procesamiento accidental
    const video = await this.videoRepository.findOneBy({ id: videoId });
    if (!video || video.status !== 'processing') {
      this.logger.warn(`Video ${videoId} no está en estado 'processing', abortando`);
      return;
    }

    // 5️ Verificar límite de intentos
    if (video.processingAttempts >= MAX_PROCESSING_ATTEMPTS) {
      this.logger.error(`Video ${videoId} alcanzó el máximo de ${MAX_PROCESSING_ATTEMPTS} intentos`);
      await this.videoRepository.update(videoId, { status: 'failed' });
      return;
    }

    await this.videoRepository.update(videoId, {
      processingAttempts: video.processingAttempts + 1,
    });

    const baseDir = this.configService.get<string>('VIDEO_BASE_DIR') ?? 'videos';

    // 1️ Crear carpeta base si no existe
    await fs.promises.mkdir(baseDir, { recursive: true });

    const outputDir = path.join(baseDir, videoId);

    try {
      // 7️ Detectar corrupción — validar metadata antes de procesar
      const metadata = await this.videoProcessingService.getVideoMetadata(tempPath);

      if (!metadata.duration || !metadata.resolution || metadata.resolution.includes('undefined')) {
        throw new Error('Metadata inválida — el archivo puede estar corrupto');
      }

      this.logger.log(
        `Video ${videoId} (intento ${video.processingAttempts + 1}) — duración: ${metadata.duration}s, resolución: ${metadata.resolution}`,
      );

      await this.videoProcessingService.processToMultiHLS(tempPath, outputDir, metadata);

      // 2️ Verificar que master.m3u8 realmente se creó
      const playlistPath = path.join(outputDir, 'master.m3u8');
      if (!fs.existsSync(playlistPath)) {
        throw new Error('master.m3u8 no fue generado por FFmpeg');
      }

      await this.videoProcessingService.generateThumbnail(tempPath, outputDir);

      let waveformResult: WaveformResult | null = null;

      if (metadata.hasAudio) {
        await this.videoProcessingService.extractAudio(tempPath, outputDir);

        const audioWavPath = path.join(outputDir, 'audio.wav');
        if (!fs.existsSync(audioWavPath)) {
          throw new Error('audio.wav no fue generado por FFmpeg');
        }

        waveformResult = await this.videoProcessingService.generateOptimizedWaveform(
          audioWavPath,
          outputDir,
          metadata.duration,
        );

        if (!fs.existsSync(path.join(outputDir, waveformResult.waveformFile))) {
          throw new Error(`${waveformResult.waveformFile} no fue generado por audiowaveform`);
        }
        if (waveformResult.waveformLowFile && !fs.existsSync(path.join(outputDir, waveformResult.waveformLowFile))) {
          throw new Error(`${waveformResult.waveformLowFile} no fue generado por audiowaveform`);
        }

        this.logger.log(`Video ${videoId} — waveform generado`);
      }

      await this.videoRepository.update(videoId, {
        status: 'ready',
        // 3️ Rutas relativas — el frontend construye la URL pública
        hlsPath: `${videoId}/master.m3u8`,
        thumbnailPath: `${videoId}/thumbnail.jpg`,
        audioMp3Path: metadata.hasAudio ? `${videoId}/audio.mp3` : undefined,
        audioWavPath: metadata.hasAudio ? `${videoId}/audio.wav` : undefined,
        waveformPath: waveformResult ? `${videoId}/${waveformResult.waveformFile}` : undefined,
        waveformLowPath: waveformResult?.waveformLowFile ? `${videoId}/${waveformResult.waveformLowFile}` : undefined,
        duration: metadata.duration,
        resolution: metadata.resolution,
      });

      this.logger.log(`Video ${videoId} procesado correctamente`);
    } catch (err) {
      this.logger.error(
        `Error procesando video ${videoId} (intento ${video.processingAttempts + 1}): ${(err as Error).message}`,
        (err as Error).stack,
      );
      await this.videoRepository.update(videoId, { status: 'failed' });
      await this.videoProcessingService.cleanup(outputDir);
    } finally {
      fs.unlink(tempPath, (err) => {
        if (err) this.logger.warn(`No se pudo eliminar temp ${tempPath}: ${(err as Error).message}`);
      });
    }
  }

  private async saveTemp(file: Express.Multer.File, safeFilename: string): Promise<string> {
    const ext = path.extname(safeFilename).toLowerCase() || '.mp4';
    const tempPath = path.join(
      os.tmpdir(),
      `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
    );
    await fs.promises.writeFile(tempPath, file.buffer);
    return tempPath;
  }
}
