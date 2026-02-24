import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * Representa una versión procesada del audio original de un video.
 *
 * La combinación (videoId, pitchShift, tempo) es única: si el cliente
 * solicita la misma variante dos veces se devuelve la existente (caché).
 *
 * Rutas guardadas como relativas al VIDEO_BASE_DIR:
 *   <videoId>/processed/pitch+2_tempo0.75.wav
 */
@Entity()
@Unique(['videoId', 'pitchShift', 'tempo'])
@Index(['videoId'])
export class AudioVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  videoId: string;

  /** Desplazamiento tonal en semitonos enteros. -12..+12. 0 = sin cambio. */
  @Column('int')
  pitchShift: number;

  /**
   * Multiplicador de tempo. 1.0 = velocidad original.
   * Rango permitido: 0.5..2.0 (dos decimales de precisión).
   */
  @Column('float')
  tempo: number;

  /** Ruta relativa al archivo WAV procesado. null mientras status=processing. */
  @Column({ nullable: true, type: 'varchar' })
  filePath: string | null;

  @Column()
  status: 'processing' | 'ready' | 'failed';

  /**
   * Motor usado para generar la variante.
   * 'rubberband' (alta calidad, preserva formantes) o 'asetrate' (fallback FFmpeg puro).
   */
  @Column({ nullable: true, type: 'varchar', length: 20 })
  processingEngine: 'rubberband' | 'asetrate' | null;

  /** Mensaje de error del último intento fallido. */
  @Column({ nullable: true, type: 'text' })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
