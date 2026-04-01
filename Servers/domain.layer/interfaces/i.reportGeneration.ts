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
  llmKeyId?: number;
}

export interface ReportGenerationResult {
  success: boolean;
  filename: string;
  content: Buffer;
  mimeType: string;
  error?: string;
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
  recommendations?: string[];
  sectionSummaries: Record<string, string>;
  riskHighlights?: string;
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
    owner?: string;
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
    owner?: string;
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
    mitigationStatus: string;
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
    title: string;
    type: string;
    severity: string;
    status: string;
    reportedDate?: string;
    resolvedDate?: string;
    assignee?: string;
  }>;
}
