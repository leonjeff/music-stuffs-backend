import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { spawn } from 'child_process';

export interface ProcessVariantOptions {
  pitchShift: number; // semitonos enteros
  tempo: number;      // multiplicador 0.5..2.0
}

export interface ProcessVariantResult {
  engine: 'rubberband' | 'asetrate';
}

const SAMPLE_RATE = 44_100;

@Injectable()
export class AudioProcessingService implements OnModuleInit {
  private readonly logger = new Logger(AudioProcessingService.name);
  private rubberbandAvailable = false;

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    this.rubberbandAvailable = await this.checkRubberbandAvailable();
    this.logger.log(
      this.rubberbandAvailable
        ? 'Motor de procesamiento: arubberband (alta calidad, preserva formantes)'
        : 'Motor de procesamiento: asetrate (fallback FFmpeg puro)',
    );
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  /**
   * Genera el nombre de archivo canónico para una variante.
   * Ejemplos:
   *   pitch+2_tempo0.75.wav
   *   pitch-3.wav
   *   tempo1.5.wav
   */
  static buildFilename(pitchShift: number, tempo: number): string {
    const parts: string[] = [];
    if (pitchShift !== 0) {
      parts.push(`pitch${pitchShift > 0 ? '+' : ''}${pitchShift}`);
    }
    if (tempo !== 1.0) {
      parts.push(`tempo${tempo}`);
    }
    return `${parts.join('_')}.wav`;
  }

  /**
   * Aplica pitch shift y/o cambio de tempo al archivo WAV de entrada.
   * No es destructivo: el archivo original no se modifica.
   */
  async processVariant(
    inputPath: string,
    outputPath: string,
    options: ProcessVariantOptions,
  ): Promise<ProcessVariantResult> {
    const engine = this.rubberbandAvailable ? 'rubberband' : 'asetrate';
    const filter = this.buildFilterChain(options.pitchShift, options.tempo, engine);

    this.logger.debug(
      `Generando variante [${engine}] pitch=${options.pitchShift}st, tempo=${options.tempo}x → filter: ${filter}`,
    );

    await this.runFfmpegFilter(inputPath, outputPath, filter);
    return { engine };
  }

  /**
   * Construye la cadena de filtros FFmpeg para los parámetros dados.
   * Expuesto para facilitar testing unitario.
   */
  buildFilterChain(
    pitchShift: number,
    tempo: number,
    engine: 'rubberband' | 'asetrate',
  ): string {
    return engine === 'rubberband'
      ? this.buildRubberbandFilter(pitchShift, tempo)
      : this.buildAsetrateFilter(pitchShift, tempo);
  }

  // ─── Filter builders ─────────────────────────────────────────────────────────

  /**
   * arubberband — alta calidad, preserva formantes vocales.
   * Requiere FFmpeg compilado con librubberband.
   *
   * pitch  = 2^(semitones/12)  (ratio lineal de frecuencia)
   * tempo  = multiplicador directo de velocidad (1.0 = normal, 2.0 = doble)
   */
  private buildRubberbandFilter(pitchShift: number, tempo: number): string {
    const pitchRatio = Math.pow(2, pitchShift / 12);
    const parts: string[] = [];
    if (pitchShift !== 0) parts.push(`pitch=${pitchRatio.toFixed(6)}`);
    if (tempo !== 1.0)    parts.push(`tempo=${tempo.toFixed(6)}`);
    return `arubberband=${parts.join(':')}`;
  }

  /**
   * Implementación asetrate+aresample+atempo — solo FFmpeg puro.
   *
   * Técnica de pitch shift sin rubberband:
   *  1. asetrate=44100*P  — reinterpreta las muestras a tasa P×44100.
   *                         Efecto: pitch sube P× PERO también velocidad P×.
   *  2. aresample=44100   — reconvierte a 44100 Hz (preserva el pitch ya cambiado).
   *  3. atempo=tempo/P    — corrige la velocidad no deseada de asetrate
   *                         y aplica el tempo deseado de forma neta.
   *
   * Limitación: atempo solo acepta 0.5..2.0.
   * Para valores fuera de rango se encadenan múltiples filtros atempo.
   */
  private buildAsetrateFilter(pitchShift: number, tempo: number): string {
    const filters: string[] = [];

    if (pitchShift !== 0) {
      const pitchRatio = Math.pow(2, pitchShift / 12);
      filters.push(
        `asetrate=${Math.round(SAMPLE_RATE * pitchRatio)}`,
        `aresample=${SAMPLE_RATE}`,
      );
      // La velocidad después de asetrate+aresample es pitchRatio×.
      // Para lograr la velocidad final deseada (tempo), ajustamos:
      const atempoRatio = tempo / pitchRatio;
      filters.push(...this.buildAtempoChain(atempoRatio));
    } else {
      filters.push(...this.buildAtempoChain(tempo));
    }

    return filters.join(',');
  }

  /**
   * Genera una cadena de filtros atempo que cubre cualquier ratio,
   * incluyendo valores fuera del rango nativo 0.5..2.0 de FFmpeg.
   *
   * Para ratio=4.0 → ['atempo=2.0', 'atempo=2.0']         (2×2=4)
   * Para ratio=0.25→ ['atempo=0.5', 'atempo=0.5']         (0.5×0.5=0.25)
   * Para ratio=1.0 → ['atempo=1.0']                        (no-op explícito)
   */
  private buildAtempoChain(ratio: number): string[] {
    const filters: string[] = [];
    let remaining = ratio;

    while (remaining > 2.0 + 1e-9) {
      filters.push('atempo=2.0');
      remaining /= 2.0;
    }
    while (remaining < 0.5 - 1e-9) {
      filters.push('atempo=0.5');
      remaining *= 2.0;
    }
    // Agregar el residuo solo si es significativo (evita atempo=1.000000)
    if (Math.abs(remaining - 1.0) > 1e-6) {
      filters.push(`atempo=${remaining.toFixed(6)}`);
    }

    return filters.length > 0 ? filters : ['atempo=1.0'];
  }

  // ─── FFmpeg runner ────────────────────────────────────────────────────────────

  private runFfmpegFilter(
    inputPath: string,
    outputPath: string,
    filter: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let stderr = '';

      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-af', filter,
        '-acodec', 'pcm_s16le', // WAV sin pérdida, compatible con Web Audio API
        '-ar', String(SAMPLE_RATE),
        '-ac', '1',             // mono — consistente con audio.wav del pipeline
        '-y',                   // sobreescribir si existe
        outputPath,
      ]);

      ffmpeg.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        this.logger.verbose(`FFmpeg variant: ${data}`);
      });

      ffmpeg.on('close', (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg variant falló (código=${code}): ${stderr.slice(-400)}`));
      });

      ffmpeg.on('error', (err: Error) => reject(err));
    });
  }

  // ─── Rubberband detection ─────────────────────────────────────────────────────

  private checkRubberbandAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      let output = '';
      const ffmpeg = spawn('ffmpeg', ['-filters']);
      ffmpeg.stdout.on('data', (d: Buffer) => (output += d.toString()));
      ffmpeg.stderr.on('data', (d: Buffer) => (output += d.toString()));
      ffmpeg.on('close', () => resolve(output.includes('arubberband')));
      ffmpeg.on('error', () => resolve(false));
    });
  }
}
