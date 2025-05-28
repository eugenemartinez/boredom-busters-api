import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ConfigService } from '@nestjs/config';
import { Server } from 'http';
import { PaginatedResponse } from '../src/common/interfaces/paginated-response.interface.js';
// Import shared API interfaces
import {
  UserResponse,
  LoginResponse,
  ApiErrorResponse,
} from './common/interfaces/api.interfaces.js'; // Adjusted path

// Define or import your interfaces
// REMOVE local UserResponse definition
// REMOVE local LoginResponse definition
// REMOVE local ErrorResponse definition

interface UpdateUserPayload {
  username?: string;
}

interface CreateActivityPayload {
  title: string;
  description: string;
  type: string;
}

interface ActivityResponse {
  id: string;
  title: string;
  description: string;
  type: string;
  contributor_name: string | null;
  user_id: string;
}

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let apiPrefix: string;

  // Helper function to register and login a user, returning tokens and user details
  async function setupUserAndLogin(
    credentials: { email?: string; password?: string; username?: string } = {},
  ): Promise<{ accessToken: string; user: UserResponse }> {
    const uniqueSuffix = Date.now();
    const defaultEmail = `user-${uniqueSuffix}@example.com`;
    const defaultPassword = 'Password123!';
    const defaultUsername = `user-${uniqueSuffix}`;

    const registerPayload = {
      email: credentials.email || defaultEmail,
      password: credentials.password || defaultPassword,
      username: credentials.username || defaultUsername,
    };

    // Register user
    await request(httpServer)
      .post(`${apiPrefix}/auth/register`)
      .send(registerPayload)
      .expect(HttpStatus.CREATED);

    // Login user
    const loginRes = await request(httpServer)
      .post(`${apiPrefix}/auth/login`)
      .send({
        email: registerPayload.email,
        password: registerPayload.password,
      })
      .expect(HttpStatus.OK);

    // Explicitly cast loginRes.body to LoginResponse
    const loginData = loginRes.body as LoginResponse;
    return { accessToken: loginData.accessToken, user: loginData.user };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const configService = app.get(ConfigService);
    // Ensure API_PREFIX is read from config, with a fallback if necessary
    apiPrefix = configService.get<string>('API_PREFIX', '/api'); // Match how it's done in auth.e2e-spec.ts

    app.setGlobalPrefix(apiPrefix); // <--- ADD OR ENSURE THIS LINE IS PRESENT AND CORRECT

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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PATCH /users/me (Update Profile)', () => {
    const updateUserUrl = '/users/me';
    const activitiesUrl = '/activities'; // Assuming this is your activities endpoint

    it('should successfully update username with a valid access token (200)', async () => {
      const { accessToken, user: originalUser } = await setupUserAndLogin();
      let newUsername = `updated_user_${Date.now()}`;
      if (newUsername.length > 30) {
        newUsername = newUsername.substring(0, 30);
      }

      const updatePayload: UpdateUserPayload = {
        username: newUsername,
      };

      return request(httpServer)
        .patch(`${apiPrefix}${updateUserUrl}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updatePayload)
        .then((response) => {
          if (response.status !== (HttpStatus.OK as number)) {
            console.error(
              'PATCH /users/me (success case) failed with status:',
              response.status,
            );
            console.error(
              'Response body:',
              JSON.stringify(response.body, null, 2),
            );
          }
          expect(response.status).toEqual(HttpStatus.OK);
          const updatedUser = response.body as UserResponse;
          expect(updatedUser).toBeDefined();
          expect(updatedUser.id).toEqual(originalUser.id);
          expect(updatedUser.email).toEqual(originalUser.email);
          expect(updatedUser.username).toEqual(newUsername);
          expect(updatedUser).not.toHaveProperty('password_hash');
        });
    });

    it('should fail to update username if already taken by another user (409)', async () => {
      // 1. Create userOne
      const userOneCredentials = {
        email: `userone-${Date.now()}@example.com`,
        username: `user_one_${Date.now() % 100000}`, // Ensure it's valid
        password: 'PasswordOne123!',
      };
      if (userOneCredentials.username.length > 30) {
        // Ensure valid length
        userOneCredentials.username = userOneCredentials.username.substring(
          0,
          30,
        );
      }
      await setupUserAndLogin(userOneCredentials); // We only need userOne to exist

      // 2. Create and login as userTwo
      const userTwoSuffix = Date.now() + 1; // Ensure different from userOne
      const { accessToken: userTwoAccessToken } = await setupUserAndLogin({
        email: `usertwo-${userTwoSuffix}@example.com`,
        username: `user_two_${userTwoSuffix % 100000}`,
        password: 'PasswordTwo123!',
      });

      // 3. Attempt to update userTwo's username to userOne's username
      const updatePayload: UpdateUserPayload = {
        username: userOneCredentials.username, // Attempt to take userOne's username
      };

      return request(httpServer)
        .patch(`${apiPrefix}${updateUserUrl}`)
        .set('Authorization', `Bearer ${userTwoAccessToken}`)
        .send(updatePayload)
        .expect(HttpStatus.CONFLICT) // Expect 409 Conflict
        .then((response: { body: ApiErrorResponse }) => {
          // Use ApiErrorResponse
          expect(response.body).toBeDefined();
          expect(response.body.statusCode).toEqual(HttpStatus.CONFLICT);
          expect(response.body.message).toEqual('Username already taken.'); // message is string here
        });
    });

    it('should allow updating username to the same current username (200)', async () => {
      const { accessToken, user: originalUser } = await setupUserAndLogin({
        username: `current_user_${Date.now() % 100000}`, // Ensure a known username
      });

      // Ensure originalUser.username is not null or undefined for the test
      if (!originalUser.username) {
        throw new Error(
          'Original user username is unexpectedly null or undefined for the test setup.',
        );
      }

      const updatePayload: UpdateUserPayload = {
        username: originalUser.username, // Attempt to "update" to the same username
      };

      return request(httpServer)
        .patch(`${apiPrefix}${updateUserUrl}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updatePayload)
        .expect(HttpStatus.OK)
        .then((response) => {
          const updatedUser = response.body as UserResponse;
          expect(updatedUser).toBeDefined();
          expect(updatedUser.id).toEqual(originalUser.id);
          expect(updatedUser.email).toEqual(originalUser.email);
          expect(updatedUser.username).toEqual(originalUser.username); // Username should be the same
          expect(updatedUser).not.toHaveProperty('password_hash');
          // Optionally, check if updated_at timestamp changed or not, depending on service logic
        });
    });

    describe('DTO Validation Failures (UpdateUserDto)', () => {
      let accessToken: string;

      beforeEach(async () => {
        // Setup a user and get their token for these tests
        const authDetails = await setupUserAndLogin();
        accessToken = authDetails.accessToken;
      });

      it('should reject with 400 if username is too short', () => {
        const payloadWithShortUsername: UpdateUserPayload = {
          username: 'ab', // Violates @MinLength(3)
        };
        return request(httpServer)
          .patch(`${apiPrefix}${updateUserUrl}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send(payloadWithShortUsername)
          .expect(HttpStatus.BAD_REQUEST)
          .then((response: { body: ApiErrorResponse }) => {
            expect(response.body.statusCode).toEqual(HttpStatus.BAD_REQUEST);
            expect(Array.isArray(response.body.message)).toBe(true);
            expect(response.body.message).toEqual(
              expect.arrayContaining([
                expect.stringContaining(
                  'username must be longer than or equal to 3 characters',
                ),
              ]),
            );
          });
      });

      it('should reject with 400 if username is too long', () => {
        const payloadWithLongUsername: UpdateUserPayload = {
          username: 'a'.repeat(31), // Violates @MaxLength(30)
        };
        return request(httpServer)
          .patch(`${apiPrefix}${updateUserUrl}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send(payloadWithLongUsername)
          .expect(HttpStatus.BAD_REQUEST)
          .then((response: { body: ApiErrorResponse }) => {
            expect(response.body.statusCode).toEqual(HttpStatus.BAD_REQUEST);
            expect(Array.isArray(response.body.message)).toBe(true);
            expect(response.body.message).toEqual(
              expect.arrayContaining([
                expect.stringContaining(
                  'username must be shorter than or equal to 30 characters',
                ),
              ]),
            );
          });
      });

      it('should reject with 400 if username contains invalid characters', () => {
        const payloadWithInvalidChars: UpdateUserPayload = {
          username: 'user-name!', // Violates @Matches(/^[a-zA-Z0-9_]+$/)
        };
        return request(httpServer)
          .patch(`${apiPrefix}${updateUserUrl}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send(payloadWithInvalidChars)
          .expect(HttpStatus.BAD_REQUEST)
          .then((response: { body: ApiErrorResponse }) => {
            expect(response.body.statusCode).toEqual(HttpStatus.BAD_REQUEST);
            expect(Array.isArray(response.body.message)).toBe(true);
            expect(response.body.message).toEqual(
              expect.arrayContaining([
                'Username can only contain letters, numbers, and underscores.',
              ]),
            );
          });
      });

      it('should reject with 400 if username is an empty string', () => {
        const payloadWithEmptyUsername: UpdateUserPayload = {
          username: '', // Violates @IsNotEmpty()
        };
        return request(httpServer)
          .patch(`${apiPrefix}${updateUserUrl}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send(payloadWithEmptyUsername)
          .expect(HttpStatus.BAD_REQUEST)
          .then((response: { body: ApiErrorResponse }) => {
            expect(response.body.statusCode).toEqual(HttpStatus.BAD_REQUEST);
            expect(Array.isArray(response.body.message)).toBe(true);
            // @IsNotEmpty often comes with @MinLength, so the minLength message might appear,
            // or a specific "isNotEmpty" message. Check your actual error.
            // For `class-validator`, @IsNotEmpty() message is typically "username should not be empty"
            // and @MinLength(3) is "username must be longer than or equal to 3 characters"
            // Since an empty string fails both, you might get both or just one depending on order.
            // Let's check for the "isNotEmpty" one primarily.
            expect(response.body.message).toEqual(
              expect.arrayContaining([
                expect.stringMatching(
                  /username should not be empty|username must be longer than or equal to 3 characters/,
                ),
              ]),
            );
          });
      });
    });

    describe('Authentication for PATCH /users/me', () => {
      it('should reject with 401 if no access token is provided', () => {
        const updatePayload: UpdateUserPayload = {
          username: 'any_valid_username',
        };

        return (
          request(httpServer)
            .patch(`${apiPrefix}${updateUserUrl}`)
            // No .set('Authorization', ...)
            .send(updatePayload)
            .expect(HttpStatus.UNAUTHORIZED)
            .then((response: { body: ApiErrorResponse }) => {
              expect(response.body.statusCode).toEqual(HttpStatus.UNAUTHORIZED);
              // Ensure message is a string before calling toLowerCase()
              if (typeof response.body.message === 'string') {
                expect(response.body.message.toLowerCase()).toContain(
                  'no auth token',
                );
              } else {
                // If it's an array, this specific expectation might need adjustment,
                // but for a 401, a single string is typical.
                // We can fail the test if it's not a string, as that would be unexpected for this error.
                fail(
                  'Expected error message to be a string for 401 Unauthorized',
                );
              }
            })
        );
      });

      // You might also add a test for an invalid/expired token here if not covered elsewhere,
      // though it's often covered in auth.e2e-spec.ts for a generic protected route.
    });

    describe('Side Effects of PATCH /users/me', () => {
      it('should update contributor_name on activities when username is changed', async () => {
        // 1. Setup user and create an activity
        const initialUsername = `test_user_${Date.now()}`;
        const { accessToken, user: originalUser } = await setupUserAndLogin({
          username: initialUsername,
          email: `cascade-${Date.now()}@example.com`,
          password: 'Password123!',
        });

        const createActivityPayload: CreateActivityPayload = {
          title: 'My Test Activity for Cascade',
          description: 'Testing contributor name update.',
          type: 'test_cascade',
        };

        const createActivityResponse = await request(httpServer)
          .post(`${apiPrefix}${activitiesUrl}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send(createActivityPayload)
          .expect(HttpStatus.CREATED);

        const createdActivity = createActivityResponse.body as ActivityResponse;
        expect(createdActivity.contributor_name).toEqual(initialUsername);
        expect(createdActivity.user_id).toEqual(originalUser.id);

        // 2. Update user's username
        const newUsername = `updated_user_${Date.now()}`;
        const updateUserPayload: UpdateUserPayload = { username: newUsername };

        await request(httpServer)
          .patch(`${apiPrefix}${updateUserUrl}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send(updateUserPayload)
          .expect(HttpStatus.OK);

        // 3. Fetch the activity again and verify contributor_name
        const fetchActivityResponse = await request(httpServer)
          .get(`${apiPrefix}${activitiesUrl}/${createdActivity.id}`)
          // Assuming GET /activities/{id} is public or accessible by the same user
          .set('Authorization', `Bearer ${accessToken}`) // Or remove if public
          .expect(HttpStatus.OK);

        const fetchedActivity = fetchActivityResponse.body as ActivityResponse;
        expect(fetchedActivity.id).toEqual(createdActivity.id);
        expect(fetchedActivity.contributor_name).toEqual(newUsername);
      });
    });
  });

  describe("GET /users/me/activities (List Authenticated User's Activities)", () => {
    const userActivitiesUrl = '/users/me/activities';
    const activitiesUrl = '/activities'; // For creating activities

    let userOne: { accessToken: string; user: UserResponse };

    let userOneActivities: ActivityResponse[] = [];

    beforeAll(async () => {
      // Setup User One and create some activities for them
      userOne = await setupUserAndLogin({
        email: `userone-activities-${Date.now()}@example.com`,
        username: `userone_activities_${Date.now() % 100000}`,
      });

      const activityPayloads: CreateActivityPayload[] = [
        {
          title: 'UserOne Activity One',
          description: 'A valid description with enough length',
          type: 'userone_type_alpha',
        },
        {
          title: 'UserOne Activity Two',
          description: 'Another valid description for testing',
          type: 'userone_type_beta',
        },
      ];

      // To satisfy prefer-const if it's only assigned once after collection:
      const createdActivities: ActivityResponse[] = []; // Collect here

      for (const payload of activityPayloads) {
        const response = await request(httpServer)
          .post(`${apiPrefix}${activitiesUrl}`)
          .set('Authorization', `Bearer ${userOne.accessToken}`)
          .send(payload)
          .expect(HttpStatus.CREATED); // This should now pass
        createdActivities.push(response.body as ActivityResponse);
      }

      userOneActivities = createdActivities; // Assign once

      // Setup User Two and create an activity for them (to ensure it's not fetched by User One)
      const userTwo = await setupUserAndLogin({
        email: `usertwo-activities-${Date.now()}@example.com`,
        username: `usertwo_activities_${Date.now() % 100000}`,
      });
      await request(httpServer)
        .post(`${apiPrefix}${activitiesUrl}`)
        .set('Authorization', `Bearer ${userTwo.accessToken}`)
        .send({
          title: 'UserTwo Valid Activity',
          description: "This is UserTwo's valid activity description",
          type: 'usertwo_type_gamma',
        })
        .expect(HttpStatus.CREATED);
    });

    it('should return a paginated list of activities for the authenticated user (200)', async () => {
      return request(httpServer)
        .get(`${apiPrefix}${userActivitiesUrl}`)
        .set('Authorization', `Bearer ${userOne.accessToken}`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>;

          expect(paginatedResponse.data).toBeInstanceOf(Array);
          expect(paginatedResponse.meta).toBeDefined();

          // Check meta structure (adjust defaults if your pagination defaults are different)
          expect(paginatedResponse.meta.totalItems).toEqual(
            userOneActivities.length,
          );
          expect(paginatedResponse.meta.itemCount).toEqual(
            userOneActivities.length,
          ); // Assuming default limit >= userOneActivities.length
          expect(paginatedResponse.meta.itemsPerPage).toBeGreaterThanOrEqual(
            userOneActivities.length,
          ); // Or your default limit
          expect(paginatedResponse.meta.totalPages).toEqual(1); // Assuming all fit on one page
          expect(paginatedResponse.meta.currentPage).toEqual(1);

          // Verify that all of userOne's activities are present
          expect(paginatedResponse.data.length).toEqual(
            userOneActivities.length,
          );
          userOneActivities.forEach((activity) => {
            expect(
              paginatedResponse.data.some(
                (a) => a.id === activity.id && a.title === activity.title,
              ),
            ).toBe(true);
          });

          // Verify that userTwo's activities are NOT present
          paginatedResponse.data.forEach((activity) => {
            expect(activity.user_id).toEqual(userOne.user.id);
          });
        });
    });

    it('should return an empty list with correct pagination structure if the user has no activities (200)', async () => {
      // Setup a new user who will have no activities
      const userWithNoActivities = await setupUserAndLogin({
        email: `no-activities-user-${Date.now()}@example.com`,
        username: `no_activities_user_${Date.now() % 100000}`,
      });

      return request(httpServer)
        .get(`${apiPrefix}${userActivitiesUrl}`)
        .set('Authorization', `Bearer ${userWithNoActivities.accessToken}`)
        .expect(HttpStatus.OK)
        .then((response) => {
          const paginatedResponse =
            response.body as PaginatedResponse<ActivityResponse>; // Using the imported PaginatedResponse

          expect(paginatedResponse.data).toBeInstanceOf(Array);
          expect(paginatedResponse.data.length).toEqual(0); // Key check: data array is empty

          expect(paginatedResponse.meta).toBeDefined();
          expect(paginatedResponse.meta.totalItems).toEqual(0);
          expect(paginatedResponse.meta.itemCount).toEqual(0);
          expect(paginatedResponse.meta.itemsPerPage).toBeGreaterThanOrEqual(1); // Or your default limit
          expect(paginatedResponse.meta.totalPages).toEqual(0); // Or 1, depending on how your pagination handles 0 items
          expect(paginatedResponse.meta.currentPage).toEqual(1); // Default page is 1
        });
    });

    describe('Query Functionality', () => {
      let queryUser: { accessToken: string; user: UserResponse };
      const totalActivitiesForQueryUser = 5;
      let createdActivitiesForQueryUser: ActivityResponse[] = []; // Populated in beforeAll

      beforeAll(async () => {
        queryUser = await setupUserAndLogin({
          email: `query-user-${Date.now()}@example.com`,
          username: `query_user_${Date.now() % 100000}`,
        });

        createdActivitiesForQueryUser = []; // Reset for this describe block
        for (let i = 0; i < totalActivitiesForQueryUser; i++) {
          const payload: CreateActivityPayload = {
            title: `Query User Activity ${i + 1}`,
            description: `Description for query activity ${i + 1} which is long enough.`,
            type: `query_type_${i % 2 === 0 ? 'even' : 'odd'}`, // Alternate types for later filter tests
          };
          const response = await request(httpServer)
            .post(`${apiPrefix}${activitiesUrl}`)
            .set('Authorization', `Bearer ${queryUser.accessToken}`)
            .send(payload)
            .expect(HttpStatus.CREATED);
          createdActivitiesForQueryUser.push(response.body as ActivityResponse);
        }
        // Activities are created in order, so createdActivitiesForQueryUser[0] is the oldest, [4] is the newest
        // Assuming default sort is by creation time DESC for activities (newest first)
        // For consistent pagination testing, let's reverse so [0] is newest if default sort is DESC
        createdActivitiesForQueryUser.reverse();
      });

      it('should handle pagination correctly (page 1, limit 2)', async () => {
        const page = 1;
        const limit = 2;
        return request(httpServer)
          .get(`${apiPrefix}${userActivitiesUrl}?page=${page}&limit=${limit}`)
          .set('Authorization', `Bearer ${queryUser.accessToken}`)
          .expect(HttpStatus.OK)
          .then((response) => {
            const paginatedResponse =
              response.body as PaginatedResponse<ActivityResponse>;
            expect(paginatedResponse.data.length).toEqual(limit);
            expect(paginatedResponse.meta.itemCount).toEqual(limit);
            expect(paginatedResponse.meta.itemsPerPage).toEqual(limit);
            expect(paginatedResponse.meta.currentPage).toEqual(page);
            expect(paginatedResponse.meta.totalItems).toEqual(
              totalActivitiesForQueryUser,
            );
            expect(paginatedResponse.meta.totalPages).toEqual(
              Math.ceil(totalActivitiesForQueryUser / limit),
            );
            // Verify correct items (assuming default sort is newest first)
            expect(paginatedResponse.data[0].id).toEqual(
              createdActivitiesForQueryUser[0].id,
            );
            expect(paginatedResponse.data[1].id).toEqual(
              createdActivitiesForQueryUser[1].id,
            );
          });
      });

      it('should handle pagination correctly (page 2, limit 2)', async () => {
        const page = 2;
        const limit = 2;
        return request(httpServer)
          .get(`${apiPrefix}${userActivitiesUrl}?page=${page}&limit=${limit}`)
          .set('Authorization', `Bearer ${queryUser.accessToken}`)
          .expect(HttpStatus.OK)
          .then((response) => {
            const paginatedResponse =
              response.body as PaginatedResponse<ActivityResponse>;
            expect(paginatedResponse.data.length).toEqual(limit);
            expect(paginatedResponse.meta.itemCount).toEqual(limit);
            expect(paginatedResponse.meta.itemsPerPage).toEqual(limit);
            expect(paginatedResponse.meta.currentPage).toEqual(page);
            expect(paginatedResponse.meta.totalItems).toEqual(
              totalActivitiesForQueryUser,
            );
            expect(paginatedResponse.meta.totalPages).toEqual(
              Math.ceil(totalActivitiesForQueryUser / limit),
            );
            // Verify correct items
            expect(paginatedResponse.data[0].id).toEqual(
              createdActivitiesForQueryUser[2].id,
            );
            expect(paginatedResponse.data[1].id).toEqual(
              createdActivitiesForQueryUser[3].id,
            );
          });
      });

      it('should handle pagination correctly (page 3, limit 2 - partial last page)', async () => {
        const page = 3;
        const limit = 2;
        const expectedItemCount = totalActivitiesForQueryUser % limit || limit; // handles if total is multiple of limit
        if (totalActivitiesForQueryUser < (page - 1) * limit + 1) {
          // if page is out of bounds
          // This case should ideally not happen if totalPages is calculated correctly by API
          // or could be tested as an empty page if API supports it.
          // For now, assuming API returns items if page is within totalPages.
          // If this test setup leads to an empty page 3, adjust expectations.
          // For 5 items, limit 2: page 3 has 1 item.
          expect(expectedItemCount).toBe(1);
        }

        return request(httpServer)
          .get(`${apiPrefix}${userActivitiesUrl}?page=${page}&limit=${limit}`)
          .set('Authorization', `Bearer ${queryUser.accessToken}`)
          .expect(HttpStatus.OK)
          .then((response) => {
            const paginatedResponse =
              response.body as PaginatedResponse<ActivityResponse>;
            expect(paginatedResponse.data.length).toEqual(expectedItemCount);
            expect(paginatedResponse.meta.itemCount).toEqual(expectedItemCount);
            expect(paginatedResponse.meta.itemsPerPage).toEqual(limit);
            expect(paginatedResponse.meta.currentPage).toEqual(page);
            expect(paginatedResponse.meta.totalItems).toEqual(
              totalActivitiesForQueryUser,
            );
            expect(paginatedResponse.meta.totalPages).toEqual(
              Math.ceil(totalActivitiesForQueryUser / limit),
            );
            // Verify correct items
            expect(paginatedResponse.data[0].id).toEqual(
              createdActivitiesForQueryUser[4].id,
            );
          });
      });

      it('should use default pagination (page 1, limit 10) when no params are provided', async () => {
        const defaultLimit = 10; // As per ActivityQueryDto
        const defaultPage = 1;
        // All 5 activities should be returned as 5 < 10
        return request(httpServer)
          .get(`${apiPrefix}${userActivitiesUrl}`)
          .set('Authorization', `Bearer ${queryUser.accessToken}`)
          .expect(HttpStatus.OK)
          .then((response) => {
            const paginatedResponse =
              response.body as PaginatedResponse<ActivityResponse>;
            expect(paginatedResponse.data.length).toEqual(
              totalActivitiesForQueryUser,
            );
            expect(paginatedResponse.meta.itemCount).toEqual(
              totalActivitiesForQueryUser,
            );
            expect(paginatedResponse.meta.itemsPerPage).toEqual(defaultLimit);
            expect(paginatedResponse.meta.currentPage).toEqual(defaultPage);
            expect(paginatedResponse.meta.totalItems).toEqual(
              totalActivitiesForQueryUser,
            );
            expect(paginatedResponse.meta.totalPages).toEqual(1); // Math.ceil(5 / 10) = 1
          });
      });

      it('should filter activities by type "query_type_even"', async () => {
        const filterType = 'query_type_even';
        const expectedCount = createdActivitiesForQueryUser.filter(
          (act) => act.type === filterType,
        ).length;

        return request(httpServer)
          .get(`${apiPrefix}${userActivitiesUrl}?type=${filterType}`)
          .set('Authorization', `Bearer ${queryUser.accessToken}`)
          .expect(HttpStatus.OK)
          .then((response) => {
            const paginatedResponse =
              response.body as PaginatedResponse<ActivityResponse>;
            expect(paginatedResponse.data.length).toEqual(expectedCount);
            expect(paginatedResponse.meta.itemCount).toEqual(expectedCount);
            expect(paginatedResponse.meta.totalItems).toEqual(expectedCount);
            paginatedResponse.data.forEach((activity) => {
              expect(activity.type).toEqual(filterType);
            });
          });
      });

      it('should filter activities by type "query_type_odd"', async () => {
        const filterType = 'query_type_odd';
        const expectedCount = createdActivitiesForQueryUser.filter(
          (act) => act.type === filterType,
        ).length;

        return request(httpServer)
          .get(`${apiPrefix}${userActivitiesUrl}?type=${filterType}`)
          .set('Authorization', `Bearer ${queryUser.accessToken}`)
          .expect(HttpStatus.OK)
          .then((response) => {
            const paginatedResponse =
              response.body as PaginatedResponse<ActivityResponse>;
            expect(paginatedResponse.data.length).toEqual(expectedCount);
            expect(paginatedResponse.meta.itemCount).toEqual(expectedCount);
            expect(paginatedResponse.meta.totalItems).toEqual(expectedCount);
            paginatedResponse.data.forEach((activity) => {
              expect(activity.type).toEqual(filterType);
            });
          });
      });

      it('should return an empty list when filtering by a non-existent type', async () => {
        const filterType = 'non_existent_type';
        return request(httpServer)
          .get(`${apiPrefix}${userActivitiesUrl}?type=${filterType}`)
          .set('Authorization', `Bearer ${queryUser.accessToken}`)
          .expect(HttpStatus.OK)
          .then((response) => {
            const paginatedResponse =
              response.body as PaginatedResponse<ActivityResponse>;
            expect(paginatedResponse.data.length).toEqual(0);
            expect(paginatedResponse.meta.itemCount).toEqual(0);
            expect(paginatedResponse.meta.totalItems).toEqual(0);
          });
      });

      it('should sort activities by title in ascending order', async () => {
        const sortBy = 'title';
        const sortOrder = 'ASC';
        // Create a sorted version of the original activities for comparison
        const expectedSortedActivities = [
          ...createdActivitiesForQueryUser,
        ].sort((a, b) => a.title.localeCompare(b.title));

        return request(httpServer)
          .get(
            `${apiPrefix}${userActivitiesUrl}?sortBy=${sortBy}&sortOrder=${sortOrder}`,
          )
          .set('Authorization', `Bearer ${queryUser.accessToken}`)
          .expect(HttpStatus.OK)
          .then((response) => {
            const paginatedResponse =
              response.body as PaginatedResponse<ActivityResponse>;
            expect(paginatedResponse.data.length).toEqual(
              createdActivitiesForQueryUser.length,
            );
            // Verify the order of all items
            paginatedResponse.data.forEach((activity, index) => {
              expect(activity.id).toEqual(expectedSortedActivities[index].id);
            });
          });
      });

      it('should sort activities by title in descending order', async () => {
        const sortBy = 'title';
        const sortOrder = 'DESC';
        const expectedSortedActivities = [
          ...createdActivitiesForQueryUser,
        ].sort((a, b) => b.title.localeCompare(a.title));

        return request(httpServer)
          .get(
            `${apiPrefix}${userActivitiesUrl}?sortBy=${sortBy}&sortOrder=${sortOrder}`,
          )
          .set('Authorization', `Bearer ${queryUser.accessToken}`)
          .expect(HttpStatus.OK)
          .then((response) => {
            const paginatedResponse =
              response.body as PaginatedResponse<ActivityResponse>;
            expect(paginatedResponse.data.length).toEqual(
              createdActivitiesForQueryUser.length,
            );
            paginatedResponse.data.forEach((activity, index) => {
              expect(activity.id).toEqual(expectedSortedActivities[index].id);
            });
          });
      });

      it('should sort activities by created_at in ascending order (oldest first)', async () => {
        const sortBy = 'created_at';
        const sortOrder = 'ASC';
        // The original createdActivitiesForQueryUser was reversed (newest first).
        // So, for ASC (oldest first), we need to reverse it back.
        const expectedSortedActivities = [
          ...createdActivitiesForQueryUser,
        ].reverse();

        return request(httpServer)
          .get(
            `${apiPrefix}${userActivitiesUrl}?sortBy=${sortBy}&sortOrder=${sortOrder}`,
          )
          .set('Authorization', `Bearer ${queryUser.accessToken}`)
          .expect(HttpStatus.OK)
          .then((response) => {
            const paginatedResponse =
              response.body as PaginatedResponse<ActivityResponse>;
            expect(paginatedResponse.data.length).toEqual(
              createdActivitiesForQueryUser.length,
            );
            paginatedResponse.data.forEach((activity, index) => {
              expect(activity.id).toEqual(expectedSortedActivities[index].id);
            });
          });
      });

      it('should sort activities by created_at in descending order (newest first - default behavior)', async () => {
        const sortBy = 'created_at';
        const sortOrder = 'DESC';
        // This should match the order in createdActivitiesForQueryUser as it was reversed to be newest first
        const expectedSortedActivities = [...createdActivitiesForQueryUser];

        return request(httpServer)
          .get(
            `${apiPrefix}${userActivitiesUrl}?sortBy=${sortBy}&sortOrder=${sortOrder}`,
          )
          .set('Authorization', `Bearer ${queryUser.accessToken}`)
          .expect(HttpStatus.OK)
          .then((response) => {
            const paginatedResponse =
              response.body as PaginatedResponse<ActivityResponse>;
            expect(paginatedResponse.data.length).toEqual(
              createdActivitiesForQueryUser.length,
            );
            paginatedResponse.data.forEach((activity, index) => {
              expect(activity.id).toEqual(expectedSortedActivities[index].id);
            });
          });
      });
    });

    describe('Query Validation', () => {
      let validationTestUser: { accessToken: string; user: UserResponse };

      beforeAll(async () => {
        validationTestUser = await setupUserAndLogin({
          email: `validation-user-${Date.now()}@example.com`,
          username: `validation_user_${Date.now() % 100000}`,
        });
      });

      const invalidQueryCases = [
        {
          param: 'page=abc',
          description: 'non-numeric page',
          expectedMessageFragment: 'page must be an integer number',
        },
        {
          param: 'page=0',
          description: 'page less than 1',
          expectedMessageFragment: 'page must not be less than 1',
        },
        {
          param: 'limit=xyz',
          description: 'non-numeric limit',
          expectedMessageFragment: 'limit must be an integer number',
        },
        {
          param: 'limit=0',
          description: 'limit less than 1',
          expectedMessageFragment: 'limit must not be less than 1',
        },
        {
          param: 'limit=200',
          description: 'limit greater than max (e.g., 100)',
          expectedMessageFragment: 'limit must not be greater than 100',
        }, // Assumes @Max(100) in DTO
        // CORRECTED expectedMessageFragment based on ActivityQueryDto
        {
          param: 'sortBy=invalidField',
          description: 'invalid sortBy value',
          expectedMessageFragment: 'Invalid sortBy value.',
        },
        {
          param: 'sortOrder=INVALID',
          description: 'invalid sortOrder value',
          expectedMessageFragment: 'Invalid sortOrder value.',
        },
        // Example for type validation if ActivityQueryDto has @MaxLength for type
        // { param: 'type=' + 'a'.repeat(101), description: 'type exceeding max length', expectedMessageFragment: 'type must be shorter than or equal to 100 characters' },
      ];

      invalidQueryCases.forEach((testCase) => {
        it(`should return 400 Bad Request for ${testCase.description} (?${testCase.param})`, () => {
          return request(httpServer)
            .get(`${apiPrefix}${userActivitiesUrl}?${testCase.param}`)
            .set('Authorization', `Bearer ${validationTestUser.accessToken}`)
            .expect(HttpStatus.BAD_REQUEST)
            .then((response) => {
              const errorResponse = response.body as ApiErrorResponse;
              expect(errorResponse.statusCode).toEqual(HttpStatus.BAD_REQUEST);
              expect(errorResponse.error).toEqual('Bad Request');
              expect(Array.isArray(errorResponse.message)).toBe(true);
              expect(
                (errorResponse.message as string[]).some((msg) =>
                  msg.includes(testCase.expectedMessageFragment),
                ),
              ).toBe(true);
            });
        });
      });
    }); // End of Query Validation describe

    it('should return 401 Unauthorized if no access token is provided', () => {
      return (
        request(httpServer)
          .get(`${apiPrefix}${userActivitiesUrl}`)
          // No .set('Authorization', ...)
          .expect(HttpStatus.UNAUTHORIZED)
          .then((response) => {
            const errorResponse = response.body as ApiErrorResponse;
            expect(errorResponse.statusCode).toEqual(HttpStatus.UNAUTHORIZED);
            // The message for no token can vary, e.g., "Unauthorized" or specific like "No auth token"
            // Check for a common part or the exact message if known
            if (typeof errorResponse.message === 'string') {
              expect(errorResponse.message.toLowerCase()).toMatch(
                /unauthorized|no auth token/,
              );
            } else {
              // If message is an array, check if one of them matches
              expect(
                errorResponse.message.some((msg) =>
                  msg.toLowerCase().match(/unauthorized|no auth token/),
                ),
              ).toBe(true);
            }
          })
      );
    });
  }); // End of GET /users/me/activities describe
});
