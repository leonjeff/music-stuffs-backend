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
import { AudioVariant } from './entities/audio-variant.entity';
import { AudioProcessingService } from './audio-processing.service';
import { GenerateVariantDto } from './dto/generate-variant.dto';
import { Video } from '../video/entities/video.entity';

@Injectable()
export class AudioVariantService {
  private readonly logger = new Logger(AudioVariantService.name);

  constructor(
    @InjectRepository(AudioVariant)
    private readonly variantRepo: Repository<AudioVariant>,
    @InjectRepository(Video)
    private readonly videoRepo: Repository<Video>,
    private readonly audioProcessingService: AudioProcessingService,
    private readonly configService: ConfigService,
  ) {}

  // ─── generateVariant ─────────────────────────────────────────────────────────

  /**
   * Devuelve una variante existente (caché) o inicia su generación en background.
   *
   * Estrategia de caché:
   *  - ready    → devuelve inmediatamente sin reprocesar.
   *  - processing → devuelve el registro; el cliente debe hacer polling.
   *  - failed   → reintenta el procesamiento desde cero.
   *  - (nueva)  → crea el registro y lanza procesamiento async.
   */
  async generateVariant(videoId: string, dto: GenerateVariantDto): Promise<AudioVariant> {
    if (dto.pitchShift === 0 && dto.tempo === 1.0) {
      throw new BadRequestException(
        'pitchShift=0 y tempo=1.0 no requieren procesamiento; usa el audio original.',
      );
    }

    // Normalizar tempo a 2 decimales para garantizar unicidad en la clave compuesta
    const tempo = parseFloat(dto.tempo.toFixed(2));
    const { pitchShift } = dto;

    // ── Buscar en caché ──────────────────────────────────────────────────────
    const existing = await this.variantRepo.findOne({
      where: { videoId, pitchShift, tempo },
    });

    if (existing) {
      if (existing.status === 'ready') {
        this.logger.debug(`Cache hit: variante ${existing.id} (pitch=${pitchShift}, tempo=${tempo})`);
        return existing;
      }

      if (existing.status === 'processing') {
        this.logger.debug(`Variante ${existing.id} ya está en procesamiento`);
        return existing;
      }

      // status === 'failed': reintentar
      this.logger.warn(`Reintentando variante fallida ${existing.id}`);
      await this.variantRepo.update(existing.id, {
        status: 'processing',
        errorMessage: null,
        processingEngine: null,
        filePath: null,
      });
      void this.processAsync(existing.id, videoId, pitchShift, tempo);
      return { ...existing, status: 'processing', filePath: null };
    }

    // ── Validar video ────────────────────────────────────────────────────────
    const video = await this.videoRepo.findOneBy({ id: videoId });
    if (!video) throw new NotFoundException(`Video ${videoId} no encontrado`);
    if (video.status !== 'ready') {
      throw new BadRequestException(
        `El video no está listo para procesar (estado: ${video.status})`,
      );
    }
    if (!video.audioWavPath) {
      throw new BadRequestException('El video no tiene pista de audio (fue grabado sin audio)');
    }

    // ── Crear registro y lanzar en background ────────────────────────────────
    const variant = await this.variantRepo.save({
      videoId,
      pitchShift,
      tempo,
      status: 'processing' as const,
      filePath: null,
      processingEngine: null,
      errorMessage: null,
    });

    this.logger.log(
      `Nueva variante ${variant.id}: pitch=${pitchShift}st, tempo=${tempo}x para video ${videoId}`,
    );

    void this.processAsync(variant.id, videoId, pitchShift, tempo);

    return variant;
  }

  // ─── Consultas ────────────────────────────────────────────────────────────────

  async findByVideo(videoId: string): Promise<AudioVariant[]> {
    return this.variantRepo.find({
      where: { videoId },
      order: { pitchShift: 'ASC', tempo: 'ASC' },
    });
  }

  async findById(id: string): Promise<AudioVariant> {
    return this.variantRepo.findOneByOrFail({ id });
  }

  // ─── Stream ───────────────────────────────────────────────────────────────────

  async streamVariant(id: string): Promise<StreamableFile> {
    const variant = await this.variantRepo.findOneByOrFail({ id });

    if (variant.status !== 'ready') {
      throw new BadRequestException(
        `La variante no está disponible para streaming (estado: ${variant.status})`,
      );
    }

    const baseDir = this.configService.get<string>('VIDEO_BASE_DIR') ?? 'videos';
    const fullPath = path.join(baseDir, variant.filePath!);

    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Archivo de variante no encontrado en disco');
    }

    return new StreamableFile(fs.createReadStream(fullPath), {
      type: 'audio/wav',
      disposition: `inline; filename="${path.basename(fullPath)}"`,
    });
  }

  // ─── Procesamiento async ──────────────────────────────────────────────────────

  /**
   * Ejecuta el procesamiento FFmpeg en background (fire-and-forget).
   * Actualiza el registro en BD al completar o fallar.
   *
   * TODO producción: reemplazar por un job BullMQ para:
   *   - reintentos automáticos con backoff
   *   - limitación de concurrencia (evitar saturar CPU con muchos jobs)
   *   - visibilidad en dashboard
   */
  private async processAsync(
    variantId: string,
    videoId: string,
    pitchShift: number,
    tempo: number,
  ): Promise<void> {
    const baseDir = this.configService.get<string>('VIDEO_BASE_DIR') ?? 'videos';

    // Re-leer video para obtener ruta de audio actualizada
    const video = await this.videoRepo.findOneBy({ id: videoId });
    if (!video?.audioWavPath) {
      await this.variantRepo.update(variantId, {
        status: 'failed',
        errorMessage: 'audio.wav no disponible para este video',
      });
      return;
    }

    const audioWavPath = path.join(baseDir, video.audioWavPath);

    if (!fs.existsSync(audioWavPath)) {
      await this.variantRepo.update(variantId, {
        status: 'failed',
        errorMessage: `Archivo audio.wav no encontrado: ${video.audioWavPath}`,
      });
      return;
    }

    const filename = AudioProcessingService.buildFilename(pitchShift, tempo);
    const processedDir = path.join(baseDir, videoId, 'processed');
    const outputPath = path.join(processedDir, filename);
    const relativeFilePath = path.join(videoId, 'processed', filename);

    try {
      await fs.promises.mkdir(processedDir, { recursive: true });

      const { engine } = await this.audioProcessingService.processVariant(
        audioWavPath,
        outputPath,
        { pitchShift, tempo },
      );

      await this.variantRepo.update(variantId, {
        status: 'ready',
        filePath: relativeFilePath,
        processingEngine: engine,
      });

      this.logger.log(
        `Variante ${variantId} lista [${engine}]: ${filename}`,
      );
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Error generando variante ${variantId}: ${message}`);
      await this.variantRepo.update(variantId, {
        status: 'failed',
        errorMessage: message,
      });
    }
  }
}
