import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsEnum,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger'; // Import Swagger decorator
import { CostLevel } from '../entities/activity.entity.js';

export class UpdateActivityDto {
  @ApiPropertyOptional({
    description: 'The new title of the activity.',
    example: 'Master the Ukulele',
    minLength: 3,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    description: 'The new detailed description of the activity.',
    example: 'Focus on advanced techniques and performing songs.',
    minLength: 10,
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  description?: string;

  @ApiPropertyOptional({
    description: 'The new category or type of the activity.',
    example: 'skill development',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  type?: string;

  @ApiPropertyOptional({
    description: 'New minimum number of participants required.',
    example: 1,
    minimum: 1,
    type: 'integer',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  participants_min?: number | null;

  @ApiPropertyOptional({
    description: 'New maximum number of participants allowed.',
    example: 3,
    minimum: 1,
    type: 'integer',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  participants_max?: number | null;

  @ApiPropertyOptional({
    description: 'New estimated cost level of the activity.',
    enum: CostLevel,
    example: CostLevel.LOW,
  })
  @IsOptional()
  @IsEnum(CostLevel)
  cost_level?: CostLevel;

  @ApiPropertyOptional({
    description: 'New minimum estimated duration in minutes.',
    example: 60,
    minimum: 1,
    type: 'integer',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration_min?: number | null;

  @ApiPropertyOptional({
    description: 'New maximum estimated duration in minutes.',
    example: 180,
    minimum: 1,
    type: 'integer',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration_max?: number | null;
}
