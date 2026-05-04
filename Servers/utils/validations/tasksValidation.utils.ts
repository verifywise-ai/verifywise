/**
 * Tasks specific validation utilities
 * Contains validation schemas and functions specifically for task operations
 */

import {
  validateString,
  validateNumber,
  validateEnum,
  validateDate,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError,
} from "./validation.utils";
import { TaskPriority } from "../../domain.layer/enums/task-priority.enum";
import { TaskStatus } from "../../domain.layer/enums/task-status.enum";

/**
 * Validation constants for tasks
 */
export const TASKS_VALIDATION_LIMITS = {
  TITLE: { MIN: 3, MAX: 255 },
  DESCRIPTION: { MIN: 10, MAX: 2000 },
  CATEGORIES: { MIN_ITEMS: 0, MAX_ITEMS: 10, ITEM_MIN: 2, ITEM_MAX: 50 },
  ASSIGNEES: { MIN_ITEMS: 0, MAX_ITEMS: 20 },
} as const;

/**
 * Task priority enum values
 */
export const TASK_PRIORITY_ENUM = Object.values(TaskPriority);

/**
 * Task status enum values
 */
export const TASK_STATUS_ENUM = Object.values(TaskStatus);

/**
 * Valid sort fields for task queries
 */
export const TASK_SORT_FIELDS = ["due_date", "priority", "created_at"] as const;

/**
 * Valid sort orders
 */
export const SORT_ORDER_ENUM = ["ASC", "DESC"] as const;

/**
 * Validates task title field
 */
export const validateTaskTitle = (value: any): ValidationResult => {
  return validateString(value, "Task title", {
    required: true,
    minLength: TASKS_VALIDATION_LIMITS.TITLE.MIN,
    maxLength: TASKS_VALIDATION_LIMITS.TITLE.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates task description field (optional)
 */
export const validateTaskDescription = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Description is optional
  }

  return validateString(value, "Task description", {
    required: false,
    minLength: TASKS_VALIDATION_LIMITS.DESCRIPTION.MIN,
    maxLength: TASKS_VALIDATION_LIMITS.DESCRIPTION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates creator ID field
 */
export const validateCreatorId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Creator ID", true);
};

/**
 * Validates organization ID field
 */
export const validateOrganizationId = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Organization ID is optional
  }
  return validateForeignKey(value, "Organization ID", false);
};

/**
 * Validates due date field (optional)
 */
export const validateDueDate = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Due date is optional
  }

  return validateDate(value, "Due date", { required: false });
};

/**
 * Validates task priority field
 */
export const validateTaskPriority = (value: any): ValidationResult => {
  return validateEnum(value, "Task priority", TASK_PRIORITY_ENUM, true);
};

/**
 * Validates task status field
 */
export const validateTaskStatus = (value: any): ValidationResult => {
  return validateEnum(value, "Task status", TASK_STATUS_ENUM, true);
};

/**
 * Validates task categories array (optional)
 */
export const validateTaskCategories = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Categories are optional
  }

  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: "Categories must be an array",
      code: "INVALID_CATEGORIES_TYPE",
    };
  }

  if (value.length > TASKS_VALIDATION_LIMITS.CATEGORIES.MAX_ITEMS) {
    return {
      isValid: false,
      message: `Categories cannot exceed ${TASKS_VALIDATION_LIMITS.CATEGORIES.MAX_ITEMS} items`,
      code: "TOO_MANY_CATEGORIES",
    };
  }

  // Validate each category
  for (let i = 0; i < value.length; i++) {
    const category = value[i];
    const categoryValidation = validateString(category, `Category ${i + 1}`, {
      required: true,
      minLength: TASKS_VALIDATION_LIMITS.CATEGORIES.ITEM_MIN,
      maxLength: TASKS_VALIDATION_LIMITS.CATEGORIES.ITEM_MAX,
      trimWhitespace: true,
    });

    if (!categoryValidation.isValid) {
      return categoryValidation;
    }
  }

  return { isValid: true };
};

/**
 * Validates task assignees array (optional)
 */
