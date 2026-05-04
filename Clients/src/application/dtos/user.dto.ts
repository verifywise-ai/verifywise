/**
 * Data Transfer Objects (DTOs) for User entity
 *
 * DTOs represent the data structure as it comes from the API.
 * They are separate from domain models to maintain a clear boundary
 * between infrastructure (API) and domain layers.
 */

/**
 * User data as received from API
 * Uses snake_case to match API response format
 */
export interface UserResponseDTO {
  id: number;
  name: string;
  surname: string;
  email: string;
  password_hash?: string;
  role_id?: number;
  created_at?: string; // ISO date string from API
  last_login?: string; // ISO date string from API
  is_demo?: boolean;
  organization_id?: number;
  pwd_set?: boolean;
}

/**
 * Data for creating a new user
 * Matches API request format
 */
export interface CreateUserDTO {
  name: string;
  surname: string;
  email: string;
  password: string;
  role_id?: number;
  organization_id?: number;
}

/**
 * Data for updating an existing user
 * All fields optional for partial updates
 */
export interface UpdateUserDTO {
  name?: string;
  surname?: string;
  email?: string;
  role_id?: number;
  organization_id?: number;
}

/**
 * Login credentials DTO
 */
export interface LoginCredentialsDTO {
  email: string;
  password: string;
}

/**
 * Login response DTO
 */
export interface LoginResponseDTO {
  token: string;
}

/**
 * Password change request DTO
 */
export interface PasswordChangeDTO {
  id: number | string;
  currentPassword: string;
  newPassword: string;
}

/**
 * Password change response DTO
 */
export interface PasswordChangeResponseDTO {
  message: string;
}

/**
 * User exists check response DTO
 */
export interface UserExistsResponseDTO {
  exists: boolean;
}

/**
 * Delete response DTO
 */
export interface DeleteResponseDTO {
  message: string;
}

/**
 * Profile photo response DTO
 */
export interface ProfilePhotoResponseDTO {
  photoUrl?: string;
  message?: string;
  photo?: unknown | null;
}
