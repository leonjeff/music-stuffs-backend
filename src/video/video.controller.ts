import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VideoService } from './video.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('videos')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  // ─── Upload ────────────────────────────────────────────────────────────────

  @Post('upload')
  @Roles('teacher', 'admin')
  @UseInterceptors(FileInterceptor('file'))
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') teacherId: string,
  ) {
    return this.videoService.handleUpload(file, teacherId);
  }

  // ─── Estado ────────────────────────────────────────────────────────────────

  /**
   * Devuelve el estado de procesamiento y todas las rutas de archivos.
   * Incluye durationMs para loop sample-accurate en el frontend.
   *
   * GET /videos/:id/status
   */
  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    return this.videoService.getStatus(id);
  }

  // ─── Audio ─────────────────────────────────────────────────────────────────

  /**
   * Devuelve el archivo WAV sin compresión para procesamiento en el frontend.
   * (PCM 16-bit, 44.1 kHz, estéreo)
   *
   * Usar para: pitch shifting, transpose, análisis espectral, Web Audio API.
   * El backend NO aplica ninguna transformación — el audio es el original.
   *
   * GET /videos/:id/audio
   */
  @Get(':id/audio')
  @Header('Accept-Ranges', 'bytes')
  async getAudio(@Param('id') id: string) {
    return this.videoService.getAudioFile(id);
  }

  // ─── Waveform ──────────────────────────────────────────────────────────────

  /**
   * Devuelve el waveform JSON decimado (high-res).
   * Para videos > 1 hora, este es el waveform de detalle/zoom.
   *
   * GET /videos/:id/waveform
   */
  @Get(':id/waveform')
  async getWaveform(@Param('id') id: string) {
    return this.videoService.getWaveformFile(id, 'high');
  }

  /**
   * Devuelve el waveform low-res (overview).
   * Solo disponible en videos > 1 hora.
   *
   * GET /videos/:id/waveform/low
   */
  @Get(':id/waveform/low')
  async getWaveformLow(@Param('id') id: string) {
    return this.videoService.getWaveformFile(id, 'low');
  }

  // ─── HLS stream (para reproductores que no usan /media directamente) ───────

  /**
   * Devuelve el master playlist HLS como StreamableFile.
   * Alternativa a acceder directamente a {{mediaUrl}}/:id/index.m3u8.
   *
   * GET /videos/:id/stream
   */
  @Get(':id/stream')
  async getStream(@Param('id') id: string) {
    return this.videoService.getStream(id);
  }
}
