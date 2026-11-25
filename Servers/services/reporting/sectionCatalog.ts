/**
 * @fileoverview Report section catalog — the single owner of the report
 * section taxonomy.
 *
 * Before Phase 3 this list existed twice: as VALID_SECTION_KEYS here in the
 * backend and as REPORT_SECTION_GROUPS hardcoded in the frontend. The two
 * agreed by coincidence, nothing enforced it, and a frontend-hardcoded list
 * cannot describe org-authored templates. This module is now the source of
 * truth; VALID_SECTION_KEYS derives from it and GET /api/reporting/sections
 * serves it.
 *
 * Labels are sentence case per the VerifyWise design rules, which is why they
 * differ from the legacy frontend constants' title case. Keys are the
 * contract; labels are presentation.
 *
 * @module services/reporting/sectionCatalog
 */

export interface ReportSectionCatalogEntry {
  /** Canonical section key. Matches sections_config[].reportSectionKey. */
  key: string;
  /** Human-readable label, sentence case. */
  label: string;
  /** Grouping label for UI presentation. */
  group: string;
  /**
   * Report kinds this section is limited to. Absent means every report can
   * use it.
   */
  kinds?: string[];
}

export const REPORT_SECTION_CATALOG: ReportSectionCatalogEntry[] = [
  { key: "projectRisks", label: "Use case risks", group: "Risk analysis" },
  { key: "vendorRisks", label: "Vendor risks", group: "Risk analysis" },
  { key: "modelRisks", label: "Model risks", group: "Risk analysis" },
  { key: "compliance", label: "Requirements", group: "Compliance and governance" },
  { key: "assessment", label: "Assessment tracker", group: "Compliance and governance" },
  { key: "clausesAndAnnexes", label: "Clauses and annexes", group: "Compliance and governance" },
  { key: "nistSubcategories", label: "NIST subcategories", group: "Compliance and governance" },
  {
    key: "frameworkRequirements",
    label: "Framework requirements",
    group: "Compliance and governance",
  },
  {
    key: "mrmFleet",
    label: "Model risk management status",
    group: "Compliance and governance",
    kinds: ["osfi_e23"],
  },
  {
    key: "e23Contradictions",
    label: "Where the checklist and the data disagree",
    group: "Compliance and governance",
    kinds: ["osfi_e23"],
  },
  {
    key: "e23FixItList",
    label: "Fix-it list (internal document)",
    group: "Compliance and governance",
    kinds: ["osfi_e23"],
  },
  {
    key: "mrmInventoryAppendix",
    label: "Model inventory appendix",
    group: "Compliance and governance",
    kinds: ["osfi_e23"],
  },
  {
    key: "signOff",
    label: "Sign-off",
    group: "Compliance and governance",
    kinds: ["osfi_e23"],
  },
  { key: "models", label: "AI models", group: "Organization" },
  { key: "vendors", label: "Vendors", group: "Organization" },
  { key: "trainingRegistry", label: "Training registry", group: "Organization" },
  { key: "policyManager", label: "Policy manager", group: "Organization" },
  { key: "incidentManagement", label: "Incident management", group: "Organization" },
];

export const SECTION_KEYS: string[] = REPORT_SECTION_CATALOG.map((s) => s.key);

/**
 * Keys that are limited to a report kind other than the one given. A general
 * report (kind undefined) violates for every kind-restricted key.
 */
export function kindViolations(keys: string[], kind: string | undefined): string[] {
  return keys.filter((key) => {
    const entry = REPORT_SECTION_CATALOG.find((e) => e.key === key);
    return !!entry?.kinds && (kind === undefined || !entry.kinds.includes(kind));
  });
}
