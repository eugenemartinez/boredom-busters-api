import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  ConflictException, // Make sure ConflictException is imported
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from './entities/user.entity.js';
import { ActivitiesService } from '../activities/activities.service.js';
import { ConfigService } from '@nestjs/config'; // Import ConfigService

// Define a type for the data needed to create a user
// This will typically come from AuthService after password hashing
export type CreateUserInternalDto = Omit<
  Partial<User>,
  'id' | 'created_at' | 'updated_at'
> & {
  email: string;
  password_hash: string;
  username?: string; // username is optional
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly activitiesService: ActivitiesService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService, // Inject ConfigService
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .where('user.email = :email', { email })
      .addSelect('user.password_hash')
      .getOne();
  }

  async findByUsername(username: string): Promise<User | null> {
    if (!username) return null;
    return this.userRepository.findOne({ where: { username } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async create(userData: CreateUserInternalDto): Promise<User> {
    this.logger.log(`Attempting to persist user: ${userData.username || userData.email}`);

    // Check row limit
    const maxUsersEnv = this.configService.get<string>('MAX_ROWS_USERS');
    if (maxUsersEnv) {
      const maxUsers = parseInt(maxUsersEnv, 10);
      if (!isNaN(maxUsers) && maxUsers > 0) {
        const currentUsersCount = await this.userRepository.count();
        this.logger.log(`Current user count: ${currentUsersCount}, Max users limit: ${maxUsers}`);
        if (currentUsersCount >= maxUsers) {
          this.logger.warn(`User registration limit reached. Current: ${currentUsersCount}, Max: ${maxUsers}`);
          throw new ConflictException('User registration limit reached. Cannot create new users at this time.');
        }
      } else if (maxUsersEnv.toLowerCase() !== 'unlimited') {
        this.logger.warn(`Invalid MAX_ROWS_USERS value: ${maxUsersEnv}. Limit check skipped if not positive integer or 'unlimited'.`);
      }
    } else {
      this.logger.log('MAX_ROWS_USERS not set. Skipping user limit check.');
    }

    const newUser = this.userRepository.create(userData);
    try {
      const savedUser = await this.userRepository.save(newUser);
      this.logger.log(`User ${savedUser.username || savedUser.email} persisted successfully with ID ${savedUser.id}`);
      return savedUser;
    } catch (error: unknown) { // Explicitly type 'error' as unknown
      let errorMessage = 'An unknown error occurred while creating the user.';
      let errorStack: string | undefined = undefined; // Explicitly type errorStack
      let errorCode: string | number | undefined = undefined;

      if (error instanceof Error) {
        errorMessage = error.message;
        errorStack = error.stack; // This is now fine
        // Safely check for 'code' property on Error-like objects
        const potentialErrorWithCode = error as Error & { code?: string | number };
        if (potentialErrorWithCode.code !== undefined &&
            (typeof potentialErrorWithCode.code === 'string' || typeof potentialErrorWithCode.code === 'number')) {
          errorCode = potentialErrorWithCode.code;
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        // Handle generic objects that might have message or code properties
        const errorObj = error as { message?: unknown; code?: unknown };

        if (typeof errorObj.message === 'string') {
          errorMessage = errorObj.message;
        } else {
          // Fallback if message is not a string or doesn't exist
          try {
            errorMessage = JSON.stringify(error);
          } catch {
            errorMessage = 'Unserializable error object encountered during user creation.';
          }
        }

        if (errorObj.code !== undefined &&
            (typeof errorObj.code === 'string' || typeof errorObj.code === 'number')) {
          errorCode = errorObj.code;
        }
      }

      this.logger.error(
        `Error saving new user ${userData.username || userData.email}: ${errorMessage}`,
        errorStack,
      );

      if (errorCode === '23505') { // PostgreSQL unique violation
        throw new ConflictException('User with this email or username already exists.');
      }
      throw new InternalServerErrorException('Failed to create user due to a database error.');
    }
  }

  async findUserWithRefreshToken(userId: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .where('user.id = :userId', { userId })
      .addSelect('user.current_hashed_refresh_token') 
      .getOne();
  }

  async update(id: string, updateUserDto: Partial<User>): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      this.logger.warn(`Attempted to update non-existent user with ID: ${id}`);
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    const oldUsername = user.username; 
    const newUsername = updateUserDto.username;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.update(User, id, updateUserDto);

      if (newUsername !== undefined && newUsername !== oldUsername) {
        this.logger.log(
          `Username changed for user ${id} from "${oldUsername}" to "${newUsername}". Updating activities.`,
        );
        if (newUsername && newUsername.trim() !== '') {
          await this.activitiesService.updateContributorNameForUser(
            id,
            newUsername,
          );
        } else if (newUsername === null || newUsername.trim() === '') {
          this.logger.log(
            `Username cleared for user ${id}. Updating contributor_name to empty or null.`,
          );
          await this.activitiesService.updateContributorNameForUser(
            id,
            newUsername || '',
          );
        }
      }

      await queryRunner.commitTransaction();

      const updatedUser = await queryRunner.manager.findOne(User, {
        where: { id },
      });
      if (!updatedUser) {
        this.logger.error(
          `User with ID "${id}" not found after update and transaction commit.`,
        );
        throw new InternalServerErrorException(
          `User with ID "${id}" not found after update.`,
        );
      }
      return updatedUser;
    } catch (error) {
      await queryRunner.rollbackTransaction(); 

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Error processing update for user ${id}: ${errorMessage}`, 
        errorStack,
      );

      if (
        error instanceof InternalServerErrorException &&
        error.message === `User with ID "${id}" not found after update.`
      ) {
        throw error; 
      }

      if (error instanceof NotFoundException) { 
        throw error;
      }
      
      if (
        error instanceof InternalServerErrorException &&
        error.message.includes('Failed to update contributor names')
      ) {
        throw error;
      }
      
      throw new InternalServerErrorException(
        'Failed to update user profile due to an internal error.',
      );
    } finally {
      await queryRunner.release();
    }
  }
}
