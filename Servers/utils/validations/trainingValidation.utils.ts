/**
 * Training specific validation utilities
 * Contains validation schemas and functions specifically for training registrar operations
 */

import {
  validateString,
  validateNumber,
  validateEnum,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError,
} from "./validation.utils";

/**
 * Validation constants for training registrars
 */
export const TRAINING_VALIDATION_LIMITS = {
  TRAINING_NAME: { MIN: 2, MAX: 255 },
  DEPARTMENT: { MIN: 1, MAX: 100 },
  PROVIDER: { MIN: 1, MAX: 255 },
  DURATION: { MIN: 1, MAX: 1000 },
  NUMBER_OF_PEOPLE: { MIN: 1, MAX: 1000 },
  DESCRIPTION: { MIN: 1, MAX: 2000 },
} as const;

/**
 * Training status enum values
 */
export const TRAINING_STATUS_ENUM = [
  "Planned",
  "In Progress",
  "Completed",
  // 'Cancelled',
  // 'Postponed',
  // 'Under Review'
] as const;

/**
 * Training department enum values (common departments)
 */
export const TRAINING_DEPARTMENT_ENUM = [
  "IT",
  "Security",
  "Compliance",
  "HR",
  "Legal",
  "Operations",
  "Finance",
  "Marketing",
  "Sales",
  "Engineering",
  "Quality Assurance",
  "Risk Management",
  "All Departments",
] as const;

/**
 * Training provider type enum values
 */
export const TRAINING_PROVIDER_ENUM = [
  "Internal",
  "External",
  "Online Platform",
  "Contractor",
  "Consultant",
  "Certification Body",
  "University",
  "Professional Body",
] as const;

/**
 * Validates training name field
 */
