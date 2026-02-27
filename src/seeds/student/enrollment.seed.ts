import { Logger } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Course, CourseStatus } from '../../courses/entities/course.entity';
import { Enrollment } from '../../students/entities/enrollment.entity';
import { Student } from '../../students/entities/student.entity';
import { StudentKey } from './student.seed';

export type EnrollmentPlan = Record<StudentKey, { student: Student; courses: Course[] }>;

export async function seedEnrollments(
  manager: EntityManager,
  students: Record<StudentKey, Student>,
  logger: Logger,
): Promise<EnrollmentPlan> {
  const courseRepo = manager.getRepository(Course);
  const enrollmentRepo = manager.getRepository(Enrollment);

  const publishedCourses = await courseRepo
    .createQueryBuilder('course')
    .leftJoinAndSelect('course.modules', 'module')
    .leftJoinAndSelect('module.lessons', 'lesson')
    .where('course.status = :status', { status: CourseStatus.PUBLISHED })
    .orderBy('course.createdAt', 'ASC')
    .addOrderBy('module.position', 'ASC')
    .addOrderBy('lesson.position', 'ASC')
    .getMany();

  if (publishedCourses.length < 2) {
    throw new Error(
      `Student seed requires at least 2 published courses. Found: ${publishedCourses.length}`,
    );
  }

  const plan: EnrollmentPlan = {
    juan: { student: students.juan, courses: [publishedCourses[0], publishedCourses[1]] },
    sofia: { student: students.sofia, courses: [publishedCourses[0]] },
  };

  const rows = Object.values(plan).flatMap(({ student, courses }) =>
    courses.map((course) => ({
      studentId: student.id,
      courseId: course.id,
    })),
  );

  await enrollmentRepo.upsert(rows, ['studentId', 'courseId']);

  const enrolled = await enrollmentRepo.find({
    where: {
      studentId: In(rows.map((row) => row.studentId)),
    },
  });

  logger.log(`Enrollments created/updated: ${enrolled.length}`);

  return plan;
}
