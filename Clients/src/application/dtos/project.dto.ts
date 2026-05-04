/**
 * Data Transfer Objects (DTOs) for Project entity
 *
 * DTOs represent the data structure as it comes from the API.
 * They are separate from domain models to maintain a clear boundary
 * between infrastructure (API) and domain layers.
 */

/**
 * Framework information in project response
 */
export interface ProjectFrameworkDTO {
  project_framework_id: number;
  framework_id: number;
  name: string;
}

/**
 * Project data as received from API
 * Uses snake_case to match API response format
 */
export interface ProjectResponseDTO {
  id: number;
  uc_id?: string;
  project_title: string;
  owner: number;
  members: string[] | number[]; // Can be IDs or names depending on API
  start_date: string; // ISO date string from API
  ai_risk_classification: number | string; // Can be number or enum string
  type_of_high_risk_role: number | string; // Can be number or enum string
  goal: string;
  last_updated: string; // ISO date string from API
  last_updated_by: number;
  framework?: ProjectFrameworkDTO[];
  monitored_regulations_and_standards?: string[] | number[];
  geography?: number;
  target_industry?: string;
  description?: string;
  is_organizational?: boolean;
  status?: string;
  is_demo?: boolean;
  created_at?: string; // ISO date string from API

  // Statistical fields (may be included in response)
  doneSubcontrols?: number;
  totalSubcontrols?: number;
  answeredAssessments?: number;
  totalAssessments?: number;
}

/**
 * Project member DTO for create/update operations
 */
export interface ProjectMemberDTO {
  _id: number;
  name: string;
  surname: string;
  email: string;
}

/**
 * Data for creating a new project
 * Matches API request format
 */
export interface CreateProjectDTO {
  project_title: string;
  owner: number;
  members: ProjectMemberDTO[];
  start_date: string; // ISO date string
  ai_risk_classification: number;
  type_of_high_risk_role: number;
  goal: string;
  framework_type?: string;
  geography?: number;
  target_industry?: string;
  description?: string;
  enable_ai_data_insertion?: boolean;
  monitored_regulations_and_standards?: Array<{ _id: number; name: string }>;
}

/**
 * Data for updating an existing project
 * All fields optional for partial updates
 */
export interface UpdateProjectDTO {
  project_title?: string;
  owner?: number;
  members?: ProjectMemberDTO[];
  start_date?: string;
  ai_risk_classification?: number;
  type_of_high_risk_role?: number;
  goal?: string;
  framework_type?: string;
  geography?: number;
  target_industry?: string;
  description?: string;
  status?: number;
  monitored_regulations_and_standards?: Array<{ _id: number; name: string }>;
}

/**
 * Project progress data DTO
 */
export interface ProjectProgressDTO {
  doneSubcontrols?: number;
  totalSubcontrols?: number;
  answeredAssessments?: number;
  totalAssessments?: number;
  [key: string]: unknown; // Allow additional fields
}
