import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ConfigService } from '@nestjs/config';
import { Server } from 'http';

describe('HealthController (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let moduleFixture: TestingModule;

  beforeAll(async () => {
    // Ensure REDIS_URL is not set in the environment for this test run
    // (e.g., via .env.test or by unsetting it if globally set for tests)
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const configService = app.get(ConfigService);
    const apiPrefix = configService.get<string>('API_PREFIX', '/api');
    app.setGlobalPrefix(apiPrefix);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (moduleFixture) {
      await moduleFixture.close();
    }
  });

  it('GET /ping should return pong', () => {
    const apiPrefix = app.get(ConfigService).get<string>('API_PREFIX', '/api');
    const path = `${apiPrefix}/ping`;
    return request(httpServer).get(path).expect(200).expect('pong');
  });
});
