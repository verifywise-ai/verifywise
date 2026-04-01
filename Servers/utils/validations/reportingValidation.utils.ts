/**
 * Reporting specific validation utilities
 * Contains validation schemas and functions specifically for reporting operations
 */

import {
  validateString,
  validateNumber,
  validateEnum,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError
} from './validation.utils';
import { ReportType } from '../../domain.layer/models/reporting/reporting.model';

/**
 * Validation constants for reporting
 */
export const REPORTING_VALIDATION_LIMITS = {
  PROJECT_TITLE: { MIN: 3, MAX: 255 },
  PROJECT_OWNER: { MIN: 2, MAX: 100 },
  REPORT_NAME: { MIN: 3, MAX: 255 }
} as const;

/**
 * Report type enum values
 */
export const REPORT_TYPE_ENUM = Object.values(ReportType);

/**
 * File source enum values (must match database enum_files_source)
 */
export const FILE_SOURCE_ENUM = [
  'Project risks report',
  'Compliance tracker report',
  'Assessment tracker report',
  'Vendors and risks report',
  'Clauses and annexes report',
  'ISO 27001 report',
  'All reports'
] as const;

/**
 * Validates project ID field
 */
export const validateProjectId = (value: any): ValidationResult => {
  return validateForeignKey(value, 'Project ID', true);
};

/**
 * Validates framework ID field
 */
export const validateFrameworkId = (value: any): ValidationResult => {
  return validateForeignKey(value, 'Framework ID', true);
};

/**
 * Validates project framework ID field
 */
export const validateProjectFrameworkId = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Project framework ID is optional
  }
  return validateForeignKey(value, 'Project framework ID', false);
};

/**
 * Validates report type field
 */
export const validateReportType = (value: any): ValidationResult => {
  return validateEnum(value, 'Report type', REPORT_TYPE_ENUM, true);
};

/**
 * Validates project title field
 */
export const validateProjectTitle = (value: any): ValidationResult => {
  return validateString(value, 'Project title', {
    required: true,
    minLength: REPORTING_VALIDATION_LIMITS.PROJECT_TITLE.MIN,
    maxLength: REPORTING_VALIDATION_LIMITS.PROJECT_TITLE.MAX,
    trimWhitespace: true
  });
};

/**
 * Validates project owner field
 */
export const validateProjectOwner = (value: any): ValidationResult => {
  return validateString(value, 'Project owner', {
    required: true,
    minLength: REPORTING_VALIDATION_LIMITS.PROJECT_OWNER.MIN,
    maxLength: REPORTING_VALIDATION_LIMITS.PROJECT_OWNER.MAX,
    trimWhitespace: true
  });
};

/**
 * Validates report name field
 */
export const validateReportName = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === '') {
    return { isValid: true }; // Report name is optional (defaults will be used)
  }

  return validateString(value, 'Report name', {
    required: false,
    minLength: REPORTING_VALIDATION_LIMITS.REPORT_NAME.MIN,
    maxLength: REPORTING_VALIDATION_LIMITS.REPORT_NAME.MAX,
    trimWhitespace: true
  });
};

/**
 * Validates user ID field
 */
export const validateUserId = (value: any): ValidationResult => {
  return validateNumber(value, 'User ID', {
    required: true,
    min: 1,
    integer: true
  });
};

/**
 * Validates report ID parameter
 */
export const validateReportIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, 'Report ID', true);
};

/**
 * Validation schema for generating reports
 */
export const generateReportSchema = {
  projectId: validateProjectId,
  reportType: validateReportType,
  projectTitle: validateProjectTitle,
  projectOwner: validateProjectOwner,
  frameworkId: validateFrameworkId,
  reportName: validateReportName,
  projectFrameworkId: validateProjectFrameworkId
};

/**
 * Validation schema for user context validation
 */
export const userContextSchema = {
  userId: validateUserId
};

/**
 * Validates a complete report generation request
 */
export const validateCompleteReportGeneration = (data: any): ValidationError[] => {
  return validateSchema(data, generateReportSchema);
};

/**
 * Validates user context for report operations
 */
export const validateUserContext = (data: any): ValidationError[] => {
  return validateSchema(data, userContextSchema);
};

/**
 * Business rule validation for report generation
 */
