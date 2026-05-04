/**
 * Domain Ports (Repository Interfaces)
 *
 * This module exports all repository interfaces that define the contracts
 * for data access operations. These interfaces represent the "ports" in
 * hexagonal/clean architecture, allowing the domain layer to remain
 * independent of specific infrastructure implementations.
 *
 * Repository implementations in the application layer should implement
 * these interfaces to ensure consistency and enable dependency injection.
 */

// Base/Common
export type {
  IBaseRepository,
  PaginatedResponse,
  QueryOptions,
  ApiResponse,
} from "./IBaseRepository";

// Entity Repositories
export type {
  IUserRepository,
  User,
  CreateUserDTO,
  UpdateUserDTO,
  LoginCredentials,
  LoginResponse,
} from "./IUserRepository";

export type {
  IProjectRepository,
  Project,
  CreateProjectDTO,
  UpdateProjectDTO,
  ProjectProgressData,
} from "./IProjectRepository";

export type { ITaskRepository, TaskFilterOptions } from "./ITaskRepository";

export type {
  IVendorRepository,
  Vendor,
  CreateVendorDTO,
  UpdateVendorDTO,
} from "./IVendorRepository";

export type {
  IOrganizationRepository,
  Organization,
  CreateOrganizationDTO,
  UpdateOrganizationDTO,
} from "./IOrganizationRepository";

export type {
  IPolicyRepository,
  Policy,
  CreatePolicyDTO,
  UpdatePolicyDTO,
} from "./IPolicyRepository";

export type {
  IRiskRepository,
  Risk,
  RiskWithMitigation,
  Mitigation,
  CreateRiskDTO,
  UpdateRiskDTO,
} from "./IRiskRepository";

export type {
  ISearchRepository,
  SearchResult,
  GroupedSearchResults,
  SearchResponse,
  SearchParams,
} from "./ISearchRepository";

export type {
  IAITrustCenterRepository,
  AITrustCenterOverview,
  AITrustCenterResource,
  AITrustCenterSubprocessor,
  LogoData,
} from "./IAITrustCenterRepository";
