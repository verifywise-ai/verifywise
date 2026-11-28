/**
 * Report Generation Interfaces
 * Following VerifyWise clean architecture patterns
 */

import type { ReportParameters } from "./i.reportTemplate";

export type ReportFormat = "pdf" | "docx";

export interface ReportBranding {
  organizationName: string;
  organizationLogo?: string; // Base64 encoded or URL
  primaryColor?: string;
  secondaryColor?: string;
}

export interface ReportMetadata {
  projectId: number;
  projectTitle: string;
  projectOwner: string;
  frameworkId: number;
  frameworkName: string;
  projectFrameworkId: number;
  generatedAt: Date;
  generatedBy: string;
  organizationId: number;
  /**
   * projects.is_organizational of the report's project — NOT the report's
   * scope. Organization-scoped reports also set it, because it is what the
   * renderers read to drop the project line, but the two concepts are
   * distinct: a project-scoped report of an organizational project sets it too.
   */
  isOrganizational: boolean;
  /**
   * What the report covers. Optional so the legacy single-target collector,
   * which has no scope of its own, stays type-compatible.
   */
  scope?: "project" | "organization";
  /** Parameter values the run was made with, for report kinds that take them. */
  reportParameters?: ReportParameters;
  /** The report kind, e.g. "osfi_e23". Absent for general reports. */
  reportKind?: string;
}

export interface ReportSection {
  id: string;
  title: string;
  order: number;
  enabled: boolean;
}

export interface ReportGenerationRequest {
  projectId: number;
  frameworkId: number;
  projectFrameworkId: number;
  /**
   * What the report covers. When set, generateReport resolves the
   * projects_frameworks pairings itself (see resolveFrameworkTargets) and the
   * three ids above are not used to select data — a template or schedule states
   * a scope and, optionally, a frameworkIds selection that narrows it.
   *
   * Omitted by the legacy manual /generate-report path, which names one
   * project and one framework outright.
   */
  scope?: "project" | "organization";
  /**
   * Namespaced framework selection. Empty or absent means every framework in
   * scope, which is what every request made before this field existed means.
   */
  frameworkIds?: string[];
  reportType: string | string[];
  reportName?: string;
  format: ReportFormat;
  branding?: Partial<ReportBranding>;
  sections?: ReportSection[];
  aiEnhanced?: boolean;
  /**
   * Per-block gating for the eight AI blocks. When omitted (manual runs, which
   * have no template) `aiEnhanced: true` resolves to the five blocks that
   * reproduce today's aiSummarizer output — see LEGACY_BLOCKS.
   */
  aiBlocks?: {
    sectionSummaries: boolean;
    executiveSummary: boolean;
    keyFindings: boolean;
    recommendedActions: boolean;
    riskAnalysis: boolean;
    complianceGap: boolean;
    vendorRisk: boolean;
    /** The OSFI E-23 gap analysis; offered only for E-23 templates. */
    e23Gap: boolean;
  };
  llmKeyId?: number;
  /**
   * The schedule this run belongs to, when it has one. Used only to find the
   * previous run's stored facts snapshot; a manual run leaves it undefined and
   * gets no prior-run comparison.
   */
  scheduledReportId?: number;
  /** Parameter values for report kinds that take them. */
  reportParameters?: ReportParameters;
  /** The report kind, e.g. "osfi_e23". Absent for general reports. */
  reportKind?: string;
  /** The template the run was made from, when it has one. */
  templateId?: number;
  /** The report_runs row this generation belongs to; printed on the fix-it list's cover. */
  runId?: number;
}

