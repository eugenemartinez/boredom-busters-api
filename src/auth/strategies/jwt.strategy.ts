import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service.js';
import { AuthTokenPayload } from '../auth.service.js';
import { User } from '../../users/entities/user.entity.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  // Logger can be initialized after super() if needed, or not at all if the error check is sufficient.
  // For this specific error check, logging before throwing might not be strictly necessary
  // as the throw itself will halt and likely be logged by NestJS.
  // However, if you want to use the logger for other things in the constructor AFTER super(), that's fine.

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');

    if (!secret) {
      // You can still log here if you want, but 'this.logger' is not available yet.
      // Use a static logger or console.error directly if immediate logging before throw is desired.
      // Logger.error('FATAL ERROR: JWT_SECRET is not defined...', 'JwtStrategy'); // If using NestJS Logger statically
      console.error(
        'FATAL ERROR: JWT_SECRET is not defined in environment variables. Application cannot start.',
      );
      throw new Error('JWT_SECRET is not defined. Application cannot start.');
    }

    super({
      // 'super()' must be called first
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });

    // 'this.logger' can be used from this point onwards if initialized
    // For example: this.logger.log('JwtStrategy initialized');
  }

  /**
   * This method is called by Passport after it has successfully verified and decoded the JWT.
   * The 'payload' argument is the decoded JWT payload.
   * Whatever is returned from this method will be attached to the Request object as `request.user`.
   */
  async validate(
    payload: AuthTokenPayload,
  ): Promise<Omit<User, 'password_hash'>> {
    // Payload contains { sub: userId, email: userEmail, iat: ..., exp: ... }
    const user = await this.usersService.findById(payload.sub); // 'sub' is our user ID

    if (!user) {
      throw new UnauthorizedException('User not found or token invalid.');
    }

    // We don't want to return the password hash with the request.user object
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...result } = user;
    return result; // This 'result' will be attached as request.user
  }
}
