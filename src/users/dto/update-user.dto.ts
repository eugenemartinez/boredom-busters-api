import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger'; // Import Swagger decorator

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: "User's new username. Must be unique.",
    example: 'newCoolUser124',
    minLength: 3,
    maxLength: 30, // Or your preferred max length for username
    pattern: '^[a-zA-Z0-9_]+$',
  })
  @IsOptional() // Make it optional so users can update only what they want
  @IsString()
  @IsNotEmpty() // If provided, it shouldn't be empty
  @MinLength(3)
  @MaxLength(30) // Or your preferred max length for username
  @Matches(/^[a-zA-Z0-9_]+$/, {
    // Example: Alphanumeric and underscores
    message: 'Username can only contain letters, numbers, and underscores.',
  })
  username?: string;

  // You could add other updatable fields here later, e.g.:
  // @ApiPropertyOptional({ description: "User's biography." example: "Loves coding and hiking."})
  // @IsOptional()
  // @IsString()
  // bio?: string;
}
