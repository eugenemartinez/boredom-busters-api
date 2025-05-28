import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { 
  BadRequestException, 
  Logger, 
  NotFoundException, 
  InternalServerErrorException,
  ForbiddenException,
  ConflictException, // Add ConflictException
} from '@nestjs/common';
import { ActivitiesService } from './activities.service.js';
import { Activity, CostLevel } from './entities/activity.entity.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { ActivityQueryDto, ActivitySortBy, SortOrder } from './dto/activity-query.dto.js';
import { User } from '../users/entities/user.entity.js';
import { ILike } from 'typeorm';
import { UpdateActivityDto } from './dto/update-activity.dto.js';
import { ConfigService } from '@nestjs/config';

// Define a more specific mock type for ConfigService
interface MockConfigService {
  get: jest.Mock<string | number | boolean | undefined, [string, any?]>; // Adjust return type as needed
  // Add other methods of ConfigService if you mock them
}

// Define a more specific mock type for Activity repository
type MockActivityRepository = {
  create: jest.Mock;
  save: jest.Mock;
  findAndCount: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
  remove: jest.Mock;
  createQueryBuilder: jest.Mock;
  count: jest.Mock; // Add count mock
};

const createMockActivityRepository = (): MockActivityRepository => ({
  create: jest.fn(),
  save: jest.fn(),
  findAndCount: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
  count: jest.fn(), // Initialize count mock
});

