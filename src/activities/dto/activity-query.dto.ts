import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger'; // Import Swagger decorator

// Define available sort orders
export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

// Define fields that can be sorted by
// For now, let's allow sorting by creation_date and title.
// You can expand this enum later.
export enum ActivitySortBy {
  CREATED_AT = 'created_at', // Ensure this matches the actual column name in your entity or use @Column({ name: 'created_at' })
  TITLE = 'title',
  // Add other sortable fields like 'type', 'participants_min', etc. if needed
}

export class ActivityQueryDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination.',
    minimum: 1,
    default: 1,
    type: 'integer',
  })
  @IsOptional()
  @Type(() => Number) // Transform query string to number
  @IsInt()
  @Min(1)
  page?: number = 1; // Default to page 1

  @ApiPropertyOptional({
    description: 'Number of items per page.',
    minimum: 1,
    maximum: 100,
    default: 10,
    type: 'integer',
  })
  @IsOptional()
  @Type(() => Number) // Transform query string to number
  @IsInt()
  @Min(1)
  @Max(100) // Set a reasonable max limit
  limit?: number = 10; // Default to 10 items per page

  @ApiPropertyOptional({
    description: 'Filter activities by type (case-insensitive, partial match).',
    example: 'recreational',
    type: 'string',
  })
  @IsOptional()
  @IsString()
  type?: string; // For filtering by activity type

  @ApiPropertyOptional({
    description: 'Field to sort activities by.',
    enum: ActivitySortBy,
    default: ActivitySortBy.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(ActivitySortBy, { message: 'Invalid sortBy value.' }) // Added IsEnum decorator
  sortBy?: ActivitySortBy = ActivitySortBy.CREATED_AT; // Default sort field

  @ApiPropertyOptional({
    description: 'Order to sort activities (ascending or descending).',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder, { message: 'Invalid sortOrder value.' }) // Added IsEnum decorator
  sortOrder?: SortOrder = SortOrder.DESC; // Default sort order

  // You could add more filters here later, e.g.:
  // @IsOptional()
  // @IsEnum(CostLevel)
  // cost_level?: CostLevel;

  // @IsOptional()
  // @Type(() => Number)
  // @IsInt()
  // @Min(1)
  // participants_min?: number;
}
