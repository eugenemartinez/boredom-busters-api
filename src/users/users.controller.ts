import {
  Controller,
  Patch,
  Body,
  UseGuards,
  Req,
  Get,
  Logger,
  HttpCode,
  HttpStatus,
  ConflictException,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  AuthenticatedRequest,
  UserResponseDto,
} from '../auth/auth.controller.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { User } from './entities/user.entity.js';
import { ActivitiesService } from '../activities/activities.service.js';
import { ActivityQueryDto } from '../activities/dto/activity-query.dto.js';
import { PaginatedActivityResponseDto } from '../activities/dto/paginated-activity-response.dto.js';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  // Endpoint for the authenticated user to get their own profile
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth() // Requires Bearer token
  @ApiOperation({ summary: "Get the authenticated user's profile" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Successfully retrieved the authenticated user's profile.",
    type: UserResponseDto, // Use UserResponseDto for consistent user representation
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized.' })
  getProfile(
    @Req() request: AuthenticatedRequest,
  ): UserResponseDto { // Return type matches UserResponseDto
    this.logger.log(`User ${request.user.id} fetching their profile.`);
    return request.user; // request.user is already Omit<User, 'password_hash' | 'current_hashed_refresh_token'>
  }

  // Endpoint for the authenticated user to update their own profile
  @UseGuards(JwtAuthGuard)
  @Patch('me') // PATCH /api/users/me
  @HttpCode(HttpStatus.OK) // Default success code
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update the authenticated user's profile" })
  @ApiBody({ type: UpdateUserDto, description: "Data to update the user's profile" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "The user's profile has been successfully updated.",
    type: UserResponseDto, // Use UserResponseDto
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized.' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Conflict. Username already taken.' })
  async updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> { // Return type matches UserResponseDto
    const userId = request.user.id;
    this.logger.log(
      `User ${userId} attempting to update their profile with DTO: ${JSON.stringify(updateUserDto)}`,
    );

    const allowedUpdates: Partial<User> = {};
    if (updateUserDto.username !== undefined) {
      // Check if username is actually changing to avoid unnecessary DB query
      if (updateUserDto.username !== request.user.username) {
        const existingUserByNewUsername =
          await this.usersService.findByUsername(updateUserDto.username);
        if (
          existingUserByNewUsername &&
          existingUserByNewUsername.id !== userId
        ) {
          this.logger.warn(
            `User ${userId} attempted to update username to ${updateUserDto.username} which is already taken.`,
          );
          throw new ConflictException('Username already taken.');
        }
      }
      allowedUpdates.username = updateUserDto.username;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      this.logger.log(
        `User ${userId} submitted an empty update DTO. No changes made. Returning current profile.`,
      );
      // Ensure the returned object matches UserResponseDto structure
      // request.user is already Omit<User, 'password_hash' | 'current_hashed_refresh_token'>
      return request.user;
    }

    const updatedUserEntity = await this.usersService.update(userId, allowedUpdates);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, current_hashed_refresh_token, ...result } = updatedUserEntity;
    return result; // result is Omit<User, 'password_hash' | 'current_hashed_refresh_token'>
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/activities') // GET /api/users/me/activities
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the authenticated user's activities" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Successfully retrieved the authenticated user's activities.",
    type: PaginatedActivityResponseDto, // Use the DTO defined for paginated activities
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized.' })
  async getMyActivities(
    @Req() request: AuthenticatedRequest,
    @Query() queryDto: ActivityQueryDto,
  ): Promise<PaginatedActivityResponseDto> { // Ensure return type matches Swagger DTO
    const userId = request.user.id;
    this.logger.log(
      `User ${userId} fetching their activities with query: ${JSON.stringify(queryDto)}`,
    );
    // Ensure this.activitiesService.findAllByUserId returns a structure compatible with PaginatedActivityResponseDto
    return this.activitiesService.findAllByUserId(userId, queryDto);
  }
}
