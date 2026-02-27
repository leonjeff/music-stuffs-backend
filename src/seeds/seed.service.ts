import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import {
  Course,
  CourseCategory,
  CourseLevel,
  CourseStatus,
} from '../courses/entities/course.entity';
import { CourseModule } from '../courses/entities/course-module.entity';
import { Lesson } from '../courses/entities/lesson.entity';
import {
  LessonResource,
  ResourceType,
} from '../courses/entities/lesson-resource.entity';
import { CourseProgress } from '../students/entities/course-progress.entity';
import { Enrollment } from '../students/entities/enrollment.entity';
import { LastLessonViewed } from '../students/entities/last-lesson-viewed.entity';
import { LessonProgress } from '../students/entities/lesson-progress.entity';
import { Student } from '../students/entities/student.entity';
import { seedEnrollments } from './student/enrollment.seed';
import { seedProgress } from './student/progress.seed';
import { seedStudents } from './student/student.seed';

const TEACHER_ID = 'teacher-uuid-001';

type SeedLesson = {
  title: string;
  description: string;
  bpm: number;
  difficulty: number;
  tuning: string;
  key: string;
  timeSignature: string;
};

type SeedModule = {
  title: string;
  description: string;
  lessons: SeedLesson[];
};

type SeedCourse = {
  title: string;
  description: string;
  level: CourseLevel;
  category: CourseCategory;
  status: CourseStatus;
  modules: SeedModule[];
};

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,
    private readonly dataSource: DataSource,
  ) {}

  async run(options: {
    reset: boolean;
    resetStudent?: boolean;
    studentOnly?: boolean;
  }): Promise<void> {
    if (!options.studentOnly) {
      await this.runTeacherSeed({ reset: options.reset });
    }

    await this.runStudentSeed({ resetStudent: options.resetStudent ?? options.reset });
  }

  private async runTeacherSeed(options: { reset: boolean }): Promise<void> {
    const existingCourses = await this.courseRepo.count();
    if (existingCourses > 0 && !options.reset) {
      this.logger.warn(
        `Seed skipped: found ${existingCourses} courses. Use --reset to recreate seed data.`,
      );
      return;
    }

    const dataset = this.buildDataset();
    const counters = { courses: 0, modules: 0, lessons: 0, resources: 0 };

    await this.dataSource.transaction(async (manager) => {
      const courseRepository = manager.getRepository(Course);
      const moduleRepository = manager.getRepository(CourseModule);
      const lessonRepository = manager.getRepository(Lesson);
      const resourceRepository = manager.getRepository(LessonResource);

      if (options.reset) {
        await resourceRepository.createQueryBuilder().delete().execute();
        await lessonRepository.createQueryBuilder().delete().execute();
        await moduleRepository.createQueryBuilder().delete().execute();
        await courseRepository.createQueryBuilder().delete().execute();
        this.logger.log('Reset enabled: existing course data removed.');
      }

      for (const courseData of dataset) {
        const savedCourse = await courseRepository.save(
          courseRepository.create({
            teacherId: TEACHER_ID,
            title: courseData.title,
            description: courseData.description,
            level: courseData.level,
            category: courseData.category,
            status: courseData.status,
            thumbnailUrl: null,
          }),
        );
        counters.courses += 1;
        this.logger.log(`Course created: ${savedCourse.title}`);

        for (let moduleIndex = 0; moduleIndex < courseData.modules.length; moduleIndex += 1) {
          const moduleData = courseData.modules[moduleIndex];
          const savedModule = await moduleRepository.save(
            moduleRepository.create({
              courseId: savedCourse.id,
              title: moduleData.title,
              description: moduleData.description,
              position: moduleIndex,
            }),
          );
          counters.modules += 1;

          for (let lessonIndex = 0; lessonIndex < moduleData.lessons.length; lessonIndex += 1) {
            const lessonData = moduleData.lessons[lessonIndex];
            const savedLesson = await lessonRepository.save(
              lessonRepository.create({
                moduleId: savedModule.id,
                title: lessonData.title,
                description: lessonData.description,
                videoId: randomUUID(),
                duration: this.randomInt(180, 600),
                preview: moduleIndex === 0 && lessonIndex === 0,
                position: lessonIndex,
                bpm: lessonData.bpm,
                difficulty: lessonData.difficulty,
                tuning: lessonData.tuning,
                key: lessonData.key,
                timeSignature: lessonData.timeSignature,
              }),
            );
            counters.lessons += 1;

            const slug = this.slugify(savedLesson.title);
            const resources = resourceRepository.create([
              {
                lessonId: savedLesson.id,
                type: ResourceType.TAB,
                title: `Tablatura ${savedLesson.title}`,
                url: `https://cdn.example.com/tabs/${slug}.pdf`,
                position: 0,
              },
              {
                lessonId: savedLesson.id,
                type: ResourceType.PDF,
                title: `Teoría ${savedLesson.title}`,
                url: `https://cdn.example.com/pdfs/${slug}.pdf`,
                position: 1,
              },
              {
                lessonId: savedLesson.id,
                type: ResourceType.BACKING_TRACK,
                title: `Backing track ${savedLesson.key} — ${savedLesson.bpm}bpm`,
                url: `https://cdn.example.com/backing/${slug}-${savedLesson.bpm}bpm.mp3`,
                position: 2,
              },
            ]);
            await resourceRepository.save(resources);
            counters.resources += resources.length;
          }
        }
      }
    });

    this.logger.log('Seed completed.');
    this.logger.log(`Courses created: ${counters.courses}`);
    this.logger.log(`Modules created: ${counters.modules}`);
    this.logger.log(`Lessons created: ${counters.lessons}`);
    this.logger.log(`Resources created: ${counters.resources}`);
  }

  private async runStudentSeed(options: { resetStudent: boolean }): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const enrollmentRepo = manager.getRepository(Enrollment);
      const lessonProgressRepo = manager.getRepository(LessonProgress);
      const courseProgressRepo = manager.getRepository(CourseProgress);
      const lastViewedRepo = manager.getRepository(LastLessonViewed);
      const studentRepo = manager.getRepository(Student);

      if (options.resetStudent) {
        await lastViewedRepo.createQueryBuilder().delete().execute();
        await courseProgressRepo.createQueryBuilder().delete().execute();
        await lessonProgressRepo.createQueryBuilder().delete().execute();
        await enrollmentRepo.createQueryBuilder().delete().execute();
        await studentRepo.createQueryBuilder().delete().execute();
        this.logger.log('Reset student enabled: existing student seed data removed.');
      }

      const students = await seedStudents(manager, this.logger);
      const enrollmentsPlan = await seedEnrollments(manager, students, this.logger);
      await seedProgress(manager, enrollmentsPlan, this.logger);
    });
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private buildDataset(): SeedCourse[] {
    return [
      {
        title: 'Guitarra Acústica para Principiantes',
        description: 'Aprende los acordes básicos y técnicas fundamentales.',
        level: CourseLevel.BEGINNER,
        category: CourseCategory.ACOUSTIC,
        status: CourseStatus.DRAFT,
        modules: [
          {
            title: 'Módulo 1 — Acordes básicos',
            description: 'Do, Re, Mi, Fa, Sol, La, Si',
            lessons: [
              {
                title: 'Acorde de Do mayor',
                description: 'Primera posición en el mástil.',
                bpm: 60,
                difficulty: 2,
                tuning: 'EADGBE',
                key: 'C major',
                timeSignature: '4/4',
              },
              {
                title: 'Acorde de Sol mayor',
                description: 'Transición limpia entre C y G.',
                bpm: 68,
                difficulty: 2,
                tuning: 'EADGBE',
                key: 'G major',
                timeSignature: '4/4',
              },
              {
                title: 'Acorde de Re mayor',
                description: 'Posicionamiento correcto de dedos en cuerdas agudas.',
                bpm: 72,
                difficulty: 3,
                tuning: 'EADGBE',
                key: 'D major',
                timeSignature: '4/4',
              },
              {
                title: 'Progresión C - G - Am - F',
                description: 'Cambio de acordes con metrónomo y control de pulso.',
                bpm: 75,
                difficulty: 3,
                tuning: 'EADGBE',
                key: 'C major',
                timeSignature: '4/4',
              },
            ],
          },
          {
            title: 'Módulo 2 — Ritmo y rasgueo',
            description: 'Patrones rítmicos para acompañar canciones.',
            lessons: [
              {
                title: 'Rasgueo en negras',
                description: 'Patrón base con mano derecha relajada.',
                bpm: 80,
                difficulty: 2,
                tuning: 'EADGBE',
                key: 'A minor',
                timeSignature: '4/4',
              },
              {
                title: 'Rasgueo en corcheas',
                description: 'Combinación de golpes abajo y arriba.',
                bpm: 85,
                difficulty: 3,
                tuning: 'EADGBE',
                key: 'E minor',
                timeSignature: '4/4',
              },
              {
                title: 'Acentos y dinámica',
                description: 'Control del volumen para dar intención musical.',
                bpm: 90,
                difficulty: 3,
                tuning: 'EADGBE',
                key: 'G major',
                timeSignature: '4/4',
              },
              {
                title: 'Ritmo pop acústico',
                description: 'Patrón completo aplicado a una progresión real.',
                bpm: 96,
                difficulty: 4,
                tuning: 'EADGBE',
                key: 'C major',
                timeSignature: '4/4',
              },
            ],
          },
          {
            title: 'Módulo 3 — Primera canción completa',
            description: 'Integración de acordes y ritmo en formato canción.',
            lessons: [
              {
                title: 'Estructura verso y coro',
                description: 'Identifica secciones y cambios de energía.',
                bpm: 92,
                difficulty: 3,
                tuning: 'EADGBE',
                key: 'A major',
                timeSignature: '4/4',
              },
              {
                title: 'Transiciones sin cortes',
                description: 'Evita silencios al pasar de una sección a otra.',
                bpm: 95,
                difficulty: 4,
                tuning: 'EADGBE',
                key: 'A major',
                timeSignature: '4/4',
              },
              {
                title: 'Práctica con backing track',
                description: 'Toca sobre pista de acompañamiento estable.',
                bpm: 100,
                difficulty: 4,
                tuning: 'EADGBE',
                key: 'A major',
                timeSignature: '4/4',
              },
              {
                title: 'Interpretación final',
                description: 'Toma completa de la canción con dinámica.',
                bpm: 100,
                difficulty: 4,
                tuning: 'EADGBE',
                key: 'A major',
                timeSignature: '4/4',
              },
            ],
          },
        ],
      },
      {
        title: 'Riffs y Técnicas de Guitarra Eléctrica',
        description: 'Power chords, riffs y articulaciones para nivel intermedio.',
        level: CourseLevel.INTERMEDIATE,
        category: CourseCategory.ELECTRIC,
        status: CourseStatus.PUBLISHED,
        modules: [
          {
            title: 'Módulo 1 — Riffs con palm mute',
            description: 'Precisión rítmica y ataque definido.',
            lessons: [
              {
                title: 'Palm muting básico',
                description: 'Control de puente y densidad del ataque.',
                bpm: 90,
                difficulty: 2,
                tuning: 'Drop D',
                key: 'D minor',
                timeSignature: '4/4',
              },
              {
                title: 'Power chords en quinta',
                description: 'Desplazamiento limpio sobre sexta y quinta cuerda.',
                bpm: 100,
                difficulty: 3,
                tuning: 'Drop D',
                key: 'D minor',
                timeSignature: '4/4',
              },
              {
                title: 'Riffs sincopados',
                description: 'Acentos fuera de pulso con metrónomo.',
                bpm: 110,
                difficulty: 4,
                tuning: 'Drop D',
                key: 'F major',
                timeSignature: '4/4',
              },
              {
                title: 'Patrón de gallop',
                description: 'Figura rítmica de tres notas en semicorcheas.',
                bpm: 120,
                difficulty: 4,
                tuning: 'Drop D',
                key: 'E minor',
                timeSignature: '4/4',
              },
            ],
          },
          {
            title: 'Módulo 2 — Técnicas de lead',
            description: 'Bendings, vibrato, legato y slides.',
            lessons: [
              {
                title: 'Bending afinado',
                description: 'Llegar a la nota objetivo sin pasarte.',
                bpm: 88,
                difficulty: 3,
                tuning: 'EADGBE',
                key: 'A minor',
                timeSignature: '4/4',
              },
              {
                title: 'Vibrato controlado',
                description: 'Ancho y velocidad de vibrato en notas largas.',
                bpm: 92,
                difficulty: 3,
                tuning: 'EADGBE',
                key: 'A minor',
                timeSignature: '4/4',
              },
              {
                title: 'Legato ascendente',
                description: 'Hammer-ons y pull-offs con limpieza.',
                bpm: 104,
                difficulty: 4,
                tuning: 'EADGBE',
                key: 'E minor',
                timeSignature: '4/4',
              },
              {
                title: 'Slides expresivos',
                description: 'Conectar frases con desplazamientos fluidos.',
                bpm: 108,
                difficulty: 4,
                tuning: 'EADGBE',
                key: 'G major',
                timeSignature: '4/4',
              },
            ],
          },
          {
            title: 'Módulo 3 — Construcción de riffs',
            description: 'Aplicación musical de ritmo y técnica.',
            lessons: [
              {
                title: 'Riff de verso',
                description: 'Motivo principal con repetición efectiva.',
                bpm: 105,
                difficulty: 3,
                tuning: 'Drop D',
                key: 'D minor',
                timeSignature: '4/4',
              },
              {
                title: 'Riff de pre-coro',
                description: 'Aumenta tensión armónica y rítmica.',
                bpm: 112,
                difficulty: 4,
                tuning: 'Drop D',
                key: 'Bb major',
                timeSignature: '4/4',
              },
              {
                title: 'Hook de octavas',
                description: 'Línea memorable para sección principal.',
                bpm: 118,
                difficulty: 4,
                tuning: 'EADGBE',
                key: 'G major',
                timeSignature: '4/4',
              },
              {
                title: 'Estructura completa',
                description: 'Ejecución continua de verso, pre-coro y hook.',
                bpm: 120,
                difficulty: 5,
                tuning: 'Drop D',
                key: 'D minor',
                timeSignature: '4/4',
              },
            ],
          },
        ],
      },
      {
        title: 'Fingerstyle Avanzado — Arreglos y Expresión',
        description: 'Curso avanzado de independencia, armonía y performance.',
        level: CourseLevel.ADVANCED,
        category: CourseCategory.FINGERSTYLE,
        status: CourseStatus.PUBLISHED,
        modules: [
          {
            title: 'Módulo 1 — Independencia de mano derecha',
            description: 'Pulgar y dedos en patrones independientes.',
            lessons: [
              {
                title: 'Bajo alternado constante',
                description: 'Pulgar estable mientras la melodía se mueve.',
                bpm: 82,
                difficulty: 3,
                tuning: 'EADGBE',
                key: 'C major',
                timeSignature: '4/4',
              },
              {
                title: 'Patrones en 3/4',
                description: 'Coordinación de arpegios con compás ternario.',
                bpm: 86,
                difficulty: 4,
                tuning: 'EADGBE',
                key: 'A minor',
                timeSignature: '3/4',
              },
              {
                title: 'Arpegios en 6/8',
                description: 'Fluidez en subdivisión compuesta.',
                bpm: 90,
                difficulty: 4,
                tuning: 'EADGBE',
                key: 'G major',
                timeSignature: '6/8',
              },
              {
                title: 'Pulgar percusivo',
                description: 'Añade golpe percusivo sin romper el groove.',
                bpm: 94,
                difficulty: 5,
                tuning: 'DADGAD',
                key: 'D major',
                timeSignature: '4/4',
              },
            ],
          },
          {
            title: 'Módulo 2 — Extensiones armónicas',
            description: 'Add9, sus, y movimiento de voces internas.',
            lessons: [
              {
                title: 'Voicings add9',
                description: 'Color moderno sobre progresiones simples.',
                bpm: 84,
                difficulty: 4,
                tuning: 'DADGAD',
                key: 'D major',
                timeSignature: '4/4',
              },
              {
                title: 'Drop-2 aplicado',
                description: 'Revoicing para líneas superiores cantables.',
                bpm: 88,
                difficulty: 4,
                tuning: 'EADGBE',
                key: 'F major',
                timeSignature: '4/4',
              },
              {
                title: 'Movimiento de voces internas',
                description: 'Conducción armónica sin perder el pulso.',
                bpm: 92,
                difficulty: 5,
                tuning: 'EADGBE',
                key: 'E minor',
                timeSignature: '4/4',
              },
              {
                title: 'Armónicos naturales',
                description: 'Integración melódica de armónicos en arreglos.',
                bpm: 96,
                difficulty: 5,
                tuning: 'EADGBE',
                key: 'A major',
                timeSignature: '4/4',
              },
            ],
          },
          {
            title: 'Módulo 3 — Performance completo',
            description: 'Preparación para interpretación de principio a fin.',
            lessons: [
              {
                title: 'Diseño de introducción',
                description: 'Crear una apertura con identidad sonora.',
                bpm: 80,
                difficulty: 4,
                tuning: 'DADGAD',
                key: 'D minor',
                timeSignature: '6/8',
              },
              {
                title: 'Variación temática',
                description: 'Desarrollo de motivos para distintas secciones.',
                bpm: 86,
                difficulty: 5,
                tuning: 'EADGBE',
                key: 'A minor',
                timeSignature: '4/4',
              },
              {
                title: 'Arco dinámico',
                description: 'Construcción de clímax y resolución.',
                bpm: 92,
                difficulty: 5,
                tuning: 'EADGBE',
                key: 'C major',
                timeSignature: '4/4',
              },
              {
                title: 'Toma final en vivo',
                description: 'Interpretación continua con control expresivo.',
                bpm: 96,
                difficulty: 5,
                tuning: 'DADGAD',
                key: 'D major',
                timeSignature: '4/4',
              },
            ],
          },
        ],
      },
    ];
  }
}