export const validateReportGenerationBusinessRules = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate project owner format (should include full name)
  if (data.projectOwner) {
    if (!data.projectOwner.includes(' ') || data.projectOwner.length < 5) {
      errors.push({
        field: 'projectOwner',
        message: 'Project owner should include full name (first and last name)',
        code: 'INVALID_OWNER_FORMAT'
      });
    }
  }

  // Validate report type and framework consistency
  if (data.reportType && data.frameworkId) {
    const frameworkSpecificReports = [
      'Compliance tracker report',
      'Assessment tracker report',
      'Clauses and annexes report'
    ];

    if (frameworkSpecificReports.includes(data.reportType) && !data.frameworkId) {
      errors.push({
        field: 'frameworkId',
        message: `Framework ID is required for ${data.reportType}`,
        code: 'FRAMEWORK_REQUIRED'
      });
    }
  }

  // Validate project framework ID when provided
  if (data.projectFrameworkId && data.frameworkId) {
    if (typeof data.projectFrameworkId !== 'number' || data.projectFrameworkId <= 0) {
      errors.push({
        field: 'projectFrameworkId',
        message: 'Project framework ID must be a valid positive number when provided',
        code: 'INVALID_PROJECT_FRAMEWORK_ID'
      });
    }
  }

  // // Validate report name doesn't contain inappropriate terms
  // if (data.reportName) {
  //   const inappropriateTerms = ['test', 'dummy', 'fake', 'sample', 'tmp'];
  //   const containsInappropriate = inappropriateTerms.some(term =>
  //     data.reportName.toLowerCase().includes(term.toLowerCase())
  //   );
  //   if (containsInappropriate) {
  //     errors.push({
  //       field: 'reportName',
  //       message: 'Report name should not contain test or placeholder terms',
  //       code: 'INAPPROPRIATE_REPORT_NAME'
  //     });
  //   }
  // }

  // Validate project title doesn't contain placeholders
  if (data.projectTitle) {
    const placeholderTerms = ['untitled', 'new project', 'project 1', 'test project'];
    const containsPlaceholder = placeholderTerms.some(term =>
      data.projectTitle.toLowerCase().includes(term.toLowerCase())
    );
    if (containsPlaceholder) {
      errors.push({
        field: 'projectTitle',
        message: 'Project title should be descriptive and not use placeholder names',
        code: 'PLACEHOLDER_PROJECT_TITLE'
      });
    }
  }

  // Validate report type and project title alignment
  if (data.reportType && data.projectTitle) {
    const riskReportTypes = ['Project risks report', 'Vendors and risks report'];
    if (riskReportTypes.includes(data.reportType)) {
      const riskKeywords = ['risk', 'security', 'compliance', 'audit', 'assessment'];
      const hasRiskContext = riskKeywords.some(keyword =>
        data.projectTitle.toLowerCase().includes(keyword.toLowerCase())
      );
      if (!hasRiskContext) {
        errors.push({
          field: 'projectTitle',
          message: 'Risk-related reports should be for projects with risk management context',
          code: 'REPORT_TYPE_PROJECT_MISMATCH'
        });
      }
    }
  }

  return errors;
};

/**
 * Business rule validation for report deletion
 */
export const validateReportDeletionBusinessRules = (reportData: any, userContext: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate user permissions for deletion
  if (reportData && userContext) {
    // Check if user is trying to delete someone else's report
    if (reportData.created_by !== userContext.userId && userContext.role !== 'Admin' && userContext.role !== 'SuperAdmin') {
      errors.push({
        field: 'reportId',
        message: 'You can only delete reports you created, unless you are an administrator',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // Check if report is too old (older than 30 days)
    if (reportData.created_at) {
      const reportDate = new Date(reportData.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      if (reportDate < thirtyDaysAgo && userContext.role !== 'Admin' && userContext.role !== 'SuperAdmin') {
        errors.push({
          field: 'reportId',
          message: 'Reports older than 30 days can only be deleted by administrators',
          code: 'REPORT_TOO_OLD'
        });
      }
    }
  }

  return errors;
};

/**
 * Complete validation for report generation with business rules
 */
export const validateCompleteReportGenerationWithRules = (data: any): ValidationError[] => {
  const validationErrors = validateCompleteReportGeneration(data);
  const businessErrors = validateReportGenerationBusinessRules(data);

  return [...validationErrors, ...businessErrors];
};

/**
 * Complete validation for report deletion with business rules
 */
export const validateCompleteReportDeletion = (reportData: any, userContext: any): ValidationError[] => {
  const businessErrors = validateReportDeletionBusinessRules(reportData, userContext);
  return businessErrors;
};