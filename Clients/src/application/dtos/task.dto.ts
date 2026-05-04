/**
 * Data Transfer Objects (DTOs) for Task entity
 *
 * DTOs represent the data structure as it comes from the API.
 * They are separate from domain models to maintain a clear boundary
 * between infrastructure (API) and domain layers.
 */

/**
 * Task assignee DTO
 */
export interface TaskAssigneeDTO {
  user_id: number;
  user_name: string;
  user_avatar?: string;
  assigned_at?: string; // ISO date string from API
}

/**
 * Task data as received from API
 * Uses snake_case to match API response format
 */
export interface TaskResponseDTO {
  id?: number;
  title: string;
  description?: string;
  creator_id: number;
  organization_id?: number;
  due_date?: string; // ISO date string from API
  priority: string; // TaskPriority enum as string
  status: string; // TaskStatus enum as string
  categories?: string[];
  created_at?: string; // ISO date string from API
  updated_at?: string; // ISO date string from API
  creator_name?: string;
  assignees?: TaskAssigneeDTO[];
  isOverdue?: boolean;
}

/**
 * Paginated task response DTO
 */
export interface PaginatedTaskResponseDTO {
  data: TaskResponseDTO[];
  pagination?: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

/**
 * Data for creating a new task
 * Matches API request format
 */
export interface CreateTaskDTO {
  title: string;
  description?: string;
  creator_id: number;
  organization_id?: number;
  due_date?: string; // ISO date string
  priority: string; // TaskPriority enum as string
  status: string; // TaskStatus enum as string
  categories?: string[];
  assignees?: number[]; // Array of user IDs
}

/**
 * Data for updating an existing task
 * All fields optional for partial updates
 */
export interface UpdateTaskDTO {
  title?: string;
  description?: string;
  due_date?: string;
  priority?: string;
  status?: string;
  categories?: string[];
  assignees?: number[];
}

/**
 * Task filter parameters DTO
 */
export interface TaskFilterDTO {
  status?: string[];
  priority?: string[];
  category?: string[];
  assignee?: number[];
  due_date_start?: string;
  due_date_end?: string;
  search?: string;
  include_archived?: boolean;
  sort_by?: "due_date" | "priority" | "created_at";
  sort_order?: "ASC" | "DESC";
  page?: string;
  page_size?: string;
}
