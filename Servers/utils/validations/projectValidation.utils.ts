/**
 * Project specific validation utilities
 * Contains validation schemas and functions specifically for project operations
 */

import {
  validateString,
  validateEnum,
  validateDate,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError,
} from "./validation.utils";
import { AiRiskClassification } from "../../domain.layer/enums/ai-risk-classification.enum";
import { HighRiskRole } from "../../domain.layer/enums/high-risk-role.enum";

/**
 * Validation constants for projects
 */
export const PROJECT_VALIDATION_LIMITS = {
  PROJECT_TITLE: { MIN: 1, MAX: 255 },
  GOAL: { MIN: 1, MAX: 1000 },
} as const;

/**
 * AI Risk Classification enum values
 */
export const AI_RISK_CLASSIFICATION_ENUM = Object.values(AiRiskClassification);

/**
 * High Risk Role enum values
 */
export const HIGH_RISK_ROLE_ENUM = Object.values(HighRiskRole);

/**
 * Validates project title field
 */
export const validateProjectTitle = (value: any): ValidationResult => {
  return validateString(value, "Project title", {
    required: true,
    minLength: PROJECT_VALIDATION_LIMITS.PROJECT_TITLE.MIN,
    maxLength: PROJECT_VALIDATION_LIMITS.PROJECT_TITLE.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates project goal field
 */
export const validateGoal = (value: any): ValidationResult => {
  return validateString(value, "Goal", {
    required: true,
    minLength: PROJECT_VALIDATION_LIMITS.GOAL.MIN,
    maxLength: PROJECT_VALIDATION_LIMITS.GOAL.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates project owner foreign key
 */
export const validateOwner = (value: any): ValidationResult => {
  return validateForeignKey(value, "Owner", true);
};

/**
 * Validates start date field
 */
export const validateStartDate = (value: any): ValidationResult => {
  return validateDate(value, "Start date", {
    required: true,
  });
};

/**
 * Validates AI risk classification enum field
 * For organizational projects, this should be null
 */
export const validateAiRiskClassification = (
  value: any,
  isOrganizational?: boolean,
): ValidationResult => {
  // For organizational projects, ai_risk_classification should be null
  if (isOrganizational) {
    if (value !== null && value !== undefined) {
      return {
        isValid: false,
        message: "AI risk classification must be null for organizational projects",
        code: "ORGANIZATIONAL_PROJECT_AI_RISK_NOT_NULL",
      };
    }
    return { isValid: true };
  }

  // For non-organizational projects, validation is required
  return validateEnum(value, "AI risk classification", AI_RISK_CLASSIFICATION_ENUM, true);
};

/**
 * Validates type of high risk role enum field
 * For organizational projects, this should be null
 */
export const validateTypeOfHighRiskRole = (
  value: any,
  isOrganizational?: boolean,
): ValidationResult => {
  // For organizational projects, type_of_high_risk_role should be null
  if (isOrganizational) {
    if (value !== null && value !== undefined) {
      return {
        isValid: false,
        message: "Type of high risk role must be null for organizational projects",
        code: "ORGANIZATIONAL_PROJECT_HIGH_RISK_ROLE_NOT_NULL",
      };
    }
    return { isValid: true };
  }

  // For non-organizational projects, validation is required
  return validateEnum(value, "Type of high risk role", HIGH_RISK_ROLE_ENUM, true);
};

/**
 * Validates last updated by foreign key
 */
export const validateLastUpdatedBy = (value: any): ValidationResult => {
  return validateForeignKey(value, "Last updated by", true);
};

/**
 * Validates is_organizational boolean field
 */
export const validateIsOrganizational = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional field
  }

  if (typeof value !== "boolean") {
    return {
      isValid: false,
      message: "Is organizational must be a boolean value",
      code: "INVALID_BOOLEAN",
    };
  }

  return { isValid: true };
};

/**
 * Validates framework array field
 * Framework is required for all projects and must contain valid framework IDs
 * Handles two formats:
 * 1. Creation: [1, 2, 3] (array of framework IDs)
 * 2. Update: [{project_framework_id: 1, framework_id: 1}] (array of objects)
 */
export const validateFramework = (value: any): ValidationResult => {
  // Framework field is required
  if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
    return {
      isValid: false,
      message: "Framework is required and must contain at least one framework ID",
      code: "REQUIRED_FIELD",
    };
  }

  // Must be an array
  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: "Framework must be an array",
      code: "INVALID_ARRAY",
    };
  }

  // Valid framework IDs: 1=EU AI Act, 2=ISO 42001, 3=ISO 27001
  const validFrameworkIds = [1, 2, 3];

  // Extract framework IDs based on format
  const frameworkIds: number[] = [];

  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    let frameworkId: number;

    // Check if it's an object (update format) or number (creation format)
    if (typeof item === "object" && item !== null) {
      // Update format: {project_framework_id: X, framework_id: Y}
      if (!item.framework_id) {
        return {
          isValid: false,
          message: `Framework object at index ${i} must have a framework_id property`,
          code: "MISSING_FRAMEWORK_ID",
        };
      }
      frameworkId = item.framework_id;
    } else if (typeof item === "number") {
      // Creation format: just the number
      frameworkId = item;
    } else {
      return {
        isValid: false,
        message: `Framework at index ${i} must be either a number or an object with framework_id`,
        code: "INVALID_FRAMEWORK_FORMAT",
      };
    }

    // Check if it's a valid positive integer
    if (!Number.isInteger(frameworkId) || frameworkId <= 0) {
      return {
        isValid: false,
        message: `Framework ID at index ${i} must be a positive integer`,
        code: "INVALID_FRAMEWORK_ID",
      };
    }

    // Check if it's a valid framework ID
    if (!validFrameworkIds.includes(frameworkId)) {
      return {
        isValid: false,
        message: `Framework ID ${frameworkId} is not valid. Valid IDs are: 1 (EU AI Act), 2 (ISO 42001), 3 (ISO 27001)`,
        code: "INVALID_FRAMEWORK_ID",
      };
    }

    frameworkIds.push(frameworkId);
  }

  // Check for duplicates
  const uniqueFrameworkIds = [...new Set(frameworkIds)];
  if (uniqueFrameworkIds.length !== frameworkIds.length) {
    return {
      isValid: false,
      message: "Framework array cannot contain duplicate IDs",
      code: "DUPLICATE_FRAMEWORK_IDS",
    };
  }

  return { isValid: true };
};