export interface ReportGenerationResult {
  success: boolean;
  filename: string;
  content: Buffer;
  mimeType: string;
  error?: string;
  /**
   * An E-23 run's "at a glance" figures, stored on the run so the next run can
   * show the change since this one.
   */
  e23Glance?: E23GlanceSnapshot;
  /** A second file produced by the same run, stored beside the main report. */
  companion?: { filename: string; content: Buffer; mimeType: string };
  /**
   * Pairings whose data could not be read (collection_failed notices). The
   * report was still produced; the run orchestrator marks it partial_success.
   */
  collectionFailures?: string[];
  /**
   * Structured analyzer output, keyed by section key. The runner persists this
   * to report_run_analyses; the renderers read the flattened copy on
   * ReportData.aiSummaries instead.
   */
  analyses?: Record<
    string,
    {
      payload: any;
      abstained: boolean;
      abstain_reason: string | null;
      model: string | null;
      attempts: number;
      /**
       * True when the §6 shallowness gate fired and the call was re-issued.
       * Optional, mirroring AnalyzerRunResult in analyzers/runAnalyzers.ts:
       * sectionSummaries never runs the gate.
       */
      restatementRetried?: boolean;
      /** e23Gap positions corrected after parsing; see AnalyzerRunResult. */
      positionCorrections?: Array<{ group: string; from: string; to: string }>;
      /** E-23 runs: the prose guard re-issued the call; see AnalyzerRunResult. */
      guardRetried?: boolean;
      /** E-23 runs: what the prose guard fed back or dropped; see AnalyzerRunResult. */
      guardRejections?: Array<{
        stage: "retried" | "removed";
        field: string;
        index?: number;
        reason: string;
        sentence: string;
        detail: string;
      }>;
    }
  >;
  /**
   * The deterministic facts snapshot this run's analyzers were built from. The
   * runner persists it to report_run_analyses.audit_metadata so the next run of
   * the same schedule can diff against it.
   *
   * Deliberately untyped here: nothing between this field and the JSONB column
   * reads it, and this file has no imports — the domain layer should not start
   * depending on a service module for a shape it never inspects. The real type
   * is FactsSnapshot in services/reporting/analyzers/facts.ts.
   */
  factsSnapshot?: unknown;
}

// Chart data interfaces for report visualizations
export interface RiskDistributionData {
  level: string;
  count: number;
  color: string;
}

export interface ComplianceProgressData {
  category: string;
  completed: number;
  total: number;
  percentage: number;
}

export interface AssessmentStatusData {
  status: string;
  count: number;
  color: string;
}

export interface ChartData {
  riskDistribution?: RiskDistributionData[];
  complianceProgress?: ComplianceProgressData[];
  assessmentStatus?: AssessmentStatusData[];
}

// Rendered chart SVGs for embedding in templates
export interface RenderedCharts {
  riskDistributionBar?: string;
  riskDistributionDonut?: string;
  complianceProgress?: string;
  riskLegend?: string;
  assessmentStatus?: string;
  assessmentLegend?: string;
}

