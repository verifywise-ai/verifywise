/**
 * Task presentation-layer interfaces
 * Contains UI component props with callbacks and form error types
 */

import { ITask, ICreateTaskFormValues } from "../../../domain/interfaces/i.task";

// Re-export domain types for convenience
export type {
  ITask,
  ITaskAssignee,
  TaskSummary,
  TaskFilters,
  ICreateTaskFormValues,
  IEntityLink,
  EntityLinkType,
} from "../../../domain/interfaces/i.task";

/**
 * Props for create/edit task modal component
 */
export interface ICreateTaskProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  /**
   * On create, return `{ id }` of the newly-created task so the modal can
   * persist staged custom field values against it. Return void on edit.
   */
  onSuccess?: (
    data: ICreateTaskFormValues,
  ) => void | Promise<void> | Promise<{ id?: number } | void>;
  initialData?: ITask;
  mode?: "create" | "edit";
}

/**
 * Form validation errors for task creation/editing
 * Moved from domain layer as this is a UI concern
 */
export interface ICreateTaskFormErrors {
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  due_date?: string;
  assignees?: string;
  categories?: string;
}
