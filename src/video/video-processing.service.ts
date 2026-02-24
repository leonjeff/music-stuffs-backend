import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ─── Interfaces públicas ───────────────────────────────────────────────────────

export interface VideoMetadata {
  /** Duración en milisegundos — precisión de milisegundos */
  durationMs: number;
  /** Duración en segundos con decimales (= durationMs / 1000) */
  durationSeconds: number;
  resolution: string;
  hasAudio: boolean;
  audioSampleRate: number | null;
  audioChannels: number | null;
}

export interface WaveformResult {
  /** Archivo principal: 'waveform.json' (cortos) o 'waveform-high.json' (>1 h) */
  waveformFile: string;
  /** Solo presente en videos > LONG_VIDEO_THRESHOLD_SECONDS */
  waveformLowFile?: string;
}

export interface ProcessedMetadata {
  videoId: string;
  originalFilename: string;
  durationMs: number;
  durationSeconds: number;
  resolution: string;
  hasAudio: boolean;
  audio: {
    sampleRate: 44100;
    channels: 2;
    bitDepth: 16;
    format: 'PCM';
  } | null;
  processedAt: string;
}

// ─── Constantes ────────────────────────────────────────────────────────────────

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

/** Videos > 1 hora generan waveform dual-res para optimizar la UI */
const LONG_VIDEO_THRESHOLD_SECONDS = 3_600;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  // ─── Metadata ──────────────────────────────────────────────────────────────

  /**
   * Extrae metadata del video con precisión de milisegundos.
   * Usa `format.duration` de ffprobe (mayor precisión que stream.duration).
   */
  async getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        inputPath,
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data: Buffer) => { output += data.toString(); });

      ffprobe.on('close', (code: number) => {
        if (code !== 0) {
          return reject(new Error(`ffprobe terminó con código ${code}`));
        }

        try {
          const info = JSON.parse(output) as {
            streams: {
              codec_type: string;
              duration?: string;
              width?: number;
              height?: number;
              sample_rate?: string;
              channels?: number;
            }[];
            format: { duration?: string };
          };

          const videoStream = info.streams.find((s) => s.codec_type === 'video');
          if (!videoStream) {
            return reject(new Error('No se encontró stream de video'));
          }

          const audioStream = info.streams.find((s) => s.codec_type === 'audio');

          // format.duration tiene mayor precisión que stream.duration
          const rawDuration = parseFloat(
            info.format.duration ?? videoStream.duration ?? '0',
          );

          if (!rawDuration || rawDuration <= 0) {
            return reject(new Error('Duración inválida — el archivo puede estar corrupto'));
          }

          resolve({
            durationMs: Math.round(rawDuration * 1000),
            durationSeconds: rawDuration,
            resolution: `${videoStream.width ?? 0}x${videoStream.height ?? 0}`,
            hasAudio: !!audioStream,
            audioSampleRate: audioStream?.sample_rate
              ? parseInt(audioStream.sample_rate, 10)
              : null,
            audioChannels: audioStream?.channels ?? null,
          });
        } catch (err) {
          reject(new Error(`Error parseando ffprobe: ${(err as Error).message}`));
        }
      });
    });
  }

  // ─── HLS (multi-quality) ──────────────────────────────────────────────────

  /**
   * Genera HLS VOD multi-bitrate en estructura flat (sin subdirectorios).
   *
   * Resoluciones generadas según el alto del video fuente:
   *   - fuente ≥ 1080p → 1080p + 720p + 480p
   *   - fuente ≥  720p →         720p + 480p
   *   - fuente <  720p →                480p  (mínimo)
   *
   * Estructura de salida:
   *   {outputDir}/index.m3u8          ← master playlist
   *   {outputDir}/1080p.m3u8          ← variant playlists
   *   {outputDir}/720p.m3u8
   *   {outputDir}/480p.m3u8
   *   {outputDir}/1080p_segment_000.ts ← segmentos flat (sin subdirectorios)
   *   {outputDir}/720p_segment_000.ts
   *   {outputDir}/480p_segment_000.ts
   *
   * Segmentos flat: evita el problema donde FFmpeg escribe solo el basename
   * en la playlist, causando 404 cuando los segmentos estaban en subdirectorios.
   */
  async processToHLS(
    inputPath: string,
    outputDir: string,
    metadata: VideoMetadata,
  ): Promise<void> {
    const srcHeight = parseInt(metadata.resolution.split('x')[1], 10);

    let renditions = RENDITIONS.filter((r) => r.height <= srcHeight);
    if (renditions.length === 0) {
      renditions = [RENDITIONS[RENDITIONS.length - 1]]; // mínimo: 480p
    }

    this.logger.log(
      `HLS → ${renditions.map((r) => r.name).join(', ')} | ` +
      `${(metadata.durationMs / 1000).toFixed(3)}s | audio=${metadata.hasAudio}`,
    );

    const count     = renditions.length;
    const splitTags = renditions.map((_, i) => `[v${i}]`).join('');
    const scales    = renditions.map((r, i) => `[v${i}]scale=-2:${r.height}[v${i}out]`).join(';');
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
      '-profile:v', 'high',
      '-level', '4.1',
      '-preset', 'fast',
      '-g', '48',           // GOP consistente — crítico para loop sample-accurate
      '-keyint_min', '48',
      '-sc_threshold', '0', // sin cortes por escena
      ...(metadata.hasAudio ? ['-c:a', 'aac', '-ar', '44100', '-ac', '2'] : []),
      ...streamSettings,
      '-var_stream_map', varStreamMap,
      '-master_pl_name', 'index.m3u8',
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_playlist_type', 'vod',
      '-hls_list_size', '0',
      // Segmentos flat: {rendition}_segment_NNN.ts en el mismo directorio que las playlists
      // FFmpeg escribe en la playlist solo el basename → el player lo resuelve correctamente
      '-hls_segment_filename', path.join(outputDir, '%v_segment_%03d.ts'),
      path.join(outputDir, '%v.m3u8'),
    ];

    return this.runFFmpeg(args, 'HLS');
  }

  // ─── Audio WAV ─────────────────────────────────────────────────────────────

  /**
   * Extrae audio como PCM sin compresión — material base para DAW / Web Audio API.
   *
   * Especificaciones:
   *   Codec     : pcm_s16le (PCM 16-bit signed little-endian)
   *   Sample rate: 44 100 Hz
   *   Canales   : 2 (estéreo)
   *
   * Por qué estéreo:
   *   - Permite procesar canales L/R de forma independiente en el frontend
   *   - Pitch shifting sample-accurate con AudioContext.decodeAudioData()
   *   - Sincronización exacta con el stream HLS (mismo sample rate / layout)
   */
  async extractAudio(inputPath: string, outputDir: string): Promise<void> {
    const args = [
      '-i', inputPath,
      '-vn',                  // descarta stream de video
      '-acodec', 'pcm_s16le', // PCM 16-bit
      '-ar', '44100',         // 44.1 kHz
      '-ac', '2',             // estéreo
      path.join(outputDir, 'audio.wav'),
    ];

    return this.runFFmpeg(args, 'extractAudio');
  }

  // ─── Metadata JSON ─────────────────────────────────────────────────────────

  /**
   * Genera `metadata.json` con la información técnica del video.
   *
   * El frontend usa este archivo para inicializar el reproductor
   * (AudioContext sample rate, duración exacta para loops, etc.)
   * sin necesidad de requests adicionales a la API.
   */
  async generateMetadataFile(
    videoId: string,
    outputDir: string,
    metadata: VideoMetadata,
    originalFilename: string,
  ): Promise<void> {
    const data: ProcessedMetadata = {
      videoId,
      originalFilename,
      durationMs: metadata.durationMs,
      durationSeconds: metadata.durationSeconds,
      resolution: metadata.resolution,
      hasAudio: metadata.hasAudio,
      audio: metadata.hasAudio
        ? { sampleRate: 44100, channels: 2, bitDepth: 16, format: 'PCM' }
        : null,
      processedAt: new Date().toISOString(),
    };

    await fs.promises.writeFile(
      path.join(outputDir, 'metadata.json'),
      JSON.stringify(data, null, 2),
      'utf8',
    );

    this.logger.log(`metadata.json generado para video ${videoId}`);
  }

  // ─── Thumbnail ─────────────────────────────────────────────────────────────

  /** Captura un frame a los 2 s como thumbnail JPEG (preview en la UI). */
  async generateThumbnail(inputPath: string, outputDir: string): Promise<void> {
    const args = [
      '-i', inputPath,
      '-ss', '00:00:02',
      '-vframes', '1',
      path.join(outputDir, 'thumbnail.jpg'),
    ];
    return this.runFFmpeg(args, 'thumbnail');
  }

  // ─── Waveform ──────────────────────────────────────────────────────────────

  /**
   * Calcula samples_per_pixel para dos niveles de resolución.
   *
   * Objetivo: número de puntos constante independientemente de la duración.
   *   low  → ~5 000 pts  (overview del timeline, ~5–8 KB JSON)
   *   high → ~20 000 pts (zoom/detalle, ~20–30 KB JSON)
   *
   * Los valores se aproximan al siguiente poder de 2 (óptimo para audiowaveform).
   */
  static calculateSamplesPerPixel(durationSeconds: number): { low: number; high: number } {
    const SAMPLE_RATE = 44_100;
    const LOW_TARGET_POINTS  = 5_000;
    const HIGH_TARGET_POINTS = 20_000;
    const MIN_SPP = 256;

    const toCeilPow2 = (n: number): number =>
      Math.max(MIN_SPP, Math.pow(2, Math.ceil(Math.log2(Math.max(n, MIN_SPP)))));

    return {
      low:  toCeilPow2((durationSeconds * SAMPLE_RATE) / LOW_TARGET_POINTS),
      high: toCeilPow2((durationSeconds * SAMPLE_RATE) / HIGH_TARGET_POINTS),
    };
  }

  /**
   * Genera waveform(s) decimados adaptados a la duración.
   *
   * - ≤ 3 600 s → `waveform.json`                              (un archivo)
   * - > 3 600 s → `waveform-low.json` + `waveform-high.json`   (dual-res)
   *
   * Los archivos se generan secuencialmente para evitar picos de memoria
   * en videos de 1–3 horas.
   *
   * Nota: audiowaveform mezcla el WAV estéreo a mono internamente.
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
        ? `Waveform dual-res [${durationSeconds.toFixed(3)}s] spp.low=${spp.low} spp.high=${spp.high}`
        : `Waveform single-res [${durationSeconds.toFixed(3)}s] spp=${spp.high}`,
    );

    if (isLong) {
      // Secuencial — evita dos procesos audiowaveform compitiendo por RAM
      await this.runAudiowaveform(audioPath, path.join(outputDir, 'waveform-low.json'),  spp.low);
      await this.runAudiowaveform(audioPath, path.join(outputDir, 'waveform-high.json'), spp.high);
      return { waveformFile: 'waveform-high.json', waveformLowFile: 'waveform-low.json' };
    }

    await this.runAudiowaveform(audioPath, path.join(outputDir, 'waveform.json'), spp.high);
    return { waveformFile: 'waveform.json' };
  }

  // ─── Limpieza ──────────────────────────────────────────────────────────────

  async cleanup(outputDir: string): Promise<void> {
    try {
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
        this.logger.log(`Directorio eliminado: ${outputDir}`);
      }
    } catch (err) {
      this.logger.warn(`No se pudo limpiar ${outputDir}: ${(err as Error).message}`);
    }
  }

  // ─── Helpers privados ──────────────────────────────────────────────────────

  private runFFmpeg(args: string[], label: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let stderr = '';
      const proc = spawn('ffmpeg', args);

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        this.logger.verbose(`FFmpeg [${label}]: ${data}`);
      });

      proc.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(
            `FFmpeg [${label}] terminó con código ${code}: ${stderr.slice(-400)}`,
          ));
        }
      });
    });
  }

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
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(
            `audiowaveform falló (spp=${samplesPerPixel}, código=${code}): ${stderr.slice(-300)}`,
          ));
        }
      });
    });
  }
}
