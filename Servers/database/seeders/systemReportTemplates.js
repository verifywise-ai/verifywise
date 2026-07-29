"use strict";

/**
 * The system report template library.
 *
 * Lives here rather than inside the seed migration so the migration and the
 * two mechanical checks in __tests__/ read the SAME definitions. A test that
 * restated the table would drift from the seed in silence, which is exactly
 * the failure the checks exist to prevent.
 *
 * CommonJS and .js on purpose: migrations run from dist/ (see Servers/CLAUDE.md),
 * and a TypeScript source would put the migration and the test on different
 * paths to the same data.
 *
 * frameworkNames holds framework NAMES, never ids. The migration resolves them
 * by name the way 20260302111132-seed-framework-struct-data.js does; a
 * hardcoded integer breaks on any install whose SERIAL ran differently.
 */

// The five blocks aiSummarizer produced pre-Phase-2. Behaviour-preserving base.
const AI_BASE = {
  sectionSummaries: true,
  executiveSummary: true,
  keyFindings: true,
  recommendedActions: true,
  riskAnalysis: true,
  complianceGap: false,
  vendorRisk: false,
};

const BOTH = ["project", "organization"];

/** One enabled section entry. Core sections cannot be switched off in the wizard. */
const s = (key, reportSectionKey, label, core = true) => ({
  key,
  reportSectionKey,
  label,
  core,
  defaultEnabled: true,
  supportedScopes: BOTH,
});

/**
 * Which frameworks open each framework-gated section in collectAllData.
 * Mirrors the gates at dataCollector.ts:238-240. The reachability test below
 * is the only thing keeping the two in step.
 */
const FRAMEWORK_SECTION_GATES = {
  compliance: ["EU AI Act"],
  assessment: ["EU AI Act"],
  clausesAndAnnexes: ["ISO 42001", "ISO 27001"],
  nistSubcategories: ["NIST AI RMF"],
};

