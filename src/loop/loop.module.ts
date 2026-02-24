import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Loop } from './entities/loop.entity';
import { Video } from '../video/entities/video.entity';
import { LoopService } from './loop.service';
import { LoopController } from './loop.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Loop, Video])],
  controllers: [LoopController],
  providers: [LoopService],
})
export class LoopModule {}
