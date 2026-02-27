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
import { Course } from './course.entity';
import { Lesson } from './lesson.entity';

@Entity()
@Index(['courseId'])
export class CourseModule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  courseId: string;

  @ManyToOne(() => Course, (c) => c.modules, { onDelete: 'CASCADE' })
  course: Course;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({ type: 'int', default: 0 })
  position: number;

  @OneToMany(() => Lesson, (l) => l.module)
  lessons: Lesson[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
