import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ResourceType } from '../entities/lesson-resource.entity';

export class CreateResourceDto {
  @IsEnum(ResourceType)
  type: ResourceType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  url: string;
}
