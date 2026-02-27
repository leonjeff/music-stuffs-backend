import { Logger } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Student } from '../../students/entities/student.entity';

export const STUDENT_FIXTURES = {
  juan: {
    id: '11111111-1111-4111-8111-111111111111',
    firstName: 'Juan',
    lastName: 'Martinez',
    email: 'juan.martinez@example.com',
  },
  sofia: {
    id: '22222222-2222-4222-8222-222222222222',
    firstName: 'Sofia',
    lastName: 'Ramirez',
    email: 'sofia.ramirez@example.com',
  },
} as const;

export type StudentKey = keyof typeof STUDENT_FIXTURES;

export async function seedStudents(
  manager: EntityManager,
  logger: Logger,
): Promise<Record<StudentKey, Student>> {
  const studentRepo = manager.getRepository(Student);
  const fixtures = Object.values(STUDENT_FIXTURES);

  await studentRepo.upsert(fixtures, ['id']);

  const students = await studentRepo.find({
    where: { id: In(fixtures.map((fixture) => fixture.id)) },
  });

  const byId = new Map(students.map((student) => [student.id, student] as const));
  const juan = byId.get(STUDENT_FIXTURES.juan.id);
  const sofia = byId.get(STUDENT_FIXTURES.sofia.id);
  if (!juan || !sofia) {
    throw new Error('Students could not be created or loaded.');
  }

  logger.log(`Students created/updated: ${students.length}`);

  return { juan, sofia };
}
