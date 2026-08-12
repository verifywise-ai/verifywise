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
}

export const REPORT_SECTION_CATALOG: ReportSectionCatalogEntry[] = [
  { key: "projectRisks", label: "Use case risks", group: "Risk analysis" },
  { key: "vendorRisks", label: "Vendor risks", group: "Risk analysis" },
  { key: "modelRisks", label: "Model risks", group: "Risk analysis" },
  { key: "compliance", label: "Requirements", group: "Compliance and governance" },
  { key: "assessment", label: "Assessment tracker", group: "Compliance and governance" },
  { key: "clausesAndAnnexes", label: "Clauses and annexes", group: "Compliance and governance" },
  { key: "nistSubcategories", label: "NIST subcategories", group: "Compliance and governance" },
  { key: "models", label: "AI models", group: "Organization" },
  { key: "vendors", label: "Vendors", group: "Organization" },
  { key: "trainingRegistry", label: "Training registry", group: "Organization" },
  { key: "policyManager", label: "Policy manager", group: "Organization" },
  { key: "incidentManagement", label: "Incident management", group: "Organization" },
];

export const SECTION_KEYS: string[] = REPORT_SECTION_CATALOG.map((s) => s.key);