/**
 * Validates members array field
 */
export const validateMembers = (value: any): ValidationResult => {
  // Members field is optional
  if (value === undefined || value === null) {
    return { isValid: true };
  }

  // Must be an array
  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: "Members must be an array",
      code: "INVALID_ARRAY",
    };
  }

  // Validate each member ID in the array
  for (let i = 0; i < value.length; i++) {
    const memberId = value[i];
    const validation = validateForeignKey(memberId, `Member ID at index ${i}`, false);
    if (!validation.isValid) {
      return {
        isValid: false,
        message: `Invalid member ID at index ${i}: ${validation.message}`,
        code: validation.code || "INVALID_MEMBER_ID",
      };
    }
  }

  return { isValid: true };
};

/**
 * Validates enable_ai_data_insertion boolean field
 */
export const validateEnableAiDataInsertion = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Optional field
  }

  if (typeof value !== "boolean") {
    return {
      isValid: false,
      message: "Enable AI data insertion must be a boolean value",
      code: "INVALID_BOOLEAN",
    };
  }

  return { isValid: true };
};

/**
 * Validates project ID for existing records
 */
export const validateProjectId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Project ID", true);
};

/**
 * Validation schema for creating a new project
 * Note: ai_risk_classification and type_of_high_risk_role are validated conditionally
 * Note: status is optional (defaults to "Not started" if not provided)
 */