// AI-generated summaries for enhanced reports
export interface AISummaries {
  executiveSummary?: string;
  keyFindings?: string[];
  /** Structured findings. Renderers prefer this when present and fall back to
   *  the flat keyFindings string list when absent.
   *
   *  basis is OPTIONAL: the schema field is nullable and older stored payloads
   *  predate it entirely. The mapper passes it through rather than defaulting
   *  it, because a defaulted "observed" is a fabricated provenance claim. */
  keyFindingsDetailed?: Array<{
    text: string;
    section: string;
    severity: "low" | "medium" | "high" | "critical";
    basis?: "observed" | "inferred" | "absent";
    related_sections: string[];
    what_would_close_this: string;
  }>;
  /** Per-analyzer abstention reasons, keyed by analyzer key, already filtered
   *  for presentation by mapAnalysesToSummaries. Today an abstention has no
   *  document surface at all. */
  abstentions?: Record<string, string>;
  recommendations?: string[];
  sectionSummaries: Record<string, string>;
  riskHighlights?: string;
  recommendedActions?: Array<{
    action: string;
    suggestedOwner?: string; // MUST be an existing org member/role or omitted
    suggestedDueDate?: string;
    priority?: "low" | "medium" | "high" | "critical";
    sourceSignal?: string;
    basis?: "observed" | "inferred" | "absent";
  }>;
  /** Structured output of the riskAnalysis analyzer. */
  riskAnalysis?: {
    narrative: string;
    top_risks: Array<{ name: string; level: string; why: string }>;
  };
  /** Structured output of the complianceGap analyzer. Forwarded whole, so a
   *  nullable schema field arrives here as null rather than as undefined. */
  complianceGap?: {
    narrative: string;
    gaps: Array<{
      control: string;
      gap: string;
      priority: string;
      basis?: "observed" | "inferred" | "absent" | null;
      what_would_close_this?: string | null;
    }>;
    scores_caveat?: string | null;
  };
  /** Structured output of the vendorRisk analyzer. Forwarded whole; see above. */
  vendorRisk?: {
    narrative: string;
    concerns: Array<{
      vendor: string;
      concern: string;
      severity: string;
      basis?: "observed" | "inferred" | "absent" | null;
    }>;
  };
  /** Structured output of the e23Gap analyzer, forwarded whole. Renderers
   *  print `position` through POSITION_LABELS, never the raw value. */
  e23Gap?: {
    narrative: string;
    principles: Array<{
      group: string;
      position: "consistent" | "partly consistent" | "inconsistent" | "not assessable";
      explanation: string;
      basis?: "observed" | "inferred" | "absent" | null;
      what_would_close_this?: string | null;
    }>;
  };
}

/**
 * Why a requested section produced nothing.
 *
 * Before this existed, collectAllData simply omitted the key and both
 * renderers skipped what was absent, so "the framework you picked is on no
 * project in scope" and "this section was never requested" looked identical in
 * the output.
 */
export interface SectionNotice {
  /** Matches a REPORT_SECTION_CATALOG key. */
  sectionKey: string;
  reason:
    /** Requested, but no pairing in scope carries a framework that serves it. */
    | "no_framework_target"
    /** A pairing exists; the query returned zero rows. */
    | "no_data"
    /** A plugin:/custom: framework was selected but that path is not available yet. */
    | "unresolved_framework"
    /**
     * A query for one pairing threw. The rest of the section and the report
     * are complete; `detail` names the pairing that is missing.
     */
    | "collection_failed";
  /** For collection_failed: which pairing could not be read, e.g. "SOC 2 for Chatbot". */
  detail?: string;
}

// Unified report data structure
export interface ReportData {
  metadata: ReportMetadata;
  branding: ReportBranding;
  charts: ChartData;
  renderedCharts: RenderedCharts;
  aiSummaries?: AISummaries;
  /** Always present, possibly empty. See SectionNotice. */
  sectionNotices: SectionNotice[];
  /**
   * OSFI E-23 kind runs only: the E-23 requirement rows the contradiction
   * rules ran on, collected whether or not the frameworkRequirements section
   * was selected. Not rendered; the e23Gap analyzer reads it when the section
   * is absent. Undefined when the checklist is not on file or failed to read.
   */
  e23Requirements?: FrameworkRequirementsSectionData;
  sections: {
    // Risk Analysis group
    projectRisks?: ProjectRisksSectionData;
    vendorRisks?: VendorRisksSectionData;
    modelRisks?: ModelRisksSectionData;
    // Compliance & Governance group
    compliance?: ComplianceSectionData;
    assessment?: AssessmentSectionData;
    clausesAndAnnexes?: ClausesAndAnnexesSectionData;
    nistSubcategories?: NistSubcategoriesSectionData;
    frameworkRequirements?: FrameworkRequirementsSectionData;
    mrmFleet?: MrmFleetSectionData;
    mrmInventoryAppendix?: MrmInventoryAppendixSectionData;
    e23Contradictions?: E23ContradictionsSectionData;
    e23FixItList?: E23FixItListSectionData;
    /** Always set on an E-23 kind run, whichever sections were selected. */
    e23Glance?: E23Glance;
    /** The sign-off page carries no data; its presence means "render it". */
    signOff?: Record<string, never>;
    // Organization group
    vendors?: VendorsListSectionData;
    models?: ModelsListSectionData;
    trainingRegistry?: TrainingRegistrySectionData;
    policyManager?: PolicyManagerSectionData;
    incidentManagement?: IncidentManagementSectionData;
  };
}

