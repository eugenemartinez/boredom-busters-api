import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ConfigService } from '@nestjs/config';
import { Server } from 'http';
// Import shared API interfaces
import {
  UserResponse,
  LoginResponse,
  ApiValidationErrorResponse,
  ApiSimpleErrorResponse,
  RefreshTokenResponse,
  LogoutResponse,
} from './common/interfaces/api.interfaces.js'; // Adjusted path

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let apiPrefix: string;

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
  });

  describe('POST /auth/register', () => {
    const registerUrl = '/auth/register';
    const createdUserEmails: string[] = []; // Keep for potential cleanup if needed

    afterEach(async () => {
      // Placeholder for cleanup logic.
      // For duplicate tests, the first user created needs to persist for the second attempt to fail.
      // A robust cleanup would happen in afterAll for the describe block or globally.
      // For now, we are not actively cleaning up between these specific duplicate tests.
    });

    it('should successfully register a new user (201)', () => {
      const uniqueSuffix = Date.now();
      const newUser = {
        // Payload should match RegisterUserDto
        email: `testuser${uniqueSuffix}@example.com`,
        username: `testuser${uniqueSuffix}`, // Username is optional in DTO, but good to test with it
        password: 'Password123!',
        // DO NOT INCLUDE first_name or last_name as they are not in RegisterUserDto
      };
      // createdUserEmails.push(newUser.email); // Keep for cleanup if needed

      return request(httpServer)
        .post(`${apiPrefix}${registerUrl}`)
        .send(newUser)
        .expect(HttpStatus.CREATED) // Now this should pass if DTO is matched
        .then((response: { body: UserResponse }) => {
          expect(response.body).toBeDefined();
          expect(response.body.email).toEqual(newUser.email);
          // If username was sent and is expected in response:
          expect(response.body.username).toEqual(newUser.username);
          // If username was optional and not sent, you might expect it to be null or undefined in response
          // depending on your service logic and User entity.
          // For now, assuming it's returned if sent.
          expect(response.body.id).toBeDefined();
          expect(response.body).not.toHaveProperty('password_hash');
          expect(response.body).not.toHaveProperty(
            'current_hashed_refresh_token',
          );
        });
    });

    // Test case for when username is not provided (since it's optional)
    it('should successfully register a new user without a username (201)', () => {
      const uniqueSuffix = Date.now();
      const newUserWithoutUsername = {
        email: `testnousername${uniqueSuffix}@example.com`,
        password: 'Password123!',
        // username is deliberately omitted
      };
      // createdUserEmails.push(newUserWithoutUsername.email);

      return request(httpServer)
        .post(`${apiPrefix}${registerUrl}`)
        .send(newUserWithoutUsername)
        .expect(HttpStatus.CREATED)
        .then((response: { body: UserResponse }) => {
          expect(response.body).toBeDefined();
          expect(response.body.email).toEqual(newUserWithoutUsername.email);
          // Username in response should be null or undefined, matching your User entity
          // and service logic when username is not provided in DTO.
          // Your User entity has `username!: string | null;`
          expect(response.body.username).toBeNull(); // Or .toBeUndefined() if that's the case
          expect(response.body.id).toBeDefined();
          expect(response.body).not.toHaveProperty('password_hash');
          expect(response.body).not.toHaveProperty(
            'current_hashed_refresh_token',
          );
        });
    });

    describe('Validation Errors (400 Bad Request)', () => {
      const testCases = [
        {
          description: 'should fail if email is missing',
          payload: { username: 'testuser', password: 'Password123!' },
          expectedErrorField: 'email',
        },
        {
          description: 'should fail if email is invalid',
          payload: {
            email: 'notanemail',
            username: 'testuser',
            password: 'Password123!',
          },
          expectedErrorField: 'email',
        },
        {
          description: 'should fail if password is missing',
          payload: { email: 'test@example.com', username: 'testuser' },
          expectedErrorField: 'password',
        },
        {
          description: 'should fail if password is too short',
          payload: {
            email: 'test@example.com',
            username: 'testuser',
            password: 'short',
          },
          expectedErrorField: 'password',
        },
        {
          description: 'should fail if username is too short (when provided)',
          payload: {
            email: 'test@example.com',
            username: 'us',
            password: 'Password123!',
          },
          expectedErrorField: 'username',
        },
      ];

      testCases.forEach(({ description, payload, expectedErrorField }) => {
        it(description, () => {
          return request(httpServer)
            .post(`${apiPrefix}${registerUrl}`)
            .send(payload)
            .expect(HttpStatus.BAD_REQUEST)
            .then((response: { body: ApiValidationErrorResponse }) => {
              // <--- Type the response body here
              expect(response.body).toBeDefined();
              expect(response.body.statusCode).toEqual(HttpStatus.BAD_REQUEST);
              expect(response.body.message).toBeInstanceOf(Array);
              expect(response.body.message.length).toBeGreaterThan(0);

              // Check if at least one error message relates to the expected field
              const foundRelevantMessage = response.body.message.some(
                (msg: string) =>
                  msg.toLowerCase().includes(expectedErrorField.toLowerCase()),
              );
              expect(foundRelevantMessage).toBe(true);
              // The 'hasExpectedFieldError' variable was unused, so I've integrated its logic directly.

              expect(response.body.error).toEqual('Bad Request');
            });
        });
      });
    });

    describe('Conflict Errors (409 Conflict)', () => {
      const baseUser = {
        email: `conflictuser${Date.now()}@example.com`,
        username: `conflictuser${Date.now()}`,
        password: 'Password123!',
      };

      // Register a user once to create the conflict for subsequent tests
      beforeAll(async () => {
        await request(httpServer)
          .post(`${apiPrefix}${registerUrl}`)
          .send(baseUser)
          .expect(HttpStatus.CREATED);
        // Add email to cleanup array if you have a global cleanup strategy
        createdUserEmails.push(baseUser.email);
      });

      it('should fail if email already exists (409)', () => {
        const conflictingPayload = {
          ...baseUser, // Uses the same email as baseUser
          username: `newusername${Date.now()}`, // Different username
          password: 'AnotherPassword123!',
        };

        return request(httpServer)
          .post(`${apiPrefix}${registerUrl}`)
          .send(conflictingPayload)
          .expect(HttpStatus.CONFLICT)
          .then((response: { body: ApiSimpleErrorResponse }) => {
            // <--- Type the response body here
            expect(response.body).toBeDefined();
            expect(response.body.statusCode).toEqual(HttpStatus.CONFLICT);
            // Adjust this to match your API's exact error message for duplicate email
            expect(response.body.message.toLowerCase()).toContain(
              'email already exists',
            );
            expect(response.body.error).toEqual('Conflict');
          });
      });

      it('should fail if username already exists (409)', () => {
        const conflictingPayload = {
          ...baseUser, // Uses the same username as baseUser
          email: `newemail${Date.now()}@example.com`, // Different email
          password: 'YetAnotherPassword123!',
        };

        return request(httpServer)
          .post(`${apiPrefix}${registerUrl}`)
          .send(conflictingPayload)
          .expect(HttpStatus.CONFLICT)
          .then((response: { body: ApiSimpleErrorResponse }) => {
            // <--- Type the response body here
            expect(response.body).toBeDefined();
            expect(response.body.statusCode).toEqual(HttpStatus.CONFLICT);
            // Adjust this to match your API's exact error message for duplicate username
            expect(response.body.message.toLowerCase()).toContain(
              'username already exists',
            );
            expect(response.body.error).toEqual('Conflict');
          });
      });
    }); // End of /auth/register tests

    describe('POST /auth/login', () => {
      const loginUrl = '/auth/login';
      const registerUrl = '/auth/register'; // Needed to create a user for login

      const loginUserCredentials = {
        email: `loginuser${Date.now()}@example.com`,
        password: 'PasswordForLogin123!',
        username: `loginuser${Date.now()}`,
      };
      let createdUser: UserResponse; // Declare createdUser here, so it's accessible in the 'it' blocks

      beforeAll(async () => {
        // Register a user to be used for login tests
        const response = await request(httpServer) // 'response' is now used
          .post(`${apiPrefix}${registerUrl}`)
          .send(loginUserCredentials)
          .expect(HttpStatus.CREATED);
        createdUser = response.body as UserResponse; // Assign the created user's details
      });

      it('should successfully log in an existing user (200)', () => {
        const loginPayload = {
          email: loginUserCredentials.email,
          password: loginUserCredentials.password,
        };

        return request(httpServer)
          .post(`${apiPrefix}${loginUrl}`)
          .send(loginPayload)
          .expect(HttpStatus.OK)
          .then((response: { body: LoginResponse }) => {
            expect(response.body).toBeDefined();
            expect(response.body.accessToken).toBeDefined();
            expect(response.body.accessToken).toEqual(expect.any(String));
            expect(response.body.refreshToken).toBeDefined();
            expect(response.body.refreshToken).toEqual(expect.any(String));

            expect(response.body.user).toBeDefined();
            expect(response.body.user.id).toEqual(createdUser.id); // Now createdUser is defined
            expect(response.body.user.email).toEqual(
              loginUserCredentials.email,
            );
            expect(response.body.user.username).toEqual(
              loginUserCredentials.username,
            );
            expect(response.body.user).not.toHaveProperty('password_hash');
          });
      });

      it('should fail to log in with a non-existent email (401)', () => {
        const loginPayload = {
          email: 'nonexistentuser@example.com',
          password: loginUserCredentials.password,
        };

        return request(httpServer)
          .post(`${apiPrefix}${loginUrl}`)
          .send(loginPayload)
          .expect(HttpStatus.UNAUTHORIZED)
          .then((response: { body: ApiSimpleErrorResponse }) => {
            expect(response.body).toBeDefined();
            expect(response.body.statusCode).toEqual(HttpStatus.UNAUTHORIZED);
            expect(response.body.message.toLowerCase()).toEqual(
              'invalid credentials. user not found.',
            );
          });
      });

      it('should fail to log in with an incorrect password (401)', () => {
        const loginPayload = {
          email: loginUserCredentials.email,
          password: 'WrongPassword123!',
        };

        return request(httpServer)
          .post(`${apiPrefix}${loginUrl}`)
          .send(loginPayload)
          .expect(HttpStatus.UNAUTHORIZED)
          .then((response: { body: ApiSimpleErrorResponse }) => {
            expect(response.body).toBeDefined();
            expect(response.body.statusCode).toEqual(HttpStatus.UNAUTHORIZED);
            expect(response.body.message.toLowerCase()).toContain(
              'invalid credentials',
            );
          });
      });

      describe('Validation Errors (400 Bad Request) for Login', () => {
        // Assuming your LoginDto requires email and password
        // and might have specific format requirements (e.g., IsEmail for email)
        const testCases = [
          {
            description: 'should fail if email is missing',
            payload: { password: 'Password123!' },
            expectedErrorField: 'email',
          },
          {
            description: 'should fail if email is not a valid email format',
            payload: { email: 'notanemail', password: 'Password123!' },
            expectedErrorField: 'email', // Assuming @IsEmail() is on LoginDto.email
          },
          {
            description: 'should fail if password is missing',
            payload: { email: 'test@example.com' },
            expectedErrorField: 'password',
          },
          // Add more cases if your LoginDto has other validations (e.g., IsNotEmpty)
          {
            description: 'should fail if email is an empty string',
            payload: { email: '', password: 'Password123!' },
            expectedErrorField: 'email', // Assuming @IsNotEmpty() or similar
          },
          {
            description: 'should fail if password is an empty string',
            payload: { email: 'test@example.com', password: '' },
            expectedErrorField: 'password', // Assuming @IsNotEmpty() or similar
          },
        ];

        testCases.forEach(({ description, payload, expectedErrorField }) => {
          it(description, () => {
            return request(httpServer)
              .post(`${apiPrefix}${loginUrl}`)
              .send(payload)
              .expect(HttpStatus.BAD_REQUEST)
              .then((response: { body: ApiValidationErrorResponse }) => {
                expect(response.body).toBeDefined();
                expect(response.body.statusCode).toEqual(
                  HttpStatus.BAD_REQUEST,
                );
                expect(response.body.message).toBeInstanceOf(Array);
                expect(response.body.message.length).toBeGreaterThan(0);

                const foundRelevantMessage = response.body.message.some(
                  (msg: string) =>
                    msg
                      .toLowerCase()
                      .includes(expectedErrorField.toLowerCase()),
                );
                expect(foundRelevantMessage).toBe(true);
                expect(response.body.error).toEqual('Bad Request');
              });
          });
        });
      }); // End of Validation Errors for Login
    }); // End of /auth/login tests

    describe('GET /auth/me', () => {
      const meUrl = '/auth/me';
      const registerUrl = '/auth/register'; // For setup
      const loginUrl = '/auth/login'; // For setup

      let userAuthDetails: {
        credentials: { email: string; password: string; username: string };
        tokens: { accessToken: string; refreshToken: string };
        userResponse: UserResponse;
      };

      beforeAll(async () => {
        // 1. Register a new user
        const uniqueSuffix = Date.now();
        const credentials = {
          email: `me-user-${uniqueSuffix}@example.com`,
          password: 'PasswordForMeTest123!',
          username: `me-user-${uniqueSuffix}`,
        };

        const registerResponse = await request(httpServer)
          .post(`${apiPrefix}${registerUrl}`)
          .send(credentials)
          .expect(HttpStatus.CREATED);
        const registeredUser = registerResponse.body as UserResponse;

        // 2. Log in to get tokens
        const loginResponse = await request(httpServer)
          .post(`${apiPrefix}${loginUrl}`)
          .send({ email: credentials.email, password: credentials.password }) // Using email for login
          .expect(HttpStatus.OK);
        const loginData = loginResponse.body as LoginResponse;

        userAuthDetails = {
          credentials,
          tokens: {
            accessToken: loginData.accessToken,
            refreshToken: loginData.refreshToken,
          },
          userResponse: registeredUser,
        };
      });

      it('should return current user details with a valid access token (200)', () => {
        return request(httpServer)
          .get(`${apiPrefix}${meUrl}`)
          .set('Authorization', `Bearer ${userAuthDetails.tokens.accessToken}`)
          .expect(HttpStatus.OK)
          .then((response: { body: UserResponse }) => {
            expect(response.body).toBeDefined();
            expect(response.body.id).toEqual(userAuthDetails.userResponse.id);
            expect(response.body.email).toEqual(
              userAuthDetails.credentials.email,
            );
            expect(response.body.username).toEqual(
              userAuthDetails.credentials.username,
            );
            expect(response.body).not.toHaveProperty('password_hash');
            expect(response.body).not.toHaveProperty(
              'current_hashed_refresh_token',
            );
          });
      });

      it('should fail if no access token is provided (401)', () => {
        return (
          request(httpServer)
            .get(`${apiPrefix}${meUrl}`)
            // No Authorization header is set
            .expect(HttpStatus.UNAUTHORIZED)
            .then((response: { body: ApiSimpleErrorResponse }) => {
              expect(response.body).toBeDefined();
              expect(response.body.statusCode).toEqual(HttpStatus.UNAUTHORIZED);
              expect(response.body.message.toLowerCase()).toEqual(
                'no auth token',
              );
            })
        );
      });

      it('should fail if an invalid access token is provided (401)', () => {
        const invalidToken = 'this.is.not.a.valid.jwt.token';

        return request(httpServer)
          .get(`${apiPrefix}${meUrl}`)
          .set('Authorization', `Bearer ${invalidToken}`)
          .expect(HttpStatus.UNAUTHORIZED)
          .then((response: { body: ApiSimpleErrorResponse }) => {
            expect(response.body).toBeDefined();
            expect(response.body.statusCode).toEqual(HttpStatus.UNAUTHORIZED);
            // The message for an invalid/malformed token might be "Unauthorized",
            // "jwt malformed", "invalid token", or similar, depending on your JWT strategy.
            // Check your actual API response for the exact message.
            expect(response.body.message.toLowerCase()).toEqual(
              'jwt malformed',
            );
          });
      });
    }); // End of /auth/me tests

    describe('POST /auth/refresh', () => {
      const refreshUrl = '/auth/refresh';
      const registerUrl = '/auth/register';
      const loginUrl = '/auth/login';
      const meUrl = '/auth/me'; // To verify the new access token

      let initialAuthData: {
        credentials: { email: string; password: string; username: string };
        loginResponse: LoginResponse; // Contains initial tokens and user
      };

      beforeAll(async () => {
        // 1. Register a new user
        const uniqueSuffix = Date.now();
        const credentials = {
          email: `refresh-user-${uniqueSuffix}@example.com`,
          password: 'PasswordForRefreshTest123!',
          username: `refresh-user-${uniqueSuffix}`,
        };

        await request(httpServer)
          .post(`${apiPrefix}${registerUrl}`)
          .send(credentials)
          .expect(HttpStatus.CREATED);

        // 2. Log in to get initial tokens
        const loginResponse = await request(httpServer)
          .post(`${apiPrefix}${loginUrl}`)
          .send({ email: credentials.email, password: credentials.password })
          .expect(HttpStatus.OK);

        initialAuthData = {
          credentials,
          loginResponse: loginResponse.body as LoginResponse,
        };
      });

      it('should return new access and refresh tokens with a valid refresh token (200)', async () => {
        // Ensure we have a refresh token to use
        expect(initialAuthData.loginResponse.refreshToken).toBeDefined();

        const refreshPayload = {
          refreshToken: initialAuthData.loginResponse.refreshToken,
        };

        const refreshResponse = await request(httpServer)
          .post(`${apiPrefix}${refreshUrl}`)
          .send(refreshPayload) // Assuming RefreshTokenDto takes refreshToken in body
          .expect(HttpStatus.OK);

        const newTokens = refreshResponse.body as RefreshTokenResponse;

        expect(newTokens).toBeDefined();
        expect(newTokens.accessToken).toBeDefined();
        expect(newTokens.accessToken).toEqual(expect.any(String));
        expect(newTokens.refreshToken).toBeDefined();
        expect(newTokens.refreshToken).toEqual(expect.any(String));

        // Ensure new tokens are different from the old ones
        expect(newTokens.accessToken).not.toEqual(
          initialAuthData.loginResponse.accessToken,
        );
        expect(newTokens.refreshToken).not.toEqual(
          initialAuthData.loginResponse.refreshToken,
        );

        // Optional: Verify the new access token works
        await request(httpServer)
          .get(`${apiPrefix}${meUrl}`)
          .set('Authorization', `Bearer ${newTokens.accessToken}`)
          .expect(HttpStatus.OK)
          .then((meResponse: { body: UserResponse }) => {
            // <--- Type meResponse.body here
            expect(meResponse.body.email).toEqual(
              initialAuthData.credentials.email,
            );
          });
      });

      it('should fail if an invalid refresh token is provided (401)', () => {
        const invalidRefreshToken = 'this.is.not.a.valid.refresh.token.at.all';
        // Or a token that might be structurally valid but not one issued by your system,
        // or one that has been deliberately malformed.
        // const structurallyValidButBogusToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJib2d1cy11c2VyIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

        const refreshPayload = {
          refreshToken: invalidRefreshToken,
        };

        return request(httpServer)
          .post(`${apiPrefix}${refreshUrl}`)
          .send(refreshPayload)
          .expect(HttpStatus.UNAUTHORIZED) // Or HttpStatus.FORBIDDEN if that's what your strategy throws
          .then((response: { body: ApiSimpleErrorResponse }) => {
            // Use UnauthorizedErrorResponse or a more specific one if needed
            expect(response.body).toBeDefined();
            expect(response.body.statusCode).toEqual(HttpStatus.UNAUTHORIZED); // Adjust if 403
            // The message will depend on how your JwtRefreshStrategy handles various invalid token scenarios
            // (e.g., "Unauthorized", "jwt malformed", "invalid token", "Refresh token malformed or invalid")
            // Check your actual API response for the exact message.
            // For a completely bogus token, "jwt malformed" or a generic "Unauthorized" is common.
            expect(response.body.message.toLowerCase()).toContain(
              'jwt malformed',
            ); // Or "jwt malformed", "invalid token" etc.
          });
      });

      describe('Validation Errors (when refresh token in DTO is problematic)', () => {
        const testCases = [
          {
            description:
              'should fail with 401 if refreshToken is missing in DTO',
            payload: {},
            expectedStatus: HttpStatus.UNAUTHORIZED,
            expectedMessageContains: 'no auth token', // Updated based on log
          },
          {
            description:
              'should fail with 401 if refreshToken in DTO is an empty string',
            payload: { refreshToken: '' },
            expectedStatus: HttpStatus.UNAUTHORIZED,
            expectedMessageContains: 'no auth token', // Updated based on log
          },
          {
            description:
              'should fail with 401 if refreshToken in DTO is not a string',
            payload: { refreshToken: 12345 },
            expectedStatus: HttpStatus.UNAUTHORIZED,
            expectedMessageContains: 'jwt must be a string', // Updated based on log
          },
        ];

        testCases.forEach(
          ({
            description,
            payload,
            expectedStatus,
            expectedMessageContains,
          }) => {
            it(description, () => {
              return request(httpServer)
                .post(`${apiPrefix}${refreshUrl}`)
                .send(payload)
                .expect(expectedStatus)
                .then((response: { body: ApiSimpleErrorResponse }) => {
                  expect(response.body).toBeDefined();
                  expect(response.body.statusCode).toEqual(expectedStatus);
                  // Using .toEqual() for exact match after toLowerCase()
                  expect(response.body.message.toLowerCase()).toEqual(
                    expectedMessageContains.toLowerCase(),
                  );
                  // expect(response.body.error).toEqual('Unauthorized'); // Usually 'Unauthorized' for 401s
                });
            });
          },
        );
      }); // End of Validation Errors for Refresh Token DTO
    }); // End of /auth/refresh tests

    describe('POST /auth/logout', () => {
      const logoutUrl = '/auth/logout';
      const registerUrl = '/auth/register';
      const loginUrl = '/auth/login';

      let userAuthDetails: {
        accessToken: string;
      };

      beforeEach(async () => {
        // 1. Register a new user
        const uniqueSuffix = Date.now();
        const credentials = {
          email: `logout-user-${uniqueSuffix}@example.com`,
          password: 'PasswordForLogoutTest123!',
          username: `logout-user-${uniqueSuffix}`,
        };

        await request(httpServer)
          .post(`${apiPrefix}${registerUrl}`)
          .send(credentials)
          .expect(HttpStatus.CREATED);

        // 2. Log in to get tokens
        const loginResponse = await request(httpServer)
          .post(`${apiPrefix}${loginUrl}`)
          .send({ email: credentials.email, password: credentials.password })
          .expect(HttpStatus.OK);
        const loginData = loginResponse.body as LoginResponse;

        userAuthDetails = {
          accessToken: loginData.accessToken,
        };
      });

      it('should successfully log out a user with a valid access token (200)', () => {
        return request(httpServer)
          .post(`${apiPrefix}${logoutUrl}`)
          .set('Authorization', `Bearer ${userAuthDetails.accessToken}`)
          .expect(HttpStatus.OK)
          .then((response: { body: LogoutResponse }) => {
            // <--- Type response.body here
            expect(response.body).toBeDefined();
            expect(response.body.message).toEqual(
              'Logout successful.',
            );
          });
      });

      it('should fail if no access token is provided (401)', () => {
        return (
          request(httpServer)
            .post(`${apiPrefix}${logoutUrl}`)
            // No Authorization header is set
            .expect(HttpStatus.UNAUTHORIZED)
            .then((response: { body: ApiSimpleErrorResponse }) => {
              expect(response.body).toBeDefined();
              expect(response.body.statusCode).toEqual(HttpStatus.UNAUTHORIZED);
              // The message might be generic like "Unauthorized" or more specific
              // like "No auth token" depending on your JwtAuthGuard.
              // Check your actual API response for the exact message.
              expect(response.body.message.toLowerCase()).toContain(
                'no auth token',
              ); // Or "no auth token"
              // if (response.body.error) {
              //   expect(response.body.error.toLowerCase()).toEqual('unauthorized');
              // }
            })
        );
      });
    }); // End of /auth/logout tests
  });
});