const SYSTEM_REPORT_TEMPLATES = [
  // ---------------------------------------------------------------------
  // 1-3: already seeded by 20260619191640. Sections, labels, core and
  // defaultEnabled values are reproduced verbatim from that migration --
  // changing them would alter what existing schedules produce, and a fresh
  // install must still get the same three templates it got yesterday.
  // ---------------------------------------------------------------------
  {
    name: "Daily Governance Pulse",
    slug: "daily-governance-pulse",
    description:
      "Daily operational governance digest: current high risks, overdue tasks, open incidents.",
    category: "operational",
    defaultScope: "project",
    recommendedFrequency: "daily",
    frameworkNames: [],
    sections: [
      s("current_high_risks", "projectRisks", "Current high / critical risks"),
      s("overdue_tasks", "projectRisks", "Currently overdue / due-soon tasks"),
      s("open_incidents", "incidentManagement", "Open / unresolved incidents"),
      {
        key: "vendor_reviews",
        reportSectionKey: "vendors",
        label: "Vendor reviews due soon",
        core: false,
        defaultEnabled: false,
        supportedScopes: BOTH,
      },
      {
        key: "policy_due",
        reportSectionKey: "policyManager",
        label: "Policy reviews due soon",
        core: false,
        defaultEnabled: false,
        supportedScopes: BOTH,
      },
    ],
    ai: { ...AI_BASE, vendorRisk: true },
  },
  {
    name: "Weekly Executive Brief",
    slug: "weekly-executive-brief",
    description: "Weekly AI governance posture for leadership.",
    category: "executive",
    defaultScope: "organization",
    recommendedFrequency: "weekly",
    frameworkNames: [],
    sections: [
      s("ai_portfolio", "models", "AI portfolio overview"),
      s("risk_posture", "projectRisks", "Risk posture"),
      s("compliance_progress", "compliance", "Compliance progress"),
      s("incidents_summary", "incidentManagement", "Incidents summary", false),
    ],
    ai: { ...AI_BASE },
  },
  {
    name: "Compliance Evidence Gap",
    slug: "compliance-evidence-gap",
    description: "Audit readiness and framework evidence gaps.",
    category: "compliance",
    defaultScope: "project",
    recommendedFrequency: "weekly",
    frameworkNames: [],
    sections: [
      s("framework_progress", "clausesAndAnnexes", "Framework control progress"),
      s("missing_evidence", "compliance", "Missing evidence"),
      s("incomplete_assessments", "assessment", "Incomplete assessments"),
    ],
    ai: { ...AI_BASE, complianceGap: true },
  },

  // ---------------------------------------------------------------------
  // 4-21: new. Every framework-gated section below is reachable from the
  // template's own frameworkNames -- see the reachability check in
  // __tests__/systemReportTemplates.test.ts.
  // ---------------------------------------------------------------------
  {
    name: "EU AI Act Readiness Review",
    slug: "eu-ai-act-readiness",
    description:
      "Readiness of a single use case against the EU AI Act: control progress, assessment answers and the risks behind them.",
    category: "compliance",
    defaultScope: "project",
    recommendedFrequency: "monthly",
    frameworkNames: ["EU AI Act"],
    sections: [
      s("compliance_progress", "compliance", "Control implementation progress"),
      s("assessment_progress", "assessment", "Assessment completion"),
      s("risks", "projectRisks", "Use case risks"),
    ],
    ai: { ...AI_BASE, complianceGap: true },
  },
  {
    name: "EU AI Act Conformity Evidence Pack",
    slug: "eu-ai-act-conformity-pack",
    description:
      "Organization-wide EU AI Act conformity evidence: controls, assessments, governing policies, training records and incident history.",
    category: "compliance",
    defaultScope: "organization",
    recommendedFrequency: "monthly",
    frameworkNames: ["EU AI Act"],
    sections: [
      s("compliance_controls", "compliance", "Control implementation evidence"),
      s("assessments", "assessment", "Assessment evidence"),
      s("policies", "policyManager", "Governing policies"),
      s("training", "trainingRegistry", "Training records"),
      s("incidents", "incidentManagement", "Incident history"),
    ],
    ai: { ...AI_BASE, complianceGap: true },
  },
  {
    name: "ISO 42001 Internal Audit Pack",
    slug: "iso-42001-audit-pack",
    description:
      "Clause and annex implementation status for an ISO 42001 internal audit, with the policies, training and risks behind it.",
    category: "compliance",
    defaultScope: "organization",
    recommendedFrequency: "monthly",
    frameworkNames: ["ISO 42001"],
    sections: [
      s("clauses_annexes", "clausesAndAnnexes", "Clause and annex status"),
      s("policies", "policyManager", "Supporting policies"),
      s("training", "trainingRegistry", "Training records"),
      s("risks", "projectRisks", "Use case risks"),
    ],
    ai: { ...AI_BASE, complianceGap: true },
  },
  {
    name: "ISO 27001 Control Status Report",
    slug: "iso-27001-control-status",
    description:
      "ISO 27001 control implementation status alongside the security incidents and vendor exposure that test it.",
    category: "compliance",
    defaultScope: "organization",
    recommendedFrequency: "monthly",
    frameworkNames: ["ISO 27001"],
    sections: [
      s("controls", "clausesAndAnnexes", "Control implementation status"),
      s("incidents", "incidentManagement", "Security incidents"),
      s("vendors", "vendors", "Vendor exposure"),
    ],
    ai: { ...AI_BASE },
  },
  {
    name: "ISO 42001 + 27001 Coverage",
    slug: "iso-dual-standard-coverage",
    description:
      "Combined ISO 42001 and ISO 27001 control coverage, showing where the two standards overlap and where risk remains uncovered.",
    category: "compliance",
    defaultScope: "organization",
    recommendedFrequency: "monthly",
    frameworkNames: ["ISO 42001", "ISO 27001"],
    sections: [
      s("dual_controls", "clausesAndAnnexes", "Combined control coverage"),
      s("risks", "projectRisks", "Risks across both standards"),
    ],
    ai: {
      ...AI_BASE,
      recommendedActions: false,
      riskAnalysis: false,
      complianceGap: true,
    },
  },
  {
    name: "NIST AI RMF Profile Report",
    slug: "nist-ai-rmf-profile",
    description: "NIST AI RMF subcategory profile with the risks and models it governs.",
    category: "compliance",
    defaultScope: "organization",
    recommendedFrequency: "monthly",
    frameworkNames: ["NIST AI RMF"],
    sections: [
      s("subcategories", "nistSubcategories", "Subcategory implementation profile"),
      s("risks", "projectRisks", "Risks in scope"),
      s("models", "models", "Models in scope"),
    ],
    ai: { ...AI_BASE },
  },
  {
    name: "Cross-Framework Compliance Scorecard",
    slug: "cross-framework-scorecard",
    description:
      "Side-by-side compliance standing across EU AI Act, ISO 42001, ISO 27001 and NIST AI RMF.",
    category: "compliance",
    defaultScope: "organization",
    recommendedFrequency: "monthly",
    frameworkNames: ["EU AI Act", "ISO 42001", "ISO 27001", "NIST AI RMF"],
    sections: [
      s("eu_controls", "compliance", "EU AI Act control progress"),
      s("eu_assessments", "assessment", "EU AI Act assessment progress"),
      s("iso_clauses", "clausesAndAnnexes", "ISO clause and annex progress"),
      s("nist_subcategories", "nistSubcategories", "NIST subcategory progress"),
    ],
    ai: { ...AI_BASE, complianceGap: true },
  },
  {
    name: "Third-Party and Vendor Risk Review",
    slug: "third-party-risk-review",
    description:
      "Standing of the third-party estate: vendor register and the risks each vendor carries.",
    category: "risk",
    defaultScope: "organization",
    recommendedFrequency: "monthly",
    frameworkNames: [],
    sections: [
      s("vendor_register", "vendors", "Vendor register"),
      s("vendor_risks", "vendorRisks", "Vendor risks"),
    ],
    ai: { ...AI_BASE, riskAnalysis: false, vendorRisk: true },
  },
  {
    name: "AI Model Inventory Report",
    slug: "ai-model-inventory",
    description:
      "Register of every AI model in the organization's inventory and its recorded attributes.",
    category: "governance",
    defaultScope: "organization",
    recommendedFrequency: "monthly",
    frameworkNames: [],
    sections: [s("model_inventory", "models", "Model inventory")],
    ai: { ...AI_BASE, recommendedActions: false, riskAnalysis: false },
  },
  {
    name: "Model Risk Register",
    slug: "model-risk-register",
    description:
      "Open model risks with the models they attach to, for model risk governance review.",
    category: "risk",
    defaultScope: "organization",
    recommendedFrequency: "weekly",
    frameworkNames: [],
    sections: [
      s("model_risks", "modelRisks", "Model risks"),
      s("models", "models", "Models in scope"),
    ],
    ai: { ...AI_BASE },
  },
  {
    name: "Consolidated Risk Register",
    slug: "consolidated-risk-register",
    description: "Every open risk in one register: use case, vendor and model risks together.",
    category: "risk",
    defaultScope: "organization",
    recommendedFrequency: "weekly",
    frameworkNames: [],
    sections: [
      s("project_risks", "projectRisks", "Use case risks"),
      s("vendor_risks", "vendorRisks", "Vendor risks"),
      s("model_risks", "modelRisks", "Model risks"),
    ],
    ai: { ...AI_BASE, vendorRisk: true },
  },
  {
    name: "Incident and Post-Market Monitoring",
    slug: "incident-monitoring-report",
    description:
      "Incidents raised in the period with the risks and models they trace back to, for post-market monitoring.",
    category: "operational",
    defaultScope: "organization",
    recommendedFrequency: "weekly",
    frameworkNames: [],
    sections: [
      s("incidents", "incidentManagement", "Incidents in the period"),
      s("related_risks", "projectRisks", "Related risks"),
      s("affected_models", "models", "Affected models"),
    ],
    ai: { ...AI_BASE },
  },
  {
    name: "Policy Governance Review",
    slug: "policy-governance-review",
    description: "Policy library status: approvals, owners and reviews coming due.",
    category: "governance",
    defaultScope: "organization",
    recommendedFrequency: "monthly",
    frameworkNames: [],
    sections: [s("policies", "policyManager", "Policy status")],
    ai: { ...AI_BASE, keyFindings: false, riskAnalysis: false },
  },
  {
    name: "Training and Awareness Compliance",
    slug: "training-awareness-compliance",
    description:
      "Completion of AI governance training and the policies staff are being trained against.",
    category: "governance",
    defaultScope: "organization",
    recommendedFrequency: "monthly",
    frameworkNames: [],
    sections: [
      s("training", "trainingRegistry", "Training completion"),
      s("related_policies", "policyManager", "Related policies"),
    ],
    ai: { ...AI_BASE, riskAnalysis: false },
  },
  {
    name: "Board Governance Report",
    slug: "board-governance-report",
    description:
      "Full-estate governance picture for the board: models, risks, compliance standing, incidents and third parties.",
    category: "executive",
    defaultScope: "organization",
    recommendedFrequency: "monthly",
    frameworkNames: [],
    sections: [
      s("models", "models", "AI portfolio"),
      s("risks", "projectRisks", "Risk posture"),
      s("compliance", "compliance", "Compliance standing"),
      s("clauses_annexes", "clausesAndAnnexes", "Standards coverage"),
      s("incidents", "incidentManagement", "Incidents"),
      s("vendors", "vendors", "Third parties"),
    ],
    ai: { ...AI_BASE, complianceGap: true, vendorRisk: true },
  },
  {
    name: "Monthly Operations Review",
    slug: "monthly-operations-review",
    description:
      "Month of governance operations: risks, incidents, policy and training activity and vendor reviews.",
    category: "operational",
    defaultScope: "organization",
    recommendedFrequency: "monthly",
    frameworkNames: [],
    sections: [
      s("risks", "projectRisks", "Risk activity"),
      s("incidents", "incidentManagement", "Incident activity"),
      s("policies", "policyManager", "Policy activity"),
      s("training", "trainingRegistry", "Training activity"),
      s("vendors", "vendors", "Vendor reviews"),
    ],
    ai: { ...AI_BASE },
  },
  {
    name: "Use Case Risk Deep Dive",
    slug: "use-case-risk-deep-dive",
    description:
      "Everything risk-bearing about one use case: its own risks, the models it runs on and those models' risks.",
    category: "risk",
    defaultScope: "project",
    recommendedFrequency: "weekly",
    frameworkNames: [],
    sections: [
      s("project_risks", "projectRisks", "Use case risks"),
      s("models", "models", "Models used"),
      s("model_risks", "modelRisks", "Model risks"),
    ],
    ai: { ...AI_BASE },
  },
  {
    name: "New Use Case Onboarding Assessment",
    slug: "use-case-onboarding-assessment",
    description:
      "Onboarding pack for a new use case: its EU AI Act assessment answers, initial risks and vendor dependencies.",
    category: "compliance",
    defaultScope: "project",
    recommendedFrequency: "monthly",
    frameworkNames: ["EU AI Act"],
    sections: [
      s("assessment", "assessment", "Onboarding assessment"),
      s("initial_risks", "projectRisks", "Initial risks"),
      s("vendors", "vendors", "Vendor dependencies"),
    ],
    ai: { ...AI_BASE, riskAnalysis: false },
  },
];

module.exports = { SYSTEM_REPORT_TEMPLATES, AI_BASE, FRAMEWORK_SECTION_GATES };
