import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  status: 'processing' | 'ready' | 'failed';

  @Column()
  originalFilename: string;

  @Column()
  size: number;

  @Column()
  mimeType: string;

  /** Duración en milisegundos con precisión de milisegundos */
  @Column({ nullable: true, type: 'float' })
  durationMs: number | null;

  /** Duración en segundos — entero (compatibilidad; usar durationMs para precisión) */
  @Column({ nullable: true, type: 'integer' })
  duration: number | null;

  @Column({ nullable: true, type: 'varchar' })
  resolution: string | null;

  /** Ruta relativa a VIDEO_BASE_DIR — ej: "{id}/index.m3u8" */
  @Column({ nullable: true, type: 'varchar' })
  hlsPath: string | null;

  /** Ruta relativa a VIDEO_BASE_DIR — ej: "{id}/audio.wav" */
  @Column({ nullable: true, type: 'varchar' })
  audioWavPath: string | null;

  /** Ruta relativa a VIDEO_BASE_DIR — ej: "{id}/waveform.json" */
  @Column({ nullable: true, type: 'varchar' })
  waveformPath: string | null;

  /** Solo presente en videos > 1 hora */
  @Column({ nullable: true, type: 'varchar' })
  waveformLowPath: string | null;

  /** Ruta relativa a VIDEO_BASE_DIR — ej: "{id}/metadata.json" */
  @Column({ nullable: true, type: 'varchar' })
  metadataPath: string | null;

  /** Ruta relativa a VIDEO_BASE_DIR — ej: "{id}/thumbnail.jpg" */
  @Column({ nullable: true, type: 'varchar' })
  thumbnailPath: string | null;

  @Column({ nullable: true, type: 'varchar' })
  createdBy: string | null;

  @Column({ default: 0 })
  processingAttempts: number;

  @CreateDateColumn()
  createdAt: Date;
}
