/**
 * Report Generation Interfaces
 * Following VerifyWise clean architecture patterns
 */

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
  isOrganizational: boolean;
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
  reportType: string | string[];
  reportName?: string;
  format: ReportFormat;
  branding?: Partial<ReportBranding>;
  sections?: ReportSection[];
  aiEnhanced?: boolean;
  /**
   * Per-block gating for the seven AI blocks. When omitted (manual runs, which
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
  };
  llmKeyId?: number;
  /**
   * The schedule this run belongs to, when it has one. Used only to find the
   * previous run's stored facts snapshot; a manual run leaves it undefined and
   * gets no prior-run comparison.
   */
  scheduledReportId?: number;
}

export interface ReportGenerationResult {
  success: boolean;
  filename: string;
  content: Buffer;
  mimeType: string;
  error?: string;
  /**
   * Structured analyzer output, keyed by section key. The runner persists this
   * to report_run_analyses; the renderers read the flattened copy on
   * ReportData.aiSummaries instead.
   */
  analyses?: Record<string, {
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
  }>;
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
    suggestedOwner?: string;  // MUST be an existing org member/role or omitted
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
}

// Unified report data structure
export interface ReportData {
  metadata: ReportMetadata;
  branding: ReportBranding;
  charts: ChartData;
  renderedCharts: RenderedCharts;
  aiSummaries?: AISummaries;
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
    status: string;
    subClauses: Array<{
      id: number;
      title: string;
      status: string;
    }>;
  }>;
  annexes: Array<{
    id: number;
    annexId: string;
    title: string;
    status: string;
    controls: Array<{
      id: number;
      controlId: string;
      title: string;
      status: string;
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
    completionDate?: string;
    status: string;
    assignee?: string;
  }>;
}

export interface PolicyManagerSectionData {
  totalPolicies: number;
  policies: Array<{
    id: number;
    policyName: string;
    version?: string;
    status: string;
    reviewDate?: string;
    owner?: string;
  }>;
}

// NIST AI RMF Subcategories (Compliance & Governance group)
export interface NistSubcategoriesSectionData {
  functions: Array<{
    name: string; // Govern, Map, Measure, Manage
    categories: Array<{
      id: string;
      name: string;
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
  totalIncidents: number;
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
