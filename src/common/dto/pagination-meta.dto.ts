import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 100, description: 'Total number of items available.' })
  totalItems!: number; // Add !

  @ApiProperty({ example: 10, description: 'Number of items returned in the current page.' })
  itemCount!: number; // Add !

  @ApiProperty({ example: 10, description: 'Number of items requested per page.' })
  itemsPerPage!: number; // Add !

  @ApiProperty({ example: 10, description: 'Total number of pages.' })
  totalPages!: number; // Add !

  @ApiProperty({ example: 1, description: 'The current page number.' })
  currentPage!: number; // Add !
}