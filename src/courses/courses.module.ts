import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { Course } from './entities/course.entity';
import { CourseModule } from './entities/course-module.entity';
import { Lesson } from './entities/lesson.entity';
import { LessonResource } from './entities/lesson-resource.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Course, CourseModule, Lesson, LessonResource])],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}
