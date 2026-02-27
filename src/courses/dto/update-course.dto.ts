import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CourseCategory, CourseLevel, CourseStatus } from '../entities/course.entity';

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @IsOptional()
  @IsEnum(CourseCategory)
  category?: CourseCategory;

  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;
}
