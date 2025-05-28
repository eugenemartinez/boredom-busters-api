/**
 * Represents the common structure of a user object returned by API endpoints.
 */
export interface UserResponse {
  id: string;
  email: string;
  username?: string | null;
  // Add other common, non-sensitive fields if applicable (e.g., created_at)
}

/**
 * Represents the response structure for a successful login.
 */
export interface LoginResponse {
  user: UserResponse;
  accessToken: string;
  refreshToken: string;
}

/**
 * Generic API error response structure.
 */
export interface ApiErrorResponse {
  statusCode: number;
  message: string | string[]; // Can be a single message or an array for validation errors
  error?: string; // Optional, often "Bad Request", "Unauthorized", "Conflict", etc.
}

/**
 * Specific error response for validation failures where 'message' is always an array.
 */
export interface ApiValidationErrorResponse extends ApiErrorResponse {
  message: string[];
  error: string; // Typically "Bad Request"
}

/**
 * Specific error response for errors that typically have a single string message.
 */
export interface ApiSimpleErrorResponse extends ApiErrorResponse {
  message: string;
  error: string; // e.g., "Conflict", "Unauthorized"
}

/**
 * Response for the /auth/refresh endpoint.
 */
export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * Response for a successful /auth/logout.
 */
export interface LogoutResponse {
  message: string;
}

/**
 * Payload for creating a new activity.
 * Mirrors CreateActivityDto.
 */
export interface CreateActivityPayload {
  title: string;
  description: string;
  type: string;
  participants_min?: number | null;
  participants_max?: number | null;
  cost_level?: string; // Assuming CostLevel enum values are strings like 'FREE', 'LOW', etc.
  duration_min?: number | null;
  duration_max?: number | null;
}

/**
 * Represents the structure of an activity object returned by API endpoints.
 */
export interface ActivityResponse {
  id: string;
  title: string;
  description: string;
  type: string;
  participants_min: number | null;
  participants_max: number | null;
  cost_level: string | null; // Assuming CostLevel enum values are strings
  duration_min: number | null;
  duration_max: number | null;
  contributor_name: string | null; // Name of the user who submitted it
  user_id: string; // ID of the user who submitted it
  created_at: string; // ISO date string
  updated_at: string; // ISO date string
  // Add any other fields that are part of the activity response
}
