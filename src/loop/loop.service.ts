import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Loop } from './entities/loop.entity';
import { Video } from '../video/entities/video.entity';
import { CreateLoopDto } from './dto/create-loop.dto';

@Injectable()
export class LoopService {
  private readonly logger = new Logger(LoopService.name);

  constructor(
    @InjectRepository(Loop)
    private readonly loopRepository: Repository<Loop>,
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
  ) {}

  async create(videoId: string, userId: string, dto: CreateLoopDto): Promise<Loop> {
    const video = await this.videoRepository.findOneBy({ id: videoId });

    if (!video) {
      throw new NotFoundException(`Video ${videoId} no encontrado`);
    }

    if (video.status !== 'ready') {
      throw new BadRequestException(
        `El video no está listo para reproducción (estado: ${video.status})`,
      );
    }

    if (video.duration && dto.endTime > video.duration) {
      throw new BadRequestException(
        `endTime (${dto.endTime}s) excede la duración del video (${video.duration}s)`,
      );
    }

    const loop = this.loopRepository.create({
      videoId,
      userId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      label: dto.label ?? null,
      isPublic: dto.isPublic ?? false,
      isRecommended: dto.isRecommended ?? false,
    });

    const saved = await this.loopRepository.save(loop);
    this.logger.log(`Loop ${saved.id} creado para video ${videoId} por usuario ${userId}`);
    return saved;
  }

  async findByVideo(videoId: string, userId?: string): Promise<Loop[]> {
    const where: FindOptionsWhere<Loop> = { videoId };
    if (userId) where.userId = userId;

    return this.loopRepository.find({
      where,
      order: { startTime: 'ASC' },
    });
  }
}
