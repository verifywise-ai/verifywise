/**
 * Project Repository Interface
 *
 * Defines the contract for project data access operations.
 */

/**
 * Project entity
 */
export interface Project {
  id: number;
  project_title: string;
  owner: number;
  start_date?: string;
  ai_risk_classification?: string;
  type_of_high_risk_role?: string;
  goal?: string;
  last_updated?: string;
  created_at?: string;
  _source?: string;
}

/**
 * Data for creating a project
 */
export interface CreateProjectDTO {
  project_title: string;
  owner: number;
  start_date?: string;
  ai_risk_classification?: string;
  type_of_high_risk_role?: string;
  goal?: string;
}

/**
 * Data for updating a project
 */
export interface UpdateProjectDTO {
  project_title?: string;
  owner?: number;
  start_date?: string;
  ai_risk_classification?: string;
  type_of_high_risk_role?: string;
  goal?: string;
}

/**
 * Project progress data
 */
export interface ProjectProgressData {
  totalControls: number;
  completedControls: number;
  progressPercentage: number;
}

/**
 * Project Repository Interface
 */
export interface IProjectRepository {
  /**
   * Get all projects
   */
  getAll(options?: { signal?: AbortSignal }): Promise<Project[]>;

  /**
   * Get a project by ID
   */
  getById(id: string, options?: { signal?: AbortSignal }): Promise<Project>;

  /**
   * Create a new project
   */
  create(data: CreateProjectDTO): Promise<Project>;

  /**
   * Update a project
   */
  update(id: number, data: UpdateProjectDTO): Promise<Project>;

  /**
   * Delete a project
   */
  delete(id: number): Promise<void>;

  /**
   * Get project progress data
   */
  getProgressData(
    routeUrl: string,
    options?: { signal?: AbortSignal },
  ): Promise<ProjectProgressData>;
}