// Section-specific data interfaces
export interface ProjectRisksSectionData {
  totalRisks: number;
  risksByLevel: RiskDistributionData[];
  risks: Array<{
    id: number;
    name: string;
    description: string;
    riskLevel: string;
    impact: string;
    likelihood: string;
    mitigationStatus: string;
    owner: string;
  }>;
}

// Vendors list (Organization group)
export interface VendorsListSectionData {
  totalVendors: number;
  vendors: Array<{
    id: number;
    name: string;
    website?: string;
    contactPerson?: string;
    riskStatus: string;
    assignee?: string;
  }>;
}

// Vendor Risks (Risk Analysis group)
export interface VendorRisksSectionData {
  totalRisks: number;
  risks: Array<{
    id: number;
    vendorName: string;
    riskName: string;
    riskLevel: string;
    actionOwner?: string;
    actionPlan?: string;
  }>;
}

export interface ComplianceSectionData {
  overallProgress: number;
  totalControls: number;
  completedControls: number;
  controls: Array<{
    id: number;
    controlId: string;
    title: string;
    status: string;
    description?: string;
    /** Resolved from the numeric controls_eu.owner FK; undefined when unset. */
    owner?: string;
    /** Control family (control category name). */
    category?: string;
    /**
     * Which use case (and, where two frameworks of one project both land in
     * this section, which framework) the row came from. Set by mergeSections
     * only when a report merges more than one projects_frameworks pairing;
     * absent on every single-pairing report, which is what makes the renderers'
     * extra column appear exactly when it is needed.
     */
    useCase?: string;

    /** ISO YYYY-MM-DD. */
    dueDate?: string;
  }>;
}

export interface AssessmentSectionData {
  totalQuestions: number;
  answeredQuestions: number;
  topics: Array<{
    id: number;
    title: string;
    progress: number;
    /** See the note on ComplianceSectionData.controls[].useCase. */
    useCase?: string;

    subtopics: Array<{
      id: number;
      title: string;
      questions: Array<{
        id: number;
        question: string;
        answer?: string;
        status: string;
      }>;
    }>;
  }>;
}

export interface ClausesAndAnnexesSectionData {
  clauses: Array<{
    id: number;
    clauseId: string;
    title: string;
    /** Summary of the subclauses' statuses, e.g. "In progress (3/7)" (summarizeIsoStatus). */
    status: string;
    /** See the note on ComplianceSectionData.controls[].useCase. */
    useCase?: string;

    subClauses: Array<{
      id: number;
      /** e.g. "4.1"; empty when the struct row has none. */
      subClauseId: string;
      title: string;
      status: string;
    }>;
  }>;
  annexes: Array<{
    /** See the note on ComplianceSectionData.controls[].useCase. */
    useCase?: string;
    id: number;
    annexId: string;
    title: string;
    /** Summary of the applicable controls' statuses (summarizeIsoStatus). */
    status: string;
    controls: Array<{
      id: number;
      /** e.g. "A.5.1" (ISO 42001) or "A.5.26" (ISO 27001). */
      controlId: string;
      title: string;
      status: string;
      /** False for an ISO 42001 annex category excluded from scope. */
      isApplicable?: boolean;
    }>;
  }>;
}

// Models list (Organization group)
export interface ModelsListSectionData {
  totalModels: number;
  models: Array<{
    id: number;
    name: string;
    version?: string;
    status: string;
    /** Resolved from model_inventories.approver (a users FK). The table has no
     *  `owner` column — this is the approver, and the UI labels it so. */
    approver?: string;
    description?: string;
  }>;
}

