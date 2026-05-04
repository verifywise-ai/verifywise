/**
 * Policies specific validation utilities
 * Contains validation schemas and functions specifically for policy operations
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
import { POLICY_TAGS, PolicyTag } from "../../domain.layer/interfaces/i.policy";
import striptags from "striptags";
/**
 * Validation constants for policies
 */
export const POLICIES_VALIDATION_LIMITS = {
  TITLE: { MIN: 3, MAX: 255 },
  CONTENT_HTML: { MIN: 50, MAX: 50000 },
  STATUS: { MIN: 3, MAX: 50 },
  TAGS: { MIN_ITEMS: 0, MAX_ITEMS: 10 },
  REVIEWER_IDS: { MIN_ITEMS: 0, MAX_ITEMS: 20 },
} as const;

/**
 * Policy status enum values
 */
export const POLICY_STATUS_ENUM = [
  "Draft",
  "Under Review",
  "Approved",
  "Published",
  "Archived",
  "Deprecated",
] as const;

/**
 * Policy tags enum values
 */
export const POLICY_TAGS_ENUM = POLICY_TAGS;

/**
 * Validates policy title field
 */
export const validatePolicyTitle = (value: any): ValidationResult => {
  return validateString(value, "Policy title", {
    required: true,
    minLength: POLICIES_VALIDATION_LIMITS.TITLE.MIN,
    maxLength: POLICIES_VALIDATION_LIMITS.TITLE.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates policy content HTML field
 */
export const validatePolicyContentHtml = (value: any): ValidationResult => {
  const stringValidation = validateString(value, "Policy content", {
    required: true,
    minLength: POLICIES_VALIDATION_LIMITS.CONTENT_HTML.MIN,
    maxLength: POLICIES_VALIDATION_LIMITS.CONTENT_HTML.MAX,
    trimWhitespace: true,
  });

  if (!stringValidation.isValid) {
    return stringValidation;
  }

  // Additional HTML validation
  if (typeof value === "string") {
    // Check for basic HTML structure
    const hasOpeningTag = /<[^>]+>/i.test(value);
    const hasClosingTag = /<\/[^>]+>/i.test(value);

    if (!hasOpeningTag && !hasClosingTag) {
      // If no HTML tags, it's plain text which is acceptable
      return { isValid: true };
    }

    // Check for potentially dangerous scripts
    const dangerousPatterns = [
      /<script[^>]*>/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe[^>]*>/i,
      /<object[^>]*>/i,
      /<embed[^>]*>/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(value)) {
        return {
          isValid: false,
          message: "Policy content contains potentially unsafe HTML elements",
          code: "UNSAFE_HTML_CONTENT",
        };
      }
    }
  }

  return { isValid: true };
};

/**
 * Validates policy status field
 */
export const validatePolicyStatus = (value: any): ValidationResult => {
  return validateEnum(value, "Policy status", POLICY_STATUS_ENUM, true);
};

/**
 * Validates policy tags array (optional)
 */
export const validatePolicyTags = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Tags are optional
  }

  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: "Policy tags must be an array",
      code: "INVALID_TAGS_TYPE",
    };
  }

  if (value.length > POLICIES_VALIDATION_LIMITS.TAGS.MAX_ITEMS) {
    return {
      isValid: false,
      message: `Policy tags cannot exceed ${POLICIES_VALIDATION_LIMITS.TAGS.MAX_ITEMS} items`,
      code: "TOO_MANY_TAGS",
    };
  }

  // Validate each tag
  for (let i = 0; i < value.length; i++) {
    const tag = value[i];
    if (!POLICY_TAGS_ENUM.includes(tag as PolicyTag)) {
      return {
        isValid: false,
        message: `Invalid policy tag: "${tag}". Must be one of: ${POLICY_TAGS_ENUM.join(", ")}`,
        code: "INVALID_POLICY_TAG",
      };
    }
  }

  // Check for duplicates
  const uniqueTags = [...new Set(value)];
  if (uniqueTags.length !== value.length) {
    return {
      isValid: false,
      message: "Policy tags cannot contain duplicates",
      code: "DUPLICATE_TAGS",
    };
  }

  return { isValid: true };
};

/**
 * Validates next review date field (optional)
 */
export const validateNextReviewDate = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // Next review date is optional
  }

  return validateDate(value, "Next review date", { required: false });
};

/**
 * Validates author ID field
 */
export const validateAuthorId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Author ID", true);
};

/**
 * Validates assigned reviewer IDs array (optional)
 */
