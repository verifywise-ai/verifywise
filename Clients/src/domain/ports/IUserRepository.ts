/**
 * User Repository Interface
 *
 * Defines the contract for user data access operations.
 */

import { ApiResponse } from "./IBaseRepository";

/**
 * User entity from domain
 */
export interface User {
  id: number;
  name: string;
  surname: string;
  email: string;
  role_id?: number;
  organization_id?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Data for creating a new user
 */
export interface CreateUserDTO {
  name: string;
  surname: string;
  email: string;
  password: string;
  roleId?: number;
  role_id?: number;
  organizationId?: number;
  organization_id?: number;
}

/**
 * Data for updating a user
 */
export interface UpdateUserDTO {
  name?: string;
  surname?: string;
  email?: string;
  roleId?: number;
  organizationId?: number;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Login response
 */
export interface LoginResponse {
  data: {
    token: string;
  };
}

/**
 * User Repository Interface
 */
export interface IUserRepository {
  /**
   * Get a user by their ID
   */
  getById(userId: number | string): Promise<ApiResponse<User>>;

  /**
   * Get all users
   */
  getAll(): Promise<ApiResponse<User[]>>;

  /**
   * Create a new user
   */
  create(userData: CreateUserDTO, headers?: Record<string, string>): Promise<ApiResponse<User>>;

  /**
   * Update a user by ID
   */
  update(userId: number | string, userData: UpdateUserDTO): Promise<ApiResponse<User>>;

  /**
   * Delete a user by ID
   */
  delete(userId: number | string): Promise<ApiResponse<{ message: string }>>;

  /**
   * Update user password
   */
  updatePassword(
    userId: number | string,
    currentPassword: string,
    newPassword: string,
  ): Promise<ApiResponse<{ message: string }>>;

  /**
   * Check if any user exists
   */
  checkExists(): Promise<{ exists: boolean }>;

  /**
   * Login user
   */
  login(credentials: LoginCredentials): Promise<ApiResponse<LoginResponse>>;

  /**
   * Upload user profile photo
   */
  uploadProfilePhoto(
    userId: number | string,
    photoFile: File,
  ): Promise<ApiResponse<{ photoUrl?: string; message?: string }>>;

  /**
   * Get user profile photo
   */
  getProfilePhoto(userId: number | string): Promise<{ photo?: unknown | null }>;

  /**
   * Delete user profile photo
   */
  deleteProfilePhoto(userId: number | string): Promise<ApiResponse<{ message: string }>>;
}
