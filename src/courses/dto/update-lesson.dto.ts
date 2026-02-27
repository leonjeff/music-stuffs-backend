import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  videoId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;

  @IsOptional()
  @IsBoolean()
  preview?: boolean;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(300)
  bpm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  difficulty?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tuning?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  timeSignature?: string;
}
