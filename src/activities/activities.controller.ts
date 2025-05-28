import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpStatus,
  HttpCode,
  Logger,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Delete,
  Query,
} from '@nestjs/common';
import { ActivitiesService } from './activities.service.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { UpdateActivityDto } from './dto/update-activity.dto.js';
import { ActivityQueryDto } from './dto/activity-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AuthenticatedRequest } from '../auth/auth.controller.js';
import { Activity } from './entities/activity.entity.js';
import { PaginatedActivityResponseDto } from './dto/paginated-activity-response.dto.js';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Activities')
@Controller('activities')
export class ActivitiesController {
  private readonly logger = new Logger(ActivitiesController.name);

  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new activity' })
  @ApiBody({ type: CreateActivityDto, description: 'Data for the new activity' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'The activity has been successfully created.',
    type: Activity,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden. User may need a username.' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Conflict. Activity creation limit reached.' })
  async create(
    @Body() createActivityDto: CreateActivityDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Activity> {
    const user = request.user;
    this.logger.log(
      `User ${user.id} (${user.email}) attempting to create activity: ${createActivityDto.title}`,
    );
    const userPayloadForService = { id: user.id, username: user.username };
    return this.activitiesService.create(
      createActivityDto,
      userPayloadForService,
    );
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a paginated list of activities' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully retrieved a list of activities.',
    type: PaginatedActivityResponseDto,
  })
  async findAll(
    @Query() queryDto: ActivityQueryDto,
  ): Promise<PaginatedActivityResponseDto> {
    this.logger.log(
      `Request to fetch all activities with query: ${JSON.stringify(queryDto)}`,
    );
    return this.activitiesService.findAll(queryDto);
  }

  @Get('random')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a random activity' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully retrieved a random activity.',
    type: Activity,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No activities found matching criteria.' })
  async findRandom(@Query() queryDto: ActivityQueryDto): Promise<Activity> {
    this.logger.log(
      `Request to fetch a random activity with query: ${JSON.stringify(queryDto)}`,
    );
    return this.activitiesService.findRandom(queryDto);
  }

  @Get('types')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all unique activity types' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully retrieved unique activity types.',
    type: [String],
    example: ['music', 'sports', 'cooking'],
  })
  async getUniqueActivityTypes(): Promise<string[]> {
    this.logger.log('Request to fetch unique activity types.');
    return this.activitiesService.findUniqueTypes();
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a specific activity by its ID' })
  @ApiParam({ name: 'id', description: 'The UUID of the activity', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully retrieved the activity.',
    type: Activity,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Activity not found.' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Activity> {
    this.logger.log(`Request to fetch activity with ID: ${id}`);
    return this.activitiesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an existing activity' })
  @ApiParam({ name: 'id', description: 'The UUID of the activity to update', type: 'string', format: 'uuid' })
  @ApiBody({ type: UpdateActivityDto, description: 'Data to update the activity' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The activity has been successfully updated.',
    type: Activity,
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden. User does not own this activity.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Activity not found.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateActivityDto: UpdateActivityDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<Activity> {
    const userId = request.user.id;
    this.logger.log(
      `User ${userId} attempting to update activity ${id} with DTO: ${JSON.stringify(updateActivityDto)}`,
    );
    return this.activitiesService.update(id, updateActivityDto, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an activity' })
  @ApiParam({ name: 'id', description: 'The UUID of the activity to delete', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'The activity has been successfully deleted.',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden. User does not own this activity.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Activity not found.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const userId = request.user.id;
    this.logger.log(`User ${userId} attempting to delete activity ${id}`);
    await this.activitiesService.remove(id, userId);
  }
}
