import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { UsersModule } from '../users/users.module.js';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy.js'; // Import JwtRefreshStrategy

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }), // Default strategy for general JWT auth
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        // Secret and expiration for access tokens are handled by JwtStrategy/AuthService directly
        // This global registration is less critical if secrets are provided per sign/verify call
        // However, it can provide defaults if not overridden.
        // For refresh tokens, we'll use a different secret.
        secret: configService.get<string>('JWT_SECRET'), // Default secret
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_TOKEN_EXPIRES_IN'),
        },
      }),
      inject: [ConfigService],
    }),
    ConfigModule, // Ensure ConfigModule is imported if not already globally available
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy, // For access tokens
    JwtRefreshStrategy, // For refresh tokens
  ],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
