import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ActivitiesModule } from './activities/activities.module.js';
import { User } from './users/entities/user.entity.js';
import { Activity } from './activities/entities/activity.entity.js';
import { ThrottlerModule, ThrottlerGuard, seconds } from '@nestjs/throttler'; // Import seconds helper
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { APP_GUARD } from '@nestjs/core';
import { Redis as IORedis } from 'ioredis';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`, // Loads .env.test if NODE_ENV=test
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL');
        if (!databaseUrl) {
          console.error(
            'FATAL ERROR: DATABASE_URL is not defined. Application cannot start.',
          );
          throw new Error('DATABASE_URL is not defined.');
        }
        return {
          type: 'postgres',
          url: databaseUrl,
          synchronize:
            configService.get<string>('TYPEORM_SYNCHRONIZE') === 'true',
          logging: configService.get<string>('TYPEORM_LOGGING') === 'true',
          autoLoadEntities: true,
          ssl:
            configService.get<string>('NODE_ENV') === 'production'
              ? { rejectUnauthorized: false }
              : false,
          entityPrefix: 'boredombusters_',
          entities: [User, Activity],
        };
      },
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const ttlFromEnvInSeconds = configService.get<number>(
          'THROTTLE_TTL_SECONDS',
          60,
        );
        const limitFromEnv = configService.get<number>(
          'THROTTLE_LIMIT_REQUESTS',
          20,
        );
        const redisUrl = configService.get<string>('REDIS_URL');

        const throttlerConfigs = [
          {
            name: 'default',
            ttl: seconds(ttlFromEnvInSeconds), // Crucial: convert seconds to milliseconds
            limit: limitFromEnv,
          },
        ];

        if (!redisUrl) {
          console.warn(
            'REDIS_URL not found, Throttler falling back to in-memory storage.',
          );
          return {
            // In-memory configuration (no storage property)
            throttlers: throttlerConfigs,
          };
        }

        console.log(
          `Throttler Initialized with Redis - TTL: ${ttlFromEnvInSeconds}s, Limit: ${limitFromEnv}`,
        );
        return {
          // Redis configuration
          throttlers: throttlerConfigs,
          storage: new ThrottlerStorageRedisService(
            new IORedis(redisUrl, {
              // Pass the IORedis instance
              maxRetriesPerRequest: null, // Recommended for serverless/persistent connections
              // Add other ioredis options if needed
            }),
          ),
        };
      },
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/',
      exclude: ['/api/(.*)'],
    }),
    UsersModule,
    AuthModule,
    ActivitiesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
