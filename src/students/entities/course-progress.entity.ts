import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity';
import { Student } from './student.entity';

@Entity('course_progress')
@Index(['studentId'])
@Index(['courseId'])
@Unique(['studentId', 'courseId'])
export class CourseProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @JoinColumn({ name: 'studentId' })
  @ManyToOne(() => Student, (student) => student.courseProgress, { onDelete: 'CASCADE' })
  student: Student;

  @Column({ type: 'uuid' })
  courseId: string;

  @JoinColumn({ name: 'courseId' })
  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  course: Course;

  @Column({ type: 'int', default: 0 })
  totalLessons: number;

  @Column({ type: 'int', default: 0 })
  completedLessons: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  progressPercent: number;

  @Column({ type: 'timestamptz' })
  lastCalculatedAt: Date;
}