// Model Risks (Risk Analysis group)
export interface ModelRisksSectionData {
  totalRisks: number;
  risks: Array<{
    id: number;
    modelName: string;
    riskName: string;
    riskLevel: string;
    /** model_risks.status. Read from a non-existent `mitigation_status`
     *  column until 2026-07, so every row rendered as "Unknown". */
    mitigationStatus: string;
    mitigationPlan?: string;
    /** ISO YYYY-MM-DD. */
    targetDate?: string;
    impact?: string;
    likelihood?: string;
  }>;
}

export interface TrainingRegistrySectionData {
  totalRecords: number;
  records: Array<{
    id: number;
    trainingName: string;
    status: string;
  }>;
}

export interface PolicyManagerSectionData {
  totalPolicies: number;
  policies: Array<{
    id: number;
    policyName: string;
    status: string;
    reviewDate?: string;
    owner?: string;
  }>;
}

// Bundled framework requirements (Compliance & Governance group, framework ids 5-28 and 30)
export interface FrameworkRequirementRow {
  implId: number;
  level: 2 | 3;
  title: string;
  orderNo: number;
  status: string; // raw IMPL_STATUSES value
  owner: string | null; // display name
  reviewer: string | null;
  approver: string | null;
  dueDate: string | null; // ISO date via isoDate
  isDone: boolean;
  isOverdue: boolean;
  evidenceCount: number;
  evidenceFiles: string[]; // file names, max 10, sorted
  riskCount: number;
  /** Self-assessed adoption level 0-5; null = not assessed. Set only for a
   *  framework with adoption levels (Saudi NAII), level 2 rows. */
  adoptionLevel?: number | null;
  children?: FrameworkRequirementRow[]; // L3 under L2
}

export interface FrameworkRequirementRollup {
  total: number;
  done: number;
  unassigned: number;
  noEvidence: number;
  overdue: number;
  statusBreakdown: Record<string, number>; // keyed by raw status
}

/** Assessed domains and level range of a group (Saudi NAII). No average. */
export interface AdoptionLevelSummary {
  assessed: number;
  total: number;
  /** Lowest and highest assessed level; null when no domain is assessed. */
  min: number | null;
  max: number | null;
}

export interface FrameworkRequirementGroup {
  title: string;
  orderNo: number;
  /** Set only when more than one use case pairing contributed (see compliance). */
  useCase?: string;
  requirements: FrameworkRequirementRow[];
  rollup: FrameworkRequirementRollup;
  /** Assessed domains and level range of the group's level 2 rows. Set only for
   *  a framework with adoption levels (Saudi NAII). */
  adoptionSummary?: AdoptionLevelSummary;
}

export interface FrameworkRequirementsSectionData {
  frameworks: Array<{
    frameworkId: number;
    frameworkName: string;
    /** True when the rows carry an adoption level (Saudi NAII). */
    adoptionLevels?: boolean;
    groups: FrameworkRequirementGroup[];
    rollup: FrameworkRequirementRollup;
  }>;
}

// Model risk management facts (OSFI E-23 report). One row per model inventory
// entry, retired ones included and flagged; every E-23 section derives from it.
export type MrmTierValue = "1" | "2" | "3";

export interface MrmModelFacts {
  id: number;
  /** model_inventories.model */
  name: string;
  version: string | null;
  provider: string | null;
  type: string | null;
  status: string | null;
  /** status = 'Retired' */
  retired: boolean;
  tier: MrmTierValue | null;
  /** ISO timestamps throughout (full precision, not date-only). */
  tieredAt: string | null;
  revalidationFlagged: boolean;
  intendedUse: string | null;
  limitations: string | null;
  inventoryApproverId: number | null;
  /** Display name, or null when unset or not a current organization member. */
  inventoryApprover: string | null;
  roles: {
    /** Display names of current members only; a departed user is dropped. */
    owner: string[];
    /** Raw user ids, resolved or not. */
    developerIds: number[];
    validator: string[];
    approver: string[];
  };
  hasOpenValidation: boolean;
  openValidationNextDue: string | null;
  latestSignedOff: {
    validatorId: number | null;
    outcome: string | null;
    signedOffAt: string;
    /** Report section keys missing or with empty trimmed text. */
    emptyReportSections: string[];
  } | null;
  /** next_due of the latest signed-off validation. */
  nextReviewDue: string | null;
  activeThresholds: number;
  lastMetricReceivedAt: string | null;
  findings: Array<{
    severity: string;
    stage: string;
    dueDate: string | null;
    remediationPlanEmpty: boolean;
  }>;
}

