import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
  HttpException, // Import HttpException
} from '@nestjs/common';
import { UsersService, CreateUserInternalDto } from '../users/users.service.js';
import { RegisterUserDto } from './dto/register-user.dto.js';
import { LoginUserDto } from './dto/login-user.dto.js';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/entities/user.entity.js';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  jti?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'password_hash' | 'current_hashed_refresh_token'>;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(
    registerUserDto: RegisterUserDto,
  ): Promise<Omit<User, 'password_hash'>> {
    const { email, password, username } = registerUserDto;

    const existingUserByEmail = await this.usersService.findByEmail(email);
    if (existingUserByEmail) {
      throw new ConflictException('User with this email already exists.');
    }

    if (username) {
      const existingUserByUsername =
        await this.usersService.findByUsername(username);
      if (existingUserByUsername) {
        throw new ConflictException('User with this username already exists.');
      }
    }

    let hashedPassword: string;
    try {
      const saltRounds = 10;
      hashedPassword = await bcrypt.hash(password, saltRounds);
    } catch (error) {
      this.logger.error('Password hashing failed:', error); // This will now use the directly instantiated logger
      throw new InternalServerErrorException('Could not process registration.');
    }

    const userToCreate: CreateUserInternalDto = {
      email: registerUserDto.email,
      password_hash: hashedPassword, // Assuming hashedPassword is defined above
    };
    if (registerUserDto.username) {
      userToCreate.username = registerUserDto.username;
    }

    try {
      const createdUser = await this.usersService.create(userToCreate);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash, current_hashed_refresh_token, ...result } =
        createdUser;
      return result;
    } catch (error) {
      this.logger.error('User creation failed during usersService.create:', error);

      // If the error from usersService.create is already an HttpException (like ConflictException for row limit), re-throw it.
      if (error instanceof HttpException) {
        throw error;
      }

      // Check for specific database error codes like unique constraint violation
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code: unknown }).code === 'string' &&
        (error as { code: string }).code === '23505'
      ) {
        throw new ConflictException('Email or username already exists.');
      }

      // For any other unexpected errors from usersService.create, throw a generic InternalServerErrorException.
      throw new InternalServerErrorException('Could not create user due to an unexpected issue with user persistence.');
    }
  }

  private async updateRefreshTokenHash(
    userId: string,
    refreshToken: string | null,
  ): Promise<void> {
    if (refreshToken) {
      try {
        const sha256OfToken = crypto
          .createHash('sha256')
          .update(refreshToken)
          .digest('hex');
        const saltRounds = this.configService.get<number>(
          'BCRYPT_SALT_ROUNDS',
          10,
        ); // Get from config

        let bcryptHashOfSha256: string;
        try {
          bcryptHashOfSha256 = await bcrypt.hash(sha256OfToken, saltRounds);
        } catch (error) {
          this.logger.error(
            `Error bcrypting refresh token for user ${userId}:`,
            error,
          ); // Log bcrypt specific error
          throw error; // Re-throw
        }

        await this.usersService.update(userId, {
          current_hashed_refresh_token: bcryptHashOfSha256,
        });
        this.logger.debug(
          `[AuthService] Stored bcrypt(sha256(refreshToken)) for user ${userId}`,
        );
      } catch (error) {
        // This outer catch will catch errors from usersService.update or re-thrown bcrypt errors
        // Avoid double logging if bcrypt already logged and re-threw.
        // If the error was already logged by the inner catch, we might not want to log it again here,
        // or log a more generic message. For simplicity, let's assume usersService.update is the primary concern here.
        if (
          !(
            error instanceof Error &&
            error.message.startsWith('Error bcrypting')
          )
        ) {
          // Basic check to avoid double log
          this.logger.error(
            `Error updating refresh token hash for user ${userId}:`,
            error,
          );
        }
        throw error; // Re-throw
      }
    } else {
      try {
        await this.usersService.update(userId, {
          current_hashed_refresh_token: null,
        });
        this.logger.debug(
          `[AuthService] Cleared refresh token for user ${userId}`,
        );
      } catch (error) {
        this.logger.error(
          `Error clearing refresh token hash for user ${userId}:`,
          error,
        );
        throw error; // Re-throw
      }
    }
  }

  private generateJwtId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  async login(loginUserDto: LoginUserDto): Promise<LoginResponse> {
    const { email, password } = loginUserDto;
    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials. User not found.');
    }
    if (!user.password_hash) {
      this.logger.error(
        `Password hash not found for user: ${loginUserDto.email}. Check user entity and query.`,
      );
      throw new InternalServerErrorException('Authentication process failed.');
    }
    const isPasswordMatching = await bcrypt.compare(
      password,
      user.password_hash,
    );
    if (!isPasswordMatching) {
      throw new UnauthorizedException(
        'Invalid credentials. Password does not match.',
      );
    }
    const payload: AuthTokenPayload = {
      sub: user.id,
      email: user.email,
      jti: this.generateJwtId(),
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_TOKEN_EXPIRES_IN'),
    });
    const refreshTokenPayload: AuthTokenPayload = {
      sub: user.id,
      email: user.email,
      jti: this.generateJwtId(),
    };
    const refreshToken = this.jwtService.sign(refreshTokenPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_TOKEN_EXPIRES_IN'),
    });
    await this.updateRefreshTokenHash(user.id, refreshToken);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, current_hashed_refresh_token, ...userResult } = user;
    return {
      accessToken,
      refreshToken,
      user: userResult,
    };
  }

  async refreshToken(
    userId: string,
    providedRefreshToken: string,
  ): Promise<RefreshTokenResponse> {
    const user = await this.usersService.findUserWithRefreshToken(userId); // USE THE CORRECT METHOD

    if (!user) {
      this.logger.error(`User ${userId} not found during token refresh.`); // Log as error
      throw new UnauthorizedException('User not found or session invalidated.');
    }

    if (!user.current_hashed_refresh_token) {
      this.logger.error(`No refresh token stored for user ${userId}.`); // Log as error
      throw new UnauthorizedException(
        'Session invalidated. No refresh token on record.',
      );
    }

    const sha256OfProvidedToken = crypto
      .createHash('sha256')
      .update(providedRefreshToken)
      .digest('hex');

    const isTokenMatching = await bcrypt.compare(
      sha256OfProvidedToken,
      user.current_hashed_refresh_token,
    );

    if (!isTokenMatching) {
      this.logger.error(
        `Invalid refresh token for user ${userId}. Token mismatch.`,
      ); // Log as error
      // Critical: Invalidate all refresh tokens for this user on mismatch
      await this.updateRefreshTokenHash(userId, null);
      throw new UnauthorizedException('Invalid refresh token.');
    }

    // If we reach here, the old refresh token was valid. Proceed with rotation.
    let newAccessToken: string;
    let newRefreshTokenString: string;

    try {
      const newAccessTokenPayload: AuthTokenPayload = {
        sub: user.id,
        email: user.email,
        jti: this.generateJwtId(),
      };
      newAccessToken = this.jwtService.sign(newAccessTokenPayload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        // Use the same config key as in login()
        expiresIn: this.configService.get<string>(
          'JWT_ACCESS_TOKEN_EXPIRES_IN',
        ),
      });
    } catch (error) {
      this.logger.error(
        `Error signing new access token for user ${userId}:`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to generate new access token.',
      );
    }

    try {
      const newRefreshTokenPayload: AuthTokenPayload = {
        sub: user.id,
        email: user.email,
        jti: this.generateJwtId(),
      };
      newRefreshTokenString = this.jwtService.sign(newRefreshTokenPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        // Use the same config key as in login()
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_TOKEN_EXPIRES_IN',
        ),
      });
    } catch (error) {
      this.logger.error(
        `Error signing new refresh token for user ${userId}:`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to generate new refresh token.',
      );
    }

    try {
      await this.updateRefreshTokenHash(user.id, newRefreshTokenString);
    } catch (error) {
      // updateRefreshTokenHash should log its own specific error.
      // Here, we ensure the overall operation fails correctly.
      this.logger.error(
        `Failed to store rotated refresh token for user ${userId} after successful signing:`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to complete token refresh process.',
      );
    }

    this.logger.debug(`Tokens refreshed for user ${userId}`); // Log as debug
    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshTokenString,
    };
  }

  async logout(userId: string): Promise<{ message: string }> {
    try {
      await this.updateRefreshTokenHash(userId, null);
      // Consistent success message with what tests might expect for simplicity
      const successMessage = `User ${userId} logged out successfully.`;
      this.logger.debug(successMessage); // Use .debug
      return { message: 'Logout successful.' }; // Simpler message often preferred
    } catch (error) {
      this.logger.error(`Error during logout for user ${userId}:`, error);
      throw new InternalServerErrorException(
        'Logout failed due to a server error.',
      );
    }
  }
}
