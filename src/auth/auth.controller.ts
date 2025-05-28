import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Req,
} from '@nestjs/common';
import {
  AuthService,
  LoginResponse,
  RefreshTokenResponse,
} from './auth.service.js'; // Import RefreshTokenResponse
import { RegisterUserDto } from './dto/register-user.dto.js';
import { LoginUserDto } from './dto/login-user.dto.js';
import { User } from '../users/entities/user.entity.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard.js';
import { Request } from 'express';
import { IsNotEmpty, IsString } from 'class-validator';
import { Activity } from '../activities/entities/activity.entity.js'; // Make sure this import is present
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiProperty,
  ApiPropertyOptional,
  ApiBearerAuth,
} from '@nestjs/swagger';

// Define an interface for the request object with the user property (for access tokens)
export interface AuthenticatedRequest extends Request {
  user: Omit<User, 'password_hash' | 'current_hashed_refresh_token'>; // User from JwtStrategy
}

// Define an interface for the request object when using JwtRefreshAuthGuard
interface RefreshTokenRequest extends Request {
  user: Omit<User, 'password_hash' | 'current_hashed_refresh_token'>; // User from JwtRefreshStrategy
  // body will contain refreshToken, but JwtRefreshStrategy extracts it.
  // We can also access the raw refresh token from req.body if needed here,
  // but the strategy already validates it against the stored hash.
}

