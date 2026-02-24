import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VideoModule } from './video/video.module';
import { Video } from './video/entities/video.entity';
import { LoopModule } from './loop/loop.module';
import { Loop } from './loop/entities/loop.entity';
import { AudioVariantModule } from './audio-variant/audio-variant.module';
import { AudioVariant } from './audio-variant/entities/audio-variant.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get('DB_USER'),
        password: config.get('DB_PASS'),
        database: config.get('DB_NAME'),
        entities: [Video, Loop, AudioVariant],
        synchronize: true,
      }),
    }),
    VideoModule,
    LoopModule,
    AudioVariantModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
