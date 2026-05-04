/**
 * DTOs (Data Transfer Objects) Index
 *
 * Central export point for all DTOs.
 * DTOs represent the data structure as it comes from the API,
 * providing a clear boundary between infrastructure and domain layers.
 */

// User DTOs
export type {
  UserResponseDTO,
  CreateUserDTO,
  UpdateUserDTO,
  LoginCredentialsDTO,
  LoginResponseDTO,
  PasswordChangeDTO,
  PasswordChangeResponseDTO,
  UserExistsResponseDTO,
  DeleteResponseDTO,
  ProfilePhotoResponseDTO,
} from "./user.dto";

// Project DTOs
export type {
  ProjectResponseDTO,
  ProjectFrameworkDTO,
  ProjectMemberDTO,
  CreateProjectDTO,
  UpdateProjectDTO,
  ProjectProgressDTO,
} from "./project.dto";

// Task DTOs
export type {
  TaskResponseDTO,
  TaskAssigneeDTO,
  PaginatedTaskResponseDTO,
  CreateTaskDTO,
  UpdateTaskDTO,
  TaskFilterDTO,
} from "./task.dto";

// Vendor DTOs
export type { VendorResponseDTO, CreateVendorDTO, UpdateVendorDTO } from "./vendor.dto";
