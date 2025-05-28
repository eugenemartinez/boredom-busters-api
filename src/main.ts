import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder, SwaggerCustomOptions } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  const apiPrefix = configService.get<string>('API_PREFIX', '/api');
  app.setGlobalPrefix(apiPrefix);
  Logger.log(`Global API prefix set to: ${apiPrefix}`, 'Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const corsAllowedOrigins = configService.get<string>('CORS_ALLOWED_ORIGINS');
  if (corsAllowedOrigins === '*') {
    app.enableCors();
     Logger.log('CORS enabled for all origins (*)', 'Bootstrap');
  } else if (corsAllowedOrigins) {
    app.enableCors({
      origin: corsAllowedOrigins.split(','),
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    });
    Logger.log(
      `CORS enabled for specific origins: ${corsAllowedOrigins}`,
      'Bootstrap',
    );
  } else {
    app.enableCors({
        origin: false,
    });
    Logger.log(
      'CORS_ALLOWED_ORIGINS not set. CORS is highly restricted or disabled by default.',
      'Bootstrap',
    );
  }

  // Swagger (OpenAPI) Setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Boredom Busters API')
    .setDescription('API for discovering and managing fun activities to bust boredom.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  const customOptions: SwaggerCustomOptions = {
    customSiteTitle: 'Boredom Busters API Docs',
    customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-standalone-preset.js',
    ],
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
  };

  const swaggerPath = `${apiPrefix}/docs`;
  SwaggerModule.setup(swaggerPath, app, document, customOptions);

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port);

  const nodeEnv = configService.get<string>('NODE_ENV');
  const publicUrl = configService.get<string>('PUBLIC_URL');

  let appUrl = `http://localhost:${port}${apiPrefix}`;
  let swaggerUiUrl = `http://localhost:${port}${swaggerPath}`;

  if (nodeEnv === 'production' && publicUrl) {
    appUrl = `${publicUrl}${apiPrefix}`;
    swaggerUiUrl = `${publicUrl}${swaggerPath}`;
  } else if (publicUrl && nodeEnv !== 'test') { 
    // If PUBLIC_URL is set and not in test (e.g. a staging env or local with ngrok)
    // You might want to use PUBLIC_URL if available and not strictly 'production'
    // This part is optional and depends on your workflow
    appUrl = `${publicUrl}${apiPrefix}`;
    swaggerUiUrl = `${publicUrl}${swaggerPath}`;
  }


  Logger.log(
    `🚀 Application is running on: ${appUrl}`,
    'Bootstrap',
  );
  Logger.log(
    `📄 Swagger UI available at: ${swaggerUiUrl}`,
    'Bootstrap',
  );
  // Also log the JSON spec URL, which is useful for Postman import
  Logger.log(
    `📄 OpenAPI (JSON) spec available at: ${swaggerUiUrl}-json`,
    'Bootstrap',
  );
}

bootstrap().catch((err) => {
  Logger.error('Failed to bootstrap the application', err, 'Bootstrap');
  process.exit(1);
});
