import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CourseModule } from './course-module.entity';
import { LessonResource } from './lesson-resource.entity';

@Entity()
@Index(['moduleId'])
export class Lesson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  moduleId: string;

  @ManyToOne(() => CourseModule, (m) => m.lessons, { onDelete: 'CASCADE' })
  module: CourseModule;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  /** UUID of the linked Video (optional) */
  @Column({ nullable: true, type: 'varchar' })
  videoId: string | null;

  /** Lesson duration in seconds. */
  @Column({ nullable: true, type: 'int' })
  duration: number | null;

  /** Marks lesson as public preview in catalog/landing contexts. */
  @Column({ type: 'boolean', default: false })
  preview: boolean;

  @Column({ type: 'int', default: 0 })
  position: number;

  // ─── Guitar-specific metadata ────────────────────────────────────────────

  /** Beats per minute. Range: 20–300. */
  @Column({ nullable: true, type: 'int' })
  bpm: number | null;

  /** Difficulty 1–10. */
  @Column({ nullable: true, type: 'int' })
  difficulty: number | null;

  /** Guitar tuning — e.g. "EADGBE", "Drop D", "Open G". */
  @Column({ nullable: true, type: 'varchar', length: 50 })
  tuning: string | null;

  /** Musical key — e.g. "C major", "A minor". */
  @Column({ nullable: true, type: 'varchar', length: 50 })
  key: string | null;

  /** Time signature — e.g. "4/4", "3/4", "6/8". */
  @Column({ nullable: true, type: 'varchar', length: 10 })
  timeSignature: string | null;

  @OneToMany(() => LessonResource, (r) => r.lesson)
  resources: LessonResource[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
