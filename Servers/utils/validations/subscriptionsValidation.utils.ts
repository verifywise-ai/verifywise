/**
 * Subscriptions specific validation utilities
 * Contains validation schemas and functions specifically for subscription operations
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

/**
 * Validation constants for subscriptions
 */
export const SUBSCRIPTIONS_VALIDATION_LIMITS = {
  STRIPE_SUB_ID: { MIN: 3, MAX: 255 },
} as const;

/**
 * Subscription status enum values
 */
export const SUBSCRIPTION_STATUS_ENUM = ["active", "inactive", "canceled"] as const;

/**
 * Validates organization ID field
 */
export const validateOrganizationId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Organization ID", true);
};

/**
 * Validates tier ID field
 */
export const validateTierId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Tier ID", true);
};

/**
 * Validates Stripe subscription ID field
 */
export const validateStripeSubId = (value: any): ValidationResult => {
  const stringValidation = validateString(value, "Stripe subscription ID", {
    required: true,
    minLength: SUBSCRIPTIONS_VALIDATION_LIMITS.STRIPE_SUB_ID.MIN,
    maxLength: SUBSCRIPTIONS_VALIDATION_LIMITS.STRIPE_SUB_ID.MAX,
    trimWhitespace: true,
  });

  if (!stringValidation.isValid) {
    return stringValidation;
  }

  // Additional validation for Stripe subscription ID format
  const stripeSubIdPattern = /^sub_[a-zA-Z0-9]+$/;
  if (!stripeSubIdPattern.test(value)) {
    return {
      isValid: false,
      message: 'Stripe subscription ID must start with "sub_" followed by alphanumeric characters',
      code: "INVALID_STRIPE_SUB_ID_FORMAT",
    };
  }

  return { isValid: true };
};

/**
 * Validates subscription status field
 */
export const validateSubscriptionStatus = (value: any): ValidationResult => {
  return validateEnum(value, "Subscription status", SUBSCRIPTION_STATUS_ENUM, true);
};

/**
 * Validates start date field
 */
export const validateStartDate = (value: any): ValidationResult => {
  return validateDate(value, "Start date", { required: true });
};

/**
 * Validates end date field (optional)
 */
export const validateEndDate = (value: any): ValidationResult => {
  if (value === undefined || value === null || value === "") {
    return { isValid: true }; // End date is optional
  }

  return validateDate(value, "End date", { required: false });
};

/**
 * Validates subscription ID parameter
 */
export const validateSubscriptionIdParam = (id: any): ValidationResult => {
  return validateForeignKey(id, "Subscription ID", true);
};

/**
 * Validation schema for creating a new subscription
 */
export const createSubscriptionSchema = {
  organization_id: validateOrganizationId,
  tier_id: validateTierId,
  stripe_sub_id: validateStripeSubId,
  status: validateSubscriptionStatus,
  start_date: validateStartDate,
  end_date: validateEndDate,
};

/**
 * Validation schema for updating a subscription
 */
export const updateSubscriptionSchema = {
  tier_id: (value: any) => (value !== undefined ? validateTierId(value) : { isValid: true }),
  stripe_sub_id: (value: any) =>
    value !== undefined ? validateStripeSubId(value) : { isValid: true },
  status: (value: any) =>
    value !== undefined ? validateSubscriptionStatus(value) : { isValid: true },
  start_date: (value: any) => (value !== undefined ? validateStartDate(value) : { isValid: true }),
  end_date: (value: any) => (value !== undefined ? validateEndDate(value) : { isValid: true }),
};

/**
 * Validates a complete subscription object for creation
 */
export const validateCompleteSubscription = (data: any): ValidationError[] => {
  return validateSchema(data, createSubscriptionSchema);
};

/**
 * Validates a subscription object for updates
 */
export const validateUpdateSubscription = (data: any): ValidationError[] => {
  // Check if at least one field is provided for update
  const updateFields = ["tier_id", "stripe_sub_id", "status", "start_date", "end_date"];
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

  return validateSchema(data, updateSubscriptionSchema);
};

/**
 * Business rule validation for subscription creation
 */
