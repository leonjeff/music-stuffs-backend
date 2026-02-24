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

  @Column({ nullable: true })
  duration: number;

  @Column({ nullable: true })
  resolution: string;

  @Column({ nullable: true })
  hlsPath: string;

  @Column({ nullable: true })
  thumbnailPath: string;

  @Column({ nullable: true })
  audioMp3Path: string;

  @Column({ nullable: true })
  audioWavPath: string;

  @Column({ nullable: true })
  waveformPath: string;

  @Column({ nullable: true })
  waveformLowPath: string;

  @Column({ nullable: true })
  createdBy: string;

  @Column({ default: 0 })
  processingAttempts: number;

  @CreateDateColumn()
  createdAt: Date;
}