export const createProjectSchema = {
  project_title: validateProjectTitle,
  owner: validateOwner,
  start_date: validateStartDate,
  goal: validateGoal,
  is_organizational: validateIsOrganizational,
  framework: validateFramework,
  members: validateMembers,
  enable_ai_data_insertion: validateEnableAiDataInsertion,
  status: (value: any) => validateProjectStatus(value, false), // Optional during creation
};

/**
 * Validation schema for updating a project
 * All fields are optional for updates
 * Note: ai_risk_classification and type_of_high_risk_role are validated conditionally
 */
export const updateProjectSchema = {
  project_title: (value: any) =>
    value !== undefined ? validateProjectTitle(value) : { isValid: true },
  owner: (value: any) => (value !== undefined ? validateOwner(value) : { isValid: true }),
  start_date: (value: any) => (value !== undefined ? validateStartDate(value) : { isValid: true }),
  goal: (value: any) => (value !== undefined ? validateGoal(value) : { isValid: true }),
  members: (value: any) => (value !== undefined ? validateMembers(value) : { isValid: true }),
  status: (value: any) =>
    value !== undefined ? validateProjectStatus(value, false) : { isValid: true },
};

/**
 * Validates a complete project object for creation
 * Handles conditional validation of AI risk fields based on organizational status
 */
export const validateCompleteProject = (data: any): ValidationError[] => {
  const errors = validateSchema(data, createProjectSchema);

  // Conditional validation for AI risk fields based on organizational status
  const isOrganizational = data.is_organizational;

  // Validate ai_risk_classification conditionally
  const aiRiskValidation = validateAiRiskClassification(
    data.ai_risk_classification,
    isOrganizational,
  );
  if (!aiRiskValidation.isValid) {
    errors.push({
      field: "ai_risk_classification",
      message: aiRiskValidation.message || "AI risk classification validation failed",
      code: aiRiskValidation.code || "VALIDATION_FAILED",
    });
  }

  // Validate type_of_high_risk_role conditionally
  const highRiskRoleValidation = validateTypeOfHighRiskRole(
    data.type_of_high_risk_role,
    isOrganizational,
  );
  if (!highRiskRoleValidation.isValid) {
    errors.push({
      field: "type_of_high_risk_role",
      message: highRiskRoleValidation.message || "Type of high risk role validation failed",
      code: highRiskRoleValidation.code || "VALIDATION_FAILED",
    });
  }

  return errors;
};

/**
 * Sanitizes project data for organizational projects by setting AI risk fields to null
 */
export const sanitizeProjectDataForOrganizational = (data: any): any => {
  const sanitizedData = { ...data };

  if (data.is_organizational) {
    // For organizational projects, set AI risk fields to null
    sanitizedData.ai_risk_classification = null;
    sanitizedData.type_of_high_risk_role = null;
  }

  return sanitizedData;
};

/**
 * Validates a project object for updates
 * Handles conditional validation of AI risk fields based on organizational status
 */