export const validateTaskAssignees = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Assignees are optional
  }

  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: "Assignees must be an array",
      code: "INVALID_ASSIGNEES_TYPE",
    };
  }

  if (value.length > TASKS_VALIDATION_LIMITS.ASSIGNEES.MAX_ITEMS) {
    return {
      isValid: false,
      message: `Assignees cannot exceed ${TASKS_VALIDATION_LIMITS.ASSIGNEES.MAX_ITEMS} users`,
      code: "TOO_MANY_ASSIGNEES",
    };
  }

  // Validate each assignee ID
  for (let i = 0; i < value.length; i++) {
    const assigneeId = value[i];
    const assigneeValidation = validateNumber(assigneeId, `Assignee ${i + 1}`, {
      required: true,
      min: 1,
      integer: true,
    });

    if (!assigneeValidation.isValid) {
      return assigneeValidation;
    }
  }

  return { isValid: true };
};

/**
 * Validates task ID parameter
 */
export const validateTaskIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Task ID", true);
};

/**
 * Validates sort field for task queries
 */
export const validateSortField = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Sort field is optional
  }

  return validateEnum(value, "Sort field", TASK_SORT_FIELDS, false);
};

/**
 * Validates sort order for task queries
 */
export const validateSortOrder = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Sort order is optional
  }

  return validateEnum(value, "Sort order", SORT_ORDER_ENUM, false);
};

/**
 * Validates pagination parameters
 */
export const validatePagination = (page: any, pageSize: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (page !== undefined) {
    const pageValidation = validateNumber(page, "Page", {
      required: false,
      min: 1,
      max: 1000,
      integer: true,
    });
    if (!pageValidation.isValid) {
      errors.push({
        field: "page",
        message: pageValidation.message || "Invalid page number",
        code: pageValidation.code || "INVALID_PAGE",
      });
    }
  }

  if (pageSize !== undefined) {
    const pageSizeValidation = validateNumber(pageSize, "Page size", {
      required: false,
      min: 1,
      max: 100,
      integer: true,
    });
    if (!pageSizeValidation.isValid) {
      errors.push({
        field: "page_size",
        message: pageSizeValidation.message || "Invalid page size",
        code: pageSizeValidation.code || "INVALID_PAGE_SIZE",
      });
    }
  }

  return errors;
};

/**
 * Validation schema for creating a new task
 */
export const createTaskSchema = {
  title: validateTaskTitle,
  description: validateTaskDescription,
  creator_id: validateCreatorId,
  organization_id: validateOrganizationId,
  due_date: validateDueDate,
  priority: validateTaskPriority,
  status: validateTaskStatus,
  categories: validateTaskCategories,
  assignees: validateTaskAssignees,
};

/**
 * Validation schema for updating a task
 */
export const updateTaskSchema = {
  title: (value: any) => (value !== undefined ? validateTaskTitle(value) : { isValid: true }),
  description: (value: any) =>
    value !== undefined ? validateTaskDescription(value) : { isValid: true },
  due_date: (value: any) => (value !== undefined ? validateDueDate(value) : { isValid: true }),
  priority: (value: any) => (value !== undefined ? validateTaskPriority(value) : { isValid: true }),
  status: (value: any) => (value !== undefined ? validateTaskStatus(value) : { isValid: true }),
  categories: (value: any) =>
    value !== undefined ? validateTaskCategories(value) : { isValid: true },
  assignees: (value: any) =>
    value !== undefined ? validateTaskAssignees(value) : { isValid: true },
};

/**
 * Validates a complete task object for creation
 */
export const validateCompleteTask = (data: any): ValidationError[] => {
  return validateSchema(data, createTaskSchema);
};

/**
 * Validates a task object for updates
 */
export const validateUpdateTask = (data: any): ValidationError[] => {
  // Check if at least one field is provided for update
  const updateFields = [
    "title",
    "description",
    "due_date",
    "priority",
    "status",
    "categories",
    "assignees",
  ];
  const hasUpdateField = updateFields.some((field) => data[field] !== undefined);

  if (!hasUpdateField) {
    return [
      {
        field: "body",
        message: "At least one field must be provided for update",
        code: "NO_UPDATE_FIELDS",
      },
    ];
  }

  return validateSchema(data, updateTaskSchema);
};

/**
 * Business rule validation for task creation
 */
