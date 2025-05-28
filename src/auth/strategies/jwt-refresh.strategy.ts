import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service.js';
import { Request } from 'express';
import { AuthTokenPayload } from '../auth.service.js';
import { User } from '../../users/entities/user.entity.js';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto'; // Import crypto

// Define an interface for the expected request body structure
interface RefreshTokenRequestBody {
  refreshToken?: unknown; // Use unknown for initial safety, then check type
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  private readonly logger = new Logger(JwtRefreshStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const refreshSecret = configService.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      Logger.error(
        'FATAL ERROR: JWT_REFRESH_SECRET is not defined.',
        JwtRefreshStrategy.name,
      );
      throw new Error(
        'JWT_REFRESH_SECRET is not defined. Application cannot start.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      secretOrKey: refreshSecret,
      passReqToCallback: true,
      ignoreExpiration: false,
    });
  }

  async validate(
    req: Request,
    payload: AuthTokenPayload,
  ): Promise<Omit<User, 'password_hash' | 'current_hashed_refresh_token'>> {
    const body = req.body as RefreshTokenRequestBody;
    const refreshTokenFromBody = body.refreshToken;

    this.logger.debug(
      `[JwtRefreshStrategy] Validating token for user ID from JWT payload: ${payload?.sub}`,
    );

    if (typeof refreshTokenFromBody !== 'string' || !refreshTokenFromBody) {
      this.logger.warn(
        '[JwtRefreshStrategy] Refresh token not found in request body or not a string.',
      );
      throw new UnauthorizedException('Refresh token missing or invalid.');
    }

    // this.logger.debug(`[JwtRefreshStrategy] refreshTokenFromBody (first 20 chars): ${refreshTokenFromBody.substring(0, 20)}...`);
    // this.logger.debug(`[JwtRefreshStrategy] Full refreshTokenFromBody: ${refreshTokenFromBody}`); // Potentially too verbose for regular logs

    if (!payload || !payload.sub) {
      this.logger.warn(
        '[JwtRefreshStrategy] Invalid payload in refresh token JWT.',
      );
      throw new UnauthorizedException('Invalid refresh token payload.');
    }

    const user = await this.usersService.findUserWithRefreshToken(payload.sub);

    if (
      !user ||
      typeof user.current_hashed_refresh_token !== 'string' ||
      !user.current_hashed_refresh_token
    ) {
      this.logger.warn(
        `[JwtRefreshStrategy] User ${payload.sub} not found or no valid refresh token stored in DB. Stored hash in DB: ${user?.current_hashed_refresh_token}`,
      );
      throw new UnauthorizedException(
        'Invalid refresh token or user session not found.',
      );
    }

    // this.logger.debug(`[JwtRefreshStrategy] Stored bcrypt(sha256(token)) in DB for user ${user.id}: ${user.current_hashed_refresh_token}`);

    // 1. Create a SHA-256 hash of the incoming plaintext refresh token
    const sha256OfIncomingToken = crypto
      .createHash('sha256')
      .update(refreshTokenFromBody)
      .digest('hex');

    this.logger.debug(
      `[JwtRefreshStrategy] PRE-COMPARE SHA256 of incoming token: ${sha256OfIncomingToken}`,
    );
    this.logger.debug(
      `[JwtRefreshStrategy] PRE-COMPARE Hashed token from DB: ${user.current_hashed_refresh_token}`,
    );

    // 2. Compare the SHA-256 hash of the incoming token with the stored bcrypt hash
    const isRefreshTokenMatching = await bcrypt.compare(
      sha256OfIncomingToken,
      user.current_hashed_refresh_token,
    );

    this.logger.debug(
      `[JwtRefreshStrategy] bcrypt.compare(sha256(incomingToken), storedHash) result: ${isRefreshTokenMatching}`,
    );

    if (!isRefreshTokenMatching) {
      this.logger.warn(
        `[JwtRefreshStrategy] Refresh token mismatch for user ${payload.sub}. SHA256 of token from body did not match stored hash.`,
      );
      // Potentially implement stricter logout/session invalidation for all devices for this user here
      throw new UnauthorizedException('Refresh token mismatch.');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, current_hashed_refresh_token, ...result } = user;
    return result as Omit<
      User,
      'password_hash' | 'current_hashed_refresh_token'
    >;
  }
}
