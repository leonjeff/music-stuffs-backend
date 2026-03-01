import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { LoopService } from './loop.service';
import { CreateLoopDto } from './dto/create-loop.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('video/:videoId/loops')
export class LoopController {
  constructor(private readonly loopService: LoopService) {}

  @Post()
  async createLoop(
    @Param('videoId') videoId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateLoopDto,
  ) {
    return this.loopService.create(videoId, userId, dto);
  }

  @Get()
  async getLoops(
    @Param('videoId') videoId: string,
    @Query('userId') userId?: string,
  ) {
    return this.loopService.findByVideo(videoId, userId);
  }
}
