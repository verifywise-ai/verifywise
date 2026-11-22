/**
 * Hand-built ReportData for the renderer tests: a general (non-kind) report
 * and an OSFI E-23 kind report. Shared by the PDF template and DOCX tests so
 * both renderers are checked against the same data.
 */
import type {
  E23ContradictionsSectionData,
  FrameworkRequirementGroup,
  FrameworkRequirementRow,
  MrmFleetSectionData,
  MrmInventoryAppendixRow,
  ReportData,
} from "../../../../domain.layer/interfaces/i.reportGeneration";

// Noon UTC, so the date reads the same in every CI time zone.
export const FIXED_GENERATED_AT = new Date("2026-11-20T12:00:00Z");

const row = (
  title: string,
  overrides: Partial<FrameworkRequirementRow> = {},
): FrameworkRequirementRow => ({
  implId: Math.floor(Math.random() * 1e6),
  level: 2,
  title,
  orderNo: 1,
  status: "Implemented",
  owner: "Dana Reviewer",
  reviewer: null,
  approver: null,
  dueDate: "2026-12-31",
  isDone: true,
  isOverdue: false,
  evidenceCount: 1,
  evidenceFiles: ["policy.pdf"],
  riskCount: 0,
  ...overrides,
});

const group = (
  title: string,
  requirements: FrameworkRequirementRow[],
): FrameworkRequirementGroup => ({
  title,
  orderNo: 1,
  requirements,
  rollup: {
    total: requirements.length,
    done: requirements.filter((r) => r.isDone).length,
    unassigned: 0,
    noEvidence: 0,
    overdue: 0,
    statusBreakdown: {},
  },
});

/** A general report with AI blocks, several sections and both notice kinds. */
export function nonKindReportData(): ReportData {
  const groups = [
    group("Administrative safeguards", [
      row("164.308(a)(1) Security management process"),
      row("164.308(a)(2) Assigned security responsibility", {
        status: "In progress",
        isDone: false,
        owner: null,
        evidenceCount: 0,
        evidenceFiles: [],
      }),
    ]),
  ];
  return {
    metadata: {
      projectId: 1,
      projectTitle: "Acme Vision",
      projectOwner: "Jane Doe",
      frameworkId: 5,
      frameworkName: "HIPAA",
      projectFrameworkId: 1,
      generatedAt: FIXED_GENERATED_AT,
      generatedBy: "Jane Doe",
      organizationId: 1,
      isOrganizational: false,
    },
    branding: { organizationName: "Acme", primaryColor: "#13715B" },
    charts: {},
    renderedCharts: {},
    aiSummaries: {
      executiveSummary: "The programme is broadly on track.",
      keyFindingsDetailed: [
        {
          text: "Two requirements lack evidence.",
          section: "frameworkRequirements",
          severity: "high",
          basis: "observed",
          related_sections: ["frameworkRequirements"],
          what_would_close_this: "Evidence attached",
        },
      ],
      recommendations: ["Attach evidence"],
      sectionSummaries: { frameworkRequirements: "Mostly implemented." },
      recommendedActions: [
        {
          action: "Assign an owner",
          priority: "high",
          basis: "observed",
          suggestedOwner: "Jane Doe",
        },
      ],
      complianceGap: {
        narrative: "Gaps are limited.",
        gaps: [{ control: "164.308", gap: "No owner", priority: "high", basis: "observed" }],
        scores_caveat: null,
      },
      abstentions: { vendorRisk: "This analysis was not produced." },
    },
    sectionNotices: [
      { sectionKey: "models", reason: "no_data" },
      {
        sectionKey: "frameworkRequirements",
        reason: "collection_failed",
        detail: "SOC 2 for Chatbot",
      },
    ],
    sections: {
      frameworkRequirements: {
        frameworks: [
          {
            frameworkId: 5,
            frameworkName: "HIPAA",
            groups,
            rollup: {
              total: 2,
              done: 1,
              unassigned: 1,
              noEvidence: 1,
              overdue: 0,
              statusBreakdown: {},
            },
          },
        ],
      },
      policyManager: {
        totalPolicies: 1,
        policies: [{ id: 1, policyName: "AI use policy", status: "Published", owner: "Jane Doe" }],
      },
    },
  };
}

export const E23_GROUP_INVENTORY = "2.1 Model inventory and governance";
export const E23_GROUP_VALIDATION = "3.4 Model review and validation";
export const E23_GROUP_SELF = "1.1 Purpose and scope";