/** Counts within the report period, non-retired models only. */
export interface MrmActivity {
  /** null when the run has no period; every count is then 0. */
  period: { start: string; end: string } | null;
  validationsSignedOff: number;
  findingsOpened: number;
  findingsClosed: number;
  breaches: number;
  revalidationEvents: number;
}

export interface MrmFleetSectionData {
  totals: {
    models: number;
    untiered: number;
    byTier: Record<MrmTierValue, number>;
  };
  /** Each model in scope in exactly one bucket; the four add up to totals.models. */
  validationCoverage: {
    /** Latest sign-off passed (validated, or validated with findings), no validation open. */
    validated: number;
    /** An open validation (first or revalidation), not overdue. */
    inReview: number;
    /** Latest sign-off not_validated, no validation open. */
    notPassed: number;
    notStarted: number;
    overdue: number;
  };
  openFindingsBySeverity: Record<"critical" | "high" | "medium" | "low", number>;
  monitoring: {
    withActiveThresholds: number;
    withRecentMetric: number;
  };
  activity: MrmActivity;
  perTier: Array<{
    tier: MrmTierValue;
    models: number;
    tieringCurrent: number;
    validated: number;
    monitoringActive: number;
    openFindings: number;
    criticalHighFindings: number;
    /** Open findings of this tier by severity. Absent on data built before it existed. */
    openBySeverity?: Record<"critical" | "high" | "medium" | "low", number>;
  }>;
  /** Only models with at least one exception; the rest appear as counts. */
  exceptions: Array<{
    name: string;
    tier: MrmTierValue | null;
    issues: string[];
  }>;
}

export interface MrmInventoryAppendixRow {
  name: string;
  version: string | null;
  provider: string | null;
  type: string | null;
  tier: MrmTierValue | null;
  status: string | null;
  owner: string | null;
  approver: string | null;
  intendedUse: string | null;
  /** First 300 characters, then "…". */
  limitations: string | null;
  latestOutcome: string | null;
  latestSignedOffAt: string | null;
  nextReviewDue: string | null;
  activeThresholds: boolean;
  openFindings: number;
}

export interface MrmInventoryAppendixSectionData {
  active: MrmInventoryAppendixRow[];
  retired: MrmInventoryAppendixRow[];
}

/** Fixed E-23 contradiction rules (spec 8.4) evaluated over the MRM facts. */
export interface E23ContradictionsSectionData {
  /** false when the E-23 framework (id 26) is not in the requirements; no rule runs. */
  available: boolean;
  fired: Array<{
    ruleId: string;
    /** Requirement number, e.g. "2.1.4". */
    requirement: string;
    /** Full requirement title including its number, e.g. "2.1.4 Enterprise-level …". */
    requirementTitle: string;
    claimedStatus: string;
    finding: string;
    affectedCount: number;
    /** Up to five model names, sorted. */
    examples: string[];
    moreCount: number;
  }>;
  /** Rule ids evaluated (their requirement was found). */
  checked: string[];
  notRun: Array<{ ruleId: string; requirement: string; reason: string }>;
  /** Keyed by E-23 group title. */
  coverage: Record<string, "checked" | "selfAssessmentOnly">;
}

