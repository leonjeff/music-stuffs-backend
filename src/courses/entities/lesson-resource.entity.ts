import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Lesson } from './lesson.entity';

export enum ResourceType {
  PDF = 'PDF',
  TAB = 'TAB',
  BACKING_TRACK = 'BACKING_TRACK',
}

@Entity()
@Index(['lessonId'])
export class LessonResource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  lessonId: string;

  @ManyToOne(() => Lesson, (l) => l.resources, { onDelete: 'CASCADE' })
  lesson: Lesson;

  @Column({ type: 'enum', enum: ResourceType })
  type: ResourceType;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar' })
  url: string;

  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn()
  createdAt: Date;
}