const appendixRow = (
  name: string,
  overrides: Partial<MrmInventoryAppendixRow> = {},
): MrmInventoryAppendixRow => ({
  name,
  version: "1.0",
  provider: "In-house",
  type: "Credit scoring",
  tier: "1",
  status: "Approved",
  owner: "Olu Owner",
  approver: "Ana Approver",
  intendedUse: "Retail credit decisions",
  limitations: "Not for small business lending",
  latestOutcome: "validated_with_findings",
  latestSignedOffAt: "2026-03-01T10:00:00.000Z",
  nextReviewDue: "2027-03-01T00:00:00.000Z",
  activeThresholds: true,
  openFindings: 1,
  ...overrides,
});

export interface E23FixtureOptions {
  audience?: "osfi" | "board";
  isFinal?: boolean;
  institutionName?: string;
  scopeNote?: string;
  /** No contradiction fires. */
  noContradictions?: boolean;
  /** E-23 is not on file: no requirements, rules unavailable. */
  notOnFile?: boolean;
  /** No previous run to compare against. */
  noPrevious?: boolean;
  /** Empty inventory. */
  noModels?: boolean;
  withAppendix?: boolean;
  /** The MRM read failed: MRM sections absent, each with a collection_failed notice. */
  mrmFailed?: boolean;
  withHeadOfValidation?: boolean;
}