describe('ActivitiesService', () => {
  let service: ActivitiesService;
  let activityRepository: MockActivityRepository; 
  let configServiceMock: MockConfigService; // Use the more specific type
  let loggerErrorSpy: jest.SpyInstance;
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  const mockUserForActivity = (userId: string, username: string): User => {
    return {
      id: userId,
      email: `${username.toLowerCase()}@example.com`,
      username: username,
      password_hash: 'mock_hash',
      created_at: new Date(),
      updated_at: new Date(),
      current_hashed_refresh_token: null,
      activities: [],
    } as User;
  };

  const mockActivities: Activity[] = [
    { 
      id: 'activity-id-1', title: 'Global Activity 1', type: 'recreational', description: 'Desc 1', 
      cost_level: CostLevel.FREE, 
      participants_min: 1, 
      created_at: new Date("2023-01-01T10:00:00.000Z"), updated_at: new Date("2023-01-01T10:00:00.000Z"), 
      user_id: 'user-id-alpha', // Ensure this user_id is used in findAllByUserId tests
      contributor_name: 'UserAlpha',
      user: mockUserForActivity('user-id-alpha', 'UserAlpha'),
      participants_max: null, duration_min: null, duration_max: null,
    } as Activity,
    { 
      id: 'activity-id-2', title: 'Global Activity 2', type: 'social', description: 'Desc 2', 
      cost_level: CostLevel.LOW, 
      participants_min: 2, 
      created_at: new Date("2023-01-02T10:00:00.000Z"), updated_at: new Date("2023-01-02T10:00:00.000Z"), 
      user_id: 'user-id-beta', 
      contributor_name: 'UserBeta',
      user: mockUserForActivity('user-id-beta', 'UserBeta'),
      participants_max: null, duration_min: null, duration_max: null,
    } as Activity,
    { 
      id: 'activity-id-3', title: 'Alpha User Activity 2', type: 'education', description: 'Desc 3 for Alpha', 
      cost_level: CostLevel.MEDIUM, 
      participants_min: 1, 
      created_at: new Date("2023-01-03T10:00:00.000Z"), updated_at: new Date("2023-01-03T10:00:00.000Z"), 
      user_id: 'user-id-alpha', // Another activity for user-id-alpha
      contributor_name: 'UserAlpha',
      user: mockUserForActivity('user-id-alpha', 'UserAlpha'),
      participants_max: 5, duration_min: 30, duration_max: 60,
    } as Activity,
  ];

  beforeEach(async () => {
    configServiceMock = { // Initialize with the defined structure
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivitiesService,
        {
          provide: getRepositoryToken(Activity),
          useValue: createMockActivityRepository(), 
        },
        {
          provide: ConfigService,
          useValue: configServiceMock, // This is now type-safe
        },
      ],
    }).compile();

    service = module.get<ActivitiesService>(ActivitiesService);
    activityRepository = module.get<MockActivityRepository>(
      getRepositoryToken(Activity),
    );
    // configServiceMock will be the instance we defined above, no need to module.get it again for the mock variable
    
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const mockUser: Pick<User, 'id' | 'username'> = {
      id: 'user-uuid-123',
      username: 'testuser',
    };

    const createActivityDto: CreateActivityDto = {
      title: 'Test Activity',
      description: 'A great activity for testing.',
      type: 'recreational',
    };
    
    // Define a base mockActivityEntity for use in row limit tests
    const mockActivityEntityForCreate = {
        id: 'activity-uuid-for-create',
        ...createActivityDto,
        user_id: mockUser.id,
        contributor_name: mockUser.username,
        cost_level: CostLevel.FREE,
        participants_min: 1,
        created_at: new Date(),
        updated_at: new Date(),
    } as Activity;

    beforeEach(() => {
      // Default setup for most 'create' tests
      activityRepository.create.mockImplementation(dto => ({ ...dto, id: 'mock-id' }  as Partial<Activity>)); // Adjust if more specific mock needed
      activityRepository.save.mockImplementation(entity => Promise.resolve({ ...entity, created_at: new Date(), updated_at: new Date() }));
      
      // Default ConfigService behavior: MAX_ROWS_ACTIVITIES is 'unlimited' or not set
      configServiceMock.get.mockImplementation((key: string) => {
        if (key === 'MAX_ROWS_ACTIVITIES') {
          return 'unlimited'; // Default to unlimited
        }
        return undefined;
      });
      activityRepository.count.mockResolvedValue(0); // Default count is 0
    });

    it('should successfully create an activity with user_id and contributor_name', async () => {
      const activityData = {
        ...createActivityDto,
        user_id: mockUser.id,
        contributor_name: mockUser.username,
        cost_level: CostLevel.FREE, // Default
        participants_min: 1, // Default
      };
      const expectedActivity = { 
        id: 'activity-uuid-456', 
        ...activityData 
      } as Activity;

      activityRepository.create.mockReturnValue(activityData); 
      activityRepository.save.mockResolvedValue(expectedActivity); 

      const result = await service.create(createActivityDto, mockUser);

      expect(activityRepository.create).toHaveBeenCalledWith({
        ...createActivityDto,
        user_id: mockUser.id,
        contributor_name: mockUser.username,
        cost_level: CostLevel.FREE, // Expecting default
        participants_min: 1, // Expecting default
      });
      expect(activityRepository.save).toHaveBeenCalledWith(activityData);
      expect(result).toEqual(expectedActivity);
      // Check for the MAX_ROWS_ACTIVITIES log if it's "unlimited" or not set
      // Based on the service logic, if 'unlimited', no specific log about count check is made,
      // but the "MAX_ROWS_ACTIVITIES not set. Skipping activity limit check." or the "Invalid..." log might appear
      // or no log if it's 'unlimited' and the condition `maxActivitiesEnv.toLowerCase() !== 'unlimited'` is false.
      // The service logs "MAX_ROWS_ACTIVITIES not set..." if get returns undefined.
      // If it returns 'unlimited', the specific 'else if' for invalid values is skipped.
      // So, no specific log about row limit is made if it's 'unlimited'.
      // The initial log `Creating new activity...` is still expected.
      expect(loggerLogSpy).toHaveBeenCalledWith(
        `Creating new activity titled "${createActivityDto.title}" for user ID ${mockUser.id} (contributor: ${mockUser.username})`
      );
    });

    it('should set default cost_level (FREE) and participants_min (1) if not provided', async () => {
      const dtoWithoutDefaults: CreateActivityDto = {
        title: 'Default Test',
        description: 'Testing defaults.',
        type: 'education',
        // cost_level and participants_min are omitted
      };
      const activityData = {
        ...dtoWithoutDefaults,
        user_id: mockUser.id,
        contributor_name: mockUser.username,
        cost_level: CostLevel.FREE, // Expected default
        participants_min: 1,        // Expected default
      };
      const expectedActivity = { id: 'activity-uuid-789', ...activityData } as Activity;

      activityRepository.create.mockReturnValue(activityData);
      activityRepository.save.mockResolvedValue(expectedActivity);

      await service.create(dtoWithoutDefaults, mockUser);

      expect(activityRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cost_level: CostLevel.FREE,
          participants_min: 1,
        }),
      );
      expect(activityRepository.save).toHaveBeenCalledWith(activityData);
    });

    it('should use provided cost_level and participants_min if present in DTO', async () => {
      const dtoWithValues: CreateActivityDto = {
        title: 'Provided Values Test',
        description: 'Testing provided values.',
        type: 'social',
        cost_level: CostLevel.LOW,
        participants_min: 2,
      };
      const activityData = {
        ...dtoWithValues,
        user_id: mockUser.id,
        contributor_name: mockUser.username,
        // cost_level and participants_min are from dtoWithValues
      };
      const expectedActivity = { id: 'activity-uuid-101', ...activityData } as Activity;

      activityRepository.create.mockReturnValue(activityData);
      activityRepository.save.mockResolvedValue(expectedActivity);

      await service.create(dtoWithValues, mockUser);

      expect(activityRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cost_level: CostLevel.LOW,
          participants_min: 2,
        }),
      );
      expect(activityRepository.save).toHaveBeenCalledWith(activityData);
    });

    it('should use provided participants_min if it is 0', async () => {
      const dtoWithZeroParticipants: CreateActivityDto = {
        title: 'Zero Participants Test',
        description: 'Testing zero participants.',
        type: 'diy',
        participants_min: 0, // Explicitly setting to 0
      };
      const activityData = {
        ...dtoWithZeroParticipants,
        user_id: mockUser.id,
        contributor_name: mockUser.username,
        cost_level: CostLevel.FREE, // Default
        participants_min: 0,
      };
      const expectedActivity = { id: 'activity-uuid-112', ...activityData } as Activity;
    
      activityRepository.create.mockReturnValue(activityData);
      activityRepository.save.mockResolvedValue(expectedActivity);
    
      await service.create(dtoWithZeroParticipants, mockUser);
    
      expect(activityRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          participants_min: 0,
        }),
      );
      expect(activityRepository.save).toHaveBeenCalledWith(activityData);
    });

    it('should throw BadRequestException if user.username is missing', async () => {
      loggerLogSpy.mockClear(); // Clear the spy before this specific test action

      const mockUserWithoutUsername: Pick<User, 'id' | 'username'> = {
        id: 'user-uuid-456',
        username: null, 
      };
      const dto: CreateActivityDto = {
        title: 'No Username Test',
        description: 'This should fail.',
        type: 'charity',
      };

      await expect(service.create(dto, mockUserWithoutUsername)).rejects.toThrow(
        new BadRequestException(
          'A username is required to contribute an activity. Please update your profile.',
        ),
      );

      expect(activityRepository.create).not.toHaveBeenCalled();
      expect(activityRepository.save).not.toHaveBeenCalled();
      expect(loggerLogSpy).not.toHaveBeenCalled(); 
    });

    it('should throw BadRequestException if user.username is an empty string', async () => {
      loggerLogSpy.mockClear(); // Clear the spy for this test too

      const mockUserWithEmptyUsername: Pick<User, 'id' | 'username'> = {
        id: 'user-uuid-789',
        username: '', 
      };
      const dto: CreateActivityDto = {
        title: 'Empty Username Test',
        description: 'This should also fail.',
        type: 'cooking',
      };

      await expect(service.create(dto, mockUserWithEmptyUsername)).rejects.toThrow(
        new BadRequestException(
          'A username is required to contribute an activity. Please update your profile.',
        ),
      );
      expect(activityRepository.create).not.toHaveBeenCalled();
      expect(activityRepository.save).not.toHaveBeenCalled();
      expect(loggerLogSpy).not.toHaveBeenCalled(); 
    });

    // --- Tests for MAX_ROWS_ACTIVITIES ---
    describe('row limit logic (MAX_ROWS_ACTIVITIES)', () => {
      // Use the mockActivityEntityForCreate defined in the parent describe
      beforeEach(() => {
          // Ensure create and save are mocked for these specific tests if needed differently
          activityRepository.create.mockReturnValue(mockActivityEntityForCreate);
          activityRepository.save.mockResolvedValue(mockActivityEntityForCreate);
      });

      it('should allow creation if MAX_ROWS_ACTIVITIES is not set', async () => {
        configServiceMock.get.mockImplementation((key: string) => { // Override for this test
            if (key === 'MAX_ROWS_ACTIVITIES') return undefined;
            return undefined;
        });
        await expect(service.create(createActivityDto, mockUser)).resolves.toEqual(mockActivityEntityForCreate);
        expect(activityRepository.count).not.toHaveBeenCalled();
        expect(loggerLogSpy).toHaveBeenCalledWith('MAX_ROWS_ACTIVITIES not set. Skipping activity limit check.');
      });

      it('should allow creation if MAX_ROWS_ACTIVITIES is "unlimited"', async () => {
        configServiceMock.get.mockImplementation((key: string) => { // Override for this test
            if (key === 'MAX_ROWS_ACTIVITIES') return 'unlimited';
            return undefined;
        });
        await expect(service.create(createActivityDto, mockUser)).resolves.toEqual(mockActivityEntityForCreate);
        expect(activityRepository.count).not.toHaveBeenCalled();
        // No specific log for "unlimited" other than the general creation log
      });

      it('should allow creation and log warning if MAX_ROWS_ACTIVITIES is an invalid non-numeric string (not "unlimited")', async () => {
        configServiceMock.get.mockImplementation((key: string) => {
            if (key === 'MAX_ROWS_ACTIVITIES') return 'not-a-number';
            return undefined;
        });
        await expect(service.create(createActivityDto, mockUser)).resolves.toEqual(mockActivityEntityForCreate);
        expect(loggerWarnSpy).toHaveBeenCalledWith("Invalid MAX_ROWS_ACTIVITIES value: not-a-number. Limit check skipped if not positive integer or 'unlimited'.");
        expect(activityRepository.count).not.toHaveBeenCalled();
      });

      it('should allow creation and log warning if MAX_ROWS_ACTIVITIES is zero', async () => {
        configServiceMock.get.mockImplementation((key: string) => {
            if (key === 'MAX_ROWS_ACTIVITIES') return '0';
            return undefined;
        });
        await expect(service.create(createActivityDto, mockUser)).resolves.toEqual(mockActivityEntityForCreate);
        expect(loggerWarnSpy).toHaveBeenCalledWith("Invalid MAX_ROWS_ACTIVITIES value: 0. Limit check skipped if not positive integer or 'unlimited'.");
        expect(activityRepository.count).not.toHaveBeenCalled();
      });
      
      it('should allow creation and log warning if MAX_ROWS_ACTIVITIES is a negative number', async () => {
        configServiceMock.get.mockImplementation((key: string) => {
            if (key === 'MAX_ROWS_ACTIVITIES') return '-5';
            return undefined;
        });
        await expect(service.create(createActivityDto, mockUser)).resolves.toEqual(mockActivityEntityForCreate);
        expect(loggerWarnSpy).toHaveBeenCalledWith("Invalid MAX_ROWS_ACTIVITIES value: -5. Limit check skipped if not positive integer or 'unlimited'.");
        expect(activityRepository.count).not.toHaveBeenCalled();
      });

      it('should allow creation if current count is below MAX_ROWS_ACTIVITIES limit', async () => {
        configServiceMock.get.mockImplementation((key: string) => {
            if (key === 'MAX_ROWS_ACTIVITIES') return '5';
            return undefined;
        });
        activityRepository.count.mockResolvedValue(4);
        await expect(service.create(createActivityDto, mockUser)).resolves.toEqual(mockActivityEntityForCreate);
        expect(activityRepository.count).toHaveBeenCalledTimes(1);
        expect(loggerLogSpy).toHaveBeenCalledWith('Current activities count: 4, Max activities limit: 5');
      });

      it('should throw ConflictException if current count is equal to MAX_ROWS_ACTIVITIES limit', async () => {
        configServiceMock.get.mockImplementation((key: string) => {
            if (key === 'MAX_ROWS_ACTIVITIES') return '5';
            return undefined;
        });
        activityRepository.count.mockResolvedValue(5);
        
        await expect(service.create(createActivityDto, mockUser)).rejects.toThrow(ConflictException);
        // To check the message specifically, you might need a try-catch or a more specific matcher if toThrow supports it directly
        try {
            await service.create(createActivityDto, mockUser);
            // If it doesn't throw the second time, the test should fail.
            throw new Error('Expected service.create to throw ConflictException on the second call as well');
        } catch (e) { // e is initially unknown
            // Type guard for the error
            if (e instanceof Error) {
                expect(e.message).toBe('Activity creation limit reached. Cannot create new activities at this time.');
            } else {
                // If it's not an Error instance, fail the test or handle appropriately
                throw new Error('Caught something that was not an Error instance');
            }
            expect(e).toBeInstanceOf(ConflictException); // Also ensure it's the correct exception type
        }
        expect(activityRepository.count).toHaveBeenCalledTimes(2); // Called for each attempt
        expect(loggerWarnSpy).toHaveBeenCalledWith('Activity creation limit reached. Current: 5, Max: 5');
      });

      it('should throw ConflictException if current count is greater than MAX_ROWS_ACTIVITIES limit', async () => {
        configServiceMock.get.mockImplementation((key: string) => {
            if (key === 'MAX_ROWS_ACTIVITIES') return '5';
            return undefined;
        });
        activityRepository.count.mockResolvedValue(6);
        await expect(service.create(createActivityDto, mockUser)).rejects.toThrow(ConflictException);
        try {
            await service.create(createActivityDto, mockUser);
            throw new Error('Expected service.create to throw ConflictException on the second call as well');
        } catch (e) { // e is initially unknown
            if (e instanceof Error) {
                expect(e.message).toBe('Activity creation limit reached. Cannot create new activities at this time.');
            } else {
                throw new Error('Caught something that was not an Error instance');
            }
            expect(e).toBeInstanceOf(ConflictException);
        }
        expect(activityRepository.count).toHaveBeenCalledTimes(2);
        expect(loggerWarnSpy).toHaveBeenCalledWith('Activity creation limit reached. Current: 6, Max: 5');
      });
    });
    // --- End of tests for MAX_ROWS_ACTIVITIES ---

    it('should handle repository.save error, log it, and re-throw', async () => {
      const dbError = new Error('Database save failed');
      const activityData = { // Data that would be passed to save
        ...createActivityDto, // Use the existing createActivityDto from the describe block
        user_id: mockUser.id,
        contributor_name: mockUser.username,
        cost_level: CostLevel.FREE,
        participants_min: 1,
      };

      activityRepository.create.mockReturnValue(activityData); // create succeeds
      activityRepository.save.mockRejectedValue(dbError);      // save fails

      // Expect the original error to be re-thrown
      await expect(service.create(createActivityDto, mockUser)).rejects.toThrow(dbError);

      expect(activityRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        title: createActivityDto.title, // Ensure create was called with correct data
      }));
      expect(activityRepository.save).toHaveBeenCalledWith(activityData);
      
      // Check that the initial log for creation attempt was made
      expect(loggerLogSpy).toHaveBeenCalledWith(
        `Creating new activity titled "${createActivityDto.title}" for user ID ${mockUser.id} (contributor: ${mockUser.username})`
      );
      // Check that the error was logged
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Failed to create activity: ${dbError.message}`,
        dbError.stack,
      );
    });

    it('should log unknown error if repository.save fails with non-Error object', async () => {
      const nonErrorObject = { message: 'Something weird happened' };
      const activityData = {
        ...createActivityDto,
        user_id: mockUser.id,
        contributor_name: mockUser.username,
        cost_level: CostLevel.FREE,
        participants_min: 1,
      };

      activityRepository.create.mockReturnValue(activityData);
      activityRepository.save.mockRejectedValue(nonErrorObject);

      await expect(service.create(createActivityDto, mockUser)).rejects.toEqual(nonErrorObject);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to create activity due to an unknown error',
        nonErrorObject,
      );
    });
  });

  describe('findAll', () => {
    const defaultQueryDto: ActivityQueryDto = {};

    it('should return a paginated list of activities with default parameters', async () => {
      loggerLogSpy.mockClear(); // Clear spy for this test
      const totalItems = mockActivities.length;
      const page = 1;
      const limit = 10; // Default limit in your service
      
      activityRepository.findAndCount.mockResolvedValue([mockActivities, totalItems]);

      const result = await service.findAll(defaultQueryDto);

      expect(activityRepository.findAndCount).toHaveBeenCalledWith({
        skip: (page - 1) * limit,
        take: limit,
        order: { [ActivitySortBy.CREATED_AT]: SortOrder.DESC },
        where: {},
      });
      expect(result.data).toEqual(mockActivities);
      expect(result.meta.totalItems).toBe(totalItems);
      expect(result.meta.itemCount).toBe(mockActivities.length);
      expect(result.meta.itemsPerPage).toBe(limit);
      expect(result.meta.totalPages).toBe(Math.ceil(totalItems / limit));
      expect(result.meta.currentPage).toBe(page);
      expect(loggerLogSpy).toHaveBeenCalledWith( // Check the log after clearing
        `Fetching all activities with query: ${JSON.stringify(defaultQueryDto)}`
      );
    });

    it('should handle pagination with provided page and limit', async () => {
      loggerLogSpy.mockClear();
      const queryDto: ActivityQueryDto = { page: 2, limit: 5 };
      const totalItems = 20; // Assume more items than the limit
      // Use non-null assertion operator since we've defined page and limit in queryDto
      const expectedSkip = (queryDto.page! - 1) * queryDto.limit!; 

      const paginatedActivities = mockActivities.slice(0, queryDto.limit); 
      activityRepository.findAndCount.mockResolvedValue([paginatedActivities, totalItems]);

      const result = await service.findAll(queryDto);

      expect(activityRepository.findAndCount).toHaveBeenCalledWith({
        skip: expectedSkip,
        take: queryDto.limit!, // Use non-null assertion
        order: { [ActivitySortBy.CREATED_AT]: SortOrder.DESC }, 
        where: {},
      });
      expect(result.data).toEqual(paginatedActivities);
      expect(result.meta.totalItems).toBe(totalItems);
      expect(result.meta.itemCount).toBe(paginatedActivities.length);
      expect(result.meta.itemsPerPage).toBe(queryDto.limit!); // Use non-null assertion
      expect(result.meta.totalPages).toBe(Math.ceil(totalItems / queryDto.limit!)); // Use non-null assertion
      expect(result.meta.currentPage).toBe(queryDto.page!); // Use non-null assertion
      expect(loggerLogSpy).toHaveBeenCalledWith(
        `Fetching all activities with query: ${JSON.stringify(queryDto)}`
      );
    });

    it('should use default page (1) and limit (10) if not provided or invalid', async () => {
      loggerLogSpy.mockClear();
      // Test with undefined page and limit
      const queryDtoUndefined: ActivityQueryDto = {};
      const totalItems = 5;
      activityRepository.findAndCount.mockResolvedValue([mockActivities.slice(0, totalItems), totalItems]);
      
      await service.findAll(queryDtoUndefined);
      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0, // (1 - 1) * 10
          take: 10,
        }),
      );

      // Test with invalid (e.g., zero or negative) page and limit, 
      // assuming your DTO validation or service logic defaults them.
      // The DTO validation should handle this, but the service defaults are a fallback.
      // For this unit test, we assume DTO validation might not run or we test service defaults.
      // Your service code explicitly defaults: page = 1, limit = 10
      const queryDtoInvalid: ActivityQueryDto = { page: 0, limit: -5 }; 
      activityRepository.findAndCount.mockClear(); // Clear previous calls
      activityRepository.findAndCount.mockResolvedValue([mockActivities.slice(0, totalItems), totalItems]);


      await service.findAll(queryDtoInvalid);
      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0, // (1 - 1) * 10, because service defaults page to 1
          take: 10, // because service defaults limit to 10
        }),
      );
       expect(loggerLogSpy).toHaveBeenCalledWith(
        `Fetching all activities with query: ${JSON.stringify(queryDtoInvalid)}`
      );
    });

    it('should filter activities by type if provided', async () => {
      loggerLogSpy.mockClear();
      const queryDto: ActivityQueryDto = { type: 'recreational' };
      const expectedWhere = { type: ILike(`%${queryDto.type}%`) };
      
      activityRepository.findAndCount.mockResolvedValue([mockActivities.filter(a => a.type === queryDto.type), 1]);

      await service.findAll(queryDto);

      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectedWhere,
          skip: 0, // Default page 1
          take: 10, // Default limit 10
          order: { [ActivitySortBy.CREATED_AT]: SortOrder.DESC }, // Default sort
        }),
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        `Fetching all activities with query: ${JSON.stringify(queryDto)}`
      );
    });

    it('should not apply type filter if type is not provided', async () => {
      loggerLogSpy.mockClear();
      const queryDto: ActivityQueryDto = {}; // No type
      
      activityRepository.findAndCount.mockResolvedValue([mockActivities, mockActivities.length]);

      await service.findAll(queryDto);

      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {}, // Expect empty where clause for type
          skip: 0,
          take: 10,
          order: { [ActivitySortBy.CREATED_AT]: SortOrder.DESC },
        }),
      );
    });

    it('should sort activities by created_at in ASC order if specified', async () => {
      loggerLogSpy.mockClear();
      const queryDto: ActivityQueryDto = { 
        sortBy: ActivitySortBy.CREATED_AT, 
        sortOrder: SortOrder.ASC 
      };
      
      activityRepository.findAndCount.mockResolvedValue([mockActivities, mockActivities.length]);
      await service.findAll(queryDto);

      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { [ActivitySortBy.CREATED_AT]: SortOrder.ASC },
          skip: 0, take: 10, where: {}, // Defaults for others
        }),
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        `Fetching all activities with query: ${JSON.stringify(queryDto)}`
      );
    });

    it('should sort activities by title in ASC order if specified', async () => {
      loggerLogSpy.mockClear();
      const queryDto: ActivityQueryDto = { 
        sortBy: ActivitySortBy.TITLE, 
        sortOrder: SortOrder.ASC 
      };
      
      activityRepository.findAndCount.mockResolvedValue([mockActivities, mockActivities.length]);
      await service.findAll(queryDto);

      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { [ActivitySortBy.TITLE]: SortOrder.ASC },
        }),
      );
    });

    it('should sort activities by title in DESC order if specified', async () => {
      loggerLogSpy.mockClear();
      const queryDto: ActivityQueryDto = { 
        sortBy: ActivitySortBy.TITLE, 
        sortOrder: SortOrder.DESC 
      };
      
      activityRepository.findAndCount.mockResolvedValue([mockActivities, mockActivities.length]);
      await service.findAll(queryDto);

      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { [ActivitySortBy.TITLE]: SortOrder.DESC },
        }),
      );
    });

    it('should use default sort (created_at DESC) if sortBy or sortOrder are not provided', async () => {
      loggerLogSpy.mockClear();
      // Case 1: sortBy provided, sortOrder not
      const queryDtoSortByOnly: ActivityQueryDto = { sortBy: ActivitySortBy.TITLE };
      activityRepository.findAndCount.mockResolvedValue([mockActivities, mockActivities.length]);
      await service.findAll(queryDtoSortByOnly);
      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { [ActivitySortBy.TITLE]: SortOrder.DESC }, // Default sortOrder
        }),
      );
      activityRepository.findAndCount.mockClear(); // Clear for next call

      // Case 2: sortOrder provided, sortBy not
      const queryDtoSortOrderOnly: ActivityQueryDto = { sortOrder: SortOrder.ASC };
      activityRepository.findAndCount.mockResolvedValue([mockActivities, mockActivities.length]);
      await service.findAll(queryDtoSortOrderOnly);
      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { [ActivitySortBy.CREATED_AT]: SortOrder.ASC }, // Default sortBy
        }),
      );
    });

    it('should handle repository.findAndCount error, log it, and re-throw', async () => {
      loggerLogSpy.mockClear();
      loggerErrorSpy.mockClear();
      const queryDto: ActivityQueryDto = {};
      const dbError = new Error('Database findAndCount failed');

      activityRepository.findAndCount.mockRejectedValue(dbError);

      await expect(service.findAll(queryDto)).rejects.toThrow(dbError);

      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ // Ensure it was called with default options
          skip: 0,
          take: 10,
          order: { [ActivitySortBy.CREATED_AT]: SortOrder.DESC },
          where: {},
        }),
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        `Fetching all activities with query: ${JSON.stringify(queryDto)}`
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Failed to fetch activities: ${dbError.message}`,
        dbError.stack,
      );
    });

    it('should log unknown error if repository.findAndCount fails with non-Error object', async () => {
      loggerLogSpy.mockClear();
      loggerErrorSpy.mockClear();
      const queryDto: ActivityQueryDto = {};
      const nonErrorObject = { message: 'Something weird happened during findAndCount' };
      
      activityRepository.findAndCount.mockRejectedValue(nonErrorObject);

      await expect(service.findAll(queryDto)).rejects.toEqual(nonErrorObject);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch activities due to an unknown error',
        nonErrorObject,
      );
    });
  });

  describe('findOne', () => {
    const activityId = 'test-activity-uuid-123';
    // Use one of the mockActivities from the findAll describe block or define a specific one
    const mockActivity: Activity = { 
      id: activityId, title: 'Found Activity', type: 'education', description: 'Details',
      cost_level: CostLevel.FREE, participants_min: 1, created_at: new Date(), updated_at: new Date(),
      user_id: 'user-abc', contributor_name: 'ContribUser',
      user: mockUserForActivity('user-abc', 'ContribUser'), // Now this will find the function
      participants_max: null, duration_min: null, duration_max: null,
    } as Activity;

    it('should return an activity if a valid ID is provided', async () => {
      loggerLogSpy.mockClear();
      activityRepository.findOne.mockResolvedValue(mockActivity);

      const result = await service.findOne(activityId);

      expect(activityRepository.findOne).toHaveBeenCalledWith({ where: { id: activityId } });
      expect(result).toEqual(mockActivity);
      expect(loggerLogSpy).toHaveBeenCalledWith(`Fetching activity with ID: ${activityId}`);
    });

    it('should throw NotFoundException if activity with the given ID is not found', async () => {
      loggerLogSpy.mockClear();
      loggerWarnSpy.mockClear(); // For the warning log
      activityRepository.findOne.mockResolvedValue(null); // Simulate not found

      await expect(service.findOne(activityId)).rejects.toThrow(
        new NotFoundException(`Activity with ID ${activityId} not found.`)
      );

      expect(activityRepository.findOne).toHaveBeenCalledWith({ where: { id: activityId } });
      expect(loggerLogSpy).toHaveBeenCalledWith(`Fetching activity with ID: ${activityId}`);
      expect(loggerWarnSpy).toHaveBeenCalledWith(`Activity with ID ${activityId} not found.`);
    });

    it('should handle repository.findOne error, log it, and re-throw', async () => {
      loggerLogSpy.mockClear();
      loggerErrorSpy.mockClear();
      const dbError = new Error('Database findOne failed');
      activityRepository.findOne.mockRejectedValue(dbError);

      // The service's findOne doesn't have a try-catch for repository.findOne
      // It relies on the global error handler or controller-level try-catch
      // So, the original error from the repository should propagate.
      // If findOne *did* have a try-catch like create/findAll, we'd test that logging.
      // For findOne, if the repository throws, it throws.

      await expect(service.findOne(activityId)).rejects.toThrow(dbError);
      expect(loggerLogSpy).toHaveBeenCalledWith(`Fetching activity with ID: ${activityId}`);
      // No specific error log from findOne's own try-catch, as it doesn't have one.
      // If the intention is to add one, this test would change.
    });
  });

  describe('findRandom', () => {
    const localMockActivities: Activity[] = [
      { 
        id: 'rand-1', title: 'Random Activity A', type: 'recreational', description: 'Desc A', 
        cost_level: CostLevel.FREE, participants_min: 1, created_at: new Date(), 
        updated_at: new Date(), // Corrected casing
        user_id: 'user1', contributor_name: 'UserOne', user: mockUserForActivity('user1', 'UserOne'),
        participants_max: null, duration_min: null, duration_max: null,
      } as Activity,
      { 
        id: 'rand-2', title: 'Random Activity B', type: 'social', description: 'Desc B', 
        cost_level: CostLevel.LOW, participants_min: 2, created_at: new Date(), 
        updated_at: new Date(), // Corrected casing
        user_id: 'user2', contributor_name: 'UserTwo', user: mockUserForActivity('user2', 'UserTwo'),
        participants_max: null, duration_min: null, duration_max: null,
      } as Activity,
      { 
        id: 'rand-3', title: 'Random Activity C', type: 'recreational', description: 'Desc C', 
        cost_level: CostLevel.MEDIUM, participants_min: 1, created_at: new Date(), 
        updated_at: new Date(), // Corrected casing
        user_id: 'user1', contributor_name: 'UserOne', user: mockUserForActivity('user1', 'UserOne'),
        participants_max: null, duration_min: null, duration_max: null,
      } as Activity,
    ];

    let mathRandomSpy: jest.SpyInstance;

    beforeEach(() => {
      // Mock Math.random to return a predictable value for deterministic tests
      // e.g., always pick the first element if Math.random() is 0
      mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(0); 
      loggerLogSpy.mockClear();
      loggerWarnSpy.mockClear();
      loggerErrorSpy.mockClear();
    });

    afterEach(() => {
      mathRandomSpy.mockRestore(); // Restore original Math.random
    });

    it('should return a random activity when activities exist (no filter)', async () => {
      const queryDto: ActivityQueryDto = {};
      activityRepository.find.mockResolvedValue(localMockActivities);

      const result = await service.findRandom(queryDto);

      expect(activityRepository.find).toHaveBeenCalledWith({ where: {} });
      expect(localMockActivities).toContain(result); // Check if the result is one of the mock activities
      // With Math.random mocked to 0, it should be the first one:
      expect(result).toEqual(localMockActivities[0]); 
      expect(loggerLogSpy).toHaveBeenCalledWith(`Fetching a random activity with query: ${JSON.stringify(queryDto)}`);
      expect(loggerLogSpy).toHaveBeenCalledWith(`Random activity selected: ${localMockActivities[0].id} - ${localMockActivities[0].title}`);
    });

    it('should return a random activity applying type filter', async () => {
      const queryDto: ActivityQueryDto = { type: 'recreational' };
      const recreationalActivities = localMockActivities.filter(a => a.type === 'recreational');
      activityRepository.find.mockResolvedValue(recreationalActivities);
      // Mock Math.random to pick the second recreational activity (index 1 in the filtered list)
      mathRandomSpy.mockReturnValue(0.5); // Assuming 2 recreational, 0.5 * 2 = 1 (index)

      const result = await service.findRandom(queryDto);
      
      expect(activityRepository.find).toHaveBeenCalledWith({ where: { type: ILike('%recreational%') } });
      expect(recreationalActivities).toContain(result);
      // If Math.random was mocked to pick index 1 of recreationalActivities (which has 2 items)
      expect(result).toEqual(recreationalActivities[1]); 
      expect(loggerLogSpy).toHaveBeenCalledWith(`Random activity selected: ${recreationalActivities[1].id} - ${recreationalActivities[1].title}`);
    });

    it('should throw NotFoundException if no activities match the type filter', async () => {
      const queryDto: ActivityQueryDto = { type: 'nonexistent' };
      activityRepository.find.mockResolvedValue([]); // No activities match

      await expect(service.findRandom(queryDto)).rejects.toThrow(
        new NotFoundException('No activities found matching your criteria.')
      );
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        `No activities found matching criteria for random selection: ${JSON.stringify({ type: ILike('%nonexistent%') })}`
      );
    });

    it('should throw NotFoundException if no activities exist in the database (no filter)', async () => {
      const queryDto: ActivityQueryDto = {};
      activityRepository.find.mockResolvedValue([]); // No activities at all

      await expect(service.findRandom(queryDto)).rejects.toThrow(
        new NotFoundException('No activities found matching your criteria.')
      );
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        `No activities found matching criteria for random selection: ${JSON.stringify({})}`
      );
    });

    it('should handle repository.find error, log it, and throw InternalServerErrorException', async () => {
      const queryDto: ActivityQueryDto = {};
      const dbError = new Error('Database find failed');
      activityRepository.find.mockRejectedValue(dbError);

      await expect(service.findRandom(queryDto)).rejects.toThrow(
        new InternalServerErrorException('Could not retrieve a random activity.') // Now correctly recognized
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Failed to fetch random activity: ${dbError.message}`,
        dbError.stack
      );
    });
    
    it('should handle repository.find error (non-Error object), log it, and throw InternalServerErrorException', async () => {
      const queryDto: ActivityQueryDto = {};
      const nonErrorObject = { message: 'Weird DB issue' };
      activityRepository.find.mockRejectedValue(nonErrorObject);

      await expect(service.findRandom(queryDto)).rejects.toThrow(
        new InternalServerErrorException('Could not retrieve a random activity.') // Now correctly recognized
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch random activity due to an unknown error',
        nonErrorObject
      );
    });
  });

  describe('update', () => {
    const activityId = 'activity-to-update-uuid';
    const ownerUserId = 'owner-user-uuid';
    const nonOwnerUserId = 'non-owner-user-uuid';
    
    const mockExistingActivity: Activity = {
      id: activityId,
      title: 'Old Title',
      description: 'Old Description',
      type: 'recreational',
      cost_level: CostLevel.FREE,
      participants_min: 1,
      user_id: ownerUserId,
      contributor_name: 'OwnerUser',
      created_at: new Date(),
      updated_at: new Date(),
      user: mockUserForActivity(ownerUserId, 'OwnerUser'),
      participants_max: null, duration_min: null, duration_max: null,
    } as Activity;

    const updateDto: UpdateActivityDto = {
      title: 'New Updated Title',
      description: 'New Updated Description',
      type: 'social',
    };

    beforeEach(() => {
      loggerLogSpy.mockClear();
      loggerWarnSpy.mockClear();
      loggerErrorSpy.mockClear();
      // Reset findOne and save mocks for each test if needed, or set specific mocks per test
      activityRepository.findOne.mockReset();
      activityRepository.save.mockReset();
    });

    it('should successfully update an activity if user is the owner', async () => {
      activityRepository.findOne.mockResolvedValue(mockExistingActivity);
      const expectedUpdatedActivity = { 
        ...mockExistingActivity, 
        ...updateDto,
        updated_at: expect.any(Date), // save would update this
      };
      activityRepository.save.mockResolvedValue(expectedUpdatedActivity);

      const result = await service.update(activityId, updateDto, ownerUserId);

      expect(loggerLogSpy).toHaveBeenCalledWith(`User ${ownerUserId} attempting to update activity with ID: ${activityId}`);
      expect(activityRepository.findOne).toHaveBeenCalledWith({ where: { id: activityId } });
      expect(activityRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        id: activityId,
        title: updateDto.title,
        description: updateDto.description,
        type: updateDto.type,
        user_id: ownerUserId, // Ensure user_id is not changed
      }));
      expect(result).toEqual(expectedUpdatedActivity);
      expect(loggerLogSpy).toHaveBeenCalledWith(`Activity ${activityId} updated successfully by user ${ownerUserId}.`);
    });

    it('should throw NotFoundException if activity to update is not found', async () => {
      activityRepository.findOne.mockResolvedValue(null); // Simulate findOne not finding the activity

      await expect(service.update(activityId, updateDto, ownerUserId)).rejects.toThrow(
        new NotFoundException(`Activity with ID ${activityId} not found.`)
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(`User ${ownerUserId} attempting to update activity with ID: ${activityId}`);
      expect(loggerWarnSpy).toHaveBeenCalledWith(`Activity with ID ${activityId} not found.`); // From findOne
    });

    it('should throw ForbiddenException if user is not the owner of the activity', async () => {
      activityRepository.findOne.mockResolvedValue(mockExistingActivity); // Activity exists

      await expect(service.update(activityId, updateDto, nonOwnerUserId)).rejects.toThrow(
        new ForbiddenException('You are not allowed to update this activity.')
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(`User ${nonOwnerUserId} attempting to update activity with ID: ${activityId}`);
      expect(activityRepository.findOne).toHaveBeenCalledWith({ where: { id: activityId } });
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        `User ${nonOwnerUserId} attempted to update activity ${activityId} owned by ${ownerUserId}. Forbidden.`
      );
      expect(activityRepository.save).not.toHaveBeenCalled();
    });

    it('should handle repository.save error, log it, and re-throw', async () => {
      activityRepository.findOne.mockResolvedValue(mockExistingActivity);
      const dbError = new Error('Database save failed during update');
      activityRepository.save.mockRejectedValue(dbError);

      await expect(service.update(activityId, updateDto, ownerUserId)).rejects.toThrow(dbError);
      
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Failed to update activity ${activityId}: ${dbError.message}`,
        dbError.stack
      );
    });

    it('should handle repository.save error (non-Error object), log it, and re-throw', async () => {
      activityRepository.findOne.mockResolvedValue(mockExistingActivity);
      const nonErrorObject = { message: 'Weird DB issue during update' };
      activityRepository.save.mockRejectedValue(nonErrorObject);

      await expect(service.update(activityId, updateDto, ownerUserId)).rejects.toEqual(nonErrorObject);
      
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Failed to update activity ${activityId} due to an unknown error`,
        nonErrorObject
      );
    });
  });

  describe('remove', () => {
    const activityId = 'activity-to-remove-uuid';
    const ownerUserId = 'owner-user-uuid';
    const nonOwnerUserId = 'non-owner-user-uuid';

    const mockActivityToRemove: Activity = {
      id: activityId,
      title: 'Activity to Remove',
      description: 'This will be removed.',
      type: 'recreational',
      cost_level: CostLevel.FREE,
      participants_min: 1,
      user_id: ownerUserId,
      contributor_name: 'OwnerUser',
      created_at: new Date(),
      updated_at: new Date(),
      user: mockUserForActivity(ownerUserId, 'OwnerUser'),
      participants_max: null, duration_min: null, duration_max: null,
    } as Activity;

    beforeEach(() => {
      loggerLogSpy.mockClear();
      loggerWarnSpy.mockClear();
      loggerErrorSpy.mockClear();
      activityRepository.findOne.mockReset();
      activityRepository.remove.mockReset();
    });

    it('should successfully remove an activity if user is the owner', async () => {
      activityRepository.findOne.mockResolvedValue(mockActivityToRemove);
      activityRepository.remove.mockResolvedValue(undefined); // remove usually returns void or the removed entity

      await service.remove(activityId, ownerUserId);

      expect(loggerLogSpy).toHaveBeenCalledWith(`User ${ownerUserId} attempting to delete activity with ID: ${activityId}`);
      expect(activityRepository.findOne).toHaveBeenCalledWith({ where: { id: activityId } });
      expect(activityRepository.remove).toHaveBeenCalledWith(mockActivityToRemove);
      expect(loggerLogSpy).toHaveBeenCalledWith(`Activity ${activityId} deleted successfully by user ${ownerUserId}.`);
    });

    it('should throw NotFoundException if activity to remove is not found', async () => {
      activityRepository.findOne.mockResolvedValue(null); // Simulate findOne not finding the activity

      await expect(service.remove(activityId, ownerUserId)).rejects.toThrow(
        new NotFoundException(`Activity with ID ${activityId} not found.`)
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(`User ${ownerUserId} attempting to delete activity with ID: ${activityId}`);
      expect(loggerWarnSpy).toHaveBeenCalledWith(`Activity with ID ${activityId} not found.`); // From findOne
      expect(activityRepository.remove).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not the owner of the activity', async () => {
      activityRepository.findOne.mockResolvedValue(mockActivityToRemove); // Activity exists

      await expect(service.remove(activityId, nonOwnerUserId)).rejects.toThrow(
        new ForbiddenException('You are not allowed to delete this activity.')
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(`User ${nonOwnerUserId} attempting to delete activity with ID: ${activityId}`);
      expect(activityRepository.findOne).toHaveBeenCalledWith({ where: { id: activityId } });
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        `User ${nonOwnerUserId} attempted to delete activity ${activityId} owned by ${ownerUserId}. Forbidden.`
      );
      expect(activityRepository.remove).not.toHaveBeenCalled();
    });

    it('should handle repository.remove error, log it, and re-throw', async () => {
      activityRepository.findOne.mockResolvedValue(mockActivityToRemove);
      const dbError = new Error('Database remove failed');
      activityRepository.remove.mockRejectedValue(dbError);

      await expect(service.remove(activityId, ownerUserId)).rejects.toThrow(dbError);
      
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Failed to delete activity ${activityId}: ${dbError.message}`,
        dbError.stack
      );
    });

    it('should handle repository.remove error (non-Error object), log it, and re-throw', async () => {
      activityRepository.findOne.mockResolvedValue(mockActivityToRemove);
      const nonErrorObject = { message: 'Weird DB issue during remove' };
      activityRepository.remove.mockRejectedValue(nonErrorObject);

      await expect(service.remove(activityId, ownerUserId)).rejects.toEqual(nonErrorObject);
      
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Failed to delete activity ${activityId} due to an unknown error`,
        nonErrorObject
      );
    });
  });

  describe('findUniqueTypes', () => {
    // Mock for the query builder chain
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
    };

    beforeEach(() => {
      loggerLogSpy.mockClear();
      loggerErrorSpy.mockClear();
      // Reset the query builder mock for each test
      activityRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.select.mockClear();
      mockQueryBuilder.orderBy.mockClear();
      mockQueryBuilder.getRawMany.mockClear();
    });

    it('should return an array of unique, sorted, non-empty activity types', async () => {
      const rawTypes = [
        { type: 'recreational' }, 
        { type: 'social' }, 
        { type: 'education' },
        { type: '  ' }, // whitespace only
        { type: null }, // null type
        { type: '' },   // empty string
        { type: 'recreational' }, // duplicate
      ];
      // The service sorts them and filters, so the expected result is different
      const expectedFilteredAndSortedTypes = ['education', 'recreational', 'social'];
      
      mockQueryBuilder.getRawMany.mockResolvedValue(rawTypes);

      const result = await service.findUniqueTypes();

      expect(activityRepository.createQueryBuilder).toHaveBeenCalledWith('activity');
      expect(mockQueryBuilder.select).toHaveBeenCalledWith('DISTINCT activity.type', 'type');
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('type', 'ASC');
      expect(mockQueryBuilder.getRawMany).toHaveBeenCalled();
      expect(result).toEqual(expectedFilteredAndSortedTypes);
      expect(loggerLogSpy).toHaveBeenCalledWith('Fetching unique activity types.');
      expect(loggerLogSpy).toHaveBeenCalledWith(`Found unique types: ${expectedFilteredAndSortedTypes.join(', ')}`);
    });

    it('should return an empty array if no types are found or all are invalid', async () => {
      const rawTypes = [
        { type: '  ' }, 
        { type: null }, 
        { type: '' },
      ];
      mockQueryBuilder.getRawMany.mockResolvedValue(rawTypes);

      const result = await service.findUniqueTypes();
      expect(result).toEqual([]);
      expect(loggerLogSpy).toHaveBeenCalledWith(`Found unique types: `); // Empty string for no types
    });
    
    it('should return an empty array if repository returns empty array', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.findUniqueTypes();
      expect(result).toEqual([]);
      expect(loggerLogSpy).toHaveBeenCalledWith(`Found unique types: `);
    });

    it('should handle repository error, log it, and throw InternalServerErrorException', async () => {
      const dbError = new Error('Database query builder failed');
      mockQueryBuilder.getRawMany.mockRejectedValue(dbError);

      await expect(service.findUniqueTypes()).rejects.toThrow(
        new InternalServerErrorException('Could not retrieve activity types.')
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Failed to fetch unique activity types: ${dbError.message}`,
        dbError.stack
      );
    });

    it('should handle repository error (non-Error object), log it, and throw InternalServerErrorException', async () => {
      const nonErrorObject = { message: 'Query builder weirdness' };
      mockQueryBuilder.getRawMany.mockRejectedValue(nonErrorObject);

      await expect(service.findUniqueTypes()).rejects.toThrow(
        new InternalServerErrorException('Could not retrieve activity types.')
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch unique activity types due to an unknown error',
        nonErrorObject
      );
    });
  });

  describe('findAllByUserId', () => {
    // Use a userId that exists in the global mockActivities
    const targetUserId = 'user-id-alpha'; 
    const anotherUserId = 'user-id-gamma'; // A user ID that might not have activities

    // userActivities will now correctly filter from the global mockActivities
    const userActivities = mockActivities.filter(act => act.user_id === targetUserId);
    
    // The console.warn can still be useful if targetUserId is mistyped or data changes
    if (userActivities.length === 0 && mockActivities.length > 0) {
      console.warn(`WARN: No mock activities found for targetUserId: ${targetUserId}. Consider adjusting mockActivities setup.`);
    }

    const defaultQueryDto: ActivityQueryDto = {};

    beforeEach(() => {
      loggerLogSpy.mockClear();
      loggerErrorSpy.mockClear();
      activityRepository.findAndCount.mockReset();
    });

    it('should return paginated activities for a specific user ID', async () => {
      // Ensure userActivities has items for this test to be meaningful
      expect(userActivities.length).toBeGreaterThan(0); // Add this assertion
      activityRepository.findAndCount.mockResolvedValue([userActivities, userActivities.length]);

      const result = await service.findAllByUserId(targetUserId, defaultQueryDto);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        `Fetching activities for user ID ${targetUserId} with query: ${JSON.stringify(defaultQueryDto)}`
      );
      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: targetUserId },
          skip: 0,
          take: 10,
          order: { [ActivitySortBy.CREATED_AT]: SortOrder.DESC },
        }),
      );
      expect(result.data).toEqual(userActivities);
      expect(result.meta.totalItems).toBe(userActivities.length);
      expect(result.meta.currentPage).toBe(1);
      expect(result.meta.itemsPerPage).toBe(10);
    });

    it('should apply type filter along with user ID', async () => {
      const queryDto: ActivityQueryDto = { type: 'recreational' };
      // Filter from the already user-specific activities
      const filteredUserActivities = userActivities.filter(act => act.type === 'recreational');
      expect(filteredUserActivities.length).toBeGreaterThan(0); // Ensure there's data to test with
      activityRepository.findAndCount.mockResolvedValue([filteredUserActivities, filteredUserActivities.length]);

      await service.findAllByUserId(targetUserId, queryDto);

      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: targetUserId, type: ILike('%recreational%') },
        }),
      );
    });

    it('should apply pagination for a specific user ID', async () => {
      const queryDto: ActivityQueryDto = { page: 1, limit: 1 }; // Adjusted for potentially small userActivities set
      // Ensure userActivities has enough items for this pagination test
      // For page 1, limit 1, we expect 1 item if userActivities has at least 1.
      expect(userActivities.length).toBeGreaterThanOrEqual(1); 
      const paginatedUserActivities = userActivities.slice(0, 1); // (page 1, limit 1)
      
      activityRepository.findAndCount.mockResolvedValue([paginatedUserActivities, userActivities.length]);

      const result = await service.findAllByUserId(targetUserId, queryDto);

      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: targetUserId },
          skip: 0, // (1 - 1) * 1
          take: 1,
        }),
      );
      expect(result.meta.currentPage).toBe(1);
      expect(result.meta.itemsPerPage).toBe(1);
      expect(result.data.length).toBe(paginatedUserActivities.length);
    });
    
    it('should apply sorting for a specific user ID', async () => {
      const queryDto: ActivityQueryDto = { sortBy: ActivitySortBy.TITLE, sortOrder: SortOrder.ASC };
      activityRepository.findAndCount.mockResolvedValue([userActivities, userActivities.length]); // Actual sorting is by DB

      await service.findAllByUserId(targetUserId, queryDto);

      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: targetUserId },
          order: { [ActivitySortBy.TITLE]: SortOrder.ASC },
        }),
      );
    });

    it('should return empty paginated response if user has no activities', async () => {
      activityRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAllByUserId(anotherUserId, defaultQueryDto);

      expect(activityRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: anotherUserId },
        }),
      );
      expect(result.data).toEqual([]);
      expect(result.meta.totalItems).toBe(0);
    });

    it('should handle repository.findAndCount error and throw InternalServerErrorException', async () => {
      const dbError = new Error('Database findAndCount failed for user activities');
      activityRepository.findAndCount.mockRejectedValue(dbError);

      await expect(service.findAllByUserId(targetUserId, defaultQueryDto)).rejects.toThrow(
        new InternalServerErrorException('Could not retrieve user activities.')
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Failed to fetch activities for user ${targetUserId}: ${dbError.message}`,
        dbError.stack
      );
    });

    it('should handle repository.findAndCount error (non-Error object) and throw InternalServerErrorException', async () => {
      const nonErrorObject = { message: 'DB weirdness for user activities' };
      activityRepository.findAndCount.mockRejectedValue(nonErrorObject);

      await expect(service.findAllByUserId(targetUserId, defaultQueryDto)).rejects.toThrow(
        new InternalServerErrorException('Could not retrieve user activities.')
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Failed to fetch activities for user ${targetUserId} due to an unknown error`,
        nonErrorObject
      );
    });
  });

  describe('updateContributorNameForUser', () => {
    const targetUserId = 'user-id-to-update-contrib-name';
    const newContributorName = 'NewUpdatedContributorName';

    // Mock for the query builder chain for update
    const mockUpdateQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };

    beforeEach(() => {
      loggerLogSpy.mockClear();
      loggerErrorSpy.mockClear();
      // Reset the query builder mock for each test
      activityRepository.createQueryBuilder.mockReturnValue(mockUpdateQueryBuilder as any); // Use 'as any' for simplicity if type is complex
      mockUpdateQueryBuilder.update.mockClear();
      mockUpdateQueryBuilder.set.mockClear();
      mockUpdateQueryBuilder.where.mockClear();
      mockUpdateQueryBuilder.execute.mockClear();
    });

    it('should successfully update contributor_name for all activities of a user', async () => {
      const updateResult = { affected: 3, raw: [], generatedMaps: [] }; // Example UpdateResult
      mockUpdateQueryBuilder.execute.mockResolvedValue(updateResult);

      await service.updateContributorNameForUser(targetUserId, newContributorName);

      expect(loggerLogSpy).toHaveBeenCalledWith(
        `Updating contributor_name to "${newContributorName}" for all activities by user ID ${targetUserId}.`
      );
      expect(activityRepository.createQueryBuilder).toHaveBeenCalled(); // No specific alias needed for update
      expect(mockUpdateQueryBuilder.update).toHaveBeenCalledWith(Activity);
      expect(mockUpdateQueryBuilder.set).toHaveBeenCalledWith({ contributor_name: newContributorName });
      expect(mockUpdateQueryBuilder.where).toHaveBeenCalledWith('user_id = :userId', { userId: targetUserId });
      expect(mockUpdateQueryBuilder.execute).toHaveBeenCalled();
      expect(loggerLogSpy).toHaveBeenCalledWith(
        `Updated contributor_name for ${updateResult.affected} activities for user ID ${targetUserId}.`
      );
    });

    it('should handle case where user has no activities (affected rows 0)', async () => {
      const updateResultNoAffected = { affected: 0, raw: [], generatedMaps: [] };
      mockUpdateQueryBuilder.execute.mockResolvedValue(updateResultNoAffected);

      await service.updateContributorNameForUser(targetUserId, newContributorName);

      expect(mockUpdateQueryBuilder.execute).toHaveBeenCalled();
      expect(loggerLogSpy).toHaveBeenCalledWith(
        `Updated contributor_name for 0 activities for user ID ${targetUserId}.`
      );
    });

    it('should handle repository error during update, log it, and throw InternalServerErrorException', async () => {
      const dbError = new Error('Database update execution failed');
      mockUpdateQueryBuilder.execute.mockRejectedValue(dbError);

      await expect(service.updateContributorNameForUser(targetUserId, newContributorName))
        .rejects.toThrow(new InternalServerErrorException(`Failed to update contributor names for user ${targetUserId}.`));
      
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Failed to update contributor_name for user ${targetUserId}: ${dbError.message}`,
        dbError.stack
      );
    });

    it('should handle repository error (non-Error object) during update, log it, and throw InternalServerErrorException', async () => {
      const nonErrorObject = { message: 'DB update weirdness' };
      mockUpdateQueryBuilder.execute.mockRejectedValue(nonErrorObject);

      await expect(service.updateContributorNameForUser(targetUserId, newContributorName))
        .rejects.toThrow(new InternalServerErrorException(`Failed to update contributor names for user ${targetUserId}.`));

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Failed to update contributor_name for user ${targetUserId} due to an unknown error`,
        nonErrorObject
      );
    });
  });
});