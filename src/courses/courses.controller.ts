import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { ReorderDto } from './dto/reorder.dto';

@Controller('teacher')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  // ─── Courses ──────────────────────────────────────────────────────────────

  @Post('courses')
  createCourse(
    @Headers('x-teacher-id') teacherId: string,
    @Body() dto: CreateCourseDto,
  ) {
    return this.coursesService.createCourse(teacherId, dto);
  }

  @Get('courses')
  findCourses(@Headers('x-teacher-id') teacherId: string) {
    return this.coursesService.findCoursesByTeacher(teacherId);
  }

  @Get('courses/:courseId')
  findCourse(
    @Headers('x-teacher-id') teacherId: string,
    @Param('courseId') courseId: string,
  ) {
    return this.coursesService.findCourseById(teacherId, courseId);
  }

  @Patch('courses/:courseId')
  updateCourse(
    @Headers('x-teacher-id') teacherId: string,
    @Param('courseId') courseId: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.coursesService.updateCourse(teacherId, courseId, dto);
  }

  @Delete('courses/:courseId')
  deleteCourse(
    @Headers('x-teacher-id') teacherId: string,
    @Param('courseId') courseId: string,
  ) {
    return this.coursesService.deleteCourse(teacherId, courseId);
  }

  // ─── Modules ──────────────────────────────────────────────────────────────

  @Post('courses/:courseId/modules')
  createModule(
    @Headers('x-teacher-id') teacherId: string,
    @Param('courseId') courseId: string,
    @Body() dto: CreateModuleDto,
  ) {
    return this.coursesService.createModule(teacherId, courseId, dto);
  }

  @Get('courses/:courseId/modules')
  findModules(
    @Headers('x-teacher-id') teacherId: string,
    @Param('courseId') courseId: string,
  ) {
    return this.coursesService.findModulesByCourse(teacherId, courseId);
  }

  /**
   * POST /teacher/courses/:courseId/modules/reorder
   * Must be declared BEFORE :moduleId routes to avoid NestJS matching "reorder" as a param.
   */
  @Post('courses/:courseId/modules/reorder')
  reorderModules(
    @Headers('x-teacher-id') teacherId: string,
    @Param('courseId') courseId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.coursesService.reorderModules(teacherId, courseId, dto.ids);
  }

  @Patch('courses/:courseId/modules/:moduleId')
  updateModule(
    @Headers('x-teacher-id') teacherId: string,
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: UpdateModuleDto,
  ) {
    return this.coursesService.updateModule(teacherId, courseId, moduleId, dto);
  }

  @Delete('courses/:courseId/modules/:moduleId')
  deleteModule(
    @Headers('x-teacher-id') teacherId: string,
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
  ) {
    return this.coursesService.deleteModule(teacherId, courseId, moduleId);
  }

  // ─── Lessons ──────────────────────────────────────────────────────────────

  @Post('courses/:courseId/modules/:moduleId/lessons')
  createLesson(
    @Headers('x-teacher-id') teacherId: string,
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: CreateLessonDto,
  ) {
    return this.coursesService.createLesson(teacherId, courseId, moduleId, dto);
  }

  /**
   * POST /teacher/courses/:courseId/modules/:moduleId/lessons/reorder
   * Declared before :lessonId routes.
   */
  @Post('courses/:courseId/modules/:moduleId/lessons/reorder')
  reorderLessons(
    @Headers('x-teacher-id') teacherId: string,
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.coursesService.reorderLessons(
      teacherId,
      courseId,
      moduleId,
      dto.ids,
    );
  }

  @Patch('courses/:courseId/modules/:moduleId/lessons/:lessonId')
  updateLesson(
    @Headers('x-teacher-id') teacherId: string,
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Param('lessonId') lessonId: string,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.coursesService.updateLesson(
      teacherId,
      courseId,
      moduleId,
      lessonId,
      dto,
    );
  }

  @Delete('courses/:courseId/modules/:moduleId/lessons/:lessonId')
  deleteLesson(
    @Headers('x-teacher-id') teacherId: string,
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.coursesService.deleteLesson(
      teacherId,
      courseId,
      moduleId,
      lessonId,
    );
  }

  // ─── Resources ────────────────────────────────────────────────────────────

  @Post('lessons/:lessonId/resources')
  createResource(
    @Headers('x-teacher-id') teacherId: string,
    @Param('lessonId') lessonId: string,
    @Body() dto: CreateResourceDto,
  ) {
    return this.coursesService.createResource(teacherId, lessonId, dto);
  }

  /**
   * POST /teacher/lessons/:lessonId/resources/reorder
   * Declared before :resourceId routes.
   */
  @Post('lessons/:lessonId/resources/reorder')
  reorderResources(
    @Headers('x-teacher-id') teacherId: string,
    @Param('lessonId') lessonId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.coursesService.reorderResources(teacherId, lessonId, dto.ids);
  }

  @Patch('lessons/:lessonId/resources/:resourceId')
  updateResource(
    @Headers('x-teacher-id') teacherId: string,
    @Param('lessonId') lessonId: string,
    @Param('resourceId') resourceId: string,
    @Body() dto: UpdateResourceDto,
  ) {
    return this.coursesService.updateResource(
      teacherId,
      lessonId,
      resourceId,
      dto,
    );
  }

  @Delete('lessons/:lessonId/resources/:resourceId')
  deleteResource(
    @Headers('x-teacher-id') teacherId: string,
    @Param('lessonId') lessonId: string,
    @Param('resourceId') resourceId: string,
  ) {
    return this.coursesService.deleteResource(teacherId, lessonId, resourceId);
  }
}
