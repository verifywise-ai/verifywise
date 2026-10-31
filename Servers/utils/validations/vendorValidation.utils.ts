/**
 * Vendor specific validation utilities
 * Contains validation schemas and functions specifically for vendor operations
 */

import {
  validateString,
  validateEnum,
  validateDate,
  validateForeignKey,
  validateSchema,
  ValidationResult,
  ValidationError,
  VALIDATION_PATTERNS,
} from "./validation.utils";

/**
 * Validation constants for vendors
 */
export const VENDOR_VALIDATION_LIMITS = {
  VENDOR_NAME: { MIN: 1, MAX: 255 },
  VENDOR_PROVIDES: { MIN: 1, MAX: 500 },
  WEBSITE: { MIN: 1, MAX: 255 },
  VENDOR_CONTACT_PERSON: { MIN: 1, MAX: 255 },
  REVIEW_RESULT: { MIN: 1, MAX: 1000 },
  /**
   * The other names a vendor is known by (see services/vendorResearch/aliases.ts, which reads the
   * same limits): a text of names separated by commas, semicolons or line breaks.
   */
  OTHER_NAMES: { MAX_CHARS: 500, MAX_NAMES: 8, MIN_NAME_CHARS: 2, MAX_NAME_CHARS: 80 },
  /** A company registration number, as a register writes it. */
  REGISTRATION_NUMBER: { MAX: 64 },
} as const;

/**
 * Vendor review status enum
 */
export const VENDOR_REVIEW_STATUS_ENUM = [
  "Not started",
  "In review",
  "Reviewed",
  "Requires follow-up",
] as const;

/**
 * Vendor scorecard enums
 */
export const VENDOR_DATA_SENSITIVITY_ENUM = [
  "None",
  "Internal only",
  "Personally identifiable information (PII)",
  "Financial data",
  "Health data (e.g. HIPAA)",
  "Model weights or AI assets",
  "Other sensitive data",
] as const;

export const VENDOR_BUSINESS_CRITICALITY_ENUM = [
  "Low (vendor supports non-core functions)",
  "Medium (affects operations but is replaceable)",
  "High (critical to core services or products)",
] as const;

export const VENDOR_PAST_ISSUES_ENUM = [
  "None",
  "Minor incident (e.g. small delay, minor bug)",
  "Major incident (e.g. data breach, legal issue)",
] as const;

export const VENDOR_REGULATORY_EXPOSURE_ENUM = [
  "None",
  "GDPR (EU)",
  "HIPAA (US)",
  "SOC 2",
  "ISO 27001",
  "EU AI act",
  "CCPA (california)",
  "Other",
] as const;

/**
 * Validates vendor name field
 */
