import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CourseCategory, CourseLevel, CourseStatus } from '../entities/course.entity';

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(CourseLevel)
  level: CourseLevel;

  @IsEnum(CourseCategory)
  category: CourseCategory;

  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;
}
