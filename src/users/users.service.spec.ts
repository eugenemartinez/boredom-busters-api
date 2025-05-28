import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, QueryFailedError, ObjectLiteral, EntityManager, DataSource } from 'typeorm';
import { UsersService, CreateUserInternalDto } from './users.service.js';
import { User } from './entities/user.entity.js';
import { ActivitiesService } from '../activities/activities.service.js';
import { Logger, NotFoundException, InternalServerErrorException, ConflictException } from '@nestjs/common'; // Added ConflictException
import { ConfigService } from '@nestjs/config'; // Import ConfigService

// Helper type: For a given type T, transform its function properties into jest.Mock types,
// and keep non-function properties as they are.
type MockedFunctionsAndProperties<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? jest.Mock<ReturnType<T[K]>, Parameters<T[K]>>
    : T[K];
};

// Base for our mock repository:
// 1. Omit 'manager' from Repository<T> as we'll define it explicitly.
// 2. Apply MockedFunctionsAndProperties to the remaining properties.
// 3. Make all resulting properties optional (Partial).
type BaseMockedRepository<T extends ObjectLiteral> = Partial<
  MockedFunctionsAndProperties<Omit<Repository<T>, 'manager'>>
>;

// The final MockRepository type
type MockRepository<T extends ObjectLiteral = any> = BaseMockedRepository<T> & {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  find: jest.Mock;
  count: jest.Mock; // Add count here
  createQueryBuilder: jest.Mock;
  manager: Partial<EntityManager>;
};

const createMockRepository = <T extends ObjectLiteral = any>(): MockRepository<T> => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  find: jest.fn(),
  count: jest.fn(), // Mock for count method
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
  }),
  manager: {
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    connection: {
      createQueryRunner: jest.fn().mockReturnValue({
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          save: jest.fn(),
          update: jest.fn(),
          findOne: jest.fn(),
        },
      }),
    } as any,
  } as Partial<EntityManager>,
});

// --- Define types for our mocks for better type safety ---
type MockQueryRunnerManager = {
  save: jest.Mock;
  update: jest.Mock;
  findOne: jest.Mock;
};

type MockQueryRunner = {
  connect: jest.Mock<Promise<void>, []>;
  startTransaction: jest.Mock<Promise<void>, []>;
  commitTransaction: jest.Mock<Promise<void>, []>;
  rollbackTransaction: jest.Mock<Promise<void>, []>;
  release: jest.Mock<Promise<void>, []>;
  manager: MockQueryRunnerManager;
};

type MockDataSource = {
  createQueryRunner: jest.Mock<MockQueryRunner, []>;
};
// --- End of mock type definitions ---

const mockActivitiesService = {
  updateContributorNameForUser: jest.fn(),
};

const mockQueryRunnerInstance: MockQueryRunner = {
  connect: jest.fn().mockResolvedValue(undefined),
  startTransaction: jest.fn().mockResolvedValue(undefined),
  commitTransaction: jest.fn().mockResolvedValue(undefined),
  rollbackTransaction: jest.fn().mockResolvedValue(undefined),
  release: jest.fn().mockResolvedValue(undefined),
  manager: {
    save: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
  },
};

type MockUserQueryBuilder = {
  where: jest.Mock<MockUserQueryBuilder, [string, { email: string }]>;
  addSelect: jest.Mock<MockUserQueryBuilder, [string]>;
  getOne: jest.Mock<Promise<User | null>, []>;
};

type MockUserByIdQueryBuilder = {
  where: jest.Mock<MockUserByIdQueryBuilder, [string, { userId: string }]>;
  addSelect: jest.Mock<MockUserByIdQueryBuilder, [string]>;
  getOne: jest.Mock<Promise<User | null>, []>;
};

const mockDataSource: MockDataSource = {
  createQueryRunner: jest.fn(() => mockQueryRunnerInstance),
};

