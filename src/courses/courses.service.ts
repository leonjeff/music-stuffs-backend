import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Course, CourseStatus } from './entities/course.entity';
import { CourseModule } from './entities/course-module.entity';
import { Lesson } from './entities/lesson.entity';
import { LessonResource } from './entities/lesson-resource.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,
    @InjectRepository(CourseModule)
    private readonly moduleRepo: Repository<CourseModule>,
    @InjectRepository(Lesson)
    private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(LessonResource)
    private readonly resourceRepo: Repository<LessonResource>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Courses ──────────────────────────────────────────────────────────────

  async createCourse(teacherId: string, dto: CreateCourseDto): Promise<Course> {
    const course = this.courseRepo.create({
      teacherId,
      title: dto.title,
      description: dto.description ?? null,
      level: dto.level,
      category: dto.category,
      status: dto.status ?? CourseStatus.DRAFT,
      thumbnailUrl: dto.thumbnailUrl ?? null,
    });
    const saved = await this.courseRepo.save(course);
    this.logger.log(`Course ${saved.id} created by teacher ${teacherId}`);
    return saved;
  }

  async findCoursesByTeacher(teacherId: string): Promise<Course[]> {
    return this.courseRepo
      .createQueryBuilder('c')
      .where('c.teacherId = :teacherId', { teacherId })
      .leftJoinAndSelect('c.modules', 'm')
      .orderBy('c.createdAt', 'DESC')
      .addOrderBy('m.position', 'ASC')
      .getMany();
  }

  async findCourseById(teacherId: string, courseId: string): Promise<Course> {
    const course = await this.courseRepo
      .createQueryBuilder('c')
      .where('c.id = :courseId', { courseId })
      .leftJoinAndSelect('c.modules', 'm')
      .leftJoinAndSelect('m.lessons', 'l')
      .leftJoinAndSelect('l.resources', 'r')
      .orderBy('m.position', 'ASC')
      .addOrderBy('l.position', 'ASC')
      .addOrderBy('r.position', 'ASC')
      .getOne();

    if (!course) throw new NotFoundException(`Course ${courseId} not found`);
    this.assertOwner(course, teacherId);
    return course;
  }

  async updateCourse(
    teacherId: string,
    courseId: string,
    dto: UpdateCourseDto,
  ): Promise<Course> {
    const course = await this.findCourseByIdRaw(courseId);
    this.assertOwner(course, teacherId);
    Object.assign(course, dto);
    return this.courseRepo.save(course);
  }

  async deleteCourse(teacherId: string, courseId: string): Promise<void> {
    const course = await this.findCourseByIdRaw(courseId);
    this.assertOwner(course, teacherId);
    await this.courseRepo.softDelete(courseId);
    this.logger.log(`Course ${courseId} soft-deleted by teacher ${teacherId}`);
  }

  // ─── Modules ──────────────────────────────────────────────────────────────

  async createModule(
    teacherId: string,
    courseId: string,
    dto: CreateModuleDto,
  ): Promise<CourseModule> {
    await this.assertCourseOwner(teacherId, courseId);
    const position = await this.moduleRepo.countBy({ courseId });
    const module = this.moduleRepo.create({
      courseId,
      title: dto.title,
      description: dto.description ?? null,
      position,
    });
    const saved = await this.moduleRepo.save(module);
    this.logger.log(`Module ${saved.id} created in course ${courseId}`);
    return saved;
  }

  async findModulesByCourse(
    teacherId: string,
    courseId: string,
  ): Promise<CourseModule[]> {
    await this.assertCourseOwner(teacherId, courseId);
    return this.moduleRepo.find({
      where: { courseId },
      order: { position: 'ASC' },
    });
  }

  async updateModule(
    teacherId: string,
    courseId: string,
    moduleId: string,
    dto: UpdateModuleDto,
  ): Promise<CourseModule> {
    await this.assertCourseOwner(teacherId, courseId);
    const module = await this.findModuleByIdRaw(moduleId, courseId);
    Object.assign(module, dto);
    return this.moduleRepo.save(module);
  }

  async deleteModule(
    teacherId: string,
    courseId: string,
    moduleId: string,
  ): Promise<void> {
    await this.assertCourseOwner(teacherId, courseId);
    const module = await this.findModuleByIdRaw(moduleId, courseId);
    await this.moduleRepo.remove(module);
  }

  async reorderModules(
    teacherId: string,
    courseId: string,
    ids: string[],
  ): Promise<void> {
    await this.assertCourseOwner(teacherId, courseId);
    await this.dataSource.transaction(async (em) => {
      await Promise.all(
        ids.map((id, index) =>
          em.update(CourseModule, { id, courseId }, { position: index }),
        ),
      );
    });
  }

  // ─── Lessons ──────────────────────────────────────────────────────────────

  async createLesson(
    teacherId: string,
    courseId: string,
    moduleId: string,
    dto: CreateLessonDto,
  ): Promise<Lesson> {
    await this.assertCourseOwner(teacherId, courseId);
    await this.findModuleByIdRaw(moduleId, courseId);
    const position = await this.lessonRepo.countBy({ moduleId });
    const lesson = this.lessonRepo.create({
      moduleId,
      title: dto.title,
      description: dto.description ?? null,
      videoId: dto.videoId ?? null,
      duration: dto.duration ?? null,
      preview: dto.preview ?? false,
      position,
      bpm: dto.bpm ?? null,
      difficulty: dto.difficulty ?? null,
      tuning: dto.tuning ?? null,
      key: dto.key ?? null,
      timeSignature: dto.timeSignature ?? null,
    });
    return this.lessonRepo.save(lesson);
  }

  async updateLesson(
    teacherId: string,
    courseId: string,
    moduleId: string,
    lessonId: string,
    dto: UpdateLessonDto,
  ): Promise<Lesson> {
    await this.assertCourseOwner(teacherId, courseId);
    const lesson = await this.findLessonByIdRaw(lessonId, moduleId);
    Object.assign(lesson, dto);
    return this.lessonRepo.save(lesson);
  }

  async deleteLesson(
    teacherId: string,
    courseId: string,
    moduleId: string,
    lessonId: string,
  ): Promise<void> {
    await this.assertCourseOwner(teacherId, courseId);
    const lesson = await this.findLessonByIdRaw(lessonId, moduleId);
    await this.lessonRepo.remove(lesson);
  }

  async reorderLessons(
    teacherId: string,
    courseId: string,
    moduleId: string,
    ids: string[],
  ): Promise<void> {
    await this.assertCourseOwner(teacherId, courseId);
    await this.findModuleByIdRaw(moduleId, courseId);
    await this.dataSource.transaction(async (em) => {
      await Promise.all(
        ids.map((id, index) =>
          em.update(Lesson, { id, moduleId }, { position: index }),
        ),
      );
    });
  }

  // ─── Resources ────────────────────────────────────────────────────────────

  async createResource(
    teacherId: string,
    lessonId: string,
    dto: CreateResourceDto,
  ): Promise<LessonResource> {
    await this.assertLessonOwner(teacherId, lessonId);
    const position = await this.resourceRepo.countBy({ lessonId });
    const resource = this.resourceRepo.create({
      lessonId,
      type: dto.type,
      title: dto.title,
      url: dto.url,
      position,
    });
    return this.resourceRepo.save(resource);
  }

  async updateResource(
    teacherId: string,
    lessonId: string,
    resourceId: string,
    dto: UpdateResourceDto,
  ): Promise<LessonResource> {
    await this.assertLessonOwner(teacherId, lessonId);
    const resource = await this.findResourceByIdRaw(resourceId, lessonId);
    Object.assign(resource, dto);
    return this.resourceRepo.save(resource);
  }

  async deleteResource(
    teacherId: string,
    lessonId: string,
    resourceId: string,
  ): Promise<void> {
    await this.assertLessonOwner(teacherId, lessonId);
    const resource = await this.findResourceByIdRaw(resourceId, lessonId);
    await this.resourceRepo.remove(resource);
  }

  async reorderResources(
    teacherId: string,
    lessonId: string,
    ids: string[],
  ): Promise<void> {
    await this.assertLessonOwner(teacherId, lessonId);
    await this.dataSource.transaction(async (em) => {
      await Promise.all(
        ids.map((id, index) =>
          em.update(LessonResource, { id, lessonId }, { position: index }),
        ),
      );
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async findCourseByIdRaw(courseId: string): Promise<Course> {
    const course = await this.courseRepo.findOneBy({ id: courseId });
    if (!course) throw new NotFoundException(`Course ${courseId} not found`);
    return course;
  }

  private async findModuleByIdRaw(
    moduleId: string,
    courseId: string,
  ): Promise<CourseModule> {
    const module = await this.moduleRepo.findOneBy({ id: moduleId, courseId });
    if (!module) throw new NotFoundException(`Module ${moduleId} not found`);
    return module;
  }

  private async findLessonByIdRaw(
    lessonId: string,
    moduleId: string,
  ): Promise<Lesson> {
    const lesson = await this.lessonRepo.findOneBy({ id: lessonId, moduleId });
    if (!lesson) throw new NotFoundException(`Lesson ${lessonId} not found`);
    return lesson;
  }

  private async findResourceByIdRaw(
    resourceId: string,
    lessonId: string,
  ): Promise<LessonResource> {
    const resource = await this.resourceRepo.findOneBy({
      id: resourceId,
      lessonId,
    });
    if (!resource)
      throw new NotFoundException(`Resource ${resourceId} not found`);
    return resource;
  }

  private assertOwner(course: Course, teacherId: string): void {
    if (course.teacherId !== teacherId) {
      throw new ForbiddenException('You do not own this course');
    }
  }

  private async assertCourseOwner(
    teacherId: string,
    courseId: string,
  ): Promise<void> {
    const course = await this.findCourseByIdRaw(courseId);
    this.assertOwner(course, teacherId);
  }

  /**
   * Traverses lesson → module → course to verify teacher ownership.
   * Uses a single JOIN query to avoid N+1.
   */
  private async assertLessonOwner(
    teacherId: string,
    lessonId: string,
  ): Promise<void> {
    const lesson = await this.lessonRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.module', 'm')
      .leftJoinAndSelect('m.course', 'c')
      .where('l.id = :lessonId', { lessonId })
      .getOne();

    if (!lesson) throw new NotFoundException(`Lesson ${lessonId} not found`);
    if (lesson.module?.course?.teacherId !== teacherId) {
      throw new ForbiddenException('You do not own this lesson');
    }
  }
}