export const validateVendorName = (value: any): ValidationResult => {
  return validateString(value, "Vendor name", {
    required: true,
    minLength: VENDOR_VALIDATION_LIMITS.VENDOR_NAME.MIN,
    maxLength: VENDOR_VALIDATION_LIMITS.VENDOR_NAME.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates vendor provides field (what services/products the vendor provides)
 */
export const validateVendorProvides = (value: any): ValidationResult => {
  return validateString(value, "Vendor provides", {
    required: true,
    minLength: VENDOR_VALIDATION_LIMITS.VENDOR_PROVIDES.MIN,
    maxLength: VENDOR_VALIDATION_LIMITS.VENDOR_PROVIDES.MAX,
    trimWhitespace: true,
  });
};

/**
 * Validates website field with URL pattern
 */
export const validateWebsite = (value: any): ValidationResult => {
  // First validate as string
  const stringValidation = validateString(value, "Website", {
    required: true,
    minLength: VENDOR_VALIDATION_LIMITS.WEBSITE.MIN,
    maxLength: VENDOR_VALIDATION_LIMITS.WEBSITE.MAX,
    trimWhitespace: true,
  });

  if (!stringValidation.isValid) {
    return stringValidation;
  }

  // Then validate URL format (basic validation)
  const urlPattern = /^https?:\/\/.+\..+/;
  if (!urlPattern.test(value.trim())) {
    return {
      isValid: false,
      message: "Website must be a valid URL (starting with http:// or https://)",
      code: "INVALID_URL_FORMAT",
    };
  }

  return { isValid: true };
};

/**
 * Validates vendor contact person field
 */
export const validateVendorContactPerson = (value: any): ValidationResult => {
  return validateString(value, "Vendor contact person", {
    required: true,
    minLength: VENDOR_VALIDATION_LIMITS.VENDOR_CONTACT_PERSON.MIN,
    maxLength: VENDOR_VALIDATION_LIMITS.VENDOR_CONTACT_PERSON.MAX,
    trimWhitespace: true,
    pattern: VALIDATION_PATTERNS.LETTERS_ONLY, // Only letters and spaces allowed
  });
};

/**
 * Validates review result field
 */
export const validateReviewResult = (value: any): ValidationResult => {
  return validateString(value, "Review result", {
    required: false,
    minLength: VENDOR_VALIDATION_LIMITS.REVIEW_RESULT.MIN,
    maxLength: VENDOR_VALIDATION_LIMITS.REVIEW_RESULT.MAX,
    trimWhitespace: true,
  });
};

/** A name for comparing: lower case, letters and digits only ("Face-Book" and "facebook" are one). */
const nameKey = (name: string): string => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/** The names in a text, in the order written: split at commas, semicolons and line breaks, white space collapsed. */
const namesIn = (text: string): string[] =>
  text
    .split(/[,;\n\r]+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part !== "");

/** The names once each, however they are written; the first way a name was written stays. */
const distinctNames = (names: readonly string[]): string[] => {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = nameKey(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Validates the other names of a vendor: optional text of at most 500 characters that holds at most
 * 8 names, each of 2 to 80 characters with a letter or a digit in it. A name that is written twice
 * counts once.
 */
export const validateOtherNames = (value: any): ValidationResult => {
  const limits = VENDOR_VALIDATION_LIMITS.OTHER_NAMES;
  if (value === undefined || value === null) return { isValid: true };
  if (typeof value !== "string") {
    return { isValid: false, message: "Other names must be text", code: "INVALID_TYPE" };
  }
  const text = value.trim();
  if (text.length > limits.MAX_CHARS) {
    return {
      isValid: false,
      message: `Other names must be at most ${limits.MAX_CHARS} characters`,
      code: "TOO_LONG",
    };
  }
  const names = namesIn(text);
  if (
    names.some((name) => name.length < limits.MIN_NAME_CHARS || name.length > limits.MAX_NAME_CHARS)
  ) {
    return {
      isValid: false,
      message: `Each of the other names must be between ${limits.MIN_NAME_CHARS} and ${limits.MAX_NAME_CHARS} characters`,
      code: "INVALID_NAME_LENGTH",
    };
  }
  if (names.some((name) => nameKey(name) === "")) {
    return {
      isValid: false,
      message: "Each of the other names must contain a letter or a digit",
      code: "INVALID_NAME",
    };
  }
  if (distinctNames(names).length > limits.MAX_NAMES) {
    return {
      isValid: false,
      message: `Other names can list at most ${limits.MAX_NAMES} names`,
      code: "TOO_MANY",
    };
  }
  return { isValid: true };
};

/**
 * The other names as they are stored: the names once each, joined by a comma and a space; null
 * when there is none. The text is expected to be valid (see `validateOtherNames`).
 */
export const normalizeOtherNames = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const names = distinctNames(namesIn(value));
  return names.length === 0 ? null : names.join(", ");
};

/**
 * The officially assigned codes of ISO 3166-1 alpha-2 (249). Not the regions a browser can also
 * name (EU, UN, XK, ZZ), nor an old code that stands for another (UK for GB).
 */
export const ISO_COUNTRY_CODES: readonly string[] = [
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ",
  "BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ",
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ",
  "DE DJ DK DM DO DZ",
  "EC EE EG EH ER ES ET",
  "FI FJ FK FM FO FR",
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY",
  "HK HM HN HR HT HU",
  "ID IE IL IM IN IO IQ IR IS IT",
  "JE JM JO JP",
  "KE KG KH KI KM KN KP KR KW KY KZ",
  "LA LB LC LI LK LR LS LT LU LV LY",
  "MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ",
  "NA NC NE NF NG NI NL NO NP NR NU NZ",
  "OM",
  "PA PE PF PG PH PK PL PM PN PR PS PT PW PY",
  "QA",
  "RE RO RS RU RW",
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ",
  "TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ",
  "UA UG UM US UY UZ",
  "VA VC VE VG VI VN VU",
  "WF WS",
  "YE YT",
  "ZA ZM ZW",
].flatMap((line) => line.split(" "));

/** An identifier given as text, trimmed; undefined for a value that is not text. */
const identifierText = (value: unknown): string | undefined =>
  typeof value === "string" ? value.trim() : undefined;

/** The result for an identifier that is not text, null or undefined. */
const notText = (label: string): ValidationResult => ({
  isValid: false,
  message: `${label} must be text`,
  code: "INVALID_TYPE",
});

/** The vendor's country: optional, an ISO 3166-1 alpha-2 code in either case. */
export const validateCountry = (value: unknown): ValidationResult => {
  if (value === undefined || value === null) return { isValid: true };
  const text = identifierText(value);
  if (text === undefined) return notText("Country");
  if (text === "" || ISO_COUNTRY_CODES.includes(text.toUpperCase())) return { isValid: true };
  return {
    isValid: false,
    message: "Country must be a two-letter ISO 3166-1 code, such as DE",
    code: "INVALID_COUNTRY",
  };
};

/** The country as it is stored: upper case; null when there is none. */
export const normalizeCountry = (value: unknown): string | null => {
  const text = identifierText(value);
  return text ? text.toUpperCase() : null;
};

/** The registration number as it is checked and stored: trimmed, inner white space collapsed. */
const registrationNumberOf = (text: string): string => text.replace(/\s+/g, " ");

/** The vendor's company registration number: optional text of at most 64 characters. */
export const validateRegistrationNumber = (value: unknown): ValidationResult => {
  if (value === undefined || value === null) return { isValid: true };
  const text = identifierText(value);
  if (text === undefined) return notText("Registration number");
  const max = VENDOR_VALIDATION_LIMITS.REGISTRATION_NUMBER.MAX;
  if (registrationNumberOf(text).length > max) {
    return {
      isValid: false,
      message: `Registration number must be at most ${max} characters`,
      code: "TOO_LONG",
    };
  }
  return { isValid: true };
};

/** The registration number as it is stored; null when there is none. */
export const normalizeRegistrationNumber = (value: unknown): string | null => {
  const text = identifierText(value);
  return text ? registrationNumberOf(text) : null;
};

/** The LEI as it is checked and stored: without white space, in upper case. */
const leiOf = (text: string): string => text.replace(/\s+/g, "").toUpperCase();

/**
 * True when an LEI's check digits match (ISO 17442, ISO 7064 MOD 97-10): read with its letters as
 * 10 to 35, the whole number leaves 1 when divided by 97.
 */
const leiCheckDigitsMatch = (lei: string): boolean => {
  let rest = 0;
  for (const character of lei) {
    const value = parseInt(character, 36);
    rest = (rest * (value > 9 ? 100 : 10) + value) % 97;
  }
  return rest === 1;
};

/** True for an LEI in its stored form (no white space, upper case) whose check digits match. */
export const isValidLei = (lei: string): boolean =>
  /^[A-Z0-9]{18}[0-9]{2}$/.test(lei) && leiCheckDigitsMatch(lei);

/** The vendor's Legal Entity Identifier: optional, 18 letters or digits and 2 check digits. */
export const validateLei = (value: unknown): ValidationResult => {
  if (value === undefined || value === null) return { isValid: true };
  const text = identifierText(value);
  if (text === undefined) return notText("LEI");
  if (text === "") return { isValid: true };
  const lei = leiOf(text);
  if (!/^[A-Z0-9]{18}[0-9]{2}$/.test(lei)) {
    return {
      isValid: false,
      message: "LEI must be 18 letters or digits followed by 2 check digits",
      code: "INVALID_FORMAT",
    };
  }
  if (!leiCheckDigitsMatch(lei)) {
    return {
      isValid: false,
      message: "LEI check digits do not match",
      code: "INVALID_CHECK_DIGITS",
    };
  }
  return { isValid: true };
};

/** The LEI as it is stored; null when there is none. */
export const normalizeLei = (value: unknown): string | null => {
  const text = identifierText(value);
  return text ? leiOf(text) : null;
};

/** The vendor's Central Index Key at the SEC: optional, one to ten digits. */
export const validateSecCik = (value: unknown): ValidationResult => {
  if (value === undefined || value === null) return { isValid: true };
  const text = identifierText(value);
  if (text === undefined) return notText("SEC CIK");
  if (text === "" || /^[0-9]{1,10}$/.test(text)) return { isValid: true };
  return { isValid: false, message: "SEC CIK must be one to ten digits", code: "INVALID_FORMAT" };
};

/** The CIK as it is stored: ten digits, padded with zeros; null when there is none. */
export const normalizeSecCik = (value: unknown): string | null => {
  const text = identifierText(value);
  return text ? text.padStart(10, "0") : null;
};

/** The identifiers of a vendor, each with how it is stored. */
const IDENTIFIER_NORMALIZERS = {
  country: normalizeCountry,
  registration_number: normalizeRegistrationNumber,
  lei: normalizeLei,
  sec_cik: normalizeSecCik,
} as const;

/**
 * `data` with each identifier it gives in the form it is stored, and the other fields as they are:
 * what the change history records.
 */
export const withNormalizedIdentifiers = <T extends Record<string, unknown>>(data: T): T => {
  const normalized: Record<string, unknown> = { ...data };
  for (const [field, normalize] of Object.entries(IDENTIFIER_NORMALIZERS)) {
    if (data[field] !== undefined) normalized[field] = normalize(data[field]);
  }
  return normalized as T;
};

/**
 * Validates review status enum field
 */
export const validateReviewStatus = (value: any): ValidationResult => {
  return validateEnum(value, "Review status", VENDOR_REVIEW_STATUS_ENUM, false);
};

/**
 * Validates data sensitivity enum field
 */
export const validateDataSensitivity = (value: any): ValidationResult => {
  return validateEnum(value, "Data sensitivity", VENDOR_DATA_SENSITIVITY_ENUM, false);
};

/**
 * Validates business criticality enum field
 */
export const validateBusinessCriticality = (value: any): ValidationResult => {
  return validateEnum(value, "Business criticality", VENDOR_BUSINESS_CRITICALITY_ENUM, false);
};

/**
 * Validates past issues enum field
 */
export const validatePastIssues = (value: any): ValidationResult => {
  return validateEnum(value, "Past issues", VENDOR_PAST_ISSUES_ENUM, false);
};

/**
 * Validates regulatory exposure enum field
 */
export const validateRegulatoryExposure = (value: any): ValidationResult => {
  return validateEnum(value, "Regulatory exposure", VENDOR_REGULATORY_EXPOSURE_ENUM, false);
};

/**
 * Validates assignee foreign key
 */
export const validateAssignee = (value: any): ValidationResult => {
  return validateForeignKey(value, "Assignee", true);
};

/**
 * Validates reviewer foreign key
 */
export const validateReviewer = (value: any): ValidationResult => {
  return validateForeignKey(value, "Reviewer", false);
};

/**
 * Validates review date field
 */
export const validateReviewDate = (value: any): ValidationResult => {
  return validateDate(value, "Review date", {
    required: false,
  });
};

/**
 * Validates vendor ID for existing records
 */
export const validateVendorId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Vendor ID", true);
};

/**
 * Validates project ID for queries
 */
export const validateProjectId = (value: any): ValidationResult => {
  return validateForeignKey(value, "Project ID", true);
};

/**
 * Validates projects array field (required)
 */
export const validateProjects = (value: any): ValidationResult => {
  // Projects field is required
  if (value === undefined || value === null) {
    return {
      isValid: false,
      message: "Projects is required",
      code: "REQUIRED_FIELD",
    };
  }

  // Must be an array
  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: "Projects must be an array",
      code: "INVALID_ARRAY",
    };
  }

  // Array cannot be empty since it's required
  if (value.length === 0) {
    return {
      isValid: false,
      message: "Projects array cannot be empty",
      code: "EMPTY_REQUIRED_ARRAY",
    };
  }

  // Validate each project ID in the array
  for (let i = 0; i < value.length; i++) {
    const projectId = value[i];
    const validation = validateForeignKey(projectId, `Project ID at index ${i}`, false);
    if (!validation.isValid) {
      return {
        isValid: false,
        message: `Invalid project ID at index ${i}: ${validation.message}`,
        code: validation.code || "INVALID_PROJECT_ID",
      };
    }
  }

  return { isValid: true };
};

/**
 * Validation schema for creating a new vendor
 */
export const createVendorSchema = {
  vendor_name: validateVendorName,
  vendor_provides: validateVendorProvides,
  assignee: validateAssignee,
  website: validateWebsite,
  vendor_contact_person: validateVendorContactPerson,
  review_result: validateReviewResult,
  review_status: validateReviewStatus,
  reviewer: validateReviewer,
  review_date: validateReviewDate,
  projects: validateProjects,
  data_sensitivity: validateDataSensitivity,
  business_criticality: validateBusinessCriticality,
  past_issues: validatePastIssues,
  regulatory_exposure: validateRegulatoryExposure,
  other_names: validateOtherNames,
  country: validateCountry,
  registration_number: validateRegistrationNumber,
  lei: validateLei,
  sec_cik: validateSecCik,
};

/**
 * Validation schema for updating a vendor
 * All fields are optional for updates
 */
export const updateVendorSchema = {
  vendor_name: (value: any) =>
    value !== undefined ? validateVendorName(value) : { isValid: true },
  vendor_provides: (value: any) =>
    value !== undefined ? validateVendorProvides(value) : { isValid: true },
  assignee: (value: any) => (value !== undefined ? validateAssignee(value) : { isValid: true }),
  website: (value: any) => (value !== undefined ? validateWebsite(value) : { isValid: true }),
  vendor_contact_person: (value: any) =>
    value !== undefined ? validateVendorContactPerson(value) : { isValid: true },
  review_result: (value: any) =>
    value !== undefined ? validateReviewResult(value) : { isValid: true },
  review_status: (value: any) =>
    value !== undefined ? validateReviewStatus(value) : { isValid: true },
  reviewer: (value: any) => (value !== undefined ? validateReviewer(value) : { isValid: true }),
  review_date: (value: any) =>
    value !== undefined ? validateReviewDate(value) : { isValid: true },
  projects: (value: any) => (value !== undefined ? validateProjects(value) : { isValid: true }),
  data_sensitivity: (value: any) =>
    value !== undefined ? validateDataSensitivity(value) : { isValid: true },
  business_criticality: (value: any) =>
    value !== undefined ? validateBusinessCriticality(value) : { isValid: true },
  past_issues: (value: any) =>
    value !== undefined ? validatePastIssues(value) : { isValid: true },
  regulatory_exposure: (value: any) =>
    value !== undefined ? validateRegulatoryExposure(value) : { isValid: true },
  other_names: (value: any) =>
    value !== undefined ? validateOtherNames(value) : { isValid: true },
  country: validateCountry,
  registration_number: validateRegistrationNumber,
  lei: validateLei,
  sec_cik: validateSecCik,
};

/**
 * Validates a complete vendor object for creation
 */
export const validateCompleteVendor = (data: any): ValidationError[] => {
  return validateSchema(data, createVendorSchema);
};

/**
 * Validates a vendor object for updates
 */
export const validateUpdateVendor = (data: any): ValidationError[] => {
  // Check if at least one field is provided for update
  const updateFields = [
    "vendor_name",
    "vendor_provides",
    "assignee",
    "website",
    "vendor_contact_person",
    "review_result",
    "review_status",
    "reviewer",
    "review_date",
    "projects",
    "data_sensitivity",
    "business_criticality",
    "past_issues",
    "regulatory_exposure",
    "other_names",
    "country",
    "registration_number",
    "lei",
    "sec_cik",
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

  return validateSchema(data, updateVendorSchema);
};

/**
 * Validates vendor ID parameter
 */
export const validateVendorIdParam = (id: any): ValidationResult => {
  return validateVendorId(id);
};

/**
 * Validates project ID parameter
 */
export const validateProjectIdParam = (id: any): ValidationResult => {
  return validateProjectId(id);
};

/**
 * Business logic validations
 */

/**
 * Validates that review status progression is logical
 */
export const validateReviewStatusProgression = (
  currentStatus: string,
  newStatus: string,
): ValidationResult => {
  // If status hasn't changed, it's always valid
  if (currentStatus === newStatus) {
    return { isValid: true, message: "", code: "" };
  }

  // Define valid status transitions
  const validTransitions: Record<string, string[]> = {
    "Not started": ["In review"],
    "In review": ["Reviewed", "Requires follow-up"],
    Reviewed: ["Requires follow-up"], // Can go back to follow-up if issues found
    "Requires follow-up": ["In review", "Reviewed"], // Can go back to review or directly to reviewed
  };

  const allowedStatuses = validTransitions[currentStatus] || [];

  if (!allowedStatuses.includes(newStatus)) {
    return {
      isValid: false,
      message: `Invalid status transition from "${currentStatus}" to "${newStatus}". Allowed transitions: ${allowedStatuses.join(", ")}`,
      code: "INVALID_STATUS_TRANSITION",
    };
  }

  return { isValid: true, message: "", code: "" };
};

/**
 * Validates that review date is not in the future for completed reviews
 */
export const validateReviewDateConsistency = (
  reviewStatus: string,
  reviewDate: Date,
): ValidationResult => {
  if (reviewStatus === "Reviewed" || reviewStatus === "Requires follow-up") {
    const now = new Date();
    if (reviewDate > now) {
      return {
        isValid: false,
        message: "Review date cannot be in the future for completed reviews",
        code: "FUTURE_REVIEW_DATE",
      };
    }
  }

  return { isValid: true };
};

/**
 * Validates website accessibility (placeholder for future implementation)
 */
export const validateWebsiteAccessibility = async (website: string): Promise<ValidationResult> => {
  // This would be implemented to check if website is accessible
  // For now, just validate the URL format
  return validateWebsite(website);
};

/**
 * Validates that user exists (placeholder for database check)
 */
export const validateUserExists = async (userId: number): Promise<ValidationResult> => {
  // This would be implemented to check if user exists in database
  // For now, just validate the ID format
  return validateForeignKey(userId, "User ID", true);
};

/**
 * Complete validation for vendor creation with business rules
 */
export const validateCompleteVendorWithBusinessRules = (data: any): ValidationError[] => {
  const errors = validateCompleteVendor(data);

  // Add business rule validations if basic validation passes
  if (errors.length === 0) {
    // Check review date consistency
    if (data.review_status && data.review_date) {
      const reviewDateCheck = validateReviewDateConsistency(
        data.review_status,
        new Date(data.review_date),
      );

      if (!reviewDateCheck.isValid) {
        errors.push({
          field: "review_date",
          message: reviewDateCheck.message || "Review date is inconsistent",
          code: reviewDateCheck.code || "BUSINESS_RULE_VIOLATION",
        });
      }
    }
  }

  return errors;
};

/**
 * Complete validation for vendor updates with business rules
 */
export const validateUpdateVendorWithBusinessRules = (
  data: any,
  currentVendor?: any,
): ValidationError[] => {
  const errors = validateUpdateVendor(data);

  // Add business rule validations if basic validation passes
  if (errors.length === 0 && currentVendor) {
    // Check status progression if status is being updated
    if (data.review_status !== undefined) {
      const statusProgression = validateReviewStatusProgression(
        currentVendor.review_status,
        data.review_status,
      );

      if (!statusProgression.isValid) {
        errors.push({
          field: "review_status",
          message: statusProgression.message || "Invalid status progression",
          code: statusProgression.code || "BUSINESS_RULE_VIOLATION",
        });
      }
    }

    // Check review date consistency
    const newStatus =
      data.review_status !== undefined ? data.review_status : currentVendor.review_status;
    const newDate = data.review_date !== undefined ? data.review_date : currentVendor.review_date;

    if (newStatus && newDate) {
      const reviewDateCheck = validateReviewDateConsistency(newStatus, new Date(newDate));

      if (!reviewDateCheck.isValid) {
        errors.push({
          field: "review_date",
          message: reviewDateCheck.message || "Review date is inconsistent",
          code: reviewDateCheck.code || "BUSINESS_RULE_VIOLATION",
        });
      }
    }
  }

  return errors;
};
