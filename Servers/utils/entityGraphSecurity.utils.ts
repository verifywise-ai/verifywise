/**
 * @fileoverview Entity Graph Security Utilities
 *
 * Security validation and sanitization functions for Entity Graph operations.
 * Implements defense-in-depth security measures.
 *
 * @module utils/entityGraphSecurity
 */

// Valid entity types that can be annotated
export const VALID_ENTITY_TYPES = [
  "useCase",
  "model",
  "risk",
  "vendor",
  "control",
  "evidence",
  "framework",
  "user",
] as const;

export type ValidEntityType = (typeof VALID_ENTITY_TYPES)[number];

/**
 * Validates that a schema name is safe for use in SQL queries.
 * Schema names from getTenantHash are alphanumeric, but we validate for defense-in-depth.
 *
 * @param {string} schemaName - The schema name to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidSchemaName(schemaName: string): boolean {
  if (!schemaName || typeof schemaName !== "string") {
    return false;
  }

  // Schema names must be alphanumeric only (from getTenantHash)
  // Max length 63 chars (PostgreSQL limit)
  const schemaRegex = /^[a-zA-Z0-9]{1,63}$/;
  return schemaRegex.test(schemaName);
}

/**
 * Validates that an entity type is in the allowed whitelist.
 *
 * @param {string} entityType - The entity type to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidEntityType(entityType: string): boolean {
  if (!entityType || typeof entityType !== "string") {
    return false;
  }

  return VALID_ENTITY_TYPES.includes(entityType as ValidEntityType);
}

/**
 * Validates entity ID format.
 * Entity IDs follow pattern: {entityType}-{id}-{relation} or {entityType}-{id}
 *
 * @param {string} entityId - The entity ID to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidEntityId(entityId: string): boolean {
  if (!entityId || typeof entityId !== "string") {
    return false;
  }

  // Max length 100 chars (database column limit)
  if (entityId.length > 100) {
    return false;
  }

  // Must start with a valid entity type
  const startsWithValidType = VALID_ENTITY_TYPES.some((type) => entityId.startsWith(type + "-"));

  // Only allow alphanumeric, hyphens, and underscores
  const safeCharsRegex = /^[a-zA-Z0-9\-_]+$/;

  return startsWithValidType && safeCharsRegex.test(entityId);
}

/**
 * Sanitizes annotation content.
 * Trims whitespace and validates length.
 *
 * @param {string} content - The content to sanitize
 * @returns {{ valid: boolean; sanitized: string; error?: string }}
 */
export function sanitizeAnnotationContent(content: string): {
  valid: boolean;
  sanitized: string;
  error?: string;
} {
  if (!content || typeof content !== "string") {
    return { valid: false, sanitized: "", error: "Content is required" };
  }

  const sanitized = content.trim();

  if (sanitized.length === 0) {
    return { valid: false, sanitized: "", error: "Content cannot be empty" };
  }

  if (sanitized.length > 2000) {
    return {
      valid: false,
      sanitized: "",
      error: "Content cannot exceed 2000 characters",
    };
  }

  return { valid: true, sanitized };
}

/**
 * Sanitizes view name.
 *
 * @param {string} name - The view name to sanitize
 * @returns {{ valid: boolean; sanitized: string; error?: string }}
 */
export function sanitizeViewName(name: string): {
  valid: boolean;
  sanitized: string;
  error?: string;
} {
  if (!name || typeof name !== "string") {
    return { valid: false, sanitized: "", error: "View name is required" };
  }

  const sanitized = name.trim();

  if (sanitized.length === 0) {
    return { valid: false, sanitized: "", error: "View name cannot be empty" };
  }

  if (sanitized.length > 100) {
    return {
      valid: false,
      sanitized: "",
      error: "View name cannot exceed 100 characters",
    };
  }

  return { valid: true, sanitized };
}

/**
 * Validates and sanitizes view config JSON.
 * Removes any unexpected properties and validates structure.
 *
 * @param {unknown} config - The config to validate
 * @returns {{ valid: boolean; sanitized: object; error?: string }}
 */
