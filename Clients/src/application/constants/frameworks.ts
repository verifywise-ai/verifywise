/**
 * Framework Constants
 *
 * Centralized constants for framework IDs and related configurations
 * to avoid magic numbers throughout the codebase.
 */

export const FRAMEWORK_IDS = {
  ISO_42001: 2,
  ISO_27001: 3,
  NIST_AI_RMF: 4,
} as const;

export const FRAMEWORK_NAMES = {
  ISO_42001: "ISO 42001",
  ISO_27001: "ISO 27001",
  NIST_AI_RMF: "NIST AI RMF",
} as const;

export const FRAMEWORK_DETECTION = {
  ISO_42001_PATTERNS: ["iso 42001", "iso42001"],
  ISO_27001_PATTERNS: ["iso 27001", "iso27001"],
  NIST_AI_RMF_PATTERNS: ["nist ai rmf", "nist ai", "nistai", "nist rmf"],
} as const;

/**
 * Helper function to detect framework type from name
 */
export const getFrameworkType = (
  frameworkName: string,
): "ISO_42001" | "ISO_27001" | "NIST_AI_RMF" | "UNKNOWN" => {
  const name = frameworkName.toLowerCase().replace(/[\s-]/g, "");

  if (
    FRAMEWORK_DETECTION.ISO_42001_PATTERNS.some((pattern) =>
      name.includes(pattern.replace(/[\s-]/g, "")),
    )
  ) {
    return "ISO_42001";
  }

  if (
    FRAMEWORK_DETECTION.ISO_27001_PATTERNS.some((pattern) =>
      name.includes(pattern.replace(/[\s-]/g, "")),
    )
  ) {
    return "ISO_27001";
  }

  if (
    FRAMEWORK_DETECTION.NIST_AI_RMF_PATTERNS.some((pattern) =>
      name.includes(pattern.replace(/[\s-]/g, "")),
    )
  ) {
    return "NIST_AI_RMF";
  }

  return "UNKNOWN";
};

/**
 * Helper function to check if framework is ISO 42001
 */
export const isISO42001 = (frameworkId: number, frameworkName?: string): boolean => {
  return (
    frameworkId === FRAMEWORK_IDS.ISO_42001 ||
    (frameworkName ? getFrameworkType(frameworkName) === "ISO_42001" : false)
  );
};

/**
 * Helper function to check if framework is ISO 27001
 */
export const isISO27001 = (frameworkId: number, frameworkName?: string): boolean => {
  return (
    frameworkId === FRAMEWORK_IDS.ISO_27001 ||
    (frameworkName ? getFrameworkType(frameworkName) === "ISO_27001" : false)
  );
};

/**
 * Helper function to check if framework is NIST AI RMF
 */
export const isNISTAIRMF = (frameworkId: number, frameworkName?: string): boolean => {
  return (
    frameworkId === FRAMEWORK_IDS.NIST_AI_RMF ||
    (frameworkName ? getFrameworkType(frameworkName) === "NIST_AI_RMF" : false)
  );
};
