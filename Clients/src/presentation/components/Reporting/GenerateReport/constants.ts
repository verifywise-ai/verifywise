/**
 * Report Section Definitions
 * Defines the hierarchical structure of report sections
 */

export interface ReportSection {
  id: string;
  label: string;
  backendKey: string; // Key used by backend API
}

export interface ReportSectionGroup {
  id: string;
  label: string;
  sections: ReportSection[];
}

/**
 * All available report sections organized by group
 * The structure adapts based on framework and report type (use case vs organizational)
 */
export const REPORT_SECTION_GROUPS: ReportSectionGroup[] = [
  {
    id: "riskAnalysis",
    label: "Risk Analysis",
    sections: [
      { id: "useCaseRisks", label: "Use Case Risks", backendKey: "projectRisks" },
      { id: "vendorRisks", label: "Vendor Risks", backendKey: "vendorRisks" },
      { id: "modelRisks", label: "Model Risks", backendKey: "modelRisks" },
    ],
  },
  {
    id: "complianceGovernance",
    label: "Compliance & Governance",
    sections: [
      { id: "controls", label: "Requirements", backendKey: "compliance" },
      { id: "assessmentTracker", label: "Assessment Tracker", backendKey: "assessment" },
      { id: "clausesAndAnnexes", label: "Clauses & Annexes", backendKey: "clausesAndAnnexes" },
      { id: "nistSubcategories", label: "NIST Subcategories", backendKey: "nistSubcategories" },
    ],
  },
  {
    id: "organization",
    label: "Organization",
    sections: [
      { id: "aiModels", label: "AI Models", backendKey: "models" },
      { id: "vendors", label: "Vendors", backendKey: "vendors" },
      { id: "trainingRegistry", label: "Training Registry", backendKey: "trainingRegistry" },
      { id: "policyManager", label: "Policy Manager", backendKey: "policyManager" },
      { id: "incidentManagement", label: "Incident Management", backendKey: "incidentManagement" },
    ],
  },
];

/**
 * Framework IDs
 */
export const FRAMEWORK_IDS = {
  EU_AI_ACT: 1,
  ISO_42001: 2,
  ISO_27001: 3,
  NIST_AI_RMF: 4,
} as const;

/**
 * Get sections available for a specific framework and report type
 */
export function getAvailableSections(
  frameworkId: number,
  isOrganizational: boolean,
): ReportSectionGroup[] {
  return REPORT_SECTION_GROUPS.map((group) => {
    let filteredSections = [...group.sections];

    // Filter based on report type (organizational vs use case)
    if (isOrganizational) {
      // Organizational reports don't have Vendor Risks and Model Risks in Risk Analysis
      // (they show all vendors/models in Organization group instead)
      if (group.id === "riskAnalysis") {
        filteredSections = filteredSections.filter(
          (s) => s.id !== "vendorRisks" && s.id !== "modelRisks",
        );
      }
      // Organizational reports don't have Compliance & Governance sections
      if (group.id === "complianceGovernance") {
        filteredSections = [];
      }
    }

    // Filter Compliance & Governance sections based on framework
    if (group.id === "complianceGovernance" && !isOrganizational) {
      filteredSections = filteredSections.filter((section) => {
        switch (section.id) {
          case "controls":
          case "assessmentTracker":
            // Only for EU AI Act (framework 1)
            return frameworkId === FRAMEWORK_IDS.EU_AI_ACT;
          case "clausesAndAnnexes":
            // Only for ISO frameworks (2 and 3)
            return (
              frameworkId === FRAMEWORK_IDS.ISO_42001 || frameworkId === FRAMEWORK_IDS.ISO_27001
            );
          case "nistSubcategories":
            // Only for NIST AI RMF (framework 4)
            return frameworkId === FRAMEWORK_IDS.NIST_AI_RMF;
          default:
            return true;
        }
      });
    }

    return {
      ...group,
      sections: filteredSections,
    };
  }).filter((group) => group.sections.length > 0); // Remove empty groups
}

/**
 * LocalStorage key for saving section preferences
 */
export const SECTION_PREFERENCES_KEY = "verifywise_report_sections";

/**
 * Get default section selection (all sections enabled)
 */
export function getDefaultSectionSelection(
  frameworkId: number,
  isOrganizational: boolean,
): Record<string, boolean> {
  const selection: Record<string, boolean> = {};

  const availableGroups = getAvailableSections(frameworkId, isOrganizational);
  availableGroups.forEach((group) => {
    group.sections.forEach((section) => {
      selection[section.id] = true;
    });
  });

  return selection;
}

/**
 * Load section preferences from localStorage
 * Falls back to default (all selected) if no preferences exist
 */
export function loadSectionPreferences(): Record<string, boolean> | null {
  try {
    const stored = localStorage.getItem(SECTION_PREFERENCES_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Error loading section preferences:", e);
  }
  return null;
}

/**
 * Save section preferences to localStorage
 */
export function saveSectionPreferences(selection: Record<string, boolean>): void {
  try {
    localStorage.setItem(SECTION_PREFERENCES_KEY, JSON.stringify(selection));
  } catch (e) {
    console.error("Error saving section preferences:", e);
  }
}

/**
 * Convert section selection to backend format (array of backend keys)
 */
export function selectionToBackendFormat(
  selection: Record<string, boolean>,
  frameworkId: number,
  isOrganizational: boolean,
): string[] {
  const backendKeys: string[] = [];

  const availableGroups = getAvailableSections(frameworkId, isOrganizational);
  availableGroups.forEach((group) => {
    group.sections.forEach((section) => {
      if (selection[section.id]) {
        backendKeys.push(section.backendKey);
      }
    });
  });

  return backendKeys;
}

/**
 * Legacy exports for backward compatibility with Automations page
 * @deprecated Use section-based selection instead
 */
export const EUAI_REPORT_TYPES = [
  "Use case risks report",
  "Requirements tracker report",
  "Assessments tracker report",
  "Vendors and risks report",
  "Training registry report",
  "Policy manager report",
  "Models and risks report",
  "All reports combined in one file",
];

export const ISO_REPORT_TYPES = [
  "Use case risks report",
  "Clauses and annexes report",
  "Vendors and risks report",
  "Training registry report",
  "Policy manager report",
  "Models and risks report",
  "All reports combined in one file",
];
