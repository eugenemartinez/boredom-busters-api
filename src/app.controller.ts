import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service.js';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'; // Import Swagger decorators

@ApiTags('Application Health & Info') // Updated tag
@Controller() // This will be the root relative to your global API_PREFIX
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get() // Handles requests to the base path (e.g., /api if global prefix is /api)
  @ApiOperation({
    summary: 'API Root Information',
    description: 'Provides basic information about the API and links to main resource categories.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'API information and available resource categories.',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Welcome to the Boredom Busters API. Please use specific endpoints.',
            },
            available_resources: {
              type: 'array',
              items: { type: 'string' },
              example: [
                '/api/auth',
                '/api/users',
                '/api/activities',
                '/api/ping',
              ],
            },
            swagger_docs: {
              type: 'string',
              example: '/api' // Or your specific Swagger UI path
            }
          },
        },
      },
    },
  })
  getApiInfo() {
    // Assuming your PUBLIC_URL is set in .env and accessible, e.g., http://localhost:3000
    // And API_PREFIX is /api
    // You might need to inject ConfigService to get these dynamically
    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:3000'; // Fallback
    const apiPrefix = process.env.API_PREFIX || '/api'; // Fallback

    return {
      message: 'Welcome to the Boredom Busters API. Please use specific endpoints.',
      available_resources: [
        `${baseUrl}${apiPrefix}/auth/register`,
        `${baseUrl}${apiPrefix}/auth/login`,
        `${baseUrl}${apiPrefix}/users/me`, // More specific for current user context
        `${baseUrl}${apiPrefix}/activities`,
        `${baseUrl}${apiPrefix}/ping`,
      ],
      swagger_docs: `${baseUrl}${apiPrefix}/docs` // Path to Swagger UI
    };
  }

  @Get('ping')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check API Health', description: 'Responds with "pong" if the API is operational.' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'API is healthy and responsive.',
    content: {
      'text/plain': {
        schema: {
          type: 'string',
          example: 'pong',
        },
      },
    },
  })
  getPong(): string {
    return 'pong';
  }
}
