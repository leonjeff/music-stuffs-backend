import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from '../courses/entities/course.entity';
import { CourseModule } from '../courses/entities/course-module.entity';
import { Lesson } from '../courses/entities/lesson.entity';
import { LessonResource } from '../courses/entities/lesson-resource.entity';
import { CourseProgress } from '../students/entities/course-progress.entity';
import { Enrollment } from '../students/entities/enrollment.entity';
import { LastLessonViewed } from '../students/entities/last-lesson-viewed.entity';
import { LessonProgress } from '../students/entities/lesson-progress.entity';
import { Student } from '../students/entities/student.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get('DB_USER'),
        password: config.get('DB_PASS'),
        database: config.get('DB_NAME'),
        entities: [
          Course,
          CourseModule,
          Lesson,
          LessonResource,
          Student,
          Enrollment,
          LessonProgress,
          CourseProgress,
          LastLessonViewed,
        ],
        synchronize: true,
      }),
    }),
    TypeOrmModule.forFeature([Course, CourseModule, Lesson, LessonResource]),
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
