import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

async function bootstrap() {
  const logger = new Logger('SeedCommand');
  const app = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const seedService = app.get(SeedService);
    const args = process.argv.slice(2);
    const reset = args.includes('--reset');
    const resetStudent = args.includes('--reset-student');
    const studentOnly = args.includes('--student-only');

    const mode = studentOnly ? 'student-only' : 'full';
    logger.log(
      `Starting ${mode} seed${reset ? ' with --reset' : ''}${resetStudent ? ' with --reset-student' : ''}...`,
    );
    await seedService.run({ reset, resetStudent, studentOnly });
    logger.log('Seed process finished.');
  } catch (error) {
    logger.error('Seed process failed', error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void bootstrap();
