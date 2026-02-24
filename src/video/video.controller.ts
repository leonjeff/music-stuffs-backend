import {
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VideoService } from './video.service';

@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-teacher-id') teacherId?: string,
  ) {
    return this.videoService.handleUpload(file, teacherId);
  }

  @Get(':id')
  async getVideo(@Param('id') id: string) {
    return this.videoService.findById(id);
  }

  @Get(':id/status')
  async getVideoStatus(@Param('id') id: string) {
    return this.videoService.getStatus(id);
  }

  @Get(':id/stream')
  async streamVideo(@Param('id') id: string) {
    return this.videoService.getStream(id);
  }

  /** Waveform principal (high-res para videos cortos, high-res para videos largos) */
  @Get(':id/waveform')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async getWaveform(@Param('id') id: string) {
    return this.videoService.getWaveformFile(id, 'high');
  }

  /** Waveform low-res — solo disponible para videos > 1 hora */
  @Get(':id/waveform/low')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async getWaveformLow(@Param('id') id: string) {
    return this.videoService.getWaveformFile(id, 'low');
  }
}