// Mock ConfigService
const mockConfigService = {
  get: jest.fn((key: string): string | undefined => { // Add explicit ': string | undefined' here
    if (key === 'MAX_ROWS_USERS') {
      return 'unlimited';
    }
    // Add other default mock values for other keys if necessary
    return undefined;
  }),
};


describe('UsersService', () => {
  let service: UsersService;
  let userRepository: MockRepository<User>;
  let _activitiesServiceMock: typeof mockActivitiesService; // Ensure this matches your instance name
  let dataSourceMockInstance: MockDataSource; // Ensure this matches your instance name
  let configServiceMock: typeof mockConfigService; // This should now work correctly
  let loggerErrorSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance; // For MAX_ROWS_USERS warnings
  let loggerLogSpy: jest.SpyInstance; // For general logs


  beforeEach(async () => {
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});


    mockQueryRunnerInstance.connect.mockClear();
    mockQueryRunnerInstance.startTransaction.mockClear();
    mockQueryRunnerInstance.commitTransaction.mockClear();
    mockQueryRunnerInstance.rollbackTransaction.mockClear();
    mockQueryRunnerInstance.release.mockClear();
    mockQueryRunnerInstance.manager.save.mockClear();
    mockQueryRunnerInstance.manager.update.mockClear();
    mockQueryRunnerInstance.manager.findOne.mockClear();
    
    mockDataSource.createQueryRunner.mockClear();
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunnerInstance);

    mockConfigService.get.mockClear(); // Clear configService mock calls
    // Re-apply default behavior for configService.get
    mockConfigService.get.mockImplementation((key: string): string | undefined => { // Explicit return type
        if (key === 'MAX_ROWS_USERS') {
            return 'unlimited'; // Default for most tests
        }
        return undefined;
    });


    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: createMockRepository<User>(),
        },
        {
          provide: ActivitiesService,
          useValue: mockActivitiesService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService, // Use the adjusted mockConfigService
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepository = module.get<MockRepository<User>>(getRepositoryToken(User));
    _activitiesServiceMock = module.get(ActivitiesService); 
    dataSourceMockInstance = module.get(DataSource);
    configServiceMock = module.get(ConfigService); // Get the provided mock instance
    
    loggerErrorSpy.mockClear();
    loggerWarnSpy.mockClear();
    loggerLogSpy.mockClear();
    Object.values(mockActivitiesService).forEach(mockFn => mockFn.mockClear());
    
    dataSourceMockInstance.createQueryRunner.mockClear();
    dataSourceMockInstance.createQueryRunner.mockReturnValue(mockQueryRunnerInstance); 
  });

  afterEach(() => { // Add afterEach to restore all mocks
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createUserDto: CreateUserInternalDto = {
      email: 'test@example.com',
      password_hash: 'hashedPassword123',
      username: 'testuser',
    };

    const mockUserEntity = {
      ...createUserDto,
      id: 'user-uuid-1',
      created_at: new Date(),
      updated_at: new Date(),
      activities: [],
      current_hashed_refresh_token: null,
    } as User;

    const savedUserEntity = { 
      ...mockUserEntity,
    } as User;

    beforeEach(() => {
      userRepository.create.mockClear();
      userRepository.save.mockClear();
      userRepository.count.mockClear(); // Clear count mock
      loggerErrorSpy.mockClear();
      loggerWarnSpy.mockClear();
      loggerLogSpy.mockClear();

      // Default setup for successful creation path
      userRepository.create.mockReturnValue(mockUserEntity);
      userRepository.save.mockResolvedValue(savedUserEntity);
      // Default for MAX_ROWS_USERS to allow creation
      configServiceMock.get.mockImplementation((key: string): string | undefined => { // Explicit return type
        if (key === 'MAX_ROWS_USERS') return 'unlimited';
        return undefined;
      });
      userRepository.count.mockResolvedValue(0); // Default count
    });

    it('should successfully create and save a new user when MAX_ROWS_USERS is "unlimited"', async () => {
      // ConfigService mock is already set to 'unlimited' by default in beforeEach
      const result = await service.create(createUserDto);

      expect(userRepository.create).toHaveBeenCalledWith(createUserDto);
      expect(userRepository.save).toHaveBeenCalledWith(mockUserEntity);
      expect(result).toEqual(savedUserEntity);
      expect(userRepository.count).not.toHaveBeenCalled(); // count should not be called if limit is 'unlimited'
      expect(loggerErrorSpy).not.toHaveBeenCalled();
      expect(loggerWarnSpy).not.toHaveBeenCalled();
      expect(loggerLogSpy).toHaveBeenCalledWith(`Attempting to persist user: ${createUserDto.username || createUserDto.email}`);
      expect(loggerLogSpy).toHaveBeenCalledWith(`User ${savedUserEntity.username || savedUserEntity.email} persisted successfully with ID ${savedUserEntity.id}`);
    });
    
    it('should successfully create and save a new user when MAX_ROWS_USERS is not set', async () => {
      configServiceMock.get.mockImplementation((key: string) => {
        if (key === 'MAX_ROWS_USERS') return undefined; // Simulate not set
        return undefined;
      });

      const result = await service.create(createUserDto);

      expect(userRepository.create).toHaveBeenCalledWith(createUserDto);
      expect(userRepository.save).toHaveBeenCalledWith(mockUserEntity);
      expect(result).toEqual(savedUserEntity);
      expect(userRepository.count).not.toHaveBeenCalled();
      expect(loggerLogSpy).toHaveBeenCalledWith('MAX_ROWS_USERS not set. Skipping user limit check.');
    });


    it('should throw ConflictException if userRepository.save fails with unique constraint (code 23505)', async () => {
      // Simulate a QueryFailedError that also has a 'code' property
      const dbError = new QueryFailedError('INSERT ...', [], new Error('Unique constraint violation')) as QueryFailedError & { code: string | number };
      dbError.code = '23505'; // Simulate PostgreSQL unique violation
      
      userRepository.save.mockRejectedValue(dbError);

      // Call create twice to ensure the rejection is consistent if the test setup allows for it
      // (though typically one call is sufficient for testing the rejection)
      await expect(service.create(createUserDto)).rejects.toThrow(ConflictException);
      // Second assertion to check the specific message (optional, but good for clarity)
      // Ensure this second call is intended or if a single call is sufficient for the test's purpose.
      // If the service.create method has side effects that prevent a second identical call,
      // you might need to reset state or reconsider this second assertion.
      // For now, assuming the test structure is intentional:
      userRepository.save.mockRejectedValueOnce(dbError); // Mock it again if the first expect consumes the rejection
      await expect(service.create(createUserDto)).rejects.toThrow('User with this email or username already exists.');
      
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Error saving new user ${createUserDto.username || createUserDto.email}: ${dbError.message}`),
        dbError.stack,
      );
    });
    
    it('should throw InternalServerErrorException if userRepository.save fails with a generic error', async () => {
      const genericDbError = new Error('Some other database error');
      userRepository.save.mockRejectedValue(genericDbError);

      await expect(service.create(createUserDto)).rejects.toThrow(InternalServerErrorException);
      await expect(service.create(createUserDto)).rejects.toThrow('Failed to create user due to a database error.');
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Error saving new user ${createUserDto.username || createUserDto.email}: ${genericDbError.message}`),
        genericDbError.stack,
      );
    });
    
    it('should throw an error if userRepository.create fails (less common, but possible)', async () => {
        const createError = new Error('Failed to create entity object');
        userRepository.create.mockImplementation(() => { throw createError; });

        await expect(service.create(createUserDto)).rejects.toThrow(createError);
        expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findByEmail', () => {
    const mockEmail = 'test@example.com';
    const mockUser = {
      id: 'user-uuid-1',
      email: mockEmail,
      username: 'testuser',
    } as User;

    beforeEach(() => {
      userRepository.findOne.mockClear();
    });

    it('should return a user if found by email', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      const result = await service.findByEmail(mockEmail);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email: mockEmail } });
      expect(result).toEqual(mockUser);
    });

    it('should return null if user is not found by email', async () => {
      userRepository.findOne.mockResolvedValue(null);
      const result = await service.findByEmail(mockEmail);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email: mockEmail } });
      expect(result).toBeNull();
    });

    it('should propagate an error if userRepository.findOne fails', async () => {
      const dbError = new Error('Database connection error');
      userRepository.findOne.mockRejectedValue(dbError);
      await expect(service.findByEmail(mockEmail)).rejects.toThrow(dbError);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email: mockEmail } });
    });
  });

  describe('findByEmailWithPassword', () => {
    const mockEmail = 'test-pw@example.com';
    const mockUserWithPassword = {
      id: 'user-uuid-2',
      email: mockEmail,
      username: 'testuserpw',
      password_hash: 'somehashedpasswordstring',
    } as User;

    let mockQueryBuilder: MockUserQueryBuilder;

    beforeEach(() => {
      const queryBuilderInstance: MockUserQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
      };
      mockQueryBuilder = queryBuilderInstance; 
      userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      userRepository.createQueryBuilder.mockClear(); 
      mockQueryBuilder.where.mockClear();
      mockQueryBuilder.addSelect.mockClear();
      mockQueryBuilder.getOne.mockClear();
    });

    it('should return a user with password_hash if found by email', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(mockUserWithPassword);
      const result = await service.findByEmailWithPassword(mockEmail);
      expect(userRepository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user.email = :email', { email: mockEmail });
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith('user.password_hash');
      expect(mockQueryBuilder.getOne).toHaveBeenCalled();
      expect(result).toEqual(mockUserWithPassword);
    });

    it('should return null if user is not found by email', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);
      const result = await service.findByEmailWithPassword(mockEmail);
      expect(result).toBeNull();
    });

    it('should propagate an error if queryBuilder.getOne fails', async () => {
      const dbError = new Error('Database query failed');
      mockQueryBuilder.getOne.mockRejectedValue(dbError);
      await expect(service.findByEmailWithPassword(mockEmail)).rejects.toThrow(dbError);
    });
  });

  describe('findByUsername', () => {
    const mockUsername = 'testuser123';
    const mockUser = { id: 'user-uuid-3', email: 'user3@example.com', username: mockUsername } as User;

    beforeEach(() => {
      userRepository.findOne.mockClear();
    });

    it('should return a user if found by username', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      const result = await service.findByUsername(mockUsername);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { username: mockUsername } });
      expect(result).toEqual(mockUser);
    });

    it('should return null if user is not found by username', async () => {
      userRepository.findOne.mockResolvedValue(null);
      const result = await service.findByUsername(mockUsername);
      expect(result).toBeNull();
    });

    it('should return null if the provided username is null', async () => {
      const result = await service.findByUsername(null as any);
      expect(userRepository.findOne).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should return null if the provided username is an empty string', async () => {
      const result = await service.findByUsername('');
       expect(userRepository.findOne).not.toHaveBeenCalled(); // findByUsername returns early
      expect(result).toBeNull();
    });

    it('should propagate an error if userRepository.findOne fails', async () => {
      const dbError = new Error('Database query failed during findByUsername');
      userRepository.findOne.mockRejectedValue(dbError);
      await expect(service.findByUsername(mockUsername)).rejects.toThrow(dbError);
    });
  });

  describe('findById', () => {
    const mockUserId = 'user-uuid-for-findById';
    const mockUser = { id: mockUserId, email: 'findbyid@example.com', username: 'findbyiduser' } as User;

    beforeEach(() => {
      userRepository.findOne.mockClear();
    });

    it('should return a user if found by ID', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);
      const result = await service.findById(mockUserId);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id: mockUserId } });
      expect(result).toEqual(mockUser);
    });

    it('should return null if user is not found by ID', async () => {
      userRepository.findOne.mockResolvedValue(null);
      const result = await service.findById(mockUserId);
      expect(result).toBeNull();
    });

    it('should propagate an error if userRepository.findOne fails', async () => {
      const dbError = new Error('Database query failed during findById');
      userRepository.findOne.mockRejectedValue(dbError);
      await expect(service.findById(mockUserId)).rejects.toThrow(dbError);
    });
  });

  describe('findUserWithRefreshToken', () => {
    const mockUserId = 'user-uuid-for-refresh-token';
    const mockUserWithToken = { id: mockUserId, email: 'refreshtoken@example.com', username: 'refreshtokenuser', current_hashed_refresh_token: 'somehashedrefreshtoken' } as User;
    let mockQueryBuilder: MockUserByIdQueryBuilder;

    beforeEach(() => {
      const queryBuilderInstance: MockUserByIdQueryBuilder = {
        where: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), getOne: jest.fn(),
      };
      mockQueryBuilder = queryBuilderInstance;
      userRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      userRepository.createQueryBuilder.mockClear(); 
      mockQueryBuilder.where.mockClear();
      mockQueryBuilder.addSelect.mockClear();
      mockQueryBuilder.getOne.mockClear();
    });

    it('should return a user with current_hashed_refresh_token if found by ID', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(mockUserWithToken);
      const result = await service.findUserWithRefreshToken(mockUserId);
      expect(userRepository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user.id = :userId', { userId: mockUserId });
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith('user.current_hashed_refresh_token');
      expect(mockQueryBuilder.getOne).toHaveBeenCalled();
      expect(result).toEqual(mockUserWithToken);
    });

    it('should return null if user is not found by ID', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);
      const result = await service.findUserWithRefreshToken(mockUserId);
      expect(result).toBeNull();
    });

    it('should propagate an error if queryBuilder.getOne fails', async () => {
      const dbError = new Error('Database query failed for findUserWithRefreshToken');
      mockQueryBuilder.getOne.mockRejectedValue(dbError);
      await expect(service.findUserWithRefreshToken(mockUserId)).rejects.toThrow(dbError);
    });
  });

  describe('update', () => {
    const mockUserId = 'user-to-update-uuid';
    const initialUser = { id: mockUserId, email: 'initial@example.com', username: 'InitialUser' } as User;

    beforeEach(() => {
      userRepository.findOne.mockClear();
      mockQueryRunnerInstance.connect.mockClear();
      mockQueryRunnerInstance.startTransaction.mockClear();
      mockQueryRunnerInstance.commitTransaction.mockClear();
      mockQueryRunnerInstance.rollbackTransaction.mockClear();
      mockQueryRunnerInstance.release.mockClear();
      mockQueryRunnerInstance.manager.update.mockClear();
      mockQueryRunnerInstance.manager.findOne.mockClear();
      dataSourceMockInstance.createQueryRunner.mockClear();
      dataSourceMockInstance.createQueryRunner.mockReturnValue(mockQueryRunnerInstance);
      _activitiesServiceMock.updateContributorNameForUser.mockClear();
      loggerErrorSpy.mockClear();
    });

    it('should successfully update username and call ActivitiesService, then commit', async () => {
      const updateUserDto: Partial<User> = { username: 'UpdatedUser' };
      const expectedUpdatedUser = { ...initialUser, ...updateUserDto };
      userRepository.findOne.mockResolvedValue(initialUser); 
      mockQueryRunnerInstance.manager.update.mockResolvedValue({ affected: 1 } as any);
      _activitiesServiceMock.updateContributorNameForUser.mockResolvedValue(undefined);
      mockQueryRunnerInstance.manager.findOne.mockResolvedValue(expectedUpdatedUser);

      const result = await service.update(mockUserId, updateUserDto);

      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id: mockUserId } });
      expect(dataSourceMockInstance.createQueryRunner).toHaveBeenCalledTimes(1);
      expect(mockQueryRunnerInstance.connect).toHaveBeenCalledTimes(1);
      expect(mockQueryRunnerInstance.startTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunnerInstance.manager.update).toHaveBeenCalledWith(User, mockUserId, updateUserDto);
      expect(_activitiesServiceMock.updateContributorNameForUser).toHaveBeenCalledWith(mockUserId, 'UpdatedUser');
      expect(mockQueryRunnerInstance.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunnerInstance.manager.findOne).toHaveBeenCalledWith(User, { where: { id: mockUserId } });
      expect(mockQueryRunnerInstance.rollbackTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunnerInstance.release).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedUpdatedUser);
    });

    it('should update username to null, call ActivitiesService with empty string, and commit', async () => {
      const updateUserDto: Partial<User> = { username: null };
      const expectedUpdatedUserInDb = { ...initialUser, username: null }; 
      userRepository.findOne.mockResolvedValue(initialUser); 
      mockQueryRunnerInstance.manager.update.mockResolvedValue({ affected: 1 } as any);
      _activitiesServiceMock.updateContributorNameForUser.mockResolvedValue(undefined);
      mockQueryRunnerInstance.manager.findOne.mockResolvedValue(expectedUpdatedUserInDb);

      const result = await service.update(mockUserId, updateUserDto);
      expect(mockQueryRunnerInstance.manager.update).toHaveBeenCalledWith(User, mockUserId, { username: null });
      expect(_activitiesServiceMock.updateContributorNameForUser).toHaveBeenCalledWith(mockUserId, ''); 
      expect(result).toEqual(expectedUpdatedUserInDb);
    });

    it('should update username to empty string, call ActivitiesService with empty string, and commit', async () => {
      const updateUserDto: Partial<User> = { username: '' };
      const expectedUpdatedUserInDb = { ...initialUser, username: '' };
      userRepository.findOne.mockResolvedValue(initialUser);
      mockQueryRunnerInstance.manager.update.mockResolvedValue({ affected: 1 } as any);
      _activitiesServiceMock.updateContributorNameForUser.mockResolvedValue(undefined);
      mockQueryRunnerInstance.manager.findOne.mockResolvedValue(expectedUpdatedUserInDb);

      const result = await service.update(mockUserId, updateUserDto);
      expect(mockQueryRunnerInstance.manager.update).toHaveBeenCalledWith(User, mockUserId, { username: '' });
      expect(_activitiesServiceMock.updateContributorNameForUser).toHaveBeenCalledWith(mockUserId, '');
      expect(result).toEqual(expectedUpdatedUserInDb);
    });

    it('should not call ActivitiesService if username is the same, and commit', async () => {
      const updateUserDto: Partial<User> = { username: initialUser.username }; 
      const expectedUpdatedUser = { ...initialUser };
      userRepository.findOne.mockResolvedValue(initialUser);
      mockQueryRunnerInstance.manager.update.mockResolvedValue({ affected: 1 } as any);
      mockQueryRunnerInstance.manager.findOne.mockResolvedValue(expectedUpdatedUser);

      const result = await service.update(mockUserId, updateUserDto);
      expect(_activitiesServiceMock.updateContributorNameForUser).not.toHaveBeenCalled();
      expect(result).toEqual(expectedUpdatedUser);
    });

    it('should not call ActivitiesService if username is undefined in DTO, and commit', async () => {
      const updateUserDto: Partial<User> = { email: 'newemail@example.com' }; 
      const expectedUpdatedUser = { ...initialUser, email: 'newemail@example.com' };
      userRepository.findOne.mockResolvedValue(initialUser);
      mockQueryRunnerInstance.manager.update.mockResolvedValue({ affected: 1 } as any);
      mockQueryRunnerInstance.manager.findOne.mockResolvedValue(expectedUpdatedUser);

      const result = await service.update(mockUserId, updateUserDto);
      expect(_activitiesServiceMock.updateContributorNameForUser).not.toHaveBeenCalled();
      expect(result).toEqual(expectedUpdatedUser);
    });

    it('should throw NotFoundException if user to update is not found', async () => {
      const updateUserDto: Partial<User> = { username: 'AnyUser' };
      userRepository.findOne.mockResolvedValue(null); 
      await expect(service.update(mockUserId, updateUserDto)).rejects.toThrow(NotFoundException);
      expect(dataSourceMockInstance.createQueryRunner).not.toHaveBeenCalled();
    });

    it('should roll back transaction and throw InternalServerErrorException if queryRunner.manager.update fails', async () => {
      const updateUserDto: Partial<User> = { username: 'UpdatedUser' };
      const dbError = new Error('DB update failed');
      userRepository.findOne.mockResolvedValue(initialUser); 
      mockQueryRunnerInstance.manager.update.mockRejectedValue(dbError);

      await expect(service.update(mockUserId, updateUserDto)).rejects.toThrow(InternalServerErrorException);
      expect(mockQueryRunnerInstance.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error processing update for user ${mockUserId}: ${dbError.message}`, dbError.stack,
      );
    });

    it('should roll back transaction and throw generic InternalServerErrorException if ActivitiesService fails (generic error)', async () => {
      const updateUserDto: Partial<User> = { username: 'UpdatedUserDifferent' };
      const activityServiceError = new Error('Activity service update failed');
      userRepository.findOne.mockResolvedValue(initialUser); 
      mockQueryRunnerInstance.manager.update.mockResolvedValue({ affected: 1 } as any);
      _activitiesServiceMock.updateContributorNameForUser.mockRejectedValue(activityServiceError);

      await expect(service.update(mockUserId, updateUserDto)).rejects.toThrow(
        new InternalServerErrorException('Failed to update user profile due to an internal error.'),
      );
      expect(mockQueryRunnerInstance.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error processing update for user ${mockUserId}: ${activityServiceError.message}`, activityServiceError.stack,
      );
    });

    it('should roll back and propagate specific InternalServerErrorException from ActivitiesService', async () => {
      const updateUserDto: Partial<User> = { username: 'AnotherUpdatedUser' };
      const specificActivityServiceError = new InternalServerErrorException('Failed to update contributor names in ActivitiesService');
      userRepository.findOne.mockResolvedValue(initialUser);
      mockQueryRunnerInstance.manager.update.mockResolvedValue({ affected: 1 } as any);
      _activitiesServiceMock.updateContributorNameForUser.mockRejectedValue(specificActivityServiceError);

      await expect(service.update(mockUserId, updateUserDto)).rejects.toThrow(specificActivityServiceError);
      expect(mockQueryRunnerInstance.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error processing update for user ${mockUserId}: ${specificActivityServiceError.message}`, specificActivityServiceError.stack,
      );
    });

    it('should throw InternalServerErrorException if user not found after commit', async () => {
      const updateUserDto: Partial<User> = { username: 'ConsistentUser' };
      userRepository.findOne.mockResolvedValue(initialUser);
      mockQueryRunnerInstance.manager.update.mockResolvedValue({ affected: 1 } as any);
      _activitiesServiceMock.updateContributorNameForUser.mockResolvedValue(undefined);
      mockQueryRunnerInstance.manager.findOne.mockResolvedValue(null); // Simulate user not found after commit

      await expect(service.update(mockUserId, updateUserDto)).rejects.toThrow(
        new InternalServerErrorException(`User with ID "${mockUserId}" not found after update.`),
      );
      // The original code has a specific log for this case before throwing, then the catch block logs again.
      // The first log is: `User with ID "${mockUserId}" not found after update and transaction commit.`
      // The second log (from the catch block) would be the message of the thrown InternalServerErrorException.
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `User with ID "${mockUserId}" not found after update and transaction commit.`, // This is the first log
      );
      // The transaction should be rolled back due to the error thrown *within* the try block of the service.
      expect(mockQueryRunnerInstance.rollbackTransaction).toHaveBeenCalledTimes(1);
    });
  });
});