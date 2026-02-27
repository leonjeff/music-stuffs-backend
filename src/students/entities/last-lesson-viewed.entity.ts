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
import { Lesson } from '../../courses/entities/lesson.entity';
import { Student } from './student.entity';

@Entity('last_lesson_viewed')
@Index(['studentId'])
@Index(['courseId'])
@Unique(['studentId', 'courseId'])
export class LastLessonViewed {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @JoinColumn({ name: 'studentId' })
  @ManyToOne(() => Student, (student) => student.lastLessonViewed, { onDelete: 'CASCADE' })
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

  @Column({ type: 'timestamptz' })
  viewedAt: Date;
}
