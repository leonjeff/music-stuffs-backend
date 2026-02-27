import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity';
import { Student } from './student.entity';

@Entity('enrollments')
@Index(['studentId'])
@Index(['courseId'])
@Unique(['studentId', 'courseId'])
export class Enrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @JoinColumn({ name: 'studentId' })
  @ManyToOne(() => Student, (student) => student.enrollments, { onDelete: 'CASCADE' })
  student: Student;

  @Column({ type: 'uuid' })
  studentId: string;

  @JoinColumn({ name: 'courseId' })
  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  course: Course;

  @Column({ type: 'uuid' })
  courseId: string;

  @CreateDateColumn()
  enrolledAt: Date;
}