export const validateSubscriptionCreationBusinessRules = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate start date is not in the past (with some tolerance for timezone issues)
  if (data.start_date) {
    const startDate = new Date(data.start_date);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (startDate < yesterday) {
      errors.push({
        field: "start_date",
        message: "Start date cannot be more than one day in the past",
        code: "INVALID_START_DATE",
      });
    }
  }

  // Validate end date is after start date
  if (data.start_date && data.end_date) {
    const startDate = new Date(data.start_date);
    const endDate = new Date(data.end_date);

    if (endDate <= startDate) {
      errors.push({
        field: "end_date",
        message: "End date must be after start date",
        code: "INVALID_DATE_RANGE",
      });
    }

    // Validate subscription duration is reasonable
    const durationDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (durationDays > 3650) {
      // 10 years
      errors.push({
        field: "end_date",
        message: "Subscription duration cannot exceed 10 years",
        code: "EXCESSIVE_DURATION",
      });
    }

    if (durationDays < 1) {
      errors.push({
        field: "end_date",
        message: "Subscription duration must be at least 1 day",
        code: "INSUFFICIENT_DURATION",
      });
    }
  }

  // Validate status for new subscriptions
  if (data.status) {
    const validInitialStatuses = ["active", "inactive"];
    if (!validInitialStatuses.includes(data.status)) {
      errors.push({
        field: "status",
        message: 'New subscriptions should start with "active" or "inactive" status',
        code: "INVALID_INITIAL_STATUS",
      });
    }
  }

  // Validate Stripe subscription ID uniqueness (business logic check)
  if (data.stripe_sub_id) {
    // Check for obvious test/dummy IDs
    const testPatterns = ["test", "dummy", "fake", "sample"];
    const containsTestPattern = testPatterns.some((pattern) =>
      data.stripe_sub_id.toLowerCase().includes(pattern),
    );
    if (containsTestPattern) {
      errors.push({
        field: "stripe_sub_id",
        message: "Stripe subscription ID should not contain test or placeholder terms",
        code: "INVALID_STRIPE_SUB_ID",
      });
    }
  }

  // Validate tier ID exists (basic range check)
  if (data.tier_id) {
    if (data.tier_id < 1 || data.tier_id > 4) {
      errors.push({
        field: "tier_id",
        message: "Tier ID must be between 1 and 4",
        code: "INVALID_TIER_ID_RANGE",
      });
    }
  }

  return errors;
};

/**
 * Business rule validation for subscription updates
 */
export const validateSubscriptionUpdateBusinessRules = (
  data: any,
  existingData?: any,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate status transitions
  if (data.status && existingData?.status) {
    const invalidTransitions = [
      { from: "canceled", to: "active", message: "Cannot reactivate a canceled subscription" },
      {
        from: "canceled",
        to: "inactive",
        message: "Cannot change canceled subscription to inactive",
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

  // Validate date modifications
  if (data.start_date && existingData?.start_date) {
    const existingStartDate = new Date(existingData.start_date);
    const newStartDate = new Date(data.start_date);

    // Don't allow changing start date for active subscriptions significantly
    if (existingData.status === "active") {
      const daysDifference = Math.abs(
        (newStartDate.getTime() - existingStartDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysDifference > 7) {
        errors.push({
          field: "start_date",
          message: "Cannot modify start date by more than 7 days for active subscriptions",
          code: "INVALID_START_DATE_MODIFICATION",
        });
      }
    }
  }

  // Validate end date modifications
  if (data.end_date && data.start_date && existingData) {
    const startDate = new Date(data.start_date || existingData.start_date);
    const endDate = new Date(data.end_date);

    if (endDate <= startDate) {
      errors.push({
        field: "end_date",
        message: "End date must be after start date",
        code: "INVALID_DATE_RANGE",
      });
    }
  }

  // Validate tier changes for active subscriptions
  if (data.tier_id && existingData?.tier_id && existingData?.status === "active") {
    if (data.tier_id !== existingData.tier_id) {
      // Tier changes for active subscriptions should be handled carefully
      if (data.tier_id < existingData.tier_id) {
        errors.push({
          field: "tier_id",
          message: "Downgrading tier for active subscription may require additional validation",
          code: "TIER_DOWNGRADE_WARNING",
        });
      }
    }
  }

  // Validate Stripe subscription ID changes
  if (data.stripe_sub_id && existingData?.stripe_sub_id) {
    if (data.stripe_sub_id !== existingData.stripe_sub_id && existingData.status === "active") {
      errors.push({
        field: "stripe_sub_id",
        message:
          "Changing Stripe subscription ID for active subscription requires careful handling",
        code: "STRIPE_ID_CHANGE_WARNING",
      });
    }
  }

  return errors;
};

/**
 * Complete validation for subscription creation with business rules
 */
export const validateCompleteSubscriptionCreation = (data: any): ValidationError[] => {
  const validationErrors = validateCompleteSubscription(data);
  const businessErrors = validateSubscriptionCreationBusinessRules(data);

  return [...validationErrors, ...businessErrors];
};

/**
 * Complete validation for subscription updates with business rules
 */
export const validateCompleteSubscriptionUpdate = (
  data: any,
  existingData?: any,
): ValidationError[] => {
  const validationErrors = validateUpdateSubscription(data);
  const businessErrors = validateSubscriptionUpdateBusinessRules(data, existingData);

  return [...validationErrors, ...businessErrors];
};