export function sanitizeViewConfig(config: unknown): {
  valid: boolean;
  sanitized: {
    visibleEntities?: string[];
    visibleRelationships?: string[];
    showProblemsOnly?: boolean;
    showGapsOnly?: boolean;
    query?: {
      entityType: string;
      condition: string;
      attribute: string;
    } | null;
  };
  error?: string;
} {
  if (!config || typeof config !== "object") {
    return { valid: false, sanitized: {}, error: "Valid config object is required" };
  }

  const c = config as Record<string, unknown>;
  const sanitized: {
    visibleEntities?: string[];
    visibleRelationships?: string[];
    showProblemsOnly?: boolean;
    showGapsOnly?: boolean;
    query?: {
      entityType: string;
      condition: string;
      attribute: string;
    } | null;
  } = {};

  // Validate visibleEntities
  if (c.visibleEntities !== undefined) {
    if (!Array.isArray(c.visibleEntities)) {
      return { valid: false, sanitized: {}, error: "visibleEntities must be an array" };
    }
    // Filter to only valid strings with max 50 chars each
    sanitized.visibleEntities = c.visibleEntities
      .filter((e): e is string => typeof e === "string" && e.length <= 50)
      .slice(0, 20); // Max 20 entities
  }

  // Validate visibleRelationships
  if (c.visibleRelationships !== undefined) {
    if (!Array.isArray(c.visibleRelationships)) {
      return { valid: false, sanitized: {}, error: "visibleRelationships must be an array" };
    }
    sanitized.visibleRelationships = c.visibleRelationships
      .filter((r): r is string => typeof r === "string" && r.length <= 50)
      .slice(0, 20);
  }

  // Validate booleans
  if (c.showProblemsOnly !== undefined) {
    sanitized.showProblemsOnly = Boolean(c.showProblemsOnly);
  }

  if (c.showGapsOnly !== undefined) {
    sanitized.showGapsOnly = Boolean(c.showGapsOnly);
  }

  // Validate query
  if (c.query !== undefined && c.query !== null) {
    const q = c.query as Record<string, unknown>;
    if (typeof q !== "object") {
      return { valid: false, sanitized: {}, error: "query must be an object" };
    }

    if (
      typeof q.entityType !== "string" ||
      typeof q.condition !== "string" ||
      typeof q.attribute !== "string"
    ) {
      return {
        valid: false,
        sanitized: {},
        error: "query must have entityType, condition, and attribute strings",
      };
    }

    // Validate string lengths
    if (q.entityType.length > 50 || q.condition.length > 50 || q.attribute.length > 50) {
      return { valid: false, sanitized: {}, error: "query fields cannot exceed 50 characters" };
    }

    sanitized.query = {
      entityType: q.entityType,
      condition: q.condition,
      attribute: q.attribute,
    };
  } else if (c.query === null) {
    sanitized.query = null;
  }

  return { valid: true, sanitized };
}

/**
 * Validates gap rules array.
 *
 * @param {unknown} rules - The rules to validate
 * @returns {{ valid: boolean; error?: string }}
 */
export function validateGapRules(rules: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!Array.isArray(rules)) {
    return { valid: false, error: "Rules must be an array" };
  }

  if (rules.length > 50) {
    return { valid: false, error: "Maximum of 50 gap rules allowed" };
  }

  const validEntityTypes = ["model", "risk", "control", "vendor", "useCase"];
  const validSeverities = ["critical", "warning", "info"];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i] as Record<string, unknown>;

    if (!rule || typeof rule !== "object") {
      return { valid: false, error: `Rule ${i + 1}: must be an object` };
    }

    if (!rule.entityType || !validEntityTypes.includes(rule.entityType as string)) {
      return {
        valid: false,
        error: `Rule ${i + 1}: entityType must be one of: ${validEntityTypes.join(", ")}`,
      };
    }

    if (!rule.requirement || typeof rule.requirement !== "string") {
      return { valid: false, error: `Rule ${i + 1}: requirement is required` };
    }

    if ((rule.requirement as string).length > 100) {
      return { valid: false, error: `Rule ${i + 1}: requirement cannot exceed 100 characters` };
    }

    if (!rule.severity || !validSeverities.includes(rule.severity as string)) {
      return {
        valid: false,
        error: `Rule ${i + 1}: severity must be one of: ${validSeverities.join(", ")}`,
      };
    }

    if (typeof rule.enabled !== "boolean") {
      return { valid: false, error: `Rule ${i + 1}: enabled must be a boolean` };
    }
  }

  return { valid: true };
}

/**
 * Sanitizes an error message for safe external exposure.
 * Removes internal details like stack traces, SQL errors, file paths.
 *
 * @param {Error} error - The error to sanitize
 * @param {string} fallbackMessage - Fallback message if sanitization strips all info
 * @returns {string} Safe error message
 */
export function sanitizeErrorMessage(error: Error, fallbackMessage: string): string {
  const message = error.message || "";

  // Check for patterns that indicate internal implementation details
  const unsafePatterns = [
    /at\s+[\w.]+\s+\(/i, // Stack trace patterns
    /ENOENT|ECONNREFUSED/i, // System errors
    /SELECT|INSERT|UPDATE|DELETE/i, // SQL keywords
    /\.ts:|\.js:/i, // File paths
    /node_modules/i, // Internal paths
    /Error:\s*$/, // Empty error prefix
    /UNIQUE constraint/i, // DB constraint errors
    /foreign key/i, // FK errors
    /duplicate key/i, // Duplicate key errors
    /syntax error/i, // SQL syntax errors
    /relation.*does not exist/i, // Table not found
    /column.*does not exist/i, // Column not found
  ];

  for (const pattern of unsafePatterns) {
    if (pattern.test(message)) {
      return fallbackMessage;
    }
  }

  // Limit message length
  if (message.length > 200) {
    return fallbackMessage;
  }

  // If message looks safe, return it
  return message || fallbackMessage;
}
