import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ConfigService } from '@nestjs/config';
import { Server } from 'http';
import { PaginatedResponse } from '../src/common/interfaces/paginated-response.interface.js';
import {
  LoginResponse,
  CreateActivityPayload,
  ActivityResponse,
} from './common/interfaces/api.interfaces.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Activity } from '../src/activities/entities/activity.entity.js';
import { User } from '../src/users/entities/user.entity.js';
import { Repository } from 'typeorm';

interface ValidationErrorResponse {
  statusCode: number;
  message: string[]; // ValidationPipe typically returns an array of error messages
  error: string;
}

describe('ActivitiesController (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let apiPrefix: string;
  let activityRepository: Repository<Activity>;
  let userRepository: Repository<User>;

  async function setupUserAndLogin(
    credentials: { email?: string; password?: string; username?: string } = {},
  ): Promise<LoginResponse> {
    const uniqueSuffix =
      Date.now() + Math.random().toString(36).substring(2, 7);
    const defaultEmail = `activity-test-user-${uniqueSuffix}@example.com`;
    const defaultPassword = 'Password123!';
    const defaultUsername = `activity_test_user_${uniqueSuffix}`;

    const registerPayload = {
      email: credentials.email || defaultEmail,
      password: credentials.password || defaultPassword,
      username: credentials.username || defaultUsername,
    };

    await request(httpServer)
      .post(`${apiPrefix}/auth/register`)
      .send(registerPayload)
      .expect(HttpStatus.CREATED);

    const loginRes = await request(httpServer)
      .post(`${apiPrefix}/auth/login`)
      .send({
        email: registerPayload.email,
        password: registerPayload.password,
      })
      .expect(HttpStatus.OK);
    return loginRes.body as LoginResponse;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    const configService = app.get(ConfigService);
    apiPrefix = configService.get<string>('API_PREFIX', '/api');
    app.setGlobalPrefix(apiPrefix);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();
    httpServer = app.getHttpServer() as Server;

    activityRepository = moduleFixture.get<Repository<Activity>>(
      getRepositoryToken(Activity),
    );
    userRepository = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    );

    try {
      // CORRECTED table names based on psql \dt output and entity definitions
      const activityTableName = 'boredombusters_activities'; // PLURAL
      const userTableName = 'boredombusters_users'; // PLURAL

      console.log(`Attempting to truncate "${activityTableName}" table...`);
      await activityRepository.query(
        `TRUNCATE TABLE "${activityTableName}" RESTART IDENTITY CASCADE;`,
      );
      console.log(`"${activityTableName}" table truncated.`);

      console.log(`Attempting to truncate "${userTableName}" table...`);
      await userRepository.query(
        `TRUNCATE TABLE "${userTableName}" RESTART IDENTITY CASCADE;`,
      );
      console.log(`"${userTableName}" table truncated.`);

      console.log(
        `INFO: Tables "${activityTableName}" and "${userTableName}" truncated successfully.`,
      );
    } catch (error) {
      console.error(
        'ERROR: Failed to truncate tables. Please double-check prefixed table names and DB permissions.',
      );
      console.error('Detailed error:', error);
      throw error;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /activities (Public Listing)', () => {
    const totalActivitiesToCreate = 12;
    let createdActivitiesForPagination: ActivityResponse[] = [];
    let paginationTestUser: LoginResponse; // Ensure this is declared if used, or remove if not needed for these specific tests

    beforeAll(async () => {
      // This setup creates 12 activities with types:
      // 4 of 'page_type_a', 4 of 'page_type_b', 4 of 'page_type_c'
      paginationTestUser = await setupUserAndLogin({
        username: 'pagination_tester_types',
      }); // Use a distinct user if needed
      const accessToken = paginationTestUser.accessToken;

      createdActivitiesForPagination = [];
      for (let i = 1; i <= totalActivitiesToCreate; i++) {
        const payload: CreateActivityPayload = {
          title: `Paginated Activity ${i} for Type/Sort`,
          description: `Description for paginated activity ${i}.`,
          type: `page_type_${i % 3 === 0 ? 'c' : i % 2 === 0 ? 'b' : 'a'}`,
        };
        const res = await request(httpServer)
          .post(`${apiPrefix}/activities`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send(payload)
          .expect(HttpStatus.CREATED);
        createdActivitiesForPagination.push(res.body as ActivityResponse);
      }
      // Sort by creation order for consistent expectation if needed, though findAll default is created_at DESC
      // For these filter tests, the order of createdActivitiesForPagination isn't strictly used for direct comparison of full array.
      createdActivitiesForPagination.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    });

    it('should return a list of activities (200 OK) if some exist', async () => {
      return request(httpServer)
        .get(`${apiPrefix}/activities`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>;
          expect(paginatedResponse.data).toBeInstanceOf(Array);
          const expectedDefaultLimit = 10; // Assuming default limit is 10 from ActivityQueryDto
          const expectedDataLength = Math.min(
            totalActivitiesToCreate,
            expectedDefaultLimit,
          );

          expect(paginatedResponse.data.length).toEqual(expectedDataLength);

          expect(paginatedResponse.meta.totalItems).toEqual(
            totalActivitiesToCreate,
          );
        });
    });

    it('should return a list of activities (200 OK) - default pagination', async () => {
      return request(httpServer)
        .get(`${apiPrefix}/activities`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>;
          const expectedCount = Math.min(totalActivitiesToCreate, 10); // Default limit is 10
          expect(paginatedResponse.data.length).toEqual(expectedCount);
          expect(paginatedResponse.meta.itemCount).toEqual(expectedCount);
          expect(paginatedResponse.meta.totalItems).toEqual(
            totalActivitiesToCreate,
          );
          expect(paginatedResponse.meta.itemsPerPage).toEqual(10);
          expect(paginatedResponse.meta.currentPage).toEqual(1);
          for (let i = 0; i < expectedCount; i++) {
            expect(paginatedResponse.data[i].id).toEqual(
              createdActivitiesForPagination[i].id,
            );
          }
        });
    });

    it('should return paginated activities with ?page=1&limit=5', async () => {
      const page = 1;
      const limit = 5;
      return request(httpServer)
        .get(`${apiPrefix}/activities?page=${page}&limit=${limit}`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>;
          expect(paginatedResponse.data.length).toEqual(limit);
          expect(paginatedResponse.meta.itemCount).toEqual(limit);
          expect(paginatedResponse.meta.totalItems).toEqual(
            totalActivitiesToCreate,
          );
          expect(paginatedResponse.meta.itemsPerPage).toEqual(limit);
          expect(paginatedResponse.meta.currentPage).toEqual(page);
          for (let i = 0; i < limit; i++) {
            expect(paginatedResponse.data[i].id).toEqual(
              createdActivitiesForPagination[i].id,
            );
          }
        });
    });

    it('should return paginated activities with ?page=2&limit=3', async () => {
      const page = 2;
      const limit = 3;
      const offset = (page - 1) * limit;
      return request(httpServer)
        .get(`${apiPrefix}/activities?page=${page}&limit=${limit}`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>;
          expect(paginatedResponse.data.length).toEqual(limit);
          expect(paginatedResponse.meta.itemCount).toEqual(limit);
          expect(paginatedResponse.meta.totalItems).toEqual(
            totalActivitiesToCreate,
          );
          expect(paginatedResponse.meta.itemsPerPage).toEqual(limit);
          expect(paginatedResponse.meta.currentPage).toEqual(page);
          for (let i = 0; i < limit; i++) {
            expect(paginatedResponse.data[i].id).toEqual(
              createdActivitiesForPagination[offset + i].id,
            );
          }
        });
    });

    it('should return remaining activities on the last page', async () => {
      const limit = 5;
      const totalPages = Math.ceil(totalActivitiesToCreate / limit);
      const page = totalPages;
      const expectedItemCountOnLastPage =
        totalActivitiesToCreate - (totalPages - 1) * limit;
      const offset = (page - 1) * limit;

      return request(httpServer)
        .get(`${apiPrefix}/activities?page=${page}&limit=${limit}`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>;
          expect(paginatedResponse.data.length).toEqual(
            expectedItemCountOnLastPage,
          );
          expect(paginatedResponse.meta.itemCount).toEqual(
            expectedItemCountOnLastPage,
          );
          expect(paginatedResponse.meta.totalItems).toEqual(
            totalActivitiesToCreate,
          );
          expect(paginatedResponse.meta.itemsPerPage).toEqual(limit);
          expect(paginatedResponse.meta.currentPage).toEqual(page);
          for (let i = 0; i < expectedItemCountOnLastPage; i++) {
            expect(paginatedResponse.data[i].id).toEqual(
              createdActivitiesForPagination[offset + i].id,
            );
          }
        });
    });

    it('should return an empty data array if page is out of bounds', async () => {
      const limit = 5;
      const page = Math.ceil(totalActivitiesToCreate / limit) + 1;

      return request(httpServer)
        .get(`${apiPrefix}/activities?page=${page}&limit=${limit}`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>;
          expect(paginatedResponse.data.length).toEqual(0);
          expect(paginatedResponse.meta.itemCount).toEqual(0);
          expect(paginatedResponse.meta.totalItems).toEqual(
            totalActivitiesToCreate,
          );
          expect(paginatedResponse.meta.itemsPerPage).toEqual(limit);
          expect(paginatedResponse.meta.currentPage).toEqual(page);
        });
    });

    it('should return 400 Bad Request if limit exceeds maximum allowed (e.g., 100)', async () => {
      const requestedLimit = 200; // Assuming max allowed is 100 as per ActivityQueryDto
      return request(httpServer)
        .get(`${apiPrefix}/activities?limit=${requestedLimit}`)
        .expect(HttpStatus.BAD_REQUEST)
        .then((response) => {
          // Type the response.body using the defined interface
          const errorResponse = response.body as ValidationErrorResponse;

          expect(errorResponse).toBeDefined();
          expect(errorResponse.statusCode).toEqual(HttpStatus.BAD_REQUEST);
          expect(errorResponse.message).toBeInstanceOf(Array);
          expect(errorResponse.message).toEqual(
            expect.arrayContaining([
              // The exact message comes from class-validator's default message for @Max
              // or any custom message you provided in the DTO.
              // For @Max(100), a common default message is "limit must not be greater than 100"
              expect.stringMatching(/limit must not be greater than 100/i),
            ]),
          );
          expect(errorResponse.error).toEqual('Bad Request');
        });
    });

    it('should filter activities by a valid type (e.g., page_type_a)', async () => {
      const filterType = 'page_type_a';
      const expectedCountForTypeA = createdActivitiesForPagination.filter(
        (act) => act.type === filterType,
      ).length;
      // Since totalActivitiesToCreate is 12, and types are distributed, expectedCountForTypeA should be 4.

      return request(httpServer)
        .get(`${apiPrefix}/activities?type=${filterType}`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>;
          expect(paginatedResponse.data.length).toBeGreaterThanOrEqual(1); // Should find at least one
          expect(paginatedResponse.data.length).toEqual(expectedCountForTypeA);
          expect(paginatedResponse.meta.totalItems).toEqual(
            expectedCountForTypeA,
          );
          expect(paginatedResponse.meta.itemCount).toEqual(
            expectedCountForTypeA,
          );
          paginatedResponse.data.forEach((activity) => {
            // Because of ILIKE, we should check if the activity.type contains the filterType.
            // However, since our created types are exact, we can check for equality.
            expect(activity.type).toEqual(filterType);
          });
        });
    });

    it('should return an empty list when filtering by a non-existent type', async () => {
      const filterType = 'type_that_does_not_exist_xyz123';
      return request(httpServer)
        .get(`${apiPrefix}/activities?type=${filterType}`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>;
          expect(paginatedResponse.data.length).toEqual(0);
          expect(paginatedResponse.meta.totalItems).toEqual(0);
          expect(paginatedResponse.meta.itemCount).toEqual(0);
        });
    });

    it('should return activities sorted by created_at DESC by default', async () => {
      // The createdActivitiesForPagination array is already sorted by created_at DESC in beforeAll
      // Default limit is 10
      const expectedDefaultLimit = 10;
      const expectedActivities = createdActivitiesForPagination.slice(
        0,
        expectedDefaultLimit,
      );

      return request(httpServer)
        .get(`${apiPrefix}/activities`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>;
          expect(paginatedResponse.data.length).toEqual(expectedDefaultLimit);
          expect(paginatedResponse.meta.totalItems).toEqual(
            totalActivitiesToCreate,
          );
          for (let i = 0; i < expectedDefaultLimit; i++) {
            expect(paginatedResponse.data[i].id).toEqual(
              expectedActivities[i].id,
            );
            if (i > 0) {
              expect(
                new Date(paginatedResponse.data[i].created_at).getTime(),
              ).toBeLessThanOrEqual(
                new Date(paginatedResponse.data[i - 1].created_at).getTime(),
              );
            }
          }
        });
    });

    it('should return activities sorted by created_at ASC', async () => {
      const expectedDefaultLimit = 10;
      const expectedActivities = [...createdActivitiesForPagination] // Create a shallow copy
        .reverse() // Reverse to get created_at ASC
        .slice(0, expectedDefaultLimit);

      return request(httpServer)
        .get(`${apiPrefix}/activities?sortBy=created_at&sortOrder=ASC`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>;
          expect(paginatedResponse.data.length).toEqual(expectedDefaultLimit);
          expect(paginatedResponse.meta.totalItems).toEqual(
            totalActivitiesToCreate,
          );
          for (let i = 0; i < expectedDefaultLimit; i++) {
            expect(paginatedResponse.data[i].id).toEqual(
              expectedActivities[i].id,
            );
            if (i > 0) {
              expect(
                new Date(paginatedResponse.data[i].created_at).getTime(),
              ).toBeGreaterThanOrEqual(
                new Date(paginatedResponse.data[i - 1].created_at).getTime(),
              );
            }
          }
        });
    });

    it('should return activities sorted by title ASC', async () => {
      const expectedDefaultLimit = 10;
      // Titles are "Paginated Activity 1 for Type/Sort", "Paginated Activity 2 for Type/Sort", ...
      // Lexicographical sort will be: "Paginated Activity 1", "Paginated Activity 10", "Paginated Activity 11", "Paginated Activity 12", "Paginated Activity 2", ...
      const expectedActivities = [...createdActivitiesForPagination]
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, expectedDefaultLimit);

      return request(httpServer)
        .get(`${apiPrefix}/activities?sortBy=title&sortOrder=ASC`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>;
          expect(paginatedResponse.data.length).toEqual(expectedDefaultLimit);
          expect(paginatedResponse.meta.totalItems).toEqual(
            totalActivitiesToCreate,
          );
          for (let i = 0; i < expectedDefaultLimit; i++) {
            expect(paginatedResponse.data[i].id).toEqual(
              expectedActivities[i].id,
            );
            if (i > 0) {
              expect(
                paginatedResponse.data[i].title.localeCompare(
                  paginatedResponse.data[i - 1].title,
                ),
              ).toBeGreaterThanOrEqual(0);
            }
          }
        });
    });

    it('should return activities sorted by title DESC', async () => {
      const expectedDefaultLimit = 10;
      const expectedActivities = [...createdActivitiesForPagination]
        .sort((a, b) => b.title.localeCompare(a.title))
        .slice(0, expectedDefaultLimit);

      return request(httpServer)
        .get(`${apiPrefix}/activities?sortBy=title&sortOrder=DESC`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>;
          expect(paginatedResponse.data.length).toEqual(expectedDefaultLimit);
          expect(paginatedResponse.meta.totalItems).toEqual(
            totalActivitiesToCreate,
          );
          for (let i = 0; i < expectedDefaultLimit; i++) {
            expect(paginatedResponse.data[i].id).toEqual(
              expectedActivities[i].id,
            );
            if (i > 0) {
              expect(
                paginatedResponse.data[i - 1].title.localeCompare(
                  paginatedResponse.data[i].title,
                ),
              ).toBeGreaterThanOrEqual(0);
            }
          }
        });
    });

    it('should filter by type and sort by title ASC', async () => {
      const filterType = 'page_type_a';
      // Get all activities of 'page_type_a' and sort them by title ASC
      const expectedActivities = createdActivitiesForPagination
        .filter((activity) => activity.type === filterType)
        .sort((a, b) => a.title.localeCompare(b.title));

      const expectedCountForTypeA = expectedActivities.length; // Should be 4

      return request(httpServer)
        .get(
          `${apiPrefix}/activities?type=${filterType}&sortBy=title&sortOrder=ASC`,
        )
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>;
          // Since we are filtering by type, the number of items returned should match the count of that type
          expect(paginatedResponse.data.length).toEqual(expectedCountForTypeA);
          expect(paginatedResponse.meta.totalItems).toEqual(
            expectedCountForTypeA,
          );
          expect(paginatedResponse.meta.itemCount).toEqual(
            expectedCountForTypeA,
          );
          // The default limit is 10, but itemCount should reflect the actual number of items matching the filter
          // meta.itemsPerPage might still be 10 (the requested/default limit) or adjusted by pagination logic.
          // Let's check if it's at least the number of items found, or the default if more items were possible.
          expect(paginatedResponse.meta.itemsPerPage).toEqual(10); // Default limit

          for (let i = 0; i < expectedCountForTypeA; i++) {
            expect(paginatedResponse.data[i].id).toEqual(
              expectedActivities[i].id,
            );
            expect(paginatedResponse.data[i].type).toEqual(filterType);
            if (i > 0) {
              expect(
                paginatedResponse.data[i].title.localeCompare(
                  paginatedResponse.data[i - 1].title,
                ),
              ).toBeGreaterThanOrEqual(0);
            }
          }
        });
    });

    it('should return 400 Bad Request for invalid sortBy field', async () => {
      return request(httpServer)
        .get(`${apiPrefix}/activities?sortBy=invalid_field`)
        .expect(HttpStatus.BAD_REQUEST)
        .then((response) => {
          const errorResponse = response.body as ValidationErrorResponse;
          expect(errorResponse.statusCode).toEqual(HttpStatus.BAD_REQUEST);
          expect(errorResponse.message).toBeInstanceOf(Array);
          expect(errorResponse.message).toEqual(
            expect.arrayContaining([
              // Match the custom message from ActivityQueryDto
              expect.stringMatching(/^Invalid sortBy value\.$/i),
            ]),
          );
        });
    });

    it('should return 400 Bad Request for invalid sortOrder value', async () => {
      return request(httpServer)
        .get(`${apiPrefix}/activities?sortOrder=invalid_order`)
        .expect(HttpStatus.BAD_REQUEST)
        .then((response) => {
          const errorResponse = response.body as ValidationErrorResponse;
          expect(errorResponse.statusCode).toEqual(HttpStatus.BAD_REQUEST);
          expect(errorResponse.message).toBeInstanceOf(Array);
          expect(errorResponse.message).toEqual(
            expect.arrayContaining([
              // Match the custom message from ActivityQueryDto
              expect.stringMatching(/^Invalid sortOrder value\.$/i),
            ]),
          );
        });
    });

    it('should return 400 Bad Request for non-numeric page value', async () => {
      return request(httpServer)
        .get(`${apiPrefix}/activities?page=abc`)
        .expect(HttpStatus.BAD_REQUEST)
        .then((response) => {
          const errorResponse = response.body as ValidationErrorResponse;
          expect(errorResponse.statusCode).toEqual(HttpStatus.BAD_REQUEST);
          expect(errorResponse.message).toBeInstanceOf(Array);
          // Message for @IsInt() or @IsNumberString()
          expect(errorResponse.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/page must be an integer number/i), // Or similar
            ]),
          );
        });
    });

    it('should return 400 Bad Request for non-numeric limit value', async () => {
      return request(httpServer)
        .get(`${apiPrefix}/activities?limit=xyz`)
        .expect(HttpStatus.BAD_REQUEST)
        .then((response) => {
          const errorResponse = response.body as ValidationErrorResponse;
          expect(errorResponse.statusCode).toEqual(HttpStatus.BAD_REQUEST);
          expect(errorResponse.message).toBeInstanceOf(Array);
          // Message for @IsInt() or @IsNumberString()
          expect(errorResponse.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/limit must be an integer number/i), // Or similar
            ]),
          );
        });
    });
  });

  describe('GET /activities/:id (Public Single Activity)', () => {
    let createdActivity: ActivityResponse;
    let ownerAccessToken: string;

    beforeAll(async () => {
      // Setup a user and create an activity to be fetched
      const loginResponse = await setupUserAndLogin({
        username: 'activity_owner_single_get',
      });
      ownerAccessToken = loginResponse.accessToken;

      const payload: CreateActivityPayload = {
        title: 'Test Activity for Single Get',
        description: 'A detailed description for this test activity.',
        type: 'get_single_test',
        cost_level: 'low',
        participants_min: 1,
        participants_max: 5,
        duration_min: 60,
      };
      const response = await request(httpServer)
        .post(`${apiPrefix}/activities`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);
      createdActivity = response.body as ActivityResponse;
    });

    it('should return a single activity if found (200 OK)', async () => {
      return request(httpServer)
        .get(`${apiPrefix}/activities/${createdActivity.id}`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const activity = response.body as ActivityResponse;
          expect(activity).toBeDefined();
          expect(activity.id).toEqual(createdActivity.id);
          expect(activity.title).toEqual(createdActivity.title);
          expect(activity.description).toEqual(createdActivity.description);
          expect(activity.type).toEqual(createdActivity.type);
          expect(activity.user_id).toBeDefined(); // Public endpoint, user_id is fine
          expect(activity.contributor_name).toBeDefined();
        });
    });

    it('should return 404 Not Found if activity ID does not exist', async () => {
      const nonExistentUuid = '00000000-0000-0000-0000-000000000000';
      return request(httpServer)
        .get(`${apiPrefix}/activities/${nonExistentUuid}`)
        .expect(HttpStatus.NOT_FOUND)
        .then((response) => {
          // Adjusting for the actual error response structure for this specific case
          const errorResponse = response.body as {
            statusCode: number;
            message: string;
            error: string;
          };
          expect(errorResponse.statusCode).toEqual(HttpStatus.NOT_FOUND);
          // Corrected expected message to include the period
          expect(errorResponse.message).toEqual(
            `Activity with ID ${nonExistentUuid} not found.`,
          );
          expect(errorResponse.error).toEqual('Not Found');
        });
    });

    it('should return 400 Bad Request for an invalid UUID format for activityId', async () => {
      const invalidUuid = 'this-is-not-a-uuid';
      return request(httpServer)
        .get(`${apiPrefix}/activities/${invalidUuid}`)
        .expect(HttpStatus.BAD_REQUEST)
        .then((response) => {
          // For ParseUUIDPipe, the message might be a direct string, not an array.
          // Let's define a more specific interface or adjust the assertion.
          const errorResponse = response.body as {
            statusCode: number;
            message: string | string[];
            error: string;
          };

          expect(errorResponse.statusCode).toEqual(HttpStatus.BAD_REQUEST);

          // Check if message is a string (common for ParseUUIDPipe) or an array
          if (typeof errorResponse.message === 'string') {
            // Corrected expectation for a single string message
            expect(errorResponse.message).toMatch(
              /Validation failed \(uuid .*is expected\)/i,
            );
          } else {
            // If it can sometimes be an array (less common for ParseUUIDPipe alone)
            expect(errorResponse.message).toBeInstanceOf(Array);
            expect(errorResponse.message).toEqual(
              expect.arrayContaining([
                expect.stringMatching(
                  /Validation failed \(uuid .*is expected\)/i,
                ),
              ]),
            );
          }
          expect(errorResponse.error).toEqual('Bad Request');
        });
    });
  });

  describe('GET /activities/random (Public Random Activity)', () => {
    const randomTestUserCredentials = { username: 'random_activity_creator' };
    let randomTestUser: LoginResponse;
    const activityTypeForRandom = 'random_test_type';
    const anotherActivityType = 'another_random_type';
    const totalActivitiesForRandomTest = 3; // Create a few activities of the specific type

    beforeAll(async () => {
      randomTestUser = await setupUserAndLogin(randomTestUserCredentials);
      const accessToken = randomTestUser.accessToken;

      // Create some activities, some with a specific type for filtering
      for (let i = 0; i < totalActivitiesForRandomTest; i++) {
        await request(httpServer)
          .post(`${apiPrefix}/activities`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            title: `Random Test Activity ${i + 1}`,
            description: `Desc for random ${i + 1}`,
            type: activityTypeForRandom,
          } as CreateActivityPayload)
          .expect(HttpStatus.CREATED);
      }
      // Create one activity of a different type
      await request(httpServer)
        .post(`${apiPrefix}/activities`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: `Another Type Activity`,
          description: `Desc for another type`,
          type: anotherActivityType,
        } as CreateActivityPayload)
        .expect(HttpStatus.CREATED);
    });

    it('should return a random activity (200 OK) when activities exist', async () => {
      return request(httpServer)
        .get(`${apiPrefix}/activities/random`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const activity = response.body as ActivityResponse;
          expect(activity).toBeDefined();
          expect(activity.id).toBeDefined();
          expect(activity.title).toBeDefined();
          // Further checks can be added if needed, e.g., that it's one of the created ones
        });
    });

    it('should return a random activity of a specific type if ?type filter is applied (200 OK)', async () => {
      // Make multiple requests to increase chance of seeing different activities if multiple match
      const requests = Array(5)
        .fill(null)
        .map(() =>
          request(httpServer)
            .get(`${apiPrefix}/activities/random?type=${activityTypeForRandom}`)
            .expect(HttpStatus.OK),
        );

      const responses = await Promise.all(requests);
      const returnedActivityIds = new Set<string>();

      responses.forEach((response) => {
        const activity = response.body as ActivityResponse;
        expect(activity).toBeDefined();
        expect(activity.id).toBeDefined();
        expect(activity.type).toEqual(activityTypeForRandom);
        returnedActivityIds.add(activity.id);
      });
      // If totalActivitiesForRandomTest > 1, we expect to see more than one unique ID over several requests,
      // but this is probabilistic. The core check is that the type is correct.
      // For a small number of items (3), it's reasonably likely to get different ones.
      if (totalActivitiesForRandomTest > 1) {
        expect(returnedActivityIds.size).toBeGreaterThanOrEqual(1); // At least one unique ID
        // To be more robust about randomness, one might check if IDs vary over many calls,
        // but for E2E, confirming type and existence is primary.
      }
    });

    it('should return 404 Not Found if ?type filter matches no activities', async () => {
      const nonExistentType = 'type_that_absolutely_does_not_exist_12345';
      return request(httpServer)
        .get(`${apiPrefix}/activities/random?type=${nonExistentType}`)
        .expect(HttpStatus.NOT_FOUND)
        .then((response) => {
          const errorResponse = response.body as {
            statusCode: number;
            message: string;
            error: string;
          };
          expect(errorResponse.statusCode).toEqual(HttpStatus.NOT_FOUND);
          // Corrected expected message to include the period
          expect(errorResponse.message).toEqual(
            'No activities found matching your criteria.',
          );
          expect(errorResponse.error).toEqual('Not Found');
        });
    });

    // Optional: Test that other DTO query params are validated but don't break the random logic
    it('should still return a random activity even if other valid DTO params are sent (e.g. limit, page)', async () => {
      return request(httpServer)
        .get(
          `${apiPrefix}/activities/random?limit=1&page=1&sortBy=title&sortOrder=ASC`,
        ) // Valid DTO params
        .expect(HttpStatus.OK)
        .then((response) => {
          const activity = response.body as ActivityResponse;
          expect(activity).toBeDefined();
          expect(activity.id).toBeDefined();
        });
    });

    it('should return 400 Bad Request if invalid DTO params are sent (e.g. invalid sortBy)', async () => {
      return request(httpServer)
        .get(`${apiPrefix}/activities/random?sortBy=invalidField`)
        .expect(HttpStatus.BAD_REQUEST) // ActivityQueryDto validation should still apply
        .then((response) => {
          const errorResponse = response.body as ValidationErrorResponse;
          expect(errorResponse.statusCode).toEqual(HttpStatus.BAD_REQUEST);
          expect(errorResponse.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/^Invalid sortBy value\.$/i),
            ]),
          );
        });
    });
  });

  describe('GET /activities/types (Public Distinct Activity Types)', () => {
    const typesUserCredentials = { username: 'types_creator_user_v2' }; // Changed username slightly for clarity
    let typesUser: LoginResponse;
    const distinctType1 = 'type_alpha_for_types_test';
    const distinctType2 = 'type_beta_for_types_test';
    const distinctType3 = 'type_gamma_for_types_test';

    beforeAll(async () => {
      typesUser = await setupUserAndLogin(typesUserCredentials);
      const accessToken = typesUser.accessToken;

      // Ensure activityRepository is available if used directly here
      // It should be initialized in the main beforeAll of the activities.e2e-spec.ts
      if (!activityRepository) {
        throw new Error(
          'activityRepository is not initialized. Check the main beforeAll hook.',
        );
      }
      await activityRepository.query(
        `TRUNCATE TABLE "boredombusters_activities" RESTART IDENTITY CASCADE;`,
      );

      // Create activities with descriptions that meet the minimum length
      const activitiesToCreate: CreateActivityPayload[] = [
        {
          title: 'Activity Alpha One',
          description: 'This is description for Alpha One.',
          type: distinctType1,
        },
        {
          title: 'Activity Alpha Two',
          description: 'This is description for Alpha Two.',
          type: distinctType1,
        },
        {
          title: 'Activity Beta One',
          description: 'This is description for Beta One.',
          type: distinctType2,
        },
        {
          title: 'Activity Gamma One',
          description: 'This is description for Gamma One.',
          type: distinctType3,
        },
        {
          title: 'Activity Gamma Two',
          description: 'This is description for Gamma Two.',
          type: distinctType3,
        },
      ];

      for (const payload of activitiesToCreate) {
        await request(httpServer)
          .post(`${apiPrefix}/activities`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send(payload)
          .expect(HttpStatus.CREATED); // Should now pass
      }
    });

    it('should return a list of distinct activity types (200 OK)', async () => {
      return request(httpServer)
        .get(`${apiPrefix}/activities/types`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const types = response.body as string[];
          expect(types).toBeInstanceOf(Array);
          expect(types).toEqual(
            expect.arrayContaining([
              distinctType1,
              distinctType2,
              distinctType3,
            ]),
          );
          expect(types.length).toEqual(3);
          expect(new Set(types).size).toEqual(types.length);
        });
    });

    it('should return an empty list if no activities exist (200 OK)', async () => {
      await activityRepository.query(
        `TRUNCATE TABLE "boredombusters_activities" RESTART IDENTITY CASCADE;`,
      );

      return request(httpServer)
        .get(`${apiPrefix}/activities/types`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const types = response.body as string[];
          expect(types).toBeInstanceOf(Array);
          expect(types.length).toEqual(0);
        });
    });
  });

  describe('POST /activities (Authenticated)', () => {
    let userAccessToken: string;
    let testUser: LoginResponse;

    beforeAll(async () => {
      testUser = await setupUserAndLogin({ username: 'activity_poster' });
      userAccessToken = testUser.accessToken;
    });

    it('should successfully create an activity with a valid access token and DTO (201 Created)', async () => {
      const payload: CreateActivityPayload = {
        title: 'My New Awesome Activity',
        description:
          'This is a detailed description of my new awesome activity that I am creating.',
        type: 'creative',
        cost_level: 'free', // Make sure 'free' is a valid CostLevel enum value
        participants_min: 1,
        participants_max: 1,
        duration_min: 30,
        duration_max: 60,
        // location_specific: false, // REMOVED
        // nsfw is optional and defaults to false // REMOVED - nsfw is not in DTO
      };

      return request(httpServer)
        .post(`${apiPrefix}/activities`)
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED)
        .then((response) => {
          const createdActivity = response.body as ActivityResponse;
          expect(createdActivity).toBeDefined();
          expect(createdActivity.id).toBeDefined();
          expect(createdActivity.title).toEqual(payload.title);
          expect(createdActivity.description).toEqual(payload.description);
          expect(createdActivity.type).toEqual(payload.type);
          expect(createdActivity.cost_level).toEqual(payload.cost_level);
          expect(createdActivity.participants_min).toEqual(
            payload.participants_min,
          );
          expect(createdActivity.participants_max).toEqual(
            payload.participants_max,
          );
          expect(createdActivity.duration_min).toEqual(payload.duration_min);
          expect(createdActivity.duration_max).toEqual(payload.duration_max);
          expect(createdActivity.user_id).toEqual(testUser.user.id);
          expect(createdActivity.contributor_name).toEqual(
            testUser.user.username,
          );
          expect(createdActivity.created_at).toBeDefined();
          expect(createdActivity.updated_at).toBeDefined();
        });
    });

    it('should return 400 Bad Request for DTO validation errors', async () => {
      const invalidPayload: Partial<CreateActivityPayload> = {
        title: 'T', // Too short
        description: 'Short', // Too short
        type: '', // Empty
        participants_min: 0, // Invalid, must be >= 1
        participants_max: -1, // Invalid
        duration_min: -5, // Invalid
      };

      return request(httpServer)
        .post(`${apiPrefix}/activities`)
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send(invalidPayload)
        .expect(HttpStatus.BAD_REQUEST)
        .then((response) => {
          const errorResponse = response.body as ValidationErrorResponse;
          expect(errorResponse.statusCode).toEqual(HttpStatus.BAD_REQUEST);
          expect(errorResponse.message).toBeInstanceOf(Array);
          expect(errorResponse.message.length).toBeGreaterThanOrEqual(1); // Expect multiple validation errors
          // Check for some specific error messages (adjust based on your DTO)
          expect(errorResponse.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(
                /title must be longer than or equal to 3 characters/i,
              ),
              expect.stringMatching(
                /description must be longer than or equal to 10 characters/i,
              ),
              expect.stringMatching(/type should not be empty/i),
              expect.stringMatching(
                /participants_min must not be less than 1/i,
              ),
            ]),
          );
        });
    });

    it('should return 400 Bad Request if required fields are missing', async () => {
      const incompletePayload = {
        // title is missing
        description: 'A valid description for this activity, long enough.',
        type: 'social',
      };

      return request(httpServer)
        .post(`${apiPrefix}/activities`)
        .set('Authorization', `Bearer ${userAccessToken}`)
        .send(incompletePayload)
        .expect(HttpStatus.BAD_REQUEST)
        .then((response) => {
          const errorResponse = response.body as ValidationErrorResponse;
          expect(errorResponse.statusCode).toEqual(HttpStatus.BAD_REQUEST);
          expect(errorResponse.message).toBeInstanceOf(Array);
          expect(errorResponse.message).toEqual(
            expect.arrayContaining([
              expect.stringMatching(/title should not be empty/i), // Or similar for @IsNotEmpty
              expect.stringMatching(/title must be a string/i),
            ]),
          );
        });
    });

    it('should return 401 Unauthorized if no access token is provided', async () => {
      const payload: CreateActivityPayload = {
        title: 'Activity Without Auth',
        description:
          'This activity creation should fail due to missing auth token.',
        type: 'testing',
      };

      return (
        request(httpServer)
          .post(`${apiPrefix}/activities`)
          // No .set('Authorization', ...)
          .send(payload)
          .expect(HttpStatus.UNAUTHORIZED)
      );
      // No .then() needed if only checking status, but can add to check body if desired:
      // .then((response) => {
      //   expect(response.body.message).toEqual('Unauthorized');
      // });
    });
  });

  describe('PATCH /activities/:id (Authenticated Update)', () => {
    let ownerUser: LoginResponse;
    let nonOwnerUser: LoginResponse;
    let activityToUpdate: ActivityResponse;

    const initialActivityPayload: CreateActivityPayload = {
      title: 'Activity to be Updated',
      description:
        'This is the original description of the activity that will be updated by its owner.',
      type: 'updatable',
      cost_level: 'low',
      participants_min: 1, // Example: explicitly set if needed for consistent testing
      participants_max: null, // Explicitly set to null if that's the default/expected state
      // Or ensure your service create logic handles undefined to null consistently
    };

    beforeAll(async () => {
      ownerUser = await setupUserAndLogin({ username: 'activity_owner_patch' });
      nonOwnerUser = await setupUserAndLogin({
        username: 'activity_non_owner_patch',
      });

      // Create an activity as the ownerUser
      const response = await request(httpServer)
        .post(`${apiPrefix}/activities`)
        .set('Authorization', `Bearer ${ownerUser.accessToken}`)
        .send(initialActivityPayload)
        .expect(HttpStatus.CREATED);
      activityToUpdate = response.body as ActivityResponse;
    });

    it('should successfully update an activity with valid access token (owner) and DTO (200 OK)', async () => {
      const updatePayload: Partial<CreateActivityPayload> = {
        title: 'Updated Activity Title',
        description:
          'The description has been successfully updated by the owner.',
        type: 'updated_type',
        cost_level: 'medium',
        participants_min: 2,
      };

      return request(httpServer)
        .patch(`${apiPrefix}/activities/${activityToUpdate.id}`)
        .set('Authorization', `Bearer ${ownerUser.accessToken}`)
        .send(updatePayload)
        .expect(HttpStatus.OK)
        .then((response) => {
          const updatedActivity = response.body as ActivityResponse;
          expect(updatedActivity).toBeDefined();
          expect(updatedActivity.id).toEqual(activityToUpdate.id);
          expect(updatedActivity.title).toEqual(updatePayload.title);
          expect(updatedActivity.description).toEqual(
            updatePayload.description,
          );
          expect(updatedActivity.type).toEqual(updatePayload.type);
          expect(updatedActivity.cost_level).toEqual(updatePayload.cost_level);
          expect(updatedActivity.participants_min).toEqual(
            updatePayload.participants_min,
          );
          // Fields not in updatePayload should remain from original or be their defaults
          // If initialActivityPayload.participants_max was undefined and stored as null:
          expect(updatedActivity.participants_max).toEqual(null); // Adjusted expectation
          expect(updatedActivity.user_id).toEqual(ownerUser.user.id);
          expect(updatedActivity.contributor_name).toEqual(
            ownerUser.user.username,
          );
          expect(
            new Date(updatedActivity.updated_at).getTime(),
          ).toBeGreaterThan(new Date(activityToUpdate.updated_at).getTime());
        });
    });

    it('should return 403 Forbidden if a non-owner tries to update the activity', async () => {
      const updatePayload: Partial<CreateActivityPayload> = {
        title: 'Attempted Update by Non-Owner',
      };

      return request(httpServer)
        .patch(`${apiPrefix}/activities/${activityToUpdate.id}`)
        .set('Authorization', `Bearer ${nonOwnerUser.accessToken}`)
        .send(updatePayload)
        .expect(HttpStatus.FORBIDDEN)
        .then((response) => {
          const errorResponse = response.body as {
            statusCode: number;
            message: string;
            error: string;
          };
          expect(errorResponse.statusCode).toEqual(HttpStatus.FORBIDDEN);
          // Corrected expected message
          expect(errorResponse.message).toEqual(
            'You are not allowed to update this activity.',
          );
          expect(errorResponse.error).toEqual('Forbidden');
        });
    });

    it('should return 404 Not Found if trying to update a non-existent activity ID', async () => {
      const nonExistentUuid = '123e4567-e89b-12d3-a456-426614174000'; // Valid UUID format, but non-existent
      const updatePayload: Partial<CreateActivityPayload> = {
        title: 'Update Non Existent',
      };

      return request(httpServer)
        .patch(`${apiPrefix}/activities/${nonExistentUuid}`)
        .set('Authorization', `Bearer ${ownerUser.accessToken}`) // Any valid token would do, as it should fail before ownership check
        .send(updatePayload)
        .expect(HttpStatus.NOT_FOUND)
        .then((response) => {
          const errorResponse = response.body as {
            statusCode: number;
            message: string;
            error: string;
          };
          expect(errorResponse.statusCode).toEqual(HttpStatus.NOT_FOUND);
          expect(errorResponse.message).toEqual(
            `Activity with ID ${nonExistentUuid} not found.`,
          );
        });
    });

    it('should return 400 Bad Request for an invalid UUID format for activityId', async () => {
      const invalidUuid = 'not-a-uuid';
      const updatePayload: Partial<CreateActivityPayload> = {
        title: 'Update Invalid UUID',
      };

      return request(httpServer)
        .patch(`${apiPrefix}/activities/${invalidUuid}`)
        .set('Authorization', `Bearer ${ownerUser.accessToken}`)
        .send(updatePayload)
        .expect(HttpStatus.BAD_REQUEST)
        .then((response) => {
          const errorResponse = response.body as {
            statusCode: number;
            message: string | string[];
            error: string;
          };
          expect(errorResponse.statusCode).toEqual(HttpStatus.BAD_REQUEST);
          if (typeof errorResponse.message === 'string') {
            expect(errorResponse.message).toMatch(
              /Validation failed \(uuid .*is expected\)/i,
            );
          } else {
            expect(errorResponse.message).toBeInstanceOf(Array);
            expect(errorResponse.message).toEqual(
              expect.arrayContaining([
                expect.stringMatching(
                  /Validation failed \(uuid .*is expected\)/i,
                ),
              ]),
            );
          }
        });
    });

    it('should return 400 Bad Request for DTO validation errors on update', async () => {
      const invalidUpdatePayload: Partial<CreateActivityPayload> = {
        title: '', // Empty title
        description: 'Short', // Too short
        participants_min: -1, // Invalid
      };

      return request(httpServer)
        .patch(`${apiPrefix}/activities/${activityToUpdate.id}`)
        .set('Authorization', `Bearer ${ownerUser.accessToken}`)
        .send(invalidUpdatePayload)
        .expect(HttpStatus.BAD_REQUEST)
        .then((response) => {
          const errorResponse = response.body as ValidationErrorResponse;
          expect(errorResponse.statusCode).toEqual(HttpStatus.BAD_REQUEST);
          expect(errorResponse.message).toBeInstanceOf(Array);
          expect(errorResponse.message).toEqual(
            expect.arrayContaining([
              // Corrected expected message for title based on @MinLength(3)
              expect.stringMatching(
                /title must be longer than or equal to 3 characters/i,
              ),
              expect.stringMatching(
                /description must be longer than or equal to 10 characters/i,
              ),
              expect.stringMatching(
                /participants_min must not be less than 1/i,
              ),
            ]),
          );
        });
    });

    it('should return 401 Unauthorized if no access token is provided for update', async () => {
      const updatePayload: Partial<CreateActivityPayload> = {
        title: 'Update Without Auth',
      };

      return (
        request(httpServer)
          .patch(`${apiPrefix}/activities/${activityToUpdate.id}`)
          // No .set('Authorization', ...)
          .send(updatePayload)
          .expect(HttpStatus.UNAUTHORIZED)
      );
    });
  });

  describe('DELETE /activities/:id (Authenticated Delete)', () => {
    let ownerUserDelete: LoginResponse;
    let nonOwnerUserDelete: LoginResponse;
    let activityToDeleteByOwner: ActivityResponse;
    let activityForNonOwnerAttempt: ActivityResponse; // A separate activity for the non-owner test

    const createPayloadForDeleteTests = (
      titleSuffix: string,
    ): CreateActivityPayload => ({
      title: `Activity for Deletion Test ${titleSuffix}`,
      description: `This activity is intended for a deletion test scenario (${titleSuffix}).`,
      type: 'deletable',
      cost_level: 'low',
    });

    beforeEach(async () => {
      // Using beforeEach to ensure fresh activities for each delete test
      // Generate unique usernames for each test run to avoid conflicts
      const ownerUsername = `activity_owner_del_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const nonOwnerUsername = `activity_nonowner_del_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      ownerUserDelete = await setupUserAndLogin({ username: ownerUsername });
      nonOwnerUserDelete = await setupUserAndLogin({
        username: nonOwnerUsername,
      });

      // Create an activity as the ownerUserDelete for successful deletion test
      let response = await request(httpServer)
        .post(`${apiPrefix}/activities`)
        .set('Authorization', `Bearer ${ownerUserDelete.accessToken}`)
        .send(createPayloadForDeleteTests('OwnerTarget'))
        .expect(HttpStatus.CREATED);
      activityToDeleteByOwner = response.body as ActivityResponse;

      // Create another activity (can be by ownerUserDelete or another user) for non-owner forbidden test
      // To ensure the nonOwnerUserDelete is truly a non-owner of this specific activity,
      // it's best if activityForNonOwnerAttempt is created by ownerUserDelete.
      response = await request(httpServer)
        .post(`${apiPrefix}/activities`)
        .set('Authorization', `Bearer ${ownerUserDelete.accessToken}`)
        .send(createPayloadForDeleteTests('NonOwnerTarget'))
        .expect(HttpStatus.CREATED);
      activityForNonOwnerAttempt = response.body as ActivityResponse;
    });

    it('should successfully delete an activity with valid access token (owner) (204 No Content)', async () => {
      await request(httpServer)
        .delete(`${apiPrefix}/activities/${activityToDeleteByOwner.id}`)
        .set('Authorization', `Bearer ${ownerUserDelete.accessToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Verify the activity is actually deleted
      return request(httpServer)
        .get(`${apiPrefix}/activities/${activityToDeleteByOwner.id}`)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should return 403 Forbidden if a non-owner tries to delete the activity', async () => {
      return request(httpServer)
        .delete(`${apiPrefix}/activities/${activityForNonOwnerAttempt.id}`) // Target the activity meant for this test
        .set('Authorization', `Bearer ${nonOwnerUserDelete.accessToken}`)
        .expect(HttpStatus.FORBIDDEN)
        .then((response) => {
          const errorResponse = response.body as {
            statusCode: number;
            message: string;
            error: string;
          };
          expect(errorResponse.statusCode).toEqual(HttpStatus.FORBIDDEN);
          expect(errorResponse.message).toEqual(
            'You are not allowed to delete this activity.',
          ); // Match service message
          expect(errorResponse.error).toEqual('Forbidden');
        });
    });

    it('should return 404 Not Found if trying to delete a non-existent activity ID', async () => {
      const nonExistentUuid = 'abcdef00-1234-5678-90ab-cdef01234567'; // Valid UUID format, but non-existent
      return request(httpServer)
        .delete(`${apiPrefix}/activities/${nonExistentUuid}`)
        .set('Authorization', `Bearer ${ownerUserDelete.accessToken}`) // Any valid token
        .expect(HttpStatus.NOT_FOUND)
        .then((response) => {
          const errorResponse = response.body as {
            statusCode: number;
            message: string;
            error: string;
          };
          expect(errorResponse.statusCode).toEqual(HttpStatus.NOT_FOUND);
          expect(errorResponse.message).toEqual(
            `Activity with ID ${nonExistentUuid} not found.`,
          );
        });
    });

    it('should return 404 Not Found if trying to delete an already deleted activity', async () => {
      // First, delete the activity
      await request(httpServer)
        .delete(`${apiPrefix}/activities/${activityToDeleteByOwner.id}`)
        .set('Authorization', `Bearer ${ownerUserDelete.accessToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Then, try to delete it again
      return request(httpServer)
        .delete(`${apiPrefix}/activities/${activityToDeleteByOwner.id}`)
        .set('Authorization', `Bearer ${ownerUserDelete.accessToken}`)
        .expect(HttpStatus.NOT_FOUND); // Should be Not Found as it no longer exists
    });

    it('should return 400 Bad Request for an invalid UUID format for activityId', async () => {
      const invalidUuid = 'this-is-not-a-uuid-at-all';
      return request(httpServer)
        .delete(`${apiPrefix}/activities/${invalidUuid}`)
        .set('Authorization', `Bearer ${ownerUserDelete.accessToken}`)
        .expect(HttpStatus.BAD_REQUEST)
        .then((response) => {
          const errorResponse = response.body as {
            statusCode: number;
            message: string | string[];
            error: string;
          };
          expect(errorResponse.statusCode).toEqual(HttpStatus.BAD_REQUEST);
          if (typeof errorResponse.message === 'string') {
            expect(errorResponse.message).toMatch(
              /Validation failed \(uuid .*is expected\)/i,
            );
          } else {
            expect(errorResponse.message).toBeInstanceOf(Array);
            expect(errorResponse.message).toEqual(
              expect.arrayContaining([
                expect.stringMatching(
                  /Validation failed \(uuid .*is expected\)/i,
                ),
              ]),
            );
          }
        });
    });

    it('should return 401 Unauthorized if no access token is provided for delete', async () => {
      return (
        request(httpServer)
          .delete(`${apiPrefix}/activities/${activityToDeleteByOwner.id}`) // Use any existing activity ID for this check
          // No .set('Authorization', ...)
          .expect(HttpStatus.UNAUTHORIZED)
      );
    });
  });

  // ... Other describe blocks ...
});
