import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CourseModule } from './course-module.entity';

export enum CourseLevel {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
}

export enum CourseCategory {
  ACOUSTIC = 'ACOUSTIC',
  ELECTRIC = 'ELECTRIC',
  FINGERSTYLE = 'FINGERSTYLE',
  THEORY = 'THEORY',
  OTHER = 'OTHER',
}

export enum CourseStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

@Entity()
@Index(['teacherId'])
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  teacherId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({ type: 'enum', enum: CourseLevel })
  level: CourseLevel;

  @Column({ type: 'enum', enum: CourseCategory })
  category: CourseCategory;

  @Column({ type: 'enum', enum: CourseStatus, default: CourseStatus.DRAFT })
  status: CourseStatus;

  @Column({ nullable: true, type: 'varchar' })
  thumbnailUrl: string | null;

  @OneToMany(() => CourseModule, (m) => m.course)
  modules: CourseModule[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
