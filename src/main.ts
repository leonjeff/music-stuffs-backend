import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 1. CORS primero — aplica a TODOS los requests incluyendo /media/*
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-teacher-id'],
    credentials: process.env.CORS_ORIGIN !== undefined,
  });

  // 2. Archivos estáticos via Express puro (evita que NestJS intercepte /media/*)
  //    Sirve: HLS (.m3u8, .ts), audio (.mp3, .wav), waveform (.json), thumbnail (.jpg)
  const videoBaseDir = process.env.VIDEO_BASE_DIR ?? '/tmp/music-stuffs/videos';
  const expressApp = app.getHttpAdapter().getInstance() as express.Application;
  expressApp.use('/media', express.static(videoBaseDir));

  // 3. Validación global de DTOs
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
