import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterUserDto {
  @ApiProperty({
    description: "User's email address (must be unique).",
    example: 'user@example.com',
    maxLength: 255,
    required: true,
  })
  @IsNotEmpty({ message: 'Email should not be empty.' })
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  @MaxLength(255, {
    message: 'Email must be shorter than or equal to 255 characters.',
  })
  email!: string;

  @ApiProperty({
    description: "User's password.",
    example: 'P@$$wOrd123',
    minLength: 8,
    maxLength: 100, // Matches your MaxLength validator
    required: true,
    // If you add the Matches validator back, you can add pattern here:
    // pattern: '/((?=.*\\d)|(?=.*\\W+))(?![.\\n])(?=.*[A-Z])(?=.*[a-z]).*$/',
  })
  @IsNotEmpty({ message: 'Password should not be empty.' })
  @IsString({ message: 'Password must be a string.' })
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @MaxLength(100, {
    message: 'Password must be shorter than or equal to 100 characters.',
  })
  // Optional: Add password complexity regex if desired
  // @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
  //   message: 'Password too weak. It must contain uppercase, lowercase, number or special character.',
  // })
  password!: string;

  @ApiPropertyOptional({
    description: "User's username (must be unique if provided).",
    example: 'cooluser123',
    minLength: 3,
    maxLength: 100,
  })
  @IsOptional()
  @ValidateIf(
    (o: RegisterUserDto) =>
      o.username !== undefined && o.username !== null && o.username !== '',
  ) // Explicitly type 'o'
  @IsString({ message: 'Username must be a string.' })
  @MinLength(3, { message: 'Username must be at least 3 characters long.' })
  @MaxLength(100, {
    message: 'Username must be shorter than or equal to 100 characters.',
  })
  username?: string;
}
