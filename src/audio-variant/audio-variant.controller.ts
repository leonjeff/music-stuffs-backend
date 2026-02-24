import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AudioVariantService } from './audio-variant.service';
import { GenerateVariantDto } from './dto/generate-variant.dto';

/**
 * Rutas bajo /video/:videoId/audio-variants
 *
 * POST   /video/:videoId/audio-variants           → genera o devuelve variante (caché)
 * GET    /video/:videoId/audio-variants           → lista variantes del video
 * GET    /video/:videoId/audio-variants/:id       → estado de una variante (polling)
 * GET    /video/:videoId/audio-variants/:id/stream → descarga el WAV procesado
 */
@Controller('video/:videoId/audio-variants')
export class AudioVariantController {
  constructor(private readonly service: AudioVariantService) {}

  @Post()
  async generate(
    @Param('videoId') videoId: string,
    @Body() dto: GenerateVariantDto,
  ) {
    return this.service.generateVariant(videoId, dto);
  }

  @Get()
  async list(@Param('videoId') videoId: string) {
    return this.service.findByVideo(videoId);
  }

  @Get(':variantId')
  async getOne(@Param('variantId') variantId: string) {
    return this.service.findById(variantId);
  }

  @Get(':variantId/stream')
  async stream(@Param('variantId') variantId: string) {
    return this.service.streamVariant(variantId);
  }
}
