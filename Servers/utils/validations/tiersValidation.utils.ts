/**
 * Tiers specific validation utilities
 * Contains validation schemas and functions specifically for tiers operations
 */

import {
  validateString,
  validateNumber,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError,
} from "./validation.utils";

/**
 * Validation constants for tiers
 */
export const TIERS_VALIDATION_LIMITS = {
  NAME: { MIN: 2, MAX: 50 },
  PRICE: { MIN: 0, MAX: 999999 },
  SEATS: { MIN: 1, MAX: 10000 },
  PROJECTS: { MIN: 1, MAX: 10000 },
  FRAMEWORKS: { MIN: 1, MAX: 1000 },
} as const;

/**
 * Valid tier IDs (based on current system design)
 */
export const VALID_TIER_IDS = [1, 2, 3, 4] as const;

/**
 * Valid tier names
 */
export const TIER_NAMES_ENUM = ["Free", "Starter", "Professional", "Enterprise"] as const;

/**
 * Validates tier ID parameter
 */
export const validateTierIdParam = (id: any): ValidationResult => {
  const foreignKeyValidation = validateForeignKey(id, "Tier ID", true);
  if (!foreignKeyValidation.isValid) {
    return foreignKeyValidation;
  }

  // Additional validation for tier ID range
  if (!VALID_TIER_IDS.includes(id)) {
    return {
      isValid: false,
      message: `Tier ID must be between 1 and ${Math.max(...VALID_TIER_IDS)}`,
      code: "INVALID_TIER_ID_RANGE",
    };
  }

  return { isValid: true };
};

/**
 * Validates tier name field
 */
export const validateTierName = (value: any): ValidationResult => {
  const stringValidation = validateString(value, "Tier name", {
    required: true,
    minLength: TIERS_VALIDATION_LIMITS.NAME.MIN,
    maxLength: TIERS_VALIDATION_LIMITS.NAME.MAX,
    trimWhitespace: true,
  });

  if (!stringValidation.isValid) {
    return stringValidation;
  }

  // Additional validation for tier name enum
  if (!TIER_NAMES_ENUM.includes(value as any)) {
    return {
      isValid: false,
      message: `Tier name must be one of: ${TIER_NAMES_ENUM.join(", ")}`,
      code: "INVALID_TIER_NAME",
    };
  }

  return { isValid: true };
};

/**
 * Validates tier price field
 */
export const validateTierPrice = (value: any): ValidationResult => {
  return validateNumber(value, "Tier price", {
    required: true,
    min: TIERS_VALIDATION_LIMITS.PRICE.MIN,
    max: TIERS_VALIDATION_LIMITS.PRICE.MAX,
    integer: false,
  });
};

/**
 * Validates tier features seats field
 */
export const validateTierSeats = (value: any): ValidationResult => {
  return validateNumber(value, "Tier seats", {
    required: true,
    min: TIERS_VALIDATION_LIMITS.SEATS.MIN,
    max: TIERS_VALIDATION_LIMITS.SEATS.MAX,
    integer: true,
  });
};

/**
 * Validates tier features projects field
 */
export const validateTierProjects = (value: any): ValidationResult => {
  return validateNumber(value, "Tier projects", {
    required: true,
    min: TIERS_VALIDATION_LIMITS.PROJECTS.MIN,
    max: TIERS_VALIDATION_LIMITS.PROJECTS.MAX,
    integer: true,
  });
};

/**
 * Validates tier features frameworks field
 */
export const validateTierFrameworks = (value: any): ValidationResult => {
  return validateNumber(value, "Tier frameworks", {
    required: true,
    min: TIERS_VALIDATION_LIMITS.FRAMEWORKS.MIN,
    max: TIERS_VALIDATION_LIMITS.FRAMEWORKS.MAX,
    integer: true,
  });
};

/**
 * Validates tier features object
 */
export const validateTierFeatures = (value: any): ValidationResult => {
  if (!value || typeof value !== "object") {
    return {
      isValid: false,
      message: "Tier features must be an object",
      code: "INVALID_FEATURES_TYPE",
    };
  }

  const requiredFields = ["seats", "projects", "frameworks"];
  for (const field of requiredFields) {
    if (!(field in value)) {
      return {
        isValid: false,
        message: `Tier features must include ${field}`,
        code: "MISSING_FEATURES_FIELD",
      };
    }
  }

  return { isValid: true };
};

/**
 * Validation schema for creating a new tier
 */
export const createTierSchema = {
  name: validateTierName,
  price: validateTierPrice,
  features: validateTierFeatures,
};

/**
 * Validation schema for updating a tier
 */
export const updateTierSchema = {
  name: (value: any) => (value !== undefined ? validateTierName(value) : { isValid: true }),
  price: (value: any) => (value !== undefined ? validateTierPrice(value) : { isValid: true }),
  features: (value: any) => (value !== undefined ? validateTierFeatures(value) : { isValid: true }),
};

/**
 * Validation schema for tier features
 */
export const tierFeaturesSchema = {
  seats: validateTierSeats,
  projects: validateTierProjects,
  frameworks: validateTierFrameworks,
};

/**
 * Validates a complete tier object for creation
 */
export const validateCompleteTier = (data: any): ValidationError[] => {
  const tierErrors = validateSchema(data, createTierSchema);

  // Additional validation for features if present
  if (data.features && typeof data.features === "object") {
    const featuresErrors = validateSchema(data.features, tierFeaturesSchema);
    // Prefix feature validation errors with 'features.'
    const prefixedFeaturesErrors = featuresErrors.map((error) => ({
      ...error,
      field: `features.${error.field}`,
    }));
    return [...tierErrors, ...prefixedFeaturesErrors];
  }

  return tierErrors;
};

