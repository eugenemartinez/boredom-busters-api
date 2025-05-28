import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common'; // Added Logger, ValidationPipe
import { ConfigService } from '@nestjs/config'; // Added ConfigService
import { SwaggerModule, DocumentBuilder, SwaggerCustomOptions } from '@nestjs/swagger'; // Added Swagger

// This will hold the initialized NestJS application instance (via its Express adapter)
let expressApp: express.Express | undefined;
let isNestAppReady = false;

// This function creates and initializes the NestJS application for Vercel.
async function bootstrapNestAppForVercel(): Promise<express.Express> {
  const newExpressApp = express(); // Create a new Express app instance
  const nestAppInstance: INestApplication = await NestFactory.create(
    AppModule,
    new ExpressAdapter(newExpressApp), // Use the Express adapter
    { logger: ['error', 'warn', 'log', 'debug', 'verbose'] } // Ensure logs are captured
  );

  const configService = nestAppInstance.get(ConfigService); // Get ConfigService

  // --- APPLY GLOBAL PREFIX FROM ENVIRONMENT ---
  const apiPrefix = configService.get<string>('API_PREFIX', ''); // Default to empty if not set
  if (apiPrefix) {
    nestAppInstance.setGlobalPrefix(apiPrefix);
    Logger.log(`Vercel: Global API prefix set to: ${apiPrefix}`, 'VercelBootstrap');
  } else {
    Logger.log(`Vercel: No API_PREFIX found or it's empty. No global prefix set.`, 'VercelBootstrap');
  }
  // --- END APPLY GLOBAL PREFIX ---

  // Apply global pipes (mirroring main.ts for consistency)
  nestAppInstance.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Apply CORS (mirroring main.ts for consistency)
  const corsAllowedOrigins = configService.get<string>('CORS_ALLOWED_ORIGINS');
  if (corsAllowedOrigins === '*') {
    nestAppInstance.enableCors();
    Logger.log('Vercel: CORS enabled for all origins (*)', 'VercelBootstrap');
  } else if (corsAllowedOrigins) {
    nestAppInstance.enableCors({
      origin: corsAllowedOrigins.split(','),
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    });
    Logger.log(
      `Vercel: CORS enabled for specific origins: ${corsAllowedOrigins}`,
      'VercelBootstrap',
    );
  } else {
     nestAppInstance.enableCors({ origin: false }); // Restrictive default
    Logger.log(
      'Vercel: CORS_ALLOWED_ORIGINS not set. CORS is highly restricted.',
      'VercelBootstrap',
    );
  }

  // Optional: Setup Swagger for Vercel if needed, but ensure paths are correct
  // Be mindful that `app.listen` is not called here. Swagger setup might need adjustments
  // if it relies on the server being fully "listened".
  // For Vercel, often Swagger is disabled or handled differently.
  // If you enable it, ensure the swaggerPath correctly considers the apiPrefix.
  if (configService.get<string>('NODE_ENV') !== 'test') { // Avoid Swagger in tests
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Boredom Busters API (Vercel)')
      .setDescription('API for discovering and managing fun activities - Vercel Instance.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(nestAppInstance, swaggerConfig);
    const customOptions: SwaggerCustomOptions = {
      customSiteTitle: 'Boredom Busters API Docs (Vercel)',
      customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css',
      customJs: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.js',
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-standalone-preset.js',
      ],
      swaggerOptions: { persistAuthorization: true, docExpansion: 'list', filter: true, showRequestDuration: true },
    };

    // Construct the full path for Swagger, including the apiPrefix
    const swaggerPathSegment = 'docs';
    const fullSwaggerPathForVercel = apiPrefix ? `${apiPrefix}/${swaggerPathSegment}` : `/${swaggerPathSegment}`;
    // Ensure the path doesn't start with multiple slashes if apiPrefix is empty
    const normalizedFullSwaggerPath = fullSwaggerPathForVercel.replace(/^\/+/, '/');


    SwaggerModule.setup(normalizedFullSwaggerPath, nestAppInstance, document, customOptions);
    Logger.log(`Vercel: Swagger UI available at ${normalizedFullSwaggerPath}`, 'VercelBootstrap');
    // Also log the JSON spec URL
    Logger.log(`Vercel: OpenAPI (JSON) spec available at ${normalizedFullSwaggerPath}-json`, 'VercelBootstrap');
  }


  await nestAppInstance.init(); // Initialize the NestJS application
  return newExpressApp; // Return the configured Express app
}

async function ensureNestAppIsReady() {
  if (!isNestAppReady || !expressApp) {
    console.log('NestJS application is not ready. Bootstrapping for Vercel...');
    try {
      expressApp = await bootstrapNestAppForVercel();
      isNestAppReady = true;
      console.log('NestJS application bootstrapped and ready for Vercel.');
    } catch (error) {
      console.error(
        'Failed to bootstrap NestJS application for Vercel:',
        error,
      );
      isNestAppReady = false; 
      expressApp = undefined;
      throw error; 
    }
  }
}

// Vercel Serverless Function Handler
export default async (req: express.Request, res: express.Response) => {
  try {
    await ensureNestAppIsReady();

    if (expressApp) {
      expressApp(req, res); 
    } else {
      
      console.error(
        'NestJS Express app instance is not available in Vercel handler after bootstrap attempt.',
      );
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal ServerError: Application not initialized.');
    }
  } catch (error) {
    
    console.error('Error in Vercel handler for NestJS:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error: Handler failed.');
  }
};
