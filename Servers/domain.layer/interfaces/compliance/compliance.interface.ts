/**
 * @fileoverview AI Compliance Score Interfaces
 *
 * Defines TypeScript interfaces for the AI Compliance Score system
 * implementing balanced weighted average calculations across five modules:
 * Risk Management (30%), Vendor Management (30%), Project Governance (25%)
 * Model Lifecycle Management (10%), Policy & Documentation (5%)
 */

export interface IComplianceScore {
  organizationId: number;
  overallScore: number; // 0-100 normalized score
  calculatedAt: Date;
  modules: {
    riskManagement: IModuleScore;
    vendorManagement: IModuleScore;
    projectGovernance: IModuleScore;
    modelLifecycle: IModuleScore;
    policyDocumentation: IModuleScore;
  };
  metadata: IComplianceMetadata;
}

export interface IModuleScore {
  score: number; // 0-100 normalized score
  weight: number; // 0.35, 0.35, 0.30
  components: IComponentScore[];
  totalDataPoints: number;
  qualityScore: number; // 0-1 based on data completeness
}

export interface IComponentScore {
  name: string;
  score: number;
  weight: number;
  dataPoints: number;
  details: any; // Module-specific details
}

export interface IComplianceMetadata {
  totalProjects: number;
  applicableProjects: number; // Excludes "not applicable" projects
  lastUpdated: Date;
  dataFreshness: {
    risks: Date;
    vendors: Date;
    projects: Date;
    models: Date;
    policies: Date;
  };
  calculationMethod: "balanced_weighted_average";
  version: string;
}

// Risk Management Module Interfaces
export interface IRiskManagementData {
  totalRisks: number;
  mitigatedRisks: number;
  highRisks: number;
  criticalRisks: number;
  overdueMitigations: number;
  riskCoverage: number; // Percentage of projects with risk assessments
}

// Vendor Management Module Interfaces
export interface IVendorManagementData {
  totalVendors: number;
  assessedVendors: number;
  highRiskVendors: number;
  contractCompliance: number;
  vendorCoverage: number; // Percentage of projects with vendor assessments
}

// Project Governance Module Interfaces
export interface IProjectGovernanceData {
  totalProjects: number;
  applicableProjects: number;
  completedAssessments: number;
  avgComplianceProgress: number;
  overallHealthScore: number;
  governanceMaturity: number;
}

// Dashboard Widget Interface
export interface IComplianceDashboardWidget {
  score: number;
  trend: "up" | "down" | "stable";
  trendValue: number; // Percentage change
  lastCalculated: Date;
  moduleBreakdown: {
    name: string;
    score: number;
    weight: number;
  }[];
  drillDownUrl: string;
}

// Model Lifecycle Management Module Interfaces
export interface IModelLifecycleData {
  totalModels: number;
  approvedModels: number;
  modelsWithSecurityAssessment: number;
  modelsWithBiasDocumentation: number;
  modelsWithLimitationDocumentation: number;
  avgModelAge: number; // Days since last status update
  restrictedModels: number;
}

// Policy & Documentation Module Interfaces
export interface IPolicyDocumentationData {
  totalPolicies: number;
  activePolicies: number;
  overduePolicies: number;
  totalControls: number;
  completedControls: number;
  controlsWithImplementation: number;
  controlsWithAcceptableRisk: number;
}

// Calculation Configuration
export interface IComplianceWeights {
  riskManagement: number; // 0.30
  vendorManagement: number; // 0.30
  projectGovernance: number; // 0.25
  modelLifecycle: number; // 0.10
  policyDocumentation: number; // 0.05
}

export const DEFAULT_COMPLIANCE_WEIGHTS: IComplianceWeights = {
  riskManagement: 0.3,
  vendorManagement: 0.3,
  projectGovernance: 0.25,
  modelLifecycle: 0.1,
  policyDocumentation: 0.05,
};
