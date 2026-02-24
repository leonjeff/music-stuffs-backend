import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AudioVariant } from './entities/audio-variant.entity';
import { Video } from '../video/entities/video.entity';
import { AudioProcessingService } from './audio-processing.service';
import { AudioVariantService } from './audio-variant.service';
import { AudioVariantController } from './audio-variant.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AudioVariant, Video])],
  controllers: [AudioVariantController],
  providers: [AudioVariantService, AudioProcessingService],
})
export class AudioVariantModule {}