/** An OSFI E-23 kind run with every section the formal report can show. */
export function e23ReportData(opts: E23FixtureOptions = {}): ReportData {
  const audience = opts.audience ?? "osfi";
  const e23Groups = [
    group(E23_GROUP_SELF, [row("1.1.1 Model risk management scope", { owner: "Sam Steward" })]),
    group(E23_GROUP_INVENTORY, [
      row("2.1.4 Enterprise-level model inventory as system of record"),
      row("2.2.3 Every model rated through a defined process", { owner: "Rae Rater" }),
    ]),
    group(E23_GROUP_VALIDATION, [
      row("3.4.2 Review depth and frequency set by rating", {
        status: "Audited",
        evidenceFiles: ["validation-plan.pdf"],
      }),
    ]),
  ];
  const fired: E23ContradictionsSectionData["fired"] = opts.noContradictions
    ? []
    : [
        {
          ruleId: "C2",
          requirement: "2.2.3",
          requirementTitle: "  2.2.3 Every model rated through a defined process  ",
          claimedStatus: "Implemented",
          finding: "3 models have no MRM tier",
          affectedCount: 7,
          examples: ["Fraud detector", "Pricing engine", "Churn model", "AML screen", "Chatbot"],
          moreCount: 2,
        },
      ];
  const contradictions: E23ContradictionsSectionData = opts.notOnFile
    ? { available: false, fired: [], checked: [], notRun: [], coverage: {} }
    : {
        available: true,
        fired,
        checked: ["C1", "C2", "C6"],
        notRun: [
          {
            ruleId: "C10",
            requirement: "3.6.4",
            reason: "requirement 3.6.4 not found in this organization's E-23 checklist",
          },
        ],
        coverage: {
          [E23_GROUP_SELF]: "selfAssessmentOnly",
          [E23_GROUP_INVENTORY]: "checked",
          [E23_GROUP_VALIDATION]: "checked",
        },
      };
  const mrmFleet: MrmFleetSectionData = {
    totals: opts.noModels
      ? { models: 0, untiered: 0, byTier: { "1": 0, "2": 0, "3": 0 } }
      : { models: 9, untiered: 3, byTier: { "1": 2, "2": 3, "3": 1 } },
    validationCoverage: { validated: 4, inReview: 2, notStarted: 3, overdue: 1 },
    openFindingsBySeverity: { critical: 1, high: 2, medium: 0, low: 1 },
    monitoring: { withActiveThresholds: 5, withRecentMetric: 4 },
    activity: {
      period: { start: "2026-08-01", end: "2026-10-31" },
      validationsSignedOff: 2,
      findingsOpened: 3,
      findingsClosed: 1,
      breaches: 0,
      revalidationEvents: 1,
    },
    perTier: [
      {
        tier: "1",
        models: 2,
        tieringCurrent: 2,
        validated: 2,
        monitoringActive: 2,
        openFindings: 2,
        criticalHighFindings: 2,
      },
      {
        tier: "2",
        models: 3,
        tieringCurrent: 3,
        validated: 1,
        monitoringActive: 2,
        openFindings: 1,
        criticalHighFindings: 1,
      },
      {
        tier: "3",
        models: 1,
        tieringCurrent: 1,
        validated: 1,
        monitoringActive: 1,
        openFindings: 1,
        criticalHighFindings: 0,
      },
    ],
    exceptions: [
      { name: "Fraud detector", tier: null, issues: ["Untiered", "No owner role"] },
      { name: "Credit scorer", tier: "1", issues: ["Open critical or high finding"] },
    ],
  };
  const requirementsAvailable = !opts.notOnFile;
  return {
    metadata: {
      projectId: 0,
      projectTitle: "Organization",
      projectOwner: "",
      frameworkId: 26,
      frameworkName: "OSFI E-23",
      projectFrameworkId: 0,
      generatedAt: FIXED_GENERATED_AT,
      generatedBy: "Jane Doe",
      organizationId: 1,
      isOrganizational: true,
      scope: "organization",
      reportKind: "osfi_e23",
      reportParameters: {
        periodStart: "2026-08-01",
        periodEnd: "2026-10-31",
        institutionName: opts.institutionName ?? "Northern Bank of Canada",
        accountableExecutiveName: "Alex Exec",
        accountableExecutiveTitle: "Chief Risk Officer",
        ...(opts.withHeadOfValidation && {
          headOfValidationName: "Val Head",
          headOfValidationTitle: "Head of Model Validation",
        }),
        preparedByName: "Pat Preparer",
        preparedByTitle: "MRM Lead",
        audience,
        scopeNote: opts.scopeNote ?? "Covers retail credit models only.",
        ...(opts.isFinal && { isFinal: true }),
      },
    },
    branding: { organizationName: "Acme", primaryColor: "#13715B" },
    charts: {},
    renderedCharts: {},
    aiSummaries: {
      executiveSummary: "The model risk programme is largely in place.",
      sectionSummaries: {},
      recommendedActions: [
        { action: "Tier the three untiered models", priority: "high", suggestedOwner: "Rae Rater" },
      ],
      abstentions: { e23Gap: "This analysis was not produced." },
    },
    sectionNotices: opts.notOnFile
      ? [
          { sectionKey: "frameworkRequirements", reason: "no_framework_target" },
          { sectionKey: "e23Contradictions", reason: "no_framework_target" },
        ]
      : opts.mrmFailed
        ? ["mrmFleet", "e23Contradictions", "mrmInventoryAppendix"].map((sectionKey) => ({
            sectionKey,
            reason: "collection_failed" as const,
            detail: "Model risk management data",
          }))
        : [],
    sections: {
      ...(!opts.notOnFile && {
        frameworkRequirements: {
          frameworks: [
            {
              frameworkId: 26,
              frameworkName: "OSFI E-23",
              groups: e23Groups,
              rollup: {
                total: 4,
                done: 4,
                unassigned: 0,
                noEvidence: 0,
                overdue: 0,
                statusBreakdown: {},
              },
            },
          ],
        },
      }),
      ...(!opts.mrmFailed && { mrmFleet, e23Contradictions: contradictions }),
      ...(opts.withAppendix &&
        !opts.mrmFailed && {
          mrmInventoryAppendix: {
            active: [appendixRow("Credit scorer"), appendixRow("Fraud detector", { tier: null })],
            retired: [
              appendixRow("Legacy scorecard", { status: "Retired", activeThresholds: false }),
            ],
          },
        }),
      signOff: {},
      e23Glance: {
        requirementsDone: requirementsAvailable ? 4 : 0,
        requirementsTotal: requirementsAvailable ? 83 : 0,
        groupsChecked: requirementsAvailable ? 2 : 0,
        groupsTotal: requirementsAvailable ? 3 : 0,
        rulesFired: fired.length,
        rulesTotal: 13,
        modelsInScope: 9,
        untiered: 3,
        overdueValidations: 1,
        openCriticalHigh: 3,
        fixIt: { high: 2, medium: 5, low: 1 },
        requirementsAvailable,
        previous: opts.noPrevious
          ? null
          : {
              requirementsDone: 1,
              requirementsTotal: 83,
              groupsChecked: 2,
              groupsTotal: 3,
              rulesFired: 3,
              rulesTotal: 13,
              modelsInScope: 9,
              untiered: null,
              overdueValidations: 1,
              openCriticalHigh: 4,
              fixIt: { high: 4, medium: 5, low: 1 },
              generatedAt: "2026-08-20T12:00:00.000Z",
            },
      },
    },
  };
}
