/**
 * User Mapper
 *
 * Maps between User DTOs (API layer) and User domain models.
 * Handles data transformation, type conversion, and validation.
 */

import { UserModel } from "../../domain/models/Common/user/user.model";
import { UserResponseDTO, CreateUserDTO, UpdateUserDTO } from "../dtos/user.dto";
import { User } from "../../domain/types/User";

/**
 * Maps a UserResponseDTO to a User domain type
 *
 * @param dto - User response DTO from API
 * @returns User domain type
 */
export function mapUserResponseDTOToUser(dto: UserResponseDTO): User {
  return {
    id: dto.id,
    name: dto.name,
    surname: dto.surname,
    email: dto.email,
    password_hash: dto.password_hash,
    role_id: dto.role_id,
    roleId: dto.role_id, // Map role_id to roleId for frontend compatibility
    created_at: dto.created_at ? new Date(dto.created_at) : undefined,
    last_login: dto.last_login ? new Date(dto.last_login) : undefined,
    is_demo: dto.is_demo,
    organization_id: dto.organization_id,
    pwd_set: dto.pwd_set,
  };
}

/**
 * Maps a UserResponseDTO to a UserModel
 *
 * @param dto - User response DTO from API
 * @returns UserModel instance
 */
export function mapUserResponseDTOToModel(dto: UserResponseDTO): UserModel {
  const userData: UserModel = {
    id: dto.id,
    name: dto.name,
    surname: dto.surname,
    email: dto.email,
    password_hash: dto.password_hash,
    role_id: dto.role_id,
    roleId: dto.role_id,
    created_at: dto.created_at ? new Date(dto.created_at) : undefined,
    last_login: dto.last_login ? new Date(dto.last_login) : undefined,
  };

  return new UserModel(userData);
}

/**
 * Maps an array of UserResponseDTOs to User domain types
 *
 * @param dtos - Array of user response DTOs
 * @returns Array of User domain types
 */
export function mapUserResponseDTOsToUsers(dtos: UserResponseDTO[]): User[] {
  return dtos.map(mapUserResponseDTOToUser);
}

/**
 * Maps an array of UserResponseDTOs to UserModel instances
 *
 * @param dtos - Array of user response DTOs
 * @returns Array of UserModel instances
 */
export function mapUserResponseDTOsToModels(dtos: UserResponseDTO[]): UserModel[] {
  return dtos.map(mapUserResponseDTOToModel);
}

/**
 * Maps a User domain type to CreateUserDTO
 *
 * @param user - User domain type
 * @param password - Password for new user
 * @returns CreateUserDTO
 */
export function mapUserToCreateDTO(user: Partial<User>, password: string): CreateUserDTO {
  return {
    name: user.name || "",
    surname: user.surname || "",
    email: user.email || "",
    password,
    role_id: user.role_id || user.roleId,
    organization_id: user.organization_id,
  };
}

/**
 * Maps a User domain type to UpdateUserDTO
 *
 * @param user - User domain type with fields to update
 * @returns UpdateUserDTO
 */
export function mapUserToUpdateDTO(user: Partial<User>): UpdateUserDTO {
  return {
    name: user.name,
    surname: user.surname,
    email: user.email,
    role_id: user.role_id || user.roleId,
    organization_id: user.organization_id,
  };
}
