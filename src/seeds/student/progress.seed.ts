import { Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CourseModule } from '../../courses/entities/course-module.entity';
import { Lesson } from '../../courses/entities/lesson.entity';
import { CourseProgress } from '../../students/entities/course-progress.entity';
import { LastLessonViewed } from '../../students/entities/last-lesson-viewed.entity';
import { LessonProgress } from '../../students/entities/lesson-progress.entity';
import { EnrollmentPlan } from './enrollment.seed';

type OrderedLesson = {
  lesson: Lesson;
  module: CourseModule;
};

type LessonProgressRow = {
  studentId: string;
  courseId: string;
  lessonId: string;
  completed: boolean;
  watchedSeconds: number;
  completedAt: Date | null;
  lastWatchedAt: Date | null;
};

function orderLessons(modules: CourseModule[]): OrderedLesson[] {
  return modules
    .slice()
    .sort((a, b) => a.position - b.position)
    .flatMap((module) =>
      (module.lessons ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((lesson) => ({ lesson, module })),
    );
}

function daysAgo(days: number, hour = 20): Date {
  const now = new Date();
  const date = new Date(now);
  date.setDate(now.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function safeDuration(lesson: Lesson): number {
  return Math.max(120, lesson.duration ?? 300);
}

function createCompletedRow(
  studentId: string,
  courseId: string,
  lesson: Lesson,
  offset: number,
): LessonProgressRow {
  const duration = safeDuration(lesson);
  const watchedSeconds = Math.max(60, duration - (15 + (offset % 30)));
  const timestamp = daysAgo((offset % 10) + 1, 19 + (offset % 3));

  return {
    studentId,
    courseId,
    lessonId: lesson.id,
    completed: true,
    watchedSeconds: Math.min(watchedSeconds, duration),
    completedAt: timestamp,
    lastWatchedAt: timestamp,
  };
}

function createPartialRow(
  studentId: string,
  courseId: string,
  lesson: Lesson,
  offset: number,
): LessonProgressRow {
  const duration = safeDuration(lesson);
  const watchedSeconds = Math.floor(duration * (0.35 + ((offset % 4) * 0.1)));
  const lastWatchedAt = daysAgo(offset % 10, 18 + (offset % 4));

  return {
    studentId,
    courseId,
    lessonId: lesson.id,
    completed: false,
    watchedSeconds: Math.min(watchedSeconds, duration - 1),
    completedAt: null,
    lastWatchedAt,
  };
}

function percent(completed: number, total: number): number {
  if (total === 0) {
    return 0;
  }
  return Number(((completed / total) * 100).toFixed(2));
}

export async function seedProgress(
  manager: EntityManager,
  plan: EnrollmentPlan,
  logger: Logger,
): Promise<void> {
  const lessonProgressRepo = manager.getRepository(LessonProgress);
  const courseProgressRepo = manager.getRepository(CourseProgress);
  const lastViewedRepo = manager.getRepository(LastLessonViewed);

  const lessonRows: LessonProgressRow[] = [];
  const courseRows: Array<{
    studentId: string;
    courseId: string;
    totalLessons: number;
    completedLessons: number;
    progressPercent: number;
    lastCalculatedAt: Date;
  }> = [];
  const lastViewedRows: Array<{
    studentId: string;
    courseId: string;
    lessonId: string;
    viewedAt: Date;
  }> = [];
  const progressLogs: string[] = [];

  for (const [studentKey, data] of Object.entries(plan)) {
    const studentId = data.student.id;

    for (let courseIndex = 0; courseIndex < data.courses.length; courseIndex += 1) {
      const course = data.courses[courseIndex];
      const ordered = orderLessons(course.modules ?? []);
      const lessons = ordered.map((entry) => entry.lesson);
      const totalLessons = lessons.length;

      if (totalLessons === 0) {
        continue;
      }

      if (studentKey === 'juan' && courseIndex === 0) {
        const targetEntry =
          ordered.find(
            (entry) => entry.module.position === 1 && entry.lesson.position === 1,
          ) ?? ordered[Math.min(5, ordered.length - 1)];

        const completedSet = new Set<string>();
        for (const lesson of lessons) {
          if (lesson.id === targetEntry.lesson.id) {
            continue;
          }
          completedSet.add(lesson.id);
          if (completedSet.size >= Math.min(6, totalLessons - 1)) {
            break;
          }
        }

        let offset = 1;
        for (const lesson of lessons) {
          if (completedSet.has(lesson.id)) {
            lessonRows.push(createCompletedRow(studentId, course.id, lesson, offset));
            offset += 1;
          }
        }

        lessonRows.push(createPartialRow(studentId, course.id, targetEntry.lesson, 0));
        const extraPartial = lessons.find(
          (lesson) => !completedSet.has(lesson.id) && lesson.id !== targetEntry.lesson.id,
        );
        if (extraPartial) {
          lessonRows.push(createPartialRow(studentId, course.id, extraPartial, 3));
        }

        const completedLessons = completedSet.size;
        const progressPercent = percent(completedLessons, totalLessons);
        const viewedAt = daysAgo(0, 21);
        lastViewedRows.push({
          studentId,
          courseId: course.id,
          lessonId: targetEntry.lesson.id,
          viewedAt,
        });
        courseRows.push({
          studentId,
          courseId: course.id,
          totalLessons,
          completedLessons,
          progressPercent,
          lastCalculatedAt: viewedAt,
        });
        progressLogs.push(
          `Progress % por curso -> Juan / ${course.title}: ${completedLessons}/${totalLessons} (${progressPercent}%)`,
        );
        continue;
      }

      if (studentKey === 'juan' && courseIndex === 1) {
        const completedLessons = Math.min(2, totalLessons);
        for (let index = 0; index < completedLessons; index += 1) {
          lessonRows.push(createCompletedRow(studentId, course.id, lessons[index], index + 1));
        }

        const lastViewedLesson = lessons[Math.min(2, totalLessons - 1)];
        lessonRows.push(createPartialRow(studentId, course.id, lastViewedLesson, 1));

        const progressPercent = percent(completedLessons, totalLessons);
        const viewedAt = daysAgo(1, 20);
        lastViewedRows.push({
          studentId,
          courseId: course.id,
          lessonId: lastViewedLesson.id,
          viewedAt,
        });
        courseRows.push({
          studentId,
          courseId: course.id,
          totalLessons,
          completedLessons,
          progressPercent,
          lastCalculatedAt: viewedAt,
        });
        progressLogs.push(
          `Progress % por curso -> Juan / ${course.title}: ${completedLessons}/${totalLessons} (${progressPercent}%)`,
        );
        continue;
      }

      for (let index = 0; index < lessons.length; index += 1) {
        lessonRows.push(createCompletedRow(studentId, course.id, lessons[index], index + 1));
      }

      const lastLesson = lessons[lessons.length - 1];
      const viewedAt = daysAgo(0, 22);
      lastViewedRows.push({
        studentId,
        courseId: course.id,
        lessonId: lastLesson.id,
        viewedAt,
      });

      const progressPercent = percent(totalLessons, totalLessons);
      courseRows.push({
        studentId,
        courseId: course.id,
        totalLessons,
        completedLessons: totalLessons,
        progressPercent,
        lastCalculatedAt: viewedAt,
      });
      progressLogs.push(
        `Progress % por curso -> Sofia / ${course.title}: ${totalLessons}/${totalLessons} (${progressPercent}%)`,
      );
    }
  }

  await lessonProgressRepo.upsert(lessonRows, ['studentId', 'lessonId']);
  await courseProgressRepo.upsert(courseRows, ['studentId', 'courseId']);
  await lastViewedRepo.upsert(lastViewedRows, ['studentId', 'courseId']);

  logger.log(`Lesson progress inserted/updated: ${lessonRows.length}`);
  logger.log(`Course progress inserted/updated: ${courseRows.length}`);
  logger.log(`Last lesson viewed inserted/updated: ${lastViewedRows.length}`);
  for (const line of progressLogs) {
    logger.log(line);
  }
}