// DTO for the refresh token request body
export class RefreshTokenDto {
  @ApiProperty({ // Added for Swagger
    description: 'The refresh token provided by the login endpoint.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

// Describes the user object returned in responses (excluding sensitive fields)
export class UserResponseDto implements Omit<User, 'password_hash' | 'current_hashed_refresh_token'> {
  @ApiProperty({ example: 'clx2k9q6o0000u0ph5q5g2q5g', description: 'Unique identifier for the user' })
  id!: string;

  @ApiProperty({ example: 'user@example.com', description: 'User\'s email address' })
  email!: string;

  @ApiPropertyOptional({ example: 'cooluser123', description: 'User\'s username (can be null)' })
  username!: string | null; // Matches User entity: string | null

  @ApiProperty({ example: '2023-10-27T07:49:12.123Z', description: 'Timestamp of user creation' })
  created_at!: Date;

  @ApiProperty({ example: '2023-10-27T07:49:12.123Z', description: 'Timestamp of last user update' })
  updated_at!: Date;

  // activities is part of Omit<User, 'password_hash' | 'current_hashed_refresh_token'>
  // Assuming activities are loaded and returned by the service for login/me endpoints.
  // If activities are complex, you might want a separate ActivityResponseDto.
  // For now, using the Activity entity directly.
  @ApiProperty({
    type: () => [Activity], // Use a function to prevent circular dependency issues with Swagger
    description: 'List of activities contributed by or associated with the user (if loaded)',
    required: false, // Or true if always present and populated
  })
  activities!: Activity[];
}

// Describes the response for a successful login
export class LoginResponseDto implements LoginResponse {
  @ApiProperty({ description: 'Access Token for authenticated requests', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string; // Matches LoginResponse interface (camelCase)

  @ApiProperty({ description: 'Refresh Token to get a new access token', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken!: string; // Matches LoginResponse interface (camelCase)

  @ApiProperty({ type: UserResponseDto, description: 'Details of the logged-in user' })
  user!: UserResponseDto;
}

// Describes the response for a successful token refresh
export class RefreshTokenResponseDto implements RefreshTokenResponse {
  @ApiProperty({ description: 'New Access Token', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string; // Matches RefreshTokenResponse interface (camelCase)

  @ApiProperty({ description: 'New Refresh Token', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken!: string; // Matches RefreshTokenResponse interface (camelCase)
}

// DTO for status response
export class StatusResponseDto {
  @ApiProperty({ example: 'OK', description: 'Status of the authentication' })
  status!: string;

  @ApiProperty({ example: 'You are authenticated!', description: 'Additional message' })
  message!: string;
}

// DTO for logout response
export class LogoutResponseDto {
  @ApiProperty({ example: 'User successfully logged out.', description: 'Logout success message' })
  message!: string;
}

@ApiTags('Authentication')
@Controller('auth') // Base path for all routes in this controller will be /auth
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register') // Handles POST requests to /auth/register
  @HttpCode(HttpStatus.CREATED) // Set default HTTP status code for successful registration
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterUserDto, description: 'Data for user registration' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User successfully registered. Returns the new user object (excluding sensitive fields).',
    type: UserResponseDto, // Use the DTO for clear response schema
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data (e.g., validation error).' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email or username already exists, or user registration limit reached.' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Internal server error during registration.' })
  async register(
    @Body() registerUserDto: RegisterUserDto,
  ): Promise<Omit<User, 'password_hash' | 'current_hashed_refresh_token'>> {
    // Updated return type to match service
    // The actual return from service is Omit<User, 'password_hash' | 'current_hashed_refresh_token'>
    // which UserResponseDto implements.
    return this.authService.register(registerUserDto);
  }

  @Post('login') // Handles POST requests to /auth/login
  @HttpCode(HttpStatus.OK) // Standard success code for login
  @ApiOperation({ summary: 'Log in an existing user' })
  @ApiBody({ type: LoginUserDto, description: 'Credentials for user login' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User successfully logged in. Returns access token, refresh token, and user details.',
    type: LoginResponseDto, // Use the DTO for clear response schema
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data (e.g., validation error).' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid credentials (email or password incorrect).' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Internal server error during login.' })
  async login(@Body() loginUserDto: LoginUserDto): Promise<LoginResponse> {
    return this.authService.login(loginUserDto);
  }

  // New protected route
  @UseGuards(JwtAuthGuard) // Apply the guard here
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth() // Indicates that this endpoint requires a Bearer token
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns the authenticated user\'s profile information.',
    type: UserResponseDto, // Use the existing DTO
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized - No token or invalid token provided.' })
  getProfile(
    @Req() request: AuthenticatedRequest,
  ): Omit<User, 'password_hash' | 'current_hashed_refresh_token'> {
    return request.user;
  }

  // Example of another protected route
  @UseGuards(JwtAuthGuard)
  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check authentication status' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Confirms that the user is authenticated.',
    type: StatusResponseDto, // Use the new DTO
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized - No token or invalid token provided.' })
  getStatus(): { status: string; message: string } { // Return type matches StatusResponseDto
    return { status: 'OK', message: 'You are authenticated!' };
  }

  // New endpoint for refreshing tokens
  @UseGuards(JwtRefreshAuthGuard) // Protect with JwtRefreshAuthGuard
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth() // Refresh token is typically sent in body, but endpoint itself is "auth related"
  @ApiOperation({ summary: 'Refresh access and refresh tokens' })
  @ApiBody({ type: RefreshTokenDto, description: 'The current refresh token.' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully refreshed tokens. Returns new access and refresh tokens.',
    type: RefreshTokenResponseDto, // Use the existing DTO
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized - Invalid or expired refresh token.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Bad Request - Refresh token not provided or malformed.' })
  async refreshTokens(
    @Req() request: RefreshTokenRequest,
    @Body() body: RefreshTokenDto,
  ): Promise<RefreshTokenResponse> {
    const userId = request.user.id;
    return this.authService.refreshToken(userId, body.refreshToken);
  }

  @UseGuards(JwtAuthGuard) // Protect with JwtAuthGuard (requires valid access token)
  @Post('logout') // Could also be a PATCH or DELETE request based on preference
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out the current user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User successfully logged out.',
    type: LogoutResponseDto, // Use the new DTO
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized - No token or invalid token provided.' })
  @ApiResponse({ status: HttpStatus.INTERNAL_SERVER_ERROR, description: 'Internal server error during logout.' })
  async logout(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ message: string }> { // Return type matches LogoutResponseDto
    const userId = request.user.id;
    return this.authService.logout(userId);
  }
}
