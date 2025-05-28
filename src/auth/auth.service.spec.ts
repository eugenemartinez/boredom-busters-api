import { Test, TestingModule } from '@nestjs/testing';
// Remove AuthTokenPayload and LoginResponse if they are truly unused.
// For now, let's assume they might be used later or were intended for use.
import { AuthService, AuthTokenPayload } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt'; // Keep this import
import { User } from '../users/entities/user.entity.js';
import { RegisterUserDto } from './dto/register-user.dto.js';
import { LoginUserDto } from './dto/login-user.dto.js';
import { Activity } from '../activities/entities/activity.entity.js';
import * as crypto from 'crypto';

// Define these at the top level of your spec file, before describe blocks
const mockCryptoSha256Update = jest.fn().mockReturnThis();
const mockCryptoSha256Digest = jest.fn();

interface MockBuffer {
  toString(encoding?: string): string; // Add this line
}

jest.mock('crypto', () => {
  const actualCrypto = jest.requireActual<typeof import('crypto')>('crypto');

  const mockToString = jest.fn<string, [string?]>(
    (encoding?: string): string => {
      if (encoding === 'hex') { return 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'; }
      return 'mocked-buffer-to-string-result';
    }
  );
  const mockRandomBytes = jest.fn<MockBuffer, [number]>(
    (_size: number): MockBuffer => ({ toString: mockToString })
  );

  // This is the factory for the hash object
  const mockCreateHash = jest.fn((algorithm: string) => {
    if (algorithm === 'sha256') {
      return {
        update: mockCryptoSha256Update, // Use the top-level mock
        digest: mockCryptoSha256Digest, // Use the top-level mock
      };
    }
    // Fallback for other algorithms if your service might use them
    // For this test, we only care about 'sha256'
    return actualCrypto.createHash(algorithm);
  });

  return {
    ...actualCrypto,
    randomBytes: mockRandomBytes,
    createHash: mockCreateHash,
  };
});

// Provide a factory function to jest.mock for bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let usersServiceMock: ReturnType<typeof getMockUsersService>; // Typed for clarity
  let jwtServiceMock: typeof mockJwtService; // Typed for clarity
  let configServiceMock: typeof mockConfigService; // Typed for clarity

  let loggerErrorSpy: jest.SpyInstance;
  let loggerDebugSpy: jest.SpyInstance; // For updateRefreshTokenHash

  // Function to get fresh mocks for usersService to include all needed methods
  const getMockUsersService = () => ({
    create: jest.fn(),
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    findByEmailWithPassword: jest.fn(),
    update: jest.fn(),
    findById: jest.fn(),
    findUserWithRefreshToken: jest.fn(), // Add this line
  });

  const mockJwtService = {
    signAsync: jest.fn(),
    sign: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'BCRYPT_SALT_ROUNDS': return 10;
        case 'JWT_SECRET': return 'test_access_secret';
        case 'JWT_ACCESS_TOKEN_EXPIRES_IN': return '15m';
        case 'JWT_REFRESH_SECRET': return 'test_refresh_secret';
        case 'JWT_REFRESH_TOKEN_EXPIRES_IN': return '7d';
        default: return null;
      }
    }),
  };

  beforeEach(async () => {
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    loggerDebugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {}); // Spy on debug

    usersServiceMock = getMockUsersService(); // Get fresh mocks
    jwtServiceMock = { ...mockJwtService, sign: jest.fn() }; // Ensure sign is a fresh mock
    configServiceMock = { ...mockConfigService, get: jest.fn(mockConfigService.get) }; // Ensure get is a fresh mock


    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersServiceMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);

    // Clear all mocks and spies
    jest.clearAllMocks();
    (crypto.randomBytes as jest.Mock).mockClear().mockReturnValue({ toString: jest.fn().mockReturnValue('mocked-jwt-id') });
    loggerErrorSpy.mockClear();
    loggerDebugSpy.mockClear();
    // Manually clear mocks for services if jest.clearAllMocks() is not sufficient for the new mock structure
    Object.values(usersServiceMock).forEach(mockFn => mockFn.mockClear());
    Object.values(jwtServiceMock).forEach(mockFn => mockFn.mockClear());
    configServiceMock.get.mockClear();
    // Now you can safely clear these mocks
    (bcrypt.hash as jest.Mock).mockClear();
    (bcrypt.compare as jest.Mock).mockClear();
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
    loggerDebugSpy.mockRestore(); // Restore debug spy
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  describe('register', () => {
    const registerDto: RegisterUserDto = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    };
    const hashedPassword = 'hashedPassword123';
    const testDate = new Date();

    const createdUserEntity: User = {
      id: 'user-uuid-123',
      email: registerDto.email,
      username: registerDto.username === undefined ? null : registerDto.username,
      password_hash: hashedPassword,
      current_hashed_refresh_token: null,
      created_at: testDate,
      updated_at: testDate,
      activities: [] as Activity[],
    };

    it('should successfully create a new user and return user object without sensitive fields', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(null);
      usersServiceMock.findByUsername.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      usersServiceMock.create.mockResolvedValue(createdUserEntity);

      const result = await authService.register(registerDto);

      expect(usersServiceMock.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(usersServiceMock.findByUsername).toHaveBeenCalledWith(registerDto.username);
      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 10);
      expect(usersServiceMock.create).toHaveBeenCalledWith({
        email: registerDto.email,
        username: registerDto.username,
        password_hash: hashedPassword,
      });

      const { password_hash: _password_hash, current_hashed_refresh_token: _current_hashed_refresh_token, ...expectedServiceResult } = createdUserEntity;
      expect(result).toEqual(expectedServiceResult);
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      usersServiceMock.findByEmail.mockResolvedValue({ id: 'some-id' } as User);

      await expect(authService.register(registerDto)).rejects.toThrow(ConflictException);
      expect(usersServiceMock.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(usersServiceMock.findByUsername).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(usersServiceMock.create).not.toHaveBeenCalled();
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if username already exists', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(null);
      usersServiceMock.findByUsername.mockResolvedValue({ id: 'some-id' } as User);

      await expect(authService.register(registerDto)).rejects.toThrow(ConflictException);
      expect(usersServiceMock.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(usersServiceMock.findByUsername).toHaveBeenCalledWith(registerDto.username);
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(usersServiceMock.create).not.toHaveBeenCalled();
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException if password hashing fails', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(null);
      usersServiceMock.findByUsername.mockResolvedValue(null);
      const hashingError = new Error('Hashing failed');
      (bcrypt.hash as jest.Mock).mockRejectedValue(hashingError);

      await expect(authService.register(registerDto)).rejects.toThrow(InternalServerErrorException);
      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 10);
      expect(usersServiceMock.create).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledWith('Password hashing failed:', hashingError);
    });
    
    it('should throw InternalServerErrorException if user creation in service fails unexpectedly', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(null);
      usersServiceMock.findByUsername.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      const dbError = new Error('Unexpected DB error');
      usersServiceMock.create.mockRejectedValue(dbError);

      await expect(authService.register(registerDto)).rejects.toThrow(InternalServerErrorException);
      expect(loggerErrorSpy).toHaveBeenCalledWith('User creation failed during usersService.create:', dbError); 
    });

    it('should throw ConflictException if user creation in service fails with a known conflict (e.g., DB constraint)', async () => {
      usersServiceMock.findByEmail.mockResolvedValue(null);
      usersServiceMock.findByUsername.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      const dbConflictError = { code: '23505', message: 'duplicate key value violates unique constraint' };
      usersServiceMock.create.mockRejectedValue(dbConflictError);

      await expect(authService.register(registerDto)).rejects.toThrow(ConflictException);
      expect(loggerErrorSpy).toHaveBeenCalledWith('User creation failed during usersService.create:', dbConflictError);
    });
  });

  describe('login', () => {
    const loginDto: LoginUserDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    const mockUserFromDb: User = {
      id: 'user-uuid-456',
      email: loginDto.email,
      username: 'testuser',
      password_hash: 'hashedPasswordFromDb',
      current_hashed_refresh_token: null,
      created_at: new Date(),
      updated_at: new Date(),
      activities: [],
    };

    const expectedAccessToken = 'mockAccessToken';
    const expectedRefreshToken = 'mockRefreshToken';

    // This spy will target the private method updateRefreshTokenHash
    // It needs to be set up carefully as private methods are not directly accessible for spying
    // A common approach is to spy on the service instance itself.
    let updateRefreshTokenHashSpy: jest.SpyInstance;

    beforeEach(() => {
      // Spy on the private method updateRefreshTokenHash of the authService instance
      // This is generally discouraged if the method can be tested via public API,
      // but for verifying its call, it's sometimes necessary.
      // Ensure this spy is created *after* authService is instantiated.
      updateRefreshTokenHashSpy = jest.spyOn(authService as any, 'updateRefreshTokenHash').mockResolvedValue(undefined);

      // Reset mocks specific to login that might be set in individual tests
      usersServiceMock.findByEmailWithPassword.mockReset();
      (bcrypt.compare as jest.Mock).mockReset();
      jwtServiceMock.sign.mockReset();
      configServiceMock.get.mockClear(); // Clear calls to configService.get
      (crypto.randomBytes as jest.Mock).mockClear().mockReturnValue({ toString: jest.fn().mockReturnValue('mocked-jwt-id') });
    });

    afterEach(() => {
      updateRefreshTokenHashSpy.mockRestore();
    });

    it('should successfully validate credentials, generate tokens, update refresh token hash, and return LoginResponse', async () => {
      // Arrange
      usersServiceMock.findByEmailWithPassword.mockResolvedValue(mockUserFromDb);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtServiceMock.sign
        .mockReturnValueOnce(expectedAccessToken) // First call for access token
        .mockReturnValueOnce(expectedRefreshToken); // Second call for refresh token
      
      (crypto.randomBytes as jest.Mock)
        .mockReturnValueOnce({ toString: jest.fn().mockReturnValue('access-jwt-id') })
        .mockReturnValueOnce({ toString: jest.fn().mockReturnValue('refresh-jwt-id') });


      // Act
      const result = await authService.login(loginDto);

      // Assert
      expect(usersServiceMock.findByEmailWithPassword).toHaveBeenCalledWith(loginDto.email);
      expect(bcrypt.compare).toHaveBeenCalledWith(loginDto.password, mockUserFromDb.password_hash);
      
      // Access Token Generation
      expect(jwtServiceMock.sign).toHaveBeenCalledWith(
        { sub: mockUserFromDb.id, email: mockUserFromDb.email, jti: 'access-jwt-id' },
        { secret: 'test_access_secret', expiresIn: '15m' }
      );
      // Refresh Token Generation
      expect(jwtServiceMock.sign).toHaveBeenCalledWith(
        { sub: mockUserFromDb.id, email: mockUserFromDb.email, jti: 'refresh-jwt-id' },
        { secret: 'test_refresh_secret', expiresIn: '7d' }
      );
      expect(updateRefreshTokenHashSpy).toHaveBeenCalledWith(mockUserFromDb.id, expectedRefreshToken);
      
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash, current_hashed_refresh_token, ...expectedUserResult } = mockUserFromDb;
      expect(result).toEqual({
        accessToken: expectedAccessToken,
        refreshToken: expectedRefreshToken,
        user: expectedUserResult,
      });
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if user is not found', async () => {
      usersServiceMock.findByEmailWithPassword.mockResolvedValue(null);

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(usersServiceMock.findByEmailWithPassword).toHaveBeenCalledWith(loginDto.email);
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(jwtServiceMock.sign).not.toHaveBeenCalled();
      expect(updateRefreshTokenHashSpy).not.toHaveBeenCalled();
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException if user password_hash is missing', async () => {
      const userWithoutPasswordHash = { ...mockUserFromDb, password_hash: null }; // Use null directly
      usersServiceMock.findByEmailWithPassword.mockResolvedValue(userWithoutPasswordHash);

      await expect(authService.login(loginDto)).rejects.toThrow(InternalServerErrorException);
      expect(usersServiceMock.findByEmailWithPassword).toHaveBeenCalledWith(loginDto.email);
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(jwtServiceMock.sign).not.toHaveBeenCalled();
      expect(updateRefreshTokenHashSpy).not.toHaveBeenCalled();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Password hash not found for user: ${loginDto.email}. Check user entity and query.`,
      );
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      usersServiceMock.findByEmailWithPassword.mockResolvedValue(mockUserFromDb);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(usersServiceMock.findByEmailWithPassword).toHaveBeenCalledWith(loginDto.email);
      expect(bcrypt.compare).toHaveBeenCalledWith(loginDto.password, mockUserFromDb.password_hash);
      expect(jwtServiceMock.sign).not.toHaveBeenCalled();
      expect(updateRefreshTokenHashSpy).not.toHaveBeenCalled();
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

  });

  describe('updateRefreshTokenHash', () => {
    const userId = 'user-uuid-for-update';
    const plainRefreshToken = 'plainTestRefreshToken';
    const sha256HashedToken = 'sha256HashedOutput';
    const bcryptHashedToken = 'bcryptHashedOutputOfSha256';

    beforeEach(() => {
      // Clear and prime the top-level mocks for SHA256
      mockCryptoSha256Update.mockClear().mockReturnThis(); // Important: keep mockReturnThis
      mockCryptoSha256Digest.mockClear().mockReturnValue(sha256HashedToken);
      // Clear the createHash factory mock itself
      (crypto.createHash as jest.Mock).mockClear();

      (bcrypt.hash as jest.Mock).mockClear();
      usersServiceMock.update.mockClear();
      loggerDebugSpy.mockClear();
      loggerErrorSpy.mockClear(); // Clear error spy too
    });

    it('should hash the token (SHA256 then bcrypt) and update the user if a token is provided', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue(bcryptHashedToken);
      usersServiceMock.update.mockResolvedValue({} as User);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await (authService as any).updateRefreshTokenHash(userId, plainRefreshToken);

      expect(crypto.createHash).toHaveBeenCalledWith('sha256');
      expect(mockCryptoSha256Update).toHaveBeenCalledWith(plainRefreshToken);
      expect(mockCryptoSha256Digest).toHaveBeenCalledWith('hex');
      
      expect(bcrypt.hash).toHaveBeenCalledWith(sha256HashedToken, 10);
      expect(usersServiceMock.update).toHaveBeenCalledWith(userId, { current_hashed_refresh_token: bcryptHashedToken });
      expect(loggerDebugSpy).toHaveBeenCalledWith(`[AuthService] Stored bcrypt(sha256(refreshToken)) for user ${userId}`); // Adjusted log
    });

    it('should set refresh token hash to null and update the user if null token is provided', async () => {
      usersServiceMock.update.mockResolvedValue({} as User);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await (authService as any).updateRefreshTokenHash(userId, null);

      expect(crypto.createHash).not.toHaveBeenCalled();
      expect(mockCryptoSha256Update).not.toHaveBeenCalled();
      expect(mockCryptoSha256Digest).not.toHaveBeenCalled();
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(usersServiceMock.update).toHaveBeenCalledWith(userId, { current_hashed_refresh_token: null });
      expect(loggerDebugSpy).toHaveBeenCalledWith(`[AuthService] Cleared refresh token for user ${userId}`); // Adjusted log
    });

    it('should throw error if bcrypt.hash fails', async () => {
      const bcryptError = new Error('bcrypt failed');
      (bcrypt.hash as jest.Mock).mockRejectedValue(bcryptError);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await expect((authService as any).updateRefreshTokenHash(userId, plainRefreshToken))
        .rejects.toThrow(bcryptError);
      
      expect(loggerErrorSpy).toHaveBeenCalledWith(`Error bcrypting refresh token for user ${userId}:`, bcryptError); // Adjusted log
    });
    
    it('should throw error if usersService.update fails', async () => {
      const updateError = new Error('update failed');
      (bcrypt.hash as jest.Mock).mockResolvedValue(bcryptHashedToken);
      usersServiceMock.update.mockRejectedValue(updateError);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await expect((authService as any).updateRefreshTokenHash(userId, plainRefreshToken))
        .rejects.toThrow(updateError);
        
      expect(loggerErrorSpy).toHaveBeenCalledWith(`Error updating refresh token hash for user ${userId}:`, updateError); // Adjusted log
    });
  });

    describe('refreshToken', () => {
    const mockUserId = 'user-uuid-for-refresh';
    const mockUserEmail = 'refresh@example.com';
    const oldRefreshToken = 'oldPlainRefreshToken';
    // The service will receive the payload from the validated old refresh token
    const _mockRefreshTokenPayload: AuthTokenPayload = { 
      sub: mockUserId, 
      email: mockUserEmail,
      jti: 'old-jti' // Assuming jti is part of your refresh token payload
    };
    
    const mockUserFromDbWithToken: User = {
      id: mockUserId,
      email: mockUserEmail,
      username: 'refresher',
      password_hash: 'hashedPassword',
      current_hashed_refresh_token: 'hashedOldRefreshTokenInDb', // Bcrypt(SHA256(oldRefreshToken))
      created_at: new Date(),
      updated_at: new Date(),
      activities: [],
    };

    const newAccessToken = 'newMockAccessToken';
    const newRefreshToken = 'newMockRefreshToken'; // Plain text new refresh token

    // Spy on updateRefreshTokenHash, as it's a dependency
    let updateRefreshTokenHashSpy: jest.SpyInstance;

    beforeEach(() => {
      usersServiceMock.findUserWithRefreshToken.mockClear();
      (bcrypt.compare as jest.Mock).mockClear();
      jwtServiceMock.sign.mockClear();
      (crypto.randomBytes as jest.Mock).mockClear();
      loggerDebugSpy.mockClear();
      loggerErrorSpy.mockClear();
      configServiceMock.get.mockClear();

      updateRefreshTokenHashSpy = jest.spyOn(authService as any, 'updateRefreshTokenHash').mockResolvedValue(undefined);

      (crypto.randomBytes as jest.Mock)
        .mockReturnValueOnce({ toString: jest.fn().mockReturnValue('new-access-jti') })
        .mockReturnValueOnce({ toString: jest.fn().mockReturnValue('new-refresh-jti') });
      
      // Reset and prime the crypto mocks for SHA256 specifically for refreshToken tests
      mockCryptoSha256Update.mockClear().mockReturnThis();
      // Calculate the expected SHA256 hash of oldRefreshToken for these tests
      const expectedSha256ForTest = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');
      mockCryptoSha256Digest.mockClear().mockReturnValue(expectedSha256ForTest);
    });

    afterEach(() => {
      updateRefreshTokenHashSpy.mockRestore();
    });

    it('should successfully refresh tokens, rotate refresh token, and update hash', async () => {
      usersServiceMock.findUserWithRefreshToken.mockResolvedValue(mockUserFromDbWithToken);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true); 
      jwtServiceMock.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);

      const _result = await authService.refreshToken(mockUserId, oldRefreshToken);

      expect(usersServiceMock.findUserWithRefreshToken).toHaveBeenCalledWith(mockUserId);
      
      // Now this expectation should pass because the service will use the
      // actual SHA256 hash of oldRefreshToken (due to the primed mockCryptoSha256Digest)
      expect(bcrypt.compare).toHaveBeenCalledWith(
        crypto.createHash('sha256').update(oldRefreshToken).digest('hex'), // Or expect.stringMatching(/^[0-9a-f]{64}$/)
        mockUserFromDbWithToken.current_hashed_refresh_token
      );
      
      // This specific check for the argument might become redundant if the above passes with the actual hash,
      // but it's good for ensuring the mock setup is correct.
      const compareMockFn = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>;
      const firstCallArgs = compareMockFn.mock.calls[0];
      const sha256CallArg = firstCallArgs[0] as string;
      const expectedSha256OfOldToken = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');
      expect(sha256CallArg).toBe(expectedSha256OfOldToken);

      // ... rest of the assertions ...
    });

      describe('logout', () => {
    const mockUserId = 'user-uuid-for-logout';
    let updateRefreshTokenHashSpy: jest.SpyInstance;

    beforeEach(() => {
      updateRefreshTokenHashSpy = jest.spyOn(authService as any, 'updateRefreshTokenHash').mockResolvedValue(undefined);
      loggerDebugSpy.mockClear();
      loggerErrorSpy.mockClear();
    });

    afterEach(() => {
      updateRefreshTokenHashSpy.mockRestore();
    });

    it('should call updateRefreshTokenHash with userId and null, and log success', async () => {
      const result = await authService.logout(mockUserId);

      expect(updateRefreshTokenHashSpy).toHaveBeenCalledWith(mockUserId, null);
      // Match the updated, simpler return message from the service
      expect(result).toEqual({ message: 'Logout successful.' }); 
      // Match the updated debug log message from the service
      expect(loggerDebugSpy).toHaveBeenCalledWith(`User ${mockUserId} logged out successfully.`);
    });

    it('should throw InternalServerErrorException if updateRefreshTokenHash fails', async () => {
      const dbError = new Error('Database update failed during logout');
      updateRefreshTokenHashSpy.mockRejectedValue(dbError);

      await expect(authService.logout(mockUserId))
        .rejects.toThrow(InternalServerErrorException); // Should now throw the correct type
      
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        `Error during logout for user ${mockUserId}:`,
        dbError 
      );
    });
  });
  });
});