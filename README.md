<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<h1 align="center">Boredom Busters API</h1>

<p align="center">
  An API built with NestJS to help users discover and manage activities to combat boredom.
</p>

## Description

The Boredom Busters API provides a platform for users to find, create, and share activities. It features user authentication, activity management, and aims to be a go-to resource for anyone looking for interesting things to do.

## Features

*   User registration and authentication (JWT-based)
*   CRUD operations for activities
*   Ability for users to submit their own activities
*   PostgreSQL database with TypeORM

## Technology Stack

*   **Framework**: [NestJS](https://nestjs.com/) (TypeScript)
*   **Database**: PostgreSQL
*   **ORM**: [TypeORM](https://typeorm.io/)
*   **Authentication**: JWT (JSON Web Tokens)
*   **Validation**: Class Validator, Class Transformer

## Prerequisites

*   Node.js (v18.x or higher recommended)
*   npm (v9.x or higher) or yarn
*   PostgreSQL server (running locally or accessible)
*   Git

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/eugenemartinez/boredom-busters-api
cd boredom-busters-api
```

### 2. Install Dependencies

```bash
npm install
# or
# yarn install
```

### 3. Environment Configuration

This project uses `.env` files to manage environment-specific variables. An example configuration file (`.env.example`) is provided in the root of the repository.

1.  **Create your local environment file:**
    Copy the example file to create your local development environment file:
    ```bash
    cp .env.example .env.development
    ```

2.  **Configure `.env.development`:**
    Open the newly created `.env.development` file and replace the placeholder values with your actual local configuration details.

    Key variables to configure:
    *   `DATABASE_URL`: Your PostgreSQL connection string.
        *   Format: `postgresql://YOUR_DB_USER:YOUR_DB_PASSWORD@YOUR_DB_HOST:YOUR_DB_PORT/YOUR_DB_NAME`
        *   Example: `postgresql://postgres:mysecretpassword@localhost:5432/boredom_busters_dev`
    *   `JWT_SECRET`: A strong, unique random string for signing JWT access tokens.
    *   `JWT_REFRESH_SECRET`: A different strong, unique random string for signing JWT refresh tokens.
    *   `SEED_DB`: The PostgreSQL connection string for the database seeding script. For local development, this is often the same as `DATABASE_URL`.
        *   Format: `postgresql://YOUR_DB_USER:YOUR_DB_PASSWORD@YOUR_DB_HOST:YOUR_DB_PORT/YOUR_DB_NAME`
    *   `CORS_ALLOWED_ORIGINS`: Specify the origins allowed to access your API (e.g., your frontend application's URL). For multiple origins, separate them with commas.

    Other variables like `PORT`, `TYPEORM_SYNCHRONIZE`, `TYPEORM_LOGGING`, etc., are pre-configured with sensible defaults for development but can be adjusted as needed.

    **Important Security Note:**
    *   `TYPEORM_SYNCHRONIZE=true` is convenient for development as it automatically updates your database schema based on your entities. **Never use `TYPEORM_SYNCHRONIZE=true` in a production environment.** Use database migrations for schema changes in production.
    *   Ensure your JWT secrets are strong and kept confidential.

3.  **Other Environment Files:**
    *   `.env.test`: You may want to create this file for configuring the environment when running tests (e.g., using a separate test database). Copy `.env.example` to `.env.test` and adjust accordingly.
    *   For production deployments (e.g., on Vercel, Heroku, AWS), configure environment variables directly through your hosting provider's interface or service configuration. **Do not commit `.env` files containing production secrets to your repository.**

### 4. Database Setup

Ensure your PostgreSQL server is running and you have created a database for this project.

You can use the provided SQL script to set up the necessary tables:

1.  Connect to your PostgreSQL instance.
2.  Execute the SQL script located at `scripts/create_tables.sql` (or the one previously generated) in your database. This will create the `boredombusters_users` and `boredombusters_activities` tables.

Alternatively, if TypeORM migrations are set up (not detailed here but a common practice):
```bash
# npm run migration:run (example command, depends on your setup)
```

### 5. Seed the Database (Optional but Recommended)

To populate the database with initial users and activities:

```bash
npm run db:seed
```
This script uses the connection string defined in `SEED_DB` in your `.env.development` file.

## Running the Application

### Development Mode

```bash
npm run start
```
The application will start, typically on `http://localhost:3000`.

### Watch Mode (Recommended for Development)

```bash
npm run start:dev
```
The application will start and automatically restart when file changes are detected.

### Production Mode

```bash
# First, build the application
npm run build

# Then, start the production server
npm run start:prod
```

## Running Tests

### Unit Tests

```bash
npm run test
```

### End-to-End (E2E) Tests

Ensure your development database is running and configured correctly in your test environment variables if needed.

```bash
npm run test:e2e
```

### Test Coverage

```bash
npm run test:cov
```

## API Endpoints

The API provides endpoints for health checks, user authentication, user profile management, and activity management. All API routes are prefixed with `/api` (this can be configured via the `API_PREFIX` environment variable).

For detailed interactive API documentation, an OpenAPI (Swagger) specification is available when the application is running. Navigate to `/api` (or your configured Swagger UI path, typically the same as `API_PREFIX`) in your browser.

Here's a summary of the main endpoint groups:

### Application Health

*   **`GET /ping`**: Checks if the API is operational and responsive. Returns "pong".

### Authentication (`/auth`)

*   **`POST /auth/register`**: Register a new user.
*   **`POST /auth/login`**: Log in an existing user and receive access and refresh tokens.
*   **`GET /auth/me`**: Get the profile of the currently authenticated user.
*   **`GET /auth/status`**: Check the authentication status of the current user.
*   **`POST /auth/refresh`**: Refresh access and refresh tokens using a valid refresh token.
*   **`POST /auth/logout`**: Log out the current user (invalidates refresh token).

### Users (`/users`)

*   **`GET /users/me`**: Get the authenticated user's profile.
*   **`PATCH /users/me`**: Update the authenticated user's profile (e.g., username).
*   **`GET /users/me/activities`**: Get a paginated list of activities created by the authenticated user, with filtering and sorting options.

### Activities (`/activities`)

*   **`POST /activities`**: Create a new activity (requires authentication).
*   **`GET /activities`**: Get a paginated list of all activities, with filtering and sorting options.
*   **`GET /activities/random`**: Get a random activity, optionally filtered by type.
*   **`GET /activities/types`**: Get a list of all unique activity types available in the database.
*   **`GET /activities/{id}`**: Get a specific activity by its UUID.
*   **`PATCH /activities/{id}`**: Update an existing activity by its UUID (requires authentication and ownership).
*   **`DELETE /activities/{id}`**: Delete an activity by its UUID (requires authentication and ownership).

## Database Seeding

The project includes a script to seed the database with initial data (users and activities).

To run the seed script:
```bash
node ./scripts/seed_db.js
```
This script connects to the database specified by the `SEED_DB` environment variable and populates the `boredombusters_users` and `boredombusters_activities` tables. The seed data is sourced from `scripts/seed_db.json`.

## License

This project is [MIT licensed](LICENSE).