export const validateUpdateProject = (data: any, currentProject?: any): ValidationError[] => {
  // Check if at least one field is provided for update
  const updateFields = [
    "project_title",
    "owner",
    "start_date",
    "ai_risk_classification",
    "type_of_high_risk_role",
    "goal",
    "members",
    "enable_ai_data_insertion",
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

  const errors = validateSchema(data, updateProjectSchema);

  // Conditional validation for AI risk fields based on organizational status
  // Use updated organizational status if provided, otherwise use current project status
  const isOrganizational =
    data.is_organizational !== undefined
      ? data.is_organizational
      : currentProject?.is_organizational;

  // Only validate AI risk fields if they are being updated
  if (data.ai_risk_classification !== undefined) {
    const aiRiskValidation = validateAiRiskClassification(
      data.ai_risk_classification,
      isOrganizational,
    );
    if (!aiRiskValidation.isValid) {
      errors.push({
        field: "ai_risk_classification",
        message: aiRiskValidation.message || "AI risk classification validation failed",
        code: aiRiskValidation.code || "VALIDATION_FAILED",
      });
    }
  }

  if (data.type_of_high_risk_role !== undefined) {
    const highRiskRoleValidation = validateTypeOfHighRiskRole(
      data.type_of_high_risk_role,
      isOrganizational,
    );
    if (!highRiskRoleValidation.isValid) {
      errors.push({
        field: "type_of_high_risk_role",
        message: highRiskRoleValidation.message || "Type of high risk role validation failed",
        code: highRiskRoleValidation.code || "VALIDATION_FAILED",
      });
    }
  }

  return errors;
};

/**
 * Validates project ID parameter
 */
export const validateProjectIdParam = (id: any): ValidationResult => {
  return validateProjectId(id);
};

/**
 * Validates project status enum field
 * @param required - Whether the status field is required (default: false for optional)
 */
export const validateProjectStatus = (value: any, required: boolean = false): ValidationResult => {
  // Status is optional during creation (defaults to "Not started" in database)
  if (!required && (value === undefined || value === null)) {
    return { isValid: true };
  }

  // Import ProjectStatus enum values dynamically to avoid circular dependency
  const PROJECT_STATUS_ENUM = [
    "Not started",
    "In progress",
    "Under review",
    "Completed",
    "Closed",
    "On hold",
    "Rejected",
  ] as const;

  return validateEnum(value, "Project status", PROJECT_STATUS_ENUM, required);
};

/**
 * Validates project status update request body
 * Status is REQUIRED for the dedicated status update endpoint
 */
export const validateProjectStatusUpdate = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Status is required for status update endpoint
  const statusValidation = validateProjectStatus(data.status, true);
  if (!statusValidation.isValid) {
    errors.push({
      field: "status",
      message: statusValidation.message || "Invalid project status",
      code: statusValidation.code || "INVALID_STATUS",
    });
  }

  return errors;
};

/**
 * Business logic validations
 */

/**
 * Helper function to extract framework IDs from both formats
 * Handles: [1, 2, 3] or [{project_framework_id: 1, framework_id: 1}]
 */
export const extractFrameworkIds = (frameworks: any[]): number[] => {
  if (!Array.isArray(frameworks)) {
    return [];
  }

  return frameworks
    .map((item) => {
      if (typeof item === "number") {
        return item;
      } else if (typeof item === "object" && item !== null && item.framework_id) {
        return item.framework_id;
      }
      return null;
    })
    .filter((id): id is number => id !== null);
};

/**
 * Validates that start date is not in the future beyond reasonable limits
 */
export const validateStartDateReasonable = (startDate: Date): ValidationResult => {
  const now = new Date();
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(now.getFullYear() + 1);

  if (startDate > oneYearFromNow) {
    return {
      isValid: false,
      message: "Start date cannot be more than one year in the future",
      code: "UNREASONABLE_START_DATE",
    };
  }

  return { isValid: true };
};

/**
 * Validates that frameworks are consistent with organizational status
 * This validation is required and frameworks cannot be empty
 */
