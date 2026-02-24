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
const DEFAULT_MAX_SIZE    = 500 * 1024 * 1024; // 500 MB
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

  // ─── Upload ────────────────────────────────────────────────────────────────

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

    this.logger.log(`Video ${video.id} recibido — iniciando procesamiento`);

    // Fire-and-forget — reemplazar con BullMQ en producción
    void this.processInBackground(video.id, tempPath);

    return { id: video.id };
  }

  // ─── Consultas ────────────────────────────────────────────────────────────

  async findById(id: string) {
    return this.videoRepository.findOneByOrFail({ id });
  }

  async getStatus(id: string) {
    const video = await this.videoRepository.findOneByOrFail({ id });
    return {
      id:                  video.id,
      status:              video.status,
      originalFilename:    video.originalFilename,
      durationMs:          video.durationMs,
      durationSeconds:     video.duration,
      resolution:          video.resolution,
      hlsPath:             video.hlsPath,
      audioWavPath:        video.audioWavPath,
      waveformPath:        video.waveformPath,
      waveformLowPath:     video.waveformLowPath,
      metadataPath:        video.metadataPath,
      thumbnailPath:       video.thumbnailPath,
      processingAttempts:  video.processingAttempts,
    };
  }

  // ─── Streaming de archivos ─────────────────────────────────────────────────

  /** Devuelve el WAV sin compresión — para pitch shifting en el frontend */
  async getAudioFile(id: string): Promise<StreamableFile> {
    const video = await this.videoRepository.findOneByOrFail({ id });

    if (video.status !== 'ready') {
      throw new BadRequestException(`Video no disponible (estado: ${video.status})`);
    }
    if (!video.audioWavPath) {
      throw new NotFoundException('Audio WAV no disponible para este video');
    }

    const fullPath = this.resolveMediaPath(video.audioWavPath);
    this.assertFileExists(fullPath, video.audioWavPath);

    return new StreamableFile(fs.createReadStream(fullPath), {
      type: 'audio/wav',
      disposition: 'inline',
    });
  }

  /** Devuelve el waveform JSON (high-res o low-res para videos >1 h) */
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

    const fullPath = this.resolveMediaPath(relativePath);
    this.assertFileExists(fullPath, relativePath);

    return new StreamableFile(fs.createReadStream(fullPath), {
      type: 'application/json',
      disposition: 'inline',
    });
  }

  /** Devuelve el master playlist HLS */
  async getStream(id: string): Promise<StreamableFile> {
    const video = await this.videoRepository.findOneByOrFail({ id });

    if (video.status !== 'ready') {
      throw new BadRequestException(`Video no disponible (estado: ${video.status})`);
    }
    if (!video.hlsPath) {
      throw new NotFoundException('Playlist HLS no disponible');
    }

    const fullPath = this.resolveMediaPath(video.hlsPath);
    this.assertFileExists(fullPath, video.hlsPath);

    return new StreamableFile(fs.createReadStream(fullPath), {
      type: 'application/vnd.apple.mpegurl',
      disposition: 'inline',
    });
  }

  // ─── Procesamiento en background ──────────────────────────────────────────

  private async processInBackground(videoId: string, tempPath: string): Promise<void> {
    const video = await this.videoRepository.findOneBy({ id: videoId });
    if (!video || video.status !== 'processing') {
      this.logger.warn(`Video ${videoId} no está en estado 'processing' — abortando`);
      return;
    }

    if (video.processingAttempts >= MAX_PROCESSING_ATTEMPTS) {
      this.logger.error(`Video ${videoId} alcanzó el límite de ${MAX_PROCESSING_ATTEMPTS} intentos`);
      await this.videoRepository.update(videoId, { status: 'failed' });
      return;
    }

    await this.videoRepository.update(videoId, {
      processingAttempts: video.processingAttempts + 1,
    });

    const baseDir   = this.configService.get<string>('VIDEO_BASE_DIR') ?? '/tmp/music-stuffs/videos';
    const outputDir = path.join(baseDir, videoId);

    try {
      // 1. Crear directorio de salida
      await fs.promises.mkdir(outputDir, { recursive: true });

      // 2. Extraer y validar metadata (precisión de milisegundos)
      const metadata = await this.videoProcessingService.getVideoMetadata(tempPath);

      this.logger.log(
        `Video ${videoId} (intento ${video.processingAttempts + 1}) ` +
        `— ${metadata.durationMs} ms | ${metadata.resolution} | audio=${metadata.hasAudio}`,
      );

      // 3. Generar HLS (single-quality, flat — sin subdirectorios)
      await this.videoProcessingService.processToHLS(tempPath, outputDir, metadata);

      if (!fs.existsSync(path.join(outputDir, 'index.m3u8'))) {
        throw new Error('index.m3u8 no fue generado por FFmpeg');
      }

      // 4. Thumbnail
      await this.videoProcessingService.generateThumbnail(tempPath, outputDir);

      // 5. Audio WAV (PCM, 44.1 kHz, 16-bit, estéreo) + Waveform
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
          metadata.durationSeconds,
        );

        if (!fs.existsSync(path.join(outputDir, waveformResult.waveformFile))) {
          throw new Error(`${waveformResult.waveformFile} no fue generado por audiowaveform`);
        }
        if (
          waveformResult.waveformLowFile &&
          !fs.existsSync(path.join(outputDir, waveformResult.waveformLowFile))
        ) {
          throw new Error(`${waveformResult.waveformLowFile} no fue generado por audiowaveform`);
        }
      }

      // 6. metadata.json — información técnica para el frontend
      await this.videoProcessingService.generateMetadataFile(
        videoId,
        outputDir,
        metadata,
        video.originalFilename,
      );

      // 7. Persistir rutas relativas en BD
      await this.videoRepository.update(videoId, {
        status:          'ready',
        durationMs:      metadata.durationMs,
        duration:        Math.round(metadata.durationSeconds),
        resolution:      metadata.resolution,
        hlsPath:         `${videoId}/index.m3u8`,
        thumbnailPath:   `${videoId}/thumbnail.jpg`,
        metadataPath:    `${videoId}/metadata.json`,
        audioWavPath:    metadata.hasAudio ? `${videoId}/audio.wav` : undefined,
        waveformPath:    waveformResult    ? `${videoId}/${waveformResult.waveformFile}` : undefined,
        waveformLowPath: waveformResult?.waveformLowFile
          ? `${videoId}/${waveformResult.waveformLowFile}`
          : undefined,
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

  // ─── Helpers ───────────────────────────────────────────────────────────────

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
        `Archivo demasiado grande: ${(file.size / 1024 / 1024).toFixed(1)} MB ` +
        `(máximo: ${(maxSize / 1024 / 1024).toFixed(0)} MB)`,
      );
    }
  }

  private async saveTemp(file: Express.Multer.File, safeFilename: string): Promise<string> {
    const ext      = path.extname(safeFilename).toLowerCase() || '.mp4';
    const tempPath = path.join(
      os.tmpdir(),
      `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
    );
    await fs.promises.writeFile(tempPath, file.buffer);
    return tempPath;
  }

  private resolveMediaPath(relativePath: string): string {
    const baseDir = this.configService.get<string>('VIDEO_BASE_DIR') ?? '/tmp/music-stuffs/videos';
    return path.join(baseDir, relativePath);
  }

  private assertFileExists(fullPath: string, label: string): void {
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException(`Archivo no encontrado en disco: ${label}`);
    }
  }
}