export const validateAssignedReviewerIds = (value: any): ValidationResult => {
  if (value === undefined || value === null) {
    return { isValid: true }; // Assigned reviewer IDs are optional
  }

  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: "Assigned reviewer IDs must be an array",
      code: "INVALID_REVIEWER_IDS_TYPE",
    };
  }

  if (value.length > POLICIES_VALIDATION_LIMITS.REVIEWER_IDS.MAX_ITEMS) {
    return {
      isValid: false,
      message: `Assigned reviewer IDs cannot exceed ${POLICIES_VALIDATION_LIMITS.REVIEWER_IDS.MAX_ITEMS} reviewers`,
      code: "TOO_MANY_REVIEWERS",
    };
  }

  // Validate each reviewer ID
  for (let i = 0; i < value.length; i++) {
    const reviewerId = value[i];
    const reviewerValidation = validateForeignKey(reviewerId, `Reviewer ${i + 1}`, true);
    if (!reviewerValidation.isValid) {
      return reviewerValidation;
    }
  }

  // Check for duplicates
  const uniqueReviewers = [...new Set(value)];
  if (uniqueReviewers.length !== value.length) {
    return {
      isValid: false,
      message: "Assigned reviewer IDs cannot contain duplicates",
      code: "DUPLICATE_REVIEWERS",
    };
  }

  return { isValid: true };
};

/**
 * Validates last updated by field
 */
export const validateLastUpdatedBy = (value: any): ValidationResult => {
  return validateForeignKey(value, "Last updated by", true);
};

/**
 * Validates policy ID parameter
 */
export const validatePolicyIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Policy ID", true);
};

/**
 * Validation schema for creating a new policy
 */
export const createPolicySchema = {
  title: validatePolicyTitle,
  content_html: validatePolicyContentHtml,
  status: validatePolicyStatus,
  tags: validatePolicyTags,
  next_review_date: validateNextReviewDate,
  author_id: validateAuthorId,
  assigned_reviewer_ids: validateAssignedReviewerIds,
  last_updated_by: validateLastUpdatedBy,
};

/**
 * Validation schema for updating a policy
 */
export const updatePolicySchema = {
  title: (value: any) => (value !== undefined ? validatePolicyTitle(value) : { isValid: true }),
  content_html: (value: any) =>
    value !== undefined ? validatePolicyContentHtml(value) : { isValid: true },
  status: (value: any) => (value !== undefined ? validatePolicyStatus(value) : { isValid: true }),
  tags: (value: any) => (value !== undefined ? validatePolicyTags(value) : { isValid: true }),
  next_review_date: (value: any) =>
    value !== undefined ? validateNextReviewDate(value) : { isValid: true },
  assigned_reviewer_ids: (value: any) =>
    value !== undefined ? validateAssignedReviewerIds(value) : { isValid: true },
  last_updated_by: (value: any) =>
    value !== undefined ? validateLastUpdatedBy(value) : { isValid: true },
};

/**
 * Validates a complete policy object for creation
 */
export const validateCompletePolicy = (data: any): ValidationError[] => {
  return validateSchema(data, createPolicySchema);
};

/**
 * Validates a policy object for updates
 */
