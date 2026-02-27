import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ResourceType } from '../entities/lesson-resource.entity';

export class UpdateResourceDto {
  @IsOptional()
  @IsEnum(ResourceType)
  type?: ResourceType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  url?: string;
}
