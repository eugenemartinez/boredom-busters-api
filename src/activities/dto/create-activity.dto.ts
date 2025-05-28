import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  IsEnum,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'; // Import Swagger decorators
import { CostLevel } from '../entities/activity.entity.js';

export class CreateActivityDto {
  @ApiProperty({
    description: 'The title of the activity.',
    example: 'Learn to Play the Ukulele',
    minLength: 3,
    maxLength: 255,
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  title!: string;

  @ApiProperty({
    description: 'A detailed description of the activity.',
    example: 'Start with basic chords and strumming patterns. Many tutorials are available online.',
    minLength: 10,
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  description!: string;

  @ApiProperty({
    description: 'The category or type of the activity.',
    example: 'music',
    maxLength: 100,
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  type!: string;

  @ApiPropertyOptional({
    description: 'Minimum number of participants required (if applicable).',
    example: 1,
    minimum: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  participants_min?: number | null;

  @ApiPropertyOptional({
    description: 'Maximum number of participants allowed (if applicable).',
    example: 5,
    minimum: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  participants_max?: number | null;

  @ApiPropertyOptional({
    description: 'Estimated cost level of the activity.',
    enum: CostLevel,
    example: CostLevel.FREE,
    default: CostLevel.FREE,
  })
  @IsOptional()
  @IsEnum(CostLevel)
  cost_level?: CostLevel;

  @ApiPropertyOptional({
    description: 'Minimum estimated duration in minutes (if applicable).',
    example: 30,
    minimum: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration_min?: number | null;

  @ApiPropertyOptional({
    description: 'Maximum estimated duration in minutes (if applicable).',
    example: 120,
    minimum: 1,
    type: 'integer',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration_max?: number | null;
}
