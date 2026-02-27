import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity';
import { Lesson } from '../../courses/entities/lesson.entity';
import { Student } from './student.entity';

@Entity('lesson_progress')
@Index(['studentId'])
@Index(['courseId'])
@Index(['lessonId'])
@Unique(['studentId', 'lessonId'])
export class LessonProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @JoinColumn({ name: 'studentId' })
  @ManyToOne(() => Student, (student) => student.lessonProgress, { onDelete: 'CASCADE' })
  student: Student;

  @Column({ type: 'uuid' })
  courseId: string;

  @JoinColumn({ name: 'courseId' })
  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  course: Course;

  @Column({ type: 'uuid' })
  lessonId: string;

  @JoinColumn({ name: 'lessonId' })
  @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
  lesson: Lesson;

  @Column({ type: 'boolean', default: false })
  completed: boolean;

  @Column({ type: 'int', default: 0 })
  watchedSeconds: number;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastWatchedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
