/**
 * Framework Constants
 *
 * Centralized constants for framework IDs and related configurations
 * to avoid magic numbers throughout the codebase.
 */

export const FRAMEWORK_IDS = {
  EU_AI_ACT: 1,
  ISO_42001: 2,
  ISO_27001: 3,
  NIST_AI_RMF: 4,
  // Added to the organizational project by the server when a use case gets
  // EU AI Act; never offered in an "add framework" list.
  EU_AI_ACT_ORGANIZATION: 29,
} as const;

/** Status filter options of EU AI Act requirements (use case, or EU AI Act (organization)). */
export const EU_AI_ACT_CONTROL_STATUS_OPTIONS = [
  { value: "waiting", label: "Waiting" },
  { value: "in progress", label: "In progress" },
  { value: "done", label: "Done" },
];

/** Status filter options of an EU AI Act assessment (use case, or EU AI Act (organization)). */
export const EU_AI_ACT_ASSESSMENT_STATUS_OPTIONS = [
  { value: "not started", label: "Not started" },
  { value: "in progress", label: "In progress" },
  { value: "done", label: "Done" },
];

/** Shown when enabling EU AI Act on a use case also added EU AI Act (organization). */
export const EU_AI_ACT_ORGANIZATION_ADDED_MESSAGE =
  "EU AI Act (organization) was added to the Frameworks page. Fill in its organization-level controls there.";

/** Why EU AI Act (organization) can't be removed while a use case has EU AI Act. */
export const EU_AI_ACT_ORGANIZATION_LOCKED_REASON = "Required while a use case has EU AI Act";

export const FRAMEWORK_NAMES = {
  EU_AI_ACT: "EU AI Act",
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
 * Frameworks whose group and item titles already carry the official numbers
 * ("Principle 3.1 ...", "3.1.1 ..."), so the generic list must not prefix its
 * own position numbers. Keyed by `framework_type`.
 */
export const FRAMEWORKS_WITH_OWN_NUMBERING = new Set(["osfi_e23"]);

/**
 * Position prefix the generic framework list puts before a group or item
 * title ("1 ", "1.1 "); empty for frameworks that number their own titles.
 */
export const getPositionPrefix = (
  frameworkType: string | undefined,
  label: string | number | null | undefined,
): string =>
  FRAMEWORKS_WITH_OWN_NUMBERING.has(frameworkType ?? "") ||
  label === null ||
  label === undefined ||
  label === ""
    ? ""
    : `${label} `;

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

const isEuAiActName = (name: unknown): boolean =>
  typeof name === "string" && name.trim().toLowerCase() === FRAMEWORK_NAMES.EU_AI_ACT.toLowerCase();

/**
 * True when a list of frameworks includes the EU AI Act.
 *
 * The create form holds `{ _id, name }` options, a loaded use case holds
 * `{ framework_id, name }` rows, and older callers pass plain ids or names,
 * so each shape is recognised.
 */
export const includesEuAiAct = (frameworks: unknown): boolean => {
  if (!Array.isArray(frameworks)) return false;
  return frameworks.some((fw) => {
    if (fw && typeof fw === "object") {
      const { _id, framework_id, name } = fw as {
        _id?: unknown;
        framework_id?: unknown;
        name?: unknown;
      };
      return (
        Number(_id) === FRAMEWORK_IDS.EU_AI_ACT ||
        Number(framework_id) === FRAMEWORK_IDS.EU_AI_ACT ||
        isEuAiActName(name)
      );
    }
    if (typeof fw === "number") return fw === FRAMEWORK_IDS.EU_AI_ACT;
    if (typeof fw === "string") return Number(fw) === FRAMEWORK_IDS.EU_AI_ACT || isEuAiActName(fw);
    return false;
  });
};