export const validateUpdatePolicy = (data: any): ValidationError[] => {
  // Check if at least one field is provided for update
  const updateFields = [
    "title",
    "content_html",
    "status",
    "tags",
    "next_review_date",
    "assigned_reviewer_ids",
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

  return validateSchema(data, updatePolicySchema);
};

/**
 * Business rule validation for policy creation
 */
export const validatePolicyCreationBusinessRules = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate next review date is in the future
  if (data.next_review_date) {
    const reviewDate = new Date(data.next_review_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (reviewDate <= today) {
      errors.push({
        field: "next_review_date",
        message: "Next review date must be in the future",
        code: "INVALID_REVIEW_DATE",
      });
    }

    // Warn about extremely distant review dates
    const twoYearsFromNow = new Date();
    twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);

    if (reviewDate > twoYearsFromNow) {
      errors.push({
        field: "next_review_date",
        message:
          "Review date more than two years in the future may indicate infrequent policy review",
        code: "DISTANT_REVIEW_DATE",
      });
    }
  }

  // Validate status for new policies
  if (data.status) {
    const validInitialStatuses = ["Draft", "Under Review"];
    if (!validInitialStatuses.includes(data.status)) {
      errors.push({
        field: "status",
        message: 'New policies should start with "Draft" or "Under Review" status',
        code: "INVALID_INITIAL_STATUS",
      });
    }
  }

  // // Validate title doesn't contain inappropriate terms
  // if (data.title) {
  //   const inappropriateTerms = ['test', 'dummy', 'fake', 'sample', 'draft policy', 'untitled'];
  //   const containsInappropriate = inappropriateTerms.some(term =>
  //     data.title.toLowerCase().includes(term.toLowerCase())
  //   );
  //   if (containsInappropriate) {
  //     errors.push({
  //       field: 'title',
  //       message: 'Policy title should not contain test or placeholder terms',
  //       code: 'INAPPROPRIATE_POLICY_TITLE'
  //     });
  //   }
  // }

  // Validate content HTML has meaningful content
  if (data.content_html) {
    // Strip HTML tags to check actual content length
    const textContent = striptags(data.content_html).trim();
    if (textContent.length < 100) {
      errors.push({
        field: "content_html",
        message:
          "Policy content should contain substantial text content (minimum 100 characters of actual text)",
        code: "INSUFFICIENT_CONTENT",
      });
    }

    // Check for placeholder content
    const placeholderPatterns = [
      /lorem ipsum/i,
      /placeholder/i,
      /todo/i,
      /fill in/i,
      /tbd/i,
      /to be determined/i,
    ];

    const hasPlaceholder = placeholderPatterns.some((pattern) => pattern.test(data.content_html));

    if (hasPlaceholder) {
      errors.push({
        field: "content_html",
        message: "Policy content should not contain placeholder text",
        code: "PLACEHOLDER_CONTENT",
      });
    }
  }

  // Validate tag relevance to content
  if (data.tags && data.content_html) {
    const contentLower = data.content_html.toLowerCase();
    const relevantTags = data.tags.filter((tag: string) => {
      const tagWords = tag.toLowerCase().split(/\s+/);
      return tagWords.some((word) => contentLower.includes(word));
    });

    if (relevantTags.length === 0 && data.tags.length > 0) {
      errors.push({
        field: "tags",
        message: "Policy tags should be relevant to the content",
        code: "IRRELEVANT_TAGS",
      });
    }
  }

  return errors;
};

/**
 * Business rule validation for policy updates
 */
export const validatePolicyUpdateBusinessRules = (
  data: any,
  existingData?: any,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate status transitions
  if (data.status && existingData?.status) {
    const invalidTransitions = [
      { from: "Published", to: "Draft", message: "Cannot move published policy back to draft" },
      {
        from: "Published",
        to: "Under Review",
        message: "Published policies require formal revision process",
      },
      { from: "Archived", to: "Draft", message: "Cannot restore archived policy to draft" },
      {
        from: "Archived",
        to: "Under Review",
        message: "Cannot restore archived policy to under review",
      },
      { from: "Archived", to: "Approved", message: "Cannot restore archived policy to approved" },
      { from: "Deprecated", to: "Published", message: "Cannot republish deprecated policy" },
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

  // Validate major content changes for published policies
  if (data.content_html && existingData?.status === "Published" && existingData?.content_html) {
    const oldContent = striptags(existingData.content_html).trim();
    const newContent = striptags(data.content_html).trim();

    // Simple check for significant content changes (more than 30% difference)
    const similarity =
      Math.min(oldContent.length, newContent.length) /
      Math.max(oldContent.length, newContent.length);

    if (similarity < 0.7) {
      errors.push({
        field: "content_html",
        message: "Major content changes to published policies may require formal revision process",
        code: "MAJOR_CONTENT_CHANGE",
      });
    }
  }

  // Validate review date updates
  if (data.next_review_date) {
    const reviewDate = new Date(data.next_review_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (reviewDate <= today) {
      errors.push({
        field: "next_review_date",
        message: "Next review date must be in the future",
        code: "INVALID_REVIEW_DATE",
      });
    }
  }

  // Apply creation business rules for updated data
  const creationRules = validatePolicyCreationBusinessRules(data);
  return [...errors, ...creationRules];
};

/**
 * Complete validation for policy creation with business rules
 */
export const validateCompletePolicyCreation = (data: any): ValidationError[] => {
  const validationErrors = validateCompletePolicy(data);
  const businessErrors = validatePolicyCreationBusinessRules(data);

  return [...validationErrors, ...businessErrors];
};

/**
 * Complete validation for policy updates with business rules
 */
export const validateCompletePolicyUpdate = (data: any, existingData?: any): ValidationError[] => {
  const validationErrors = validateUpdatePolicy(data);
  const businessErrors = validatePolicyUpdateBusinessRules(data, existingData);

  return [...validationErrors, ...businessErrors];
};
