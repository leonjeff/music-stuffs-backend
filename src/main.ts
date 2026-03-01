import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as express from 'express';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet());

  const origin = process.env.CORS_ORIGIN ?? '*';

  // 1. CORS global — aplica a todos los endpoints JSON de la API
  app.enableCors({
    origin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Range',         // requerido para streaming de audio/video (range requests)
      'Origin',
      'Accept',
      'Accept-Encoding',
    ],
    exposedHeaders: [
      // el frontend necesita leer estos headers para streaming y descarga
      'Content-Range',
      'Accept-Ranges',
      'Content-Length',
      'Content-Disposition',
      'Content-Type',
    ],
    credentials: process.env.CORS_ORIGIN !== undefined,
    maxAge: 3600, // cache del preflight 1 hora
  });

  // 2. Archivos estáticos via Express puro (evita que NestJS intercepte /media/*)
  //    Los headers CORS se añaden explícitamente antes de express.static
  //    para garantizarlos incluso cuando cors() se ejecuta en otro contexto.
  const videoBaseDir = process.env.VIDEO_BASE_DIR ?? '/tmp/music-stuffs/videos';
  const expressApp = app.getHttpAdapter().getInstance() as express.Application;

  expressApp.use('/media', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, Accept, Accept-Encoding');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type');
    if (origin !== '*') res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  }, express.static(videoBaseDir));

  // 3. Validación global de DTOs
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
