import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  ConflictException, // Import ConflictException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, ILike, FindOptionsWhere } from 'typeorm';
import { Activity, CostLevel } from './entities/activity.entity.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { UpdateActivityDto } from './dto/update-activity.dto.js';
import { User } from '../users/entities/user.entity.js';
import {
  ActivityQueryDto,
  ActivitySortBy,
  SortOrder,
} from './dto/activity-query.dto.js';
import { PaginatedResponse } from '../common/interfaces/paginated-response.interface.js';
import { ConfigService } from '@nestjs/config'; // Import ConfigService

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    private readonly configService: ConfigService, // Inject ConfigService
  ) {}

  async create(
    createActivityDto: CreateActivityDto,
    user: Pick<User, 'id' | 'username'>,
  ): Promise<Activity> {
    if (!user.username) {
      this.logger.warn(
        `User ${user.id} attempted to create activity without a username.`,
      );
      throw new BadRequestException(
        'A username is required to contribute an activity. Please update your profile.',
      );
    }

    // Check row limit for activities
    const maxActivitiesEnv = this.configService.get<string>(
      'MAX_ROWS_ACTIVITIES',
    );
    if (maxActivitiesEnv) {
      const maxActivities = parseInt(maxActivitiesEnv, 10);
      if (!isNaN(maxActivities) && maxActivities > 0) {
        const currentActivitiesCount = await this.activityRepository.count();
        this.logger.log(
          `Current activities count: ${currentActivitiesCount}, Max activities limit: ${maxActivities}`,
        );
        if (currentActivitiesCount >= maxActivities) {
          this.logger.warn(
            `Activity creation limit reached. Current: ${currentActivitiesCount}, Max: ${maxActivities}`,
          );
          throw new ConflictException(
            'Activity creation limit reached. Cannot create new activities at this time.',
          );
        }
      } else if (maxActivitiesEnv.toLowerCase() !== 'unlimited') {
        this.logger.warn(
          `Invalid MAX_ROWS_ACTIVITIES value: ${maxActivitiesEnv}. Limit check skipped if not positive integer or 'unlimited'.`,
        );
      }
    } else {
      this.logger.log(
        'MAX_ROWS_ACTIVITIES not set. Skipping activity limit check.',
      );
    }

    const newActivity = this.activityRepository.create({
      ...createActivityDto,
      user_id: user.id,
      contributor_name: user.username,
      cost_level: createActivityDto.cost_level || CostLevel.FREE,
      participants_min:
        createActivityDto.participants_min === undefined
          ? 1
          : createActivityDto.participants_min,
    });

    this.logger.log(
      `Creating new activity titled "${newActivity.title}" for user ID ${user.id} (contributor: ${user.username})`,
    );
    try {
      return await this.activityRepository.save(newActivity);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to create activity: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          'Failed to create activity due to an unknown error',
          error,
        );
      }
      // Re-throw the original error or a more specific one if needed
      // If it's a DB constraint error, it might be good to map it to a ConflictException
      // For now, re-throwing the original error.
      throw error;
    }
  }

  async findOne(id: string): Promise<Activity> {
    this.logger.log(`Fetching activity with ID: ${id}`);
    const activity = await this.activityRepository.findOne({
      where: { id },
    });
    if (!activity) {
      this.logger.warn(`Activity with ID ${id} not found.`);
      throw new NotFoundException(`Activity with ID ${id} not found.`);
    }
    return activity;
  }

  async update(
    id: string,
    updateActivityDto: UpdateActivityDto,
    userId: string, // ID of the authenticated user trying to update
  ): Promise<Activity> {
    this.logger.log(
      `User ${userId} attempting to update activity with ID: ${id}`,
    );
    const activity = await this.findOne(id); // findOne will throw NotFoundException if not found

    if (activity.user_id !== userId) {
      this.logger.warn(
        `User ${userId} attempted to update activity ${id} owned by ${activity.user_id}. Forbidden.`,
      );
      throw new ForbiddenException(
        'You are not allowed to update this activity.',
      );
    }

    // Merge the updates into the found activity entity
    // TypeORM's save method can also handle partial updates if you pass the ID
    // For explicit control and to ensure only DTO fields are updated:
    Object.assign(activity, updateActivityDto);

    try {
      const updatedActivity = await this.activityRepository.save(activity);
      this.logger.log(`Activity ${id} updated successfully by user ${userId}.`);
      return updatedActivity;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to update activity ${id}: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          `Failed to update activity ${id} due to an unknown error`,
          error,
        );
      }
      throw error; // Or a more specific error like InternalServerErrorException
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    this.logger.log(
      `User ${userId} attempting to delete activity with ID: ${id}`,
    );
    const activity = await this.findOne(id); // findOne will throw NotFoundException if not found

    if (activity.user_id !== userId) {
      this.logger.warn(
        `User ${userId} attempted to delete activity ${id} owned by ${activity.user_id}. Forbidden.`,
      );
      throw new ForbiddenException(
        'You are not allowed to delete this activity.',
      );
    }

    try {
      await this.activityRepository.remove(activity);
      this.logger.log(`Activity ${id} deleted successfully by user ${userId}.`);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to delete activity ${id}: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          `Failed to delete activity ${id} due to an unknown error`,
          error,
        );
      }
      throw error; // Or a more specific error like InternalServerErrorException
    }
  }

  async findAll(
    queryDto: ActivityQueryDto,
  ): Promise<PaginatedResponse<Activity>> {
    // Destructure with defaults for sortBy and sortOrder using const
    // Destructure type with const
    const {
      type,
      sortBy = ActivitySortBy.CREATED_AT,
      sortOrder = SortOrder.DESC,
    } = queryDto;

    // Use let for page and limit as they will be sanitized and potentially reassigned
    let page = queryDto.page;
    let limit = queryDto.limit;

    this.logger.log(
      `Fetching all activities with query: ${JSON.stringify(queryDto)}`,
    );

    // Explicitly validate and default page and limit
    // Ensure page is a positive integer, default to 1
    page = typeof page === 'number' && page >= 1 ? Math.floor(page) : 1;

    // Ensure limit is a positive integer, within a reasonable range (e.g., 1 to 100), default to 10
    const defaultLimit = 10;
    const maxLimit = 100; // Example maximum limit
    limit =
      typeof limit === 'number' && limit >= 1 && limit <= maxLimit
        ? Math.floor(limit)
        : defaultLimit;

    const skip = (page - 1) * limit;

    const findOptions: FindManyOptions<Activity> = {
      skip,
      take: limit,
      order: {
        [sortBy]: sortOrder, // Use const sortBy and sortOrder
      },
      where: {},
    };

    if (type) {
      // Use const type
      (findOptions.where as FindOptionsWhere<Activity>).type = ILike(
        `%${type}%`,
      );
    }

    try {
      const [activities, totalItems] =
        await this.activityRepository.findAndCount(findOptions);
      const totalPages = Math.ceil(totalItems / limit);

      return {
        data: activities,
        meta: {
          totalItems,
          itemCount: activities.length,
          itemsPerPage: limit,
          totalPages,
          currentPage: page,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to fetch activities: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          'Failed to fetch activities due to an unknown error',
          error,
        );
      }
      throw error;
    }
  }

  async findRandom(queryDto: ActivityQueryDto): Promise<Activity> {
    const { type } = queryDto; // Extract relevant filters, e.g., type
    this.logger.log(
      `Fetching a random activity with query: ${JSON.stringify(queryDto)}`,
    );

    const whereConditions: FindOptionsWhere<Activity> = {};
    if (type) {
      whereConditions.type = ILike(`%${type}%`);
    }
    // Add other filters from queryDto to whereConditions if needed
    // e.g., cost_level, participants_min, etc.

    try {
      // Fetch all activities matching the criteria
      const matchingActivities = await this.activityRepository.find({
        where: whereConditions,
      });

      if (matchingActivities.length === 0) {
        this.logger.warn(
          `No activities found matching criteria for random selection: ${JSON.stringify(
            whereConditions,
          )}`,
        );
        throw new NotFoundException(
          'No activities found matching your criteria.',
        );
      }

      // Select one at random
      const randomIndex = Math.floor(Math.random() * matchingActivities.length);
      const randomActivity = matchingActivities[randomIndex];

      this.logger.log(
        `Random activity selected: ${randomActivity.id} - ${randomActivity.title}`,
      );
      return randomActivity;
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Re-throw NotFoundException directly
        throw error;
      }
      if (error instanceof Error) {
        this.logger.error(
          `Failed to fetch random activity: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          'Failed to fetch random activity due to an unknown error',
          error,
        );
      }
      // Consider throwing a more specific error or a generic InternalServerErrorException
      throw new InternalServerErrorException(
        'Could not retrieve a random activity.',
      );
    }
  }

  async findUniqueTypes(): Promise<string[]> {
    this.logger.log('Fetching unique activity types.');
    try {
      const distinctTypesResult = await this.activityRepository
        .createQueryBuilder('activity')
        .select('DISTINCT activity.type', 'type')
        .orderBy('type', 'ASC') // The DB query attempts to sort
        .getRawMany<{ type: string }>();

      const filteredTypes = distinctTypesResult
        .map((result) => result.type)
        .filter((type) => type && type.trim() !== '');

      // Add explicit uniqueness and sorting in JavaScript
      const uniqueSortedTypes = [...new Set(filteredTypes)].sort((a, b) =>
        a.localeCompare(b),
      );

      this.logger.log(`Found unique types: ${uniqueSortedTypes.join(', ')}`);
      return uniqueSortedTypes;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to fetch unique activity types: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          'Failed to fetch unique activity types due to an unknown error',
          error,
        );
      }
      throw new InternalServerErrorException(
        'Could not retrieve activity types.',
      );
    }
  }

  async findAllByUserId(
    userId: string,
    queryDto: ActivityQueryDto,
  ): Promise<PaginatedResponse<Activity>> {
    const {
      page = 1,
      limit = 10,
      type,
      sortBy = ActivitySortBy.CREATED_AT,
      sortOrder = SortOrder.DESC,
    } = queryDto;
    this.logger.log(
      `Fetching activities for user ID ${userId} with query: ${JSON.stringify(
        queryDto,
      )}`,
    );

    const skip = (page - 1) * limit;

    const findOptions: FindManyOptions<Activity> = {
      where: { user_id: userId },
      skip,
      take: limit,
      order: {
        [sortBy]: sortOrder,
      },
    };

    if (type) {
      (findOptions.where as FindOptionsWhere<Activity>).type = ILike(
        `%${type}%`,
      );
    }

    try {
      const [activities, totalItems] =
        await this.activityRepository.findAndCount(findOptions);
      const totalPages = Math.ceil(totalItems / limit);

      return {
        data: activities,
        meta: {
          totalItems,
          itemCount: activities.length,
          itemsPerPage: limit,
          totalPages,
          currentPage: page,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to fetch activities for user ${userId}: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          `Failed to fetch activities for user ${userId} due to an unknown error`,
          error,
        );
      }
      throw new InternalServerErrorException(
        'Could not retrieve user activities.',
      );
    }
  }

  async updateContributorNameForUser(
    userId: string,
    newUsername: string,
  ): Promise<void> {
    this.logger.log(
      `Updating contributor_name to "${newUsername}" for all activities by user ID ${userId}.`,
    );
    try {
      // Use QueryBuilder for a bulk update
      const updateResult = await this.activityRepository
        .createQueryBuilder()
        .update(Activity)
        .set({ contributor_name: newUsername })
        .where('user_id = :userId', { userId })
        .execute();

      this.logger.log(
        `Updated contributor_name for ${updateResult.affected || 0} activities for user ID ${userId}.`,
      );
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to update contributor_name for user ${userId}: ${error.message}`,
          error.stack,
        );
      } else {
        this.logger.error(
          `Failed to update contributor_name for user ${userId} due to an unknown error`,
          error,
        );
      }
      // Depending on your error handling strategy, you might want to throw an error here
      // For now, just logging, as this might be part of a larger transaction in UsersService
      // or a background task. If it's critical, throw InternalServerErrorException.
      throw new InternalServerErrorException(
        `Failed to update contributor names for user ${userId}.`,
      );
    }
  }
}
