import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CourseProgress } from './course-progress.entity';
import { Enrollment } from './enrollment.entity';
import { LastLessonViewed } from './last-lesson-viewed.entity';
import { LessonProgress } from './lesson-progress.entity';

@Entity('students')
export class Student {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 200, unique: true })
  email: string;

  @OneToMany(() => Enrollment, (enrollment) => enrollment.student)
  enrollments: Enrollment[];

  @OneToMany(() => LessonProgress, (progress) => progress.student)
  lessonProgress: LessonProgress[];

  @OneToMany(() => CourseProgress, (progress) => progress.student)
  courseProgress: CourseProgress[];

  @OneToMany(() => LastLessonViewed, (lastViewed) => lastViewed.student)
  lastLessonViewed: LastLessonViewed[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
