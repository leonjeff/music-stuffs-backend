import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { VideoProcessingService } from './video-processing.service';
import { Video } from './entities/video.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Video]),
  ],
  controllers: [VideoController],
  providers: [VideoService, VideoProcessingService],
})
export class VideoModule {}