/**
 * Validates a tier object for updates
 */
export const validateUpdateTier = (data: any): ValidationError[] => {
  // Check if at least one field is provided for update
  const updateFields = ["name", "price", "features"];
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

  const tierErrors = validateSchema(data, updateTierSchema);

  // Additional validation for features if being updated
  if (data.features && typeof data.features === "object") {
    const featuresErrors = validateSchema(data.features, tierFeaturesSchema);
    // Prefix feature validation errors with 'features.'
    const prefixedFeaturesErrors = featuresErrors.map((error) => ({
      ...error,
      field: `features.${error.field}`,
    }));
    return [...tierErrors, ...prefixedFeaturesErrors];
  }

  return tierErrors;
};

/**
 * Business rule validation for tier creation
 */
export const validateTierCreationBusinessRules = (data: any): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate tier hierarchy (pricing should increase with tier level)
  if (data.name && data.price !== undefined) {
    const tierHierarchy = {
      Free: { minPrice: 0, maxPrice: 0 },
      Starter: { minPrice: 1, maxPrice: 100 },
      Professional: { minPrice: 50, maxPrice: 500 },
      Enterprise: { minPrice: 200, maxPrice: 2000 },
    };

    const tierRules = tierHierarchy[data.name as keyof typeof tierHierarchy];
    if (tierRules) {
      if (data.price < tierRules.minPrice || data.price > tierRules.maxPrice) {
        errors.push({
          field: "price",
          message: `${data.name} tier price should be between $${tierRules.minPrice} and $${tierRules.maxPrice}`,
          code: "INVALID_TIER_PRICING",
        });
      }
    }
  }

  // Validate feature limits hierarchy
  if (data.name && data.features) {
    const featureLimits = {
      Free: { maxSeats: 5, maxProjects: 3, maxFrameworks: 2 },
      Starter: { maxSeats: 25, maxProjects: 10, maxFrameworks: 5 },
      Professional: { maxSeats: 100, maxProjects: 50, maxFrameworks: 20 },
      Enterprise: { maxSeats: 1000, maxProjects: 500, maxFrameworks: 100 },
    };

    const limits = featureLimits[data.name as keyof typeof featureLimits];
    if (limits) {
      if (data.features.seats > limits.maxSeats) {
        errors.push({
          field: "features.seats",
          message: `${data.name} tier cannot exceed ${limits.maxSeats} seats`,
          code: "EXCESSIVE_SEAT_LIMIT",
        });
      }
      if (data.features.projects > limits.maxProjects) {
        errors.push({
          field: "features.projects",
          message: `${data.name} tier cannot exceed ${limits.maxProjects} projects`,
          code: "EXCESSIVE_PROJECT_LIMIT",
        });
      }
      if (data.features.frameworks > limits.maxFrameworks) {
        errors.push({
          field: "features.frameworks",
          message: `${data.name} tier cannot exceed ${limits.maxFrameworks} frameworks`,
          code: "EXCESSIVE_FRAMEWORK_LIMIT",
        });
      }
    }
  }

  // Validate Free tier constraints
  if (data.name === "Free") {
    if (data.price !== 0) {
      errors.push({
        field: "price",
        message: "Free tier must have a price of $0",
        code: "FREE_TIER_PRICING",
      });
    }
  }

  // Validate feature consistency
  if (data.features) {
    // Seats should generally be higher than projects (users per project ratio)
    if (data.features.seats < data.features.projects) {
      errors.push({
        field: "features.seats",
        message: "Number of seats should typically be equal to or greater than number of projects",
        code: "INCONSISTENT_SEAT_PROJECT_RATIO",
      });
    }

    // Frameworks should be reasonable compared to projects
    if (data.features.frameworks > data.features.projects * 10) {
      errors.push({
        field: "features.frameworks",
        message: "Number of frameworks seems excessive compared to number of projects",
        code: "EXCESSIVE_FRAMEWORK_RATIO",
      });
    }
  }

  return errors;
};

/**
 * Business rule validation for tier updates
 */
export const validateTierUpdateBusinessRules = (
  data: any,
  existingData?: any,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // Validate price changes (shouldn't decrease existing tier prices drastically)
  if (data.price !== undefined && existingData?.price !== undefined) {
    const priceDecrease = ((existingData.price - data.price) / existingData.price) * 100;
    if (priceDecrease > 50) {
      errors.push({
        field: "price",
        message: "Price decreases of more than 50% may impact existing customers",
        code: "SIGNIFICANT_PRICE_DECREASE",
      });
    }
  }

  // Validate feature downgrades
  if (data.features && existingData?.features) {
    const featuresChecks = ["seats", "projects", "frameworks"];
    featuresChecks.forEach((feature) => {
      if (data.features[feature] < existingData.features[feature]) {
        errors.push({
          field: `features.${feature}`,
          message: `Reducing ${feature} limit may impact existing customers`,
          code: "FEATURE_DOWNGRADE",
        });
      }
    });
  }

  // Apply creation business rules for the updated data
  const creationRules = validateTierCreationBusinessRules(data);
  return [...errors, ...creationRules];
};

/**
 * Complete validation for tier creation with business rules
 */
export const validateCompleteTierCreation = (data: any): ValidationError[] => {
  const validationErrors = validateCompleteTier(data);
  const businessErrors = validateTierCreationBusinessRules(data);

  return [...validationErrors, ...businessErrors];
};

/**
 * Complete validation for tier updates with business rules
 */
export const validateCompleteTierUpdate = (data: any, existingData?: any): ValidationError[] => {
  const validationErrors = validateUpdateTier(data);
  const businessErrors = validateTierUpdateBusinessRules(data, existingData);

  return [...validationErrors, ...businessErrors];
};