export const validateTrainingName = (value: any): ValidationResult => {
  return validateString(value, "Training name", {
    required: true,
    minLength: TRAINING_VALIDATION_LIMITS.TRAINING_NAME.MIN,
    maxLength: TRAINING_VALIDATION_LIMITS.TRAINING_NAME.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates training duration field
 */
export const validateTrainingDuration = (value: any): ValidationResult => {
  return validateString(value, "Training duration", {
    required: true,
    minLength: TRAINING_VALIDATION_LIMITS.DURATION.MIN,
    maxLength: TRAINING_VALIDATION_LIMITS.DURATION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates training department field
 */
export const validateTrainingDepartment = (value: any): ValidationResult => {
  return validateString(value, "Department", {
    required: true,
    minLength: TRAINING_VALIDATION_LIMITS.DEPARTMENT.MIN,
    maxLength: TRAINING_VALIDATION_LIMITS.DEPARTMENT.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates number of people field
 */
export const validateNumberOfPeople = (value: any): ValidationResult => {
  return validateNumber(value, "Number of people", {
    required: true,
    min: TRAINING_VALIDATION_LIMITS.NUMBER_OF_PEOPLE.MIN,
    max: TRAINING_VALIDATION_LIMITS.NUMBER_OF_PEOPLE.MAX,
    integer: true,
  });
};

/**
 * Validates training provider field
 */
export const validateTrainingProvider = (value: any): ValidationResult => {
  return validateString(value, "Training provider", {
    required: true,
    minLength: TRAINING_VALIDATION_LIMITS.PROVIDER.MIN,
    maxLength: TRAINING_VALIDATION_LIMITS.PROVIDER.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates training status field
 */
export const validateTrainingStatus = (value: any): ValidationResult => {
  return validateEnum(value, "Training status", TRAINING_STATUS_ENUM, true);
};

/**
 * Validates training registrar ID parameter
 */
export const validateTrainingRegistrarIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Training registrar ID", true);
};

/**
 * Validates training description field (optional)
 */
export const validateTrainingDescription = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Description is optional
  }

  return validateString(value, "Training description", {
    required: false,
    minLength: TRAINING_VALIDATION_LIMITS.DESCRIPTION.MIN,
    maxLength: TRAINING_VALIDATION_LIMITS.DESCRIPTION.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validation schema for creating a new training registrar
 */
export const createTrainingRegistrarSchema = {
  training_name: validateTrainingName,
  duration: validateTrainingDuration,
  department: validateTrainingDepartment,
  numberOfPeople: validateNumberOfPeople,
  provider: validateTrainingProvider,
  status: validateTrainingStatus,
  description: validateTrainingDescription,
};

/**
 * Validation schema for updating a training registrar
 * All fields are required for updates based on the controller logic
 */
export const updateTrainingRegistrarSchema = {
  training_name: validateTrainingName,
  duration: validateTrainingDuration,
  department: validateTrainingDepartment,
  numberOfPeople: validateNumberOfPeople,
  provider: validateTrainingProvider,
  status: validateTrainingStatus,
  description: validateTrainingDescription,
};

/**
 * Validates a complete training registrar object for creation
 */
export const validateCompleteTrainingRegistrar = (data: any): ValidationError[] => {
  return validateSchema(data, createTrainingRegistrarSchema);
};

/**
 * Validates a training registrar object for updates
 */
export const validateUpdateTrainingRegistrar = (data: any): ValidationError[] => {
  return validateSchema(data, updateTrainingRegistrarSchema);
};

/**
 * Business rule validation for training registrar creation
 */
export const validateTrainingRegistrarCreationBusinessRules = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate duration format (should contain time units)
  if (data.duration) {
    const durationPattern =
      /\b(hour|hours|day|days|week|weeks|month|months|minute|minutes|h|hr|hrs|d|w|m)\b/i;
    if (!durationPattern.test(data.duration)) {
      errors.push({
        field: "duration",
        message: 'Duration should specify time units (e.g., "2 hours", "1 day", "3 weeks")',
        code: "INVALID_DURATION_FORMAT",
      });
    }
  }

  // Validate reasonable number of people
  if (data.numberOfPeople) {
    if (data.numberOfPeople > 500) {
      errors.push({
        field: "numberOfPeople",
        message: "Number of people seems unusually high. Please verify this is correct.",
        code: "UNUSUAL_PARTICIPANT_COUNT",
      });
    }
  }

  // // Validate training name doesn't contain inappropriate terms
  // if (data.training_name) {
  //   const inappropriateTerms = ['test', 'dummy', 'fake', 'sample'];
  //   const containsInappropriate = inappropriateTerms.some(term =>
  //     data.training_name.toLowerCase().includes(term.toLowerCase())
  //   );
  //   if (containsInappropriate) {
  //     errors.push({
  //       field: 'training_name',
  //       message: 'Training name should not contain test or placeholder terms',
  //       code: 'INAPPROPRIATE_TRAINING_NAME'
  //     });
  //   }
  // }

  // // Validate status transitions for new trainings
  // if (data.status) {
  //   const validInitialStatuses = ['Planned', 'Under Review'];
  //   if (!validInitialStatuses.includes(data.status)) {
  //     errors.push({
  //       field: 'status',
  //       message: 'New training registrations should start with "Planned" or "Under Review" status',
  //       code: 'INVALID_INITIAL_STATUS'
  //     });
  //   }
  // }

  return errors;
};

/**
 * Business rule validation for training registrar updates
 */
export const validateTrainingRegistrarUpdateBusinessRules = (
  data: any,
  existingData?: any,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate status transitions
  if (data.status && existingData?.status) {
    const invalidTransitions = [
      {
        from: "Completed",
        to: "Planned",
        message: "Cannot change completed training back to planned",
      },
      { from: "Completed", to: "In Progress", message: "Cannot restart completed training" },
      {
        from: "Cancelled",
        to: "In Progress",
        message: "Cannot restart cancelled training without planning",
      },
      {
        from: "Cancelled",
        to: "Completed",
        message: "Cannot mark cancelled training as completed",
      },
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

  // Validate duration format
  if (data.duration) {
    const durationPattern =
      /\b(hour|hours|day|days|week|weeks|month|months|minute|minutes|h|hr|hrs|d|w|m)\b/i;
    if (!durationPattern.test(data.duration)) {
      errors.push({
        field: "duration",
        message: 'Duration should specify time units (e.g., "2 hours", "1 day", "3 weeks")',
        code: "INVALID_DURATION_FORMAT",
      });
    }
  }

  // Validate reasonable number of people
  if (data.numberOfPeople) {
    if (data.numberOfPeople > 500) {
      errors.push({
        field: "numberOfPeople",
        message: "Number of people seems unusually high. Please verify this is correct.",
        code: "UNUSUAL_PARTICIPANT_COUNT",
      });
    }

    // Don't allow reducing participants if training is in progress or completed
    if (existingData?.numberOfPeople && existingData?.status) {
      const restrictedStatuses = ["In Progress", "Completed"];
      if (
        restrictedStatuses.includes(existingData.status) &&
        data.numberOfPeople < existingData.numberOfPeople
      ) {
        errors.push({
          field: "numberOfPeople",
          message: "Cannot reduce participant count for training that is in progress or completed",
          code: "INVALID_PARTICIPANT_REDUCTION",
        });
      }
    }
  }

  return errors;
};

/**
 * Complete validation for training registrar creation with business rules
 */
export const validateCompleteTrainingRegistrarCreation = (data: any): ValidationError[] => {
  const validationErrors = validateCompleteTrainingRegistrar(data);
  const businessErrors = validateTrainingRegistrarCreationBusinessRules(data);

  return [...validationErrors, ...businessErrors];
};

/**
 * Complete validation for training registrar updates with business rules
 */
export const validateCompleteTrainingRegistrarUpdate = (
  data: any,
  existingData?: any,
): ValidationError[] => {
  const validationErrors = validateUpdateTrainingRegistrar(data);
  const businessErrors = validateTrainingRegistrarUpdateBusinessRules(data, existingData);

  return [...validationErrors, ...businessErrors];
};