/** One line of the internal E-23 fix-it list (spec 8.6). */
export interface E23FixItItem {
  severity: "high" | "medium" | "low";
  /** 1 fired contradiction rule, 2 no owner, 3 overdue, 4 needs rework, 5 done without evidence, 6 other not done, 7 model gap. */
  source: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  what: string;
  /** Requirement number and title, or a model name. */
  where: string;
  /** "Unassigned" when there is no active owner. */
  owner: string;
  dueDate: string | null;
  overdue: boolean;
  closesWhen: string;
  /** Requirement order number; 0 for sources 1 and 7. */
  sortKey: number;
}

export interface E23FixItListSectionData {
  items: E23FixItItem[];
  counts: { high: number; medium: number; low: number };
}

/** The fixed "at a glance" figures of an E-23 report (spec 8.3 item 3). */
export interface E23GlanceFigures {
  /**
   * E-23 (framework 26) requirements implemented or audited. Each requirement
   * number counts once across pairings, done only when done in every pairing.
   */
  requirementsDone: number;
  requirementsTotal: number;
  /** E-23 groups checked against MRM data, of all groups the rules know. */
  groupsChecked: number;
  groupsTotal: number;
  rulesFired: number;
  rulesTotal: number;
  /** Non-retired models. */
  modelsInScope: number;
  untiered: number;
  overdueValidations: number;
  openCriticalHigh: number;
  fixIt: { high: number; medium: number; low: number };
}

/**
 * Which figures were actually measured. Renderers print "Not checked" instead
 * of 0 for a figure its flag marks unavailable:
 * - requirementsAvailable false (E-23 not on file, or its checklist could not
 *   be read): requirements, groups, rules fired and fix-it counts;
 * - mrmUnavailable true (the MRM data could not be read): models in scope,
 *   untiered, overdue validations, open critical/high, groups, rules fired and
 *   fix-it counts.
 */
export interface E23GlanceAvailability {
  requirementsAvailable: boolean;
  mrmUnavailable?: boolean;
}

/** The figures as stored on a run (config_snapshot.e23_glance). */
export interface E23GlanceSnapshot extends E23GlanceFigures, E23GlanceAvailability {
  /** ISO timestamp of the run that produced them. */
  generatedAt: string;
}

type Nullable<T> = { [K in keyof T]: T[K] | null };

/**
 * The previous run's figures for the change-since-last-run line. A figure is
 * null when it was unavailable in either run (see E23GlanceAvailability), so
 * no change is shown for it; rulesTotal is fixed and always kept.
 */
export interface E23GlancePrevious extends Nullable<
  Omit<E23GlanceFigures, "rulesTotal" | "fixIt">
> {
  rulesTotal: number;
  fixIt: E23GlanceFigures["fixIt"] | null;
  generatedAt: string;
}

export interface E23Glance extends E23GlanceFigures, E23GlanceAvailability {
  /** The previous comparable run's figures, or null when there is none. */
  previous: E23GlancePrevious | null;
}

// NIST AI RMF Subcategories (Compliance & Governance group)
export interface NistSubcategoriesSectionData {
  functions: Array<{
    name: string; // Govern, Map, Measure, Manage
    categories: Array<{
      id: string;
      name: string;
      /** See the note on ComplianceSectionData.controls[].useCase. */
      useCase?: string;
      subcategories: Array<{
        id: number;
        subcategoryId: string;
        name: string;
        status: string;
        risks: Array<{
          id: number;
          riskName: string;
          riskLevel: string;
        }>;
      }>;
    }>;
  }>;
}

// Incident Management (Organization group)
export interface IncidentManagementSectionData {
  /** Incidents in the report: archived ones are left out. */
  totalIncidents: number;
  /** Archived incidents left out of the report, noted under the table. */
  archivedIncidents?: number;
  incidents: Array<{
    id: number;
    incidentId: string;
    /** No `title`: ai_incident_managements has no title column, and the only
     *  candidate (`type`) already has its own column. */
    type: string;
    severity: string;
    status: string;
    reportedDate?: string;
    resolvedDate?: string;
    /** ai_incident_managements.reporter — who filed it, not who owns it. */
    reporter?: string;
  }>;
}