export const validateOrganizationalFrameworkConsistency = (
  isOrganizational: boolean,
  frameworks: number[],
): ValidationResult => {
  // Framework validation is mandatory
  if (!frameworks || frameworks.length === 0) {
    return {
      isValid: false,
      message: "Framework array is required and cannot be empty",
      code: "REQUIRED_FRAMEWORKS",
    };
  }

  // Organizational frameworks: ISO-42001 (2), ISO-27001 (3)
  const organizationalFrameworks = [2, 3];
  // Non-organizational framework: EU-AI-Act (1)
  const nonOrganizationalFrameworks = [1];

  if (isOrganizational) {
    // For organizational projects, only allow frameworks 2 and 3
    const hasInvalidFramework = frameworks.some((id) => !organizationalFrameworks.includes(id));
    if (hasInvalidFramework) {
      const invalidFrameworks = frameworks.filter((id) => !organizationalFrameworks.includes(id));
      return {
        isValid: false,
        message: `Organizational projects can only use organizational frameworks: ISO 42001 (2) or ISO 27001 (3). Invalid framework IDs: ${invalidFrameworks.join(", ")}`,
        code: "INVALID_ORGANIZATIONAL_FRAMEWORK",
      };
    }
  } else {
    // For non-organizational (AI) projects, only allow framework 1
    const hasInvalidFramework = frameworks.some((id) => !nonOrganizationalFrameworks.includes(id));
    if (hasInvalidFramework) {
      const invalidFrameworks = frameworks.filter(
        (id) => !nonOrganizationalFrameworks.includes(id),
      );
      return {
        isValid: false,
        message: `Non-organizational (AI) projects can only use EU AI Act framework (1). Invalid framework IDs: ${invalidFrameworks.join(", ")}`,
        code: "INVALID_NON_ORGANIZATIONAL_FRAMEWORK",
      };
    }
  }

  return { isValid: true };
};

/**
 * Validates that AI risk classification is consistent with high risk role
 */
export const validateRiskClassificationConsistency = (
  aiRiskClassification: AiRiskClassification,
  typeOfHighRiskRole: HighRiskRole,
): ValidationResult => {
  // Business rule: High-risk AI systems should have appropriate high-risk roles
  // All defined HighRiskRole enum values are valid for high-risk systems
  if (aiRiskClassification === AiRiskClassification.HIGH_RISK) {
    // Any valid HighRiskRole is acceptable for high-risk systems
    const validHighRiskRoles = Object.values(HighRiskRole);
    if (!validHighRiskRoles.includes(typeOfHighRiskRole)) {
      return {
        isValid: false,
        message: "High-risk AI classification requires a valid high-risk role designation",
        code: "INCONSISTENT_RISK_CLASSIFICATION",
      };
    }
  }

  // For minimal/limited risk systems, we accept any role designation
  // as they might still need role definition for compliance tracking
  return { isValid: true };
};

/**
 * Validates that owner exists (placeholder for database check)
 */
export const validateOwnerExists = async (ownerId: number): Promise<ValidationResult> => {
  // This would be implemented to check if owner exists in database
  // For now, just validate the ID format
  return validateOwner(ownerId);
};

/**
 * Validates that framework IDs exist (placeholder for database check)
 */
export const validateFrameworksExist = async (
  frameworkIds: number[],
): Promise<ValidationResult> => {
  // This would be implemented to check if frameworks exist in database
  // For now, just validate the array format
  return validateFramework(frameworkIds);
};

/**
 * Validates that member IDs exist (placeholder for database check)
 */
export const validateMembersExist = async (memberIds: number[]): Promise<ValidationResult> => {
  // This would be implemented to check if members exist in database
  // For now, just validate the array format
  return validateMembers(memberIds);
};

/**
 * Complete validation for project creation with business rules
 */
