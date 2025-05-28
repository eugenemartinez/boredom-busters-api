import { ApiProperty } from '@nestjs/swagger';
import { Type } from '@nestjs/common';
import { PaginationMetaDto } from './pagination-meta.dto.js';

// This is a helper function to create a typed PaginatedResponseDto
// because Swagger needs a concrete type for T at decoration time.
export function PaginatedResponseDto<TItemDto extends Type<unknown>>(TItemDtoClass: TItemDto) {
  abstract class PaginatedResponseClass {
    @ApiProperty({
      isArray: true,
      type: () => TItemDtoClass, // Use the passed-in class
    })
    data!: InstanceType<TItemDto>[]; // Add !

    @ApiProperty({ type: () => PaginationMetaDto })
    meta!: PaginationMetaDto; // Add !
  }
  return PaginatedResponseClass;
}