export const validateTaskCreationBusinessRules = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate due date is not in the past (with reasonable tolerance)
  if (data.due_date) {
    const dueDate = new Date(data.due_date);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (dueDate < yesterday) {
      errors.push({
        field: "due_date",
        message: "Due date cannot be more than one day in the past",
        code: "INVALID_DUE_DATE",
      });
    }

    // Warn about extremely distant due dates
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

    if (dueDate > oneYearFromNow) {
      errors.push({
        field: "due_date",
        message: "Due date more than one year in the future may indicate unrealistic timeline",
        code: "DISTANT_DUE_DATE",
      });
    }
  }

  // Validate title doesn't contain inappropriate terms
  // if (data.title) {
  //   const inappropriateTerms = ['test', 'dummy', 'fake', 'sample', 'todo', 'fixme'];
  //   const containsInappropriate = inappropriateTerms.some(term =>
  //     data.title.toLowerCase().includes(term.toLowerCase())
  //   );
  //   if (containsInappropriate) {
  //     errors.push({
  //       field: 'title',
  //       message: 'Task title should not contain test or placeholder terms',
  //       code: 'INAPPROPRIATE_TASK_TITLE'
  //     });
  //   }
  // }

  // Validate status for new tasks
  if (data.status) {
    const validInitialStatuses = ["Open", "In Progress"];
    if (!validInitialStatuses.includes(data.status)) {
      errors.push({
        field: "status",
        message: 'New tasks should start with "Open" or "In Progress" status',
        code: "INVALID_INITIAL_STATUS",
      });
    }
  }

  // Validate priority and due date consistency
  if (data.priority === "High" && data.due_date) {
    const dueDate = new Date(data.due_date);
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

    if (dueDate > oneWeekFromNow) {
      errors.push({
        field: "due_date",
        message: "High priority tasks should typically have due dates within one week",
        code: "HIGH_PRIORITY_DISTANT_DUE_DATE",
      });
    }
  }

  // Validate categories don't contain duplicates
  if (data.categories && Array.isArray(data.categories)) {
    const uniqueCategories = [...new Set(data.categories.map((cat: string) => cat.toLowerCase()))];
    if (uniqueCategories.length !== data.categories.length) {
      errors.push({
        field: "categories",
        message: "Categories cannot contain duplicates",
        code: "DUPLICATE_CATEGORIES",
      });
    }
  }

  // Validate assignees don't contain duplicates
  if (data.assignees && Array.isArray(data.assignees)) {
    const uniqueAssignees = [...new Set(data.assignees)];
    if (uniqueAssignees.length !== data.assignees.length) {
      errors.push({
        field: "assignees",
        message: "Assignees cannot contain duplicates",
        code: "DUPLICATE_ASSIGNEES",
      });
    }
  }

  return errors;
};

/**
 * Business rule validation for task updates
 */
export const validateTaskUpdateBusinessRules = (
  data: any,
  existingData?: any,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate status transitions
  if (data.status && existingData?.status) {
    const invalidTransitions = [
      {
        from: "Completed",
        to: "Open",
        message: "Cannot reopen completed tasks without proper justification",
      },
      {
        from: "Completed",
        to: "In Progress",
        message: "Cannot move completed tasks back to in progress",
      },
      { from: "Deleted", to: "Open", message: "Cannot restore deleted tasks" },
      { from: "Deleted", to: "In Progress", message: "Cannot restore deleted tasks" },
      { from: "Deleted", to: "Completed", message: "Cannot restore deleted tasks" },
    ];

    const invalidTransition = invalidTransitions.find(
      (t) => t.from === existingData.status && t.to === data.status,
    );

    if (invalidTransition) {
      errors.push({
        field: "status",
        message: invalidTransition.message,
        code: "INVALID_STATUS_TRANSITION",
      });
    }
  }

  // Validate due date changes for completed tasks
  if (data.due_date && existingData?.status === "Completed") {
    errors.push({
      field: "due_date",
      message: "Cannot modify due date for completed tasks",
      code: "COMPLETED_TASK_DATE_MODIFICATION",
    });
  }

  // Validate priority escalation for overdue tasks
  if (data.priority && existingData?.status === "Overdue" && existingData?.priority) {
    const priorityOrder = ["Low", "Medium", "High"];
    const currentPriorityIndex = priorityOrder.indexOf(existingData.priority);
    const newPriorityIndex = priorityOrder.indexOf(data.priority);

    if (newPriorityIndex < currentPriorityIndex) {
      errors.push({
        field: "priority",
        message: "Cannot decrease priority for overdue tasks",
        code: "OVERDUE_PRIORITY_DECREASE",
      });
    }
  }

  // Validate assignees don't contain duplicates (same as creation rules)
  if (data.assignees && Array.isArray(data.assignees)) {
    const uniqueAssignees = [...new Set(data.assignees)];
    if (uniqueAssignees.length !== data.assignees.length) {
      errors.push({
        field: "assignees",
        message: "Assignees cannot contain duplicates",
        code: "DUPLICATE_ASSIGNEES",
      });
    }
  }

  return errors;
};

