/**
 * Mappers Index
 *
 * Central export point for all mapper functions.
 * Mappers convert between DTOs (API layer) and domain models.
 */

// User mappers
export {
  mapUserResponseDTOToUser,
  mapUserResponseDTOToModel,
  mapUserResponseDTOsToUsers,
  mapUserResponseDTOsToModels,
  mapUserToCreateDTO,
  mapUserToUpdateDTO,
} from "./user.mapper";

// Project mappers
export {
  mapProjectResponseDTOToProject,
  mapProjectResponseDTOToModel,
  mapProjectResponseDTOsToProjects,
  mapProjectResponseDTOsToModels,
  mapCreateProjectFormToDTO,
} from "./project.mapper";

// Task mappers
export {
  mapTaskAssigneeDTOToInterface,
  mapTaskAssigneeDTOToModel,
  mapTaskResponseDTOToInterface,
  mapTaskResponseDTOToModel,
  mapTaskResponseDTOsToInterfaces,
  mapTaskResponseDTOsToModels,
  mapTaskToCreateDTO,
  mapTaskToUpdateDTO,
} from "./task.mapper";

// Vendor mappers
export {
  mapVendorResponseDTOToModel,
  mapVendorResponseDTOsToModels,
  mapVendorToCreateDTO,
  mapVendorToUpdateDTO,
} from "./vendor.mapper";
