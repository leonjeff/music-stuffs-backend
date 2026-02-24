import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface VideoMetadata {
  duration: number;
  resolution: string;
  hasAudio: boolean;
}

export interface WaveformResult {
  /** Nombre del archivo primario: 'waveform.json' o 'waveform-high.json' */
  waveformFile: string;
  /** Solo presente para videos > LONG_VIDEO_THRESHOLD_SECONDS */
  waveformLowFile?: string;
}

interface Rendition {
  name: string;
  height: number;
  videoBitrate: string;
  maxrate: string;
  bufsize: string;
  audioBitrate: string;
}

const RENDITIONS: Rendition[] = [
  { name: '1080p', height: 1080, videoBitrate: '5000k', maxrate: '5350k', bufsize: '7500k', audioBitrate: '192k' },
  { name: '720p',  height: 720,  videoBitrate: '2800k', maxrate: '2996k', bufsize: '4200k', audioBitrate: '128k' },
  { name: '480p',  height: 480,  videoBitrate: '1400k', maxrate: '1498k', bufsize: '2100k', audioBitrate: '128k' },
];

/** Umbral a partir del cual se generan dos waveforms (low + high) */
const LONG_VIDEO_THRESHOLD_SECONDS = 3_600;

@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  // ─── Metadata ────────────────────────────────────────────────────────────────

  async getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        inputPath,
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      ffprobe.on('close', (code: number) => {
        if (code !== 0) return reject(new Error(`ffprobe exited with code ${code}`));
        try {
          const info = JSON.parse(output) as {
            streams: { codec_type: string; duration?: string; width?: number; height?: number }[];
          };
          const videoStream = info.streams.find((s) => s.codec_type === 'video');
          if (!videoStream) return reject(new Error('No se encontró stream de video'));
          resolve({
            duration: Math.round(parseFloat(videoStream.duration ?? '0')),
            resolution: `${videoStream.width}x${videoStream.height}`,
            hasAudio: info.streams.some((s) => s.codec_type === 'audio'),
          });
        } catch (err) {
          reject(new Error(`Error parseando ffprobe: ${(err as Error).message}`));
        }
      });
    });
  }

  // ─── HLS ─────────────────────────────────────────────────────────────────────

  async processToMultiHLS(
    inputPath: string,
    outputDir: string,
    metadata: VideoMetadata,
  ): Promise<void> {
    const srcHeight = parseInt(metadata.resolution.split('x')[1], 10);

    let renditions = RENDITIONS.filter((r) => r.height <= srcHeight);
    if (renditions.length === 0) {
      renditions = [RENDITIONS[RENDITIONS.length - 1]];
    }

    this.logger.log(
      `Generando ${renditions.length} rendición(es): ${renditions.map((r) => r.name).join(', ')}`,
    );

    await fs.promises.mkdir(outputDir, { recursive: true });

    const count = renditions.length;
    const splitTags = renditions.map((_, i) => `[v${i}]`).join('');
    const scales = renditions.map((r, i) => `[v${i}]scale=-2:${r.height}[v${i}out]`).join(';');
    const filterComplex = `[0:v]split=${count}${splitTags};${scales}`;

    const maps: string[] = [];
    renditions.forEach((_, i) => {
      maps.push('-map', `[v${i}out]`);
      if (metadata.hasAudio) maps.push('-map', '0:a');
    });

    const streamSettings: string[] = [];
    renditions.forEach((r, i) => {
      streamSettings.push(
        `-b:v:${i}`, r.videoBitrate,
        `-maxrate:v:${i}`, r.maxrate,
        `-bufsize:v:${i}`, r.bufsize,
      );
      if (metadata.hasAudio) streamSettings.push(`-b:a:${i}`, r.audioBitrate);
    });

    const varStreamMap = renditions
      .map((r, i) =>
        metadata.hasAudio ? `v:${i},a:${i},name:${r.name}` : `v:${i},name:${r.name}`,
      )
      .join(' ');

    const args = [
      '-i', inputPath,
      '-filter_complex', filterComplex,
      ...maps,
      '-c:v', 'libx264',
      '-profile:v', 'main',
      '-crf', '23',
      '-g', '48',
      '-keyint_min', '48',
      '-sc_threshold', '0',
      ...(metadata.hasAudio ? ['-c:a', 'aac', '-ar', '44100', '-ac', '2'] : []),
      ...streamSettings,
      '-var_stream_map', varStreamMap,
      '-master_pl_name', 'master.m3u8',
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_playlist_type', 'vod',
      '-hls_list_size', '0',
      '-hls_segment_filename', path.join(outputDir, '%v_seg_%03d.ts'),
      path.join(outputDir, '%v.m3u8'),
    ];

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', args);
      ffmpeg.stderr.on('data', (data: Buffer) => {
        this.logger.verbose(`FFmpeg: ${data}`);
      });
      ffmpeg.on('close', (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
    });
  }

  // ─── Audio ───────────────────────────────────────────────────────────────────

  async extractAudio(inputPath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        // MP3 estéreo — para descarga/reproducción
        '-vn', '-acodec', 'libmp3lame', '-q:a', '2',
        path.join(outputDir, 'audio.mp3'),
        // WAV mono 16-bit 44.1kHz — requerido por audiowaveform
        '-vn', '-acodec', 'pcm_s16le', '-ar', '44100', '-ac', '1',
        path.join(outputDir, 'audio.wav'),
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        this.logger.verbose(`FFmpeg audio: ${data}`);
      });

      ffmpeg.on('close', (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(
          `FFmpeg audio extraction falló (código=${code}): ${stderr.slice(-300)}`,
        ));
      });
    });
  }

  // ─── Thumbnail ───────────────────────────────────────────────────────────────

  async generateThumbnail(inputPath: string, outputDir: string): Promise<void> {
    const thumbnailPath = path.join(outputDir, 'thumbnail.jpg');

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-ss', '00:00:02',
        '-vframes', '1',
        thumbnailPath,
      ]);

      ffmpeg.stderr.on('data', (data: Buffer) => {
        this.logger.verbose(`FFmpeg thumbnail: ${data}`);
      });

      ffmpeg.on('close', (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg thumbnail falló con código ${code}`));
      });
    });
  }

  // ─── Waveform ────────────────────────────────────────────────────────────────

  /**
   * Calcula el samples_per_pixel óptimo para dos niveles de resolución.
   *
   * Estrategia: mantener un número de puntos objetivo independiente de la duración
   * para que el JSON resultante tenga siempre un tamaño predecible.
   *
   * - low  → ~5 000 puntos  (overview del timeline, ~5–8 KB JSON)
   * - high → ~20 000 puntos (detalle/zoom,          ~20–30 KB JSON)
   *
   * Los valores se redondean al siguiente poder de 2 (audiowaveform más eficiente).
   *
   * Mejora futura: ajustar LOW/HIGH_TARGET_POINTS según el ancho del viewport
   * del frontend para evitar puntos innecesarios.
   */
  static calculateSamplesPerPixel(durationSeconds: number): { low: number; high: number } {
    const SAMPLE_RATE = 44_100;
    const LOW_TARGET_POINTS = 5_000;
    const HIGH_TARGET_POINTS = 20_000;
    const MIN_SPP = 256;

    // Ceil al siguiente poder de 2 → garantiza tamaño ≤ target
    const toCeilPow2 = (n: number): number =>
      Math.max(MIN_SPP, Math.pow(2, Math.ceil(Math.log2(Math.max(n, MIN_SPP)))));

    return {
      low:  toCeilPow2((durationSeconds * SAMPLE_RATE) / LOW_TARGET_POINTS),
      high: toCeilPow2((durationSeconds * SAMPLE_RATE) / HIGH_TARGET_POINTS),
    };
  }

  /**
   * Genera waveform(s) adaptados a la duración del video.
   *
   * - duración ≤ 3600s → un solo archivo: waveform.json
   * - duración > 3600s → dos archivos:
   *     waveform-low.json   (overview, muy ligero)
   *     waveform-high.json  (detalle para zoom)
   *
   * Los dos archivos se generan secuencialmente para evitar
   * picos de memoria en videos de 1–3 horas.
   */
  async generateOptimizedWaveform(
    audioPath: string,
    outputDir: string,
    durationSeconds: number,
  ): Promise<WaveformResult> {
    const spp = VideoProcessingService.calculateSamplesPerPixel(durationSeconds);
    const isLong = durationSeconds > LONG_VIDEO_THRESHOLD_SECONDS;

    this.logger.log(
      isLong
        ? `Waveform dual-res [${durationSeconds}s] → spp.low=${spp.low}, spp.high=${spp.high}`
        : `Waveform single-res [${durationSeconds}s] → spp=${spp.high}`,
    );

    if (isLong) {
      // Secuencial — evita dos procesos audiowaveform compitiendo por memoria
      await this.runAudiowaveform(audioPath, path.join(outputDir, 'waveform-low.json'),  spp.low);
      await this.runAudiowaveform(audioPath, path.join(outputDir, 'waveform-high.json'), spp.high);
      return { waveformFile: 'waveform-high.json', waveformLowFile: 'waveform-low.json' };
    }

    await this.runAudiowaveform(audioPath, path.join(outputDir, 'waveform.json'), spp.high);
    return { waveformFile: 'waveform.json' };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private runAudiowaveform(
    inputPath: string,
    outputPath: string,
    samplesPerPixel: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let stderr = '';
      const proc = spawn('audiowaveform', [
        '-i', inputPath,
        '-o', outputPath,
        '--zoom', String(samplesPerPixel),
        '--bits', '8',
      ]);

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        this.logger.verbose(`audiowaveform [spp=${samplesPerPixel}]: ${data}`);
      });

      proc.on('close', (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(
          `audiowaveform falló (spp=${samplesPerPixel}, código=${code}): ${stderr.slice(-300)}`,
        ));
      });
    });
  }

  async cleanup(outputDir: string): Promise<void> {
    try {
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
        this.logger.log(`Directorio limpiado: ${outputDir}`);
      }
    } catch (err) {
      this.logger.warn(`No se pudo limpiar ${outputDir}: ${(err as Error).message}`);
    }
  }
}