/**
 * Complete validation for task creation with business rules
 */
export const validateCompleteTaskCreation = (data: any): ValidationError[] => {
  const validationErrors = validateCompleteTask(data);
  const businessErrors = validateTaskCreationBusinessRules(data);

  return [...validationErrors, ...businessErrors];
};

/**
 * Complete validation for task updates with business rules
 */
export const validateCompleteTaskUpdate = (data: any, existingData?: any): ValidationError[] => {
  const validationErrors = validateUpdateTask(data);
  const businessErrors = validateTaskUpdateBusinessRules(data, existingData);

  return [...validationErrors, ...businessErrors];
};

/**
 * Validates task query parameters for filtering and pagination
 */
export const validateTaskQueryParams = (query: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate status filter
  if (query.status) {
    const statuses = Array.isArray(query.status) ? query.status : [query.status];
    for (const status of statuses) {
      const statusValidation = validateEnum(status, "Status filter", TASK_STATUS_ENUM, false);
      if (!statusValidation.isValid) {
        errors.push({
          field: "status",
          message: statusValidation.message || "Invalid status filter",
          code: statusValidation.code || "INVALID_STATUS_FILTER",
        });
      }
    }
  }

  // Validate priority filter
  if (query.priority) {
    const priorities = Array.isArray(query.priority) ? query.priority : [query.priority];
    for (const priority of priorities) {
      const priorityValidation = validateEnum(
        priority,
        "Priority filter",
        TASK_PRIORITY_ENUM,
        false,
      );
      if (!priorityValidation.isValid) {
        errors.push({
          field: "priority",
          message: priorityValidation.message || "Invalid priority filter",
          code: priorityValidation.code || "INVALID_PRIORITY_FILTER",
        });
      }
    }
  }

  // Validate date filters
  if (query.due_date_start) {
    const startDateValidation = validateDate(query.due_date_start, "Due date start", {
      required: false,
    });
    if (!startDateValidation.isValid) {
      errors.push({
        field: "due_date_start",
        message: startDateValidation.message || "Invalid due date start",
        code: startDateValidation.code || "INVALID_DATE_START",
      });
    }
  }

  if (query.due_date_end) {
    const endDateValidation = validateDate(query.due_date_end, "Due date end", { required: false });
    if (!endDateValidation.isValid) {
      errors.push({
        field: "due_date_end",
        message: endDateValidation.message || "Invalid due date end",
        code: endDateValidation.code || "INVALID_DATE_END",
      });
    }
  }

  // Validate sort parameters
  if (query.sort_by) {
    const sortValidation = validateSortField(query.sort_by);
    if (!sortValidation.isValid) {
      errors.push({
        field: "sort_by",
        message: sortValidation.message || "Invalid sort field",
        code: sortValidation.code || "INVALID_SORT_FIELD",
      });
    }
  }

  if (query.sort_order) {
    const sortOrderValidation = validateSortOrder(query.sort_order);
    if (!sortOrderValidation.isValid) {
      errors.push({
        field: "sort_order",
        message: sortOrderValidation.message || "Invalid sort order",
        code: sortOrderValidation.code || "INVALID_SORT_ORDER",
      });
    }
  }

  // Validate pagination
  const paginationErrors = validatePagination(
    query.page ? parseInt(query.page) : undefined,
    query.page_size ? parseInt(query.page_size) : undefined,
  );
  errors.push(...paginationErrors);

  return errors;
};
