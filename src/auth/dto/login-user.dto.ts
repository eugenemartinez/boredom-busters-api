import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger'; // Import ApiProperty

export class LoginUserDto {
  @ApiProperty({
    description: "User's registered email address.",
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
    required: true,
  })
  @IsNotEmpty({ message: 'Password should not be empty.' })
  @IsString({ message: 'Password must be a string.' })
  // No MinLength/MaxLength here usually, as we just check against the hash
  password!: string;
}