export const validateCompleteProjectWithBusinessRules = (data: any): ValidationError[] => {
  const errors = validateCompleteProject(data);

  // Add business rule validations if basic validation passes
  if (errors.length === 0) {
    // Check start date reasonableness
    if (data.start_date) {
      const startDateCheck = validateStartDateReasonable(new Date(data.start_date));
      if (!startDateCheck.isValid) {
        errors.push({
          field: "start_date",
          message: startDateCheck.message || "Start date is unreasonable",
          code: startDateCheck.code || "BUSINESS_RULE_VIOLATION",
        });
      }
    }

    // Check organizational framework consistency
    // This validation is mandatory for all projects
    const isOrganizational = data.is_organizational !== undefined ? data.is_organizational : false;
    const frameworks = data.framework || [];
    const frameworkIds = extractFrameworkIds(frameworks);
    const frameworkConsistencyCheck = validateOrganizationalFrameworkConsistency(
      isOrganizational,
      frameworkIds,
    );
    if (!frameworkConsistencyCheck.isValid) {
      errors.push({
        field: "framework",
        message:
          frameworkConsistencyCheck.message ||
          "Framework is inconsistent with organizational status",
        code: frameworkConsistencyCheck.code || "BUSINESS_RULE_VIOLATION",
      });
    }

    // Check risk classification consistency (only for non-organizational projects)
    if (!data.is_organizational && data.ai_risk_classification && data.type_of_high_risk_role) {
      const consistencyCheck = validateRiskClassificationConsistency(
        data.ai_risk_classification,
        data.type_of_high_risk_role,
      );
      if (!consistencyCheck.isValid) {
        errors.push({
          field: "type_of_high_risk_role",
          message: consistencyCheck.message || "Risk classification is inconsistent",
          code: consistencyCheck.code || "BUSINESS_RULE_VIOLATION",
        });
      }
    }
  }

  return errors;
};

/**
 * Complete validation for project updates with business rules
 */
export const validateUpdateProjectWithBusinessRules = (
  data: any,
  currentProject?: any,
): ValidationError[] => {
  const errors = validateUpdateProject(data, currentProject);

  // Add business rule validations if basic validation passes
  if (errors.length === 0 && currentProject) {
    // Check start date reasonableness if being updated
    const newStartDate =
      data.start_date !== undefined ? data.start_date : currentProject.start_date;
    if (newStartDate) {
      const startDateCheck = validateStartDateReasonable(new Date(newStartDate));
      if (!startDateCheck.isValid) {
        errors.push({
          field: "start_date",
          message: startDateCheck.message || "Start date is unreasonable",
          code: startDateCheck.code || "BUSINESS_RULE_VIOLATION",
        });
      }
    }

    // Check framework consistency validation for updates
    const newIsOrganizational =
      data.is_organizational !== undefined
        ? data.is_organizational
        : currentProject.is_organizational;
    const newFramework = data.framework !== undefined ? data.framework : currentProject.framework;

    if (newFramework && newFramework.length > 0) {
      const newFrameworkIds = extractFrameworkIds(newFramework);
      const frameworkConsistencyCheck = validateOrganizationalFrameworkConsistency(
        newIsOrganizational,
        newFrameworkIds,
      );
      if (!frameworkConsistencyCheck.isValid) {
        errors.push({
          field: data.framework !== undefined ? "framework" : "is_organizational",
          message:
            frameworkConsistencyCheck.message ||
            "Framework is inconsistent with organizational status",
          code: frameworkConsistencyCheck.code || "BUSINESS_RULE_VIOLATION",
        });
      }
    }

    // Check risk classification consistency (only for non-organizational projects)
    const newAiRiskClassification =
      data.ai_risk_classification !== undefined
        ? data.ai_risk_classification
        : currentProject.ai_risk_classification;
    const newTypeOfHighRiskRole =
      data.type_of_high_risk_role !== undefined
        ? data.type_of_high_risk_role
        : currentProject.type_of_high_risk_role;

    // Only check risk classification consistency for non-organizational projects
    if (!newIsOrganizational && newAiRiskClassification && newTypeOfHighRiskRole) {
      const consistencyCheck = validateRiskClassificationConsistency(
        newAiRiskClassification,
        newTypeOfHighRiskRole,
      );
      if (!consistencyCheck.isValid) {
        errors.push({
          field:
            data.type_of_high_risk_role !== undefined
              ? "type_of_high_risk_role"
              : "ai_risk_classification",
          message: consistencyCheck.message || "Risk classification is inconsistent",
          code: consistencyCheck.code || "BUSINESS_RULE_VIOLATION",
        });
      }
    }
  }

  return errors;
};
