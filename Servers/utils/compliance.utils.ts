/**
 * @fileoverview AI Compliance Score Calculation Engine
 *
 * Calculates organizational AI compliance scores based on:
 * - Risk Management (mitigated risks, coverage)
 * - Vendor Management (assessed vendors, high-risk management)
 * - Project Governance (project completion, framework adoption)
 * - Model Lifecycle (approved models, pending reviews)
 * - Policy Documentation (active policies, review status)
 */

import {
  IComplianceScore,
  IModuleScore,
  IComponentScore,
  DEFAULT_COMPLIANCE_WEIGHTS,
  IComplianceWeights,
  IComplianceMetadata,
} from "../domain.layer/interfaces/compliance/compliance.interface";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";

/**
 * Main function to calculate overall compliance score for an organization
 */
export const calculateComplianceScore = async (
  organizationId: number,
  weights: IComplianceWeights = DEFAULT_COMPLIANCE_WEIGHTS
): Promise<IComplianceScore> => {
  // Validate weights sum to 1.0
  const weightSum = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (Math.abs(weightSum - 1.0) > 0.001) {
    throw new Error(
      `Compliance module weights must sum to 1.0, got ${weightSum.toFixed(3)}`
    );
  }

  // Gather data for all modules in parallel
  const [riskData, vendorData, projectData, modelData, policyData] =
    await Promise.all([
      getRiskManagementData(organizationId),
      getVendorManagementData(organizationId),
      getProjectGovernanceData(organizationId),
      getModelLifecycleData(organizationId),
      getPolicyDocumentationData(organizationId),
    ]);

  // Calculate module scores
  const riskScore = calculateRiskManagementScore(riskData);
  const vendorScore = calculateVendorManagementScore(vendorData);
  const projectScore = calculateProjectGovernanceScore(projectData);
  const modelScore = calculateModelLifecycleScore(modelData);
  const policyScore = calculatePolicyDocumentationScore(policyData);

  // Calculate weighted overall score
  const overallScore = Math.round(
    riskScore.score * weights.riskManagement +
      vendorScore.score * weights.vendorManagement +
      projectScore.score * weights.projectGovernance +
      modelScore.score * weights.modelLifecycle +
      policyScore.score * weights.policyDocumentation
  );

  // Build metadata
  const metadata: IComplianceMetadata = {
    totalProjects: projectData.totalProjects,
    applicableProjects: projectData.totalProjects,
    lastUpdated: new Date(),
    dataFreshness: {
      risks: new Date(),
      vendors: new Date(),
      projects: new Date(),
      models: new Date(),
      policies: new Date(),
    },
    calculationMethod: "balanced_weighted_average",
    version: "2.0.0",
  };

  return {
    organizationId,
    overallScore,
    calculatedAt: new Date(),
    modules: {
      riskManagement: riskScore,
      vendorManagement: vendorScore,
      projectGovernance: projectScore,
      modelLifecycle: modelScore,
      policyDocumentation: policyScore,
    },
    metadata,
  };
};

// ==================== Data Fetching Functions ====================

interface RiskManagementData {
  totalRisks: number;
  mitigatedRisks: number;
  highRisks: number;
  criticalRisks: number;
}

async function getRiskManagementData(
  organizationId: number
): Promise<RiskManagementData> {
  try {
    // Total risks (excluding soft deleted)
    const totalResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM project_risks
       WHERE organization_id = :organizationId
       AND (is_deleted = false OR is_deleted IS NULL)`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    // Mitigated risks
    const mitigatedResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM project_risks
       WHERE organization_id = :organizationId
       AND (is_deleted = false OR is_deleted IS NULL)
       AND mitigation_status = 'Completed'`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    // High risks (unmitigated)
    const highResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM project_risks
       WHERE organization_id = :organizationId
       AND (is_deleted = false OR is_deleted IS NULL)
       AND mitigation_status != 'Completed'
       AND (current_risk_level = 'High risk' OR current_risk_level = 'Very high risk')`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    // Critical risks
    const criticalResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM project_risks
       WHERE organization_id = :organizationId
       AND (is_deleted = false OR is_deleted IS NULL)
       AND mitigation_status != 'Completed'
       AND current_risk_level = 'Very high risk'`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    return {
      totalRisks: parseInt(totalResult[0]?.count || "0"),
      mitigatedRisks: parseInt(mitigatedResult[0]?.count || "0"),
      highRisks: parseInt(highResult[0]?.count || "0"),
      criticalRisks: parseInt(criticalResult[0]?.count || "0"),
    };
  } catch {
    return { totalRisks: 0, mitigatedRisks: 0, highRisks: 0, criticalRisks: 0 };
  }
}

interface VendorManagementData {
  totalVendors: number;
  assessedVendors: number;
  highRiskVendors: number;
}

async function getVendorManagementData(
  organizationId: number
): Promise<VendorManagementData> {
  try {
    // Total vendors
    const totalResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM vendors
       WHERE organization_id = :organizationId
       AND (is_deleted = false OR is_deleted IS NULL)`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    // Assessed vendors (reviewed)
    const assessedResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM vendors
       WHERE organization_id = :organizationId
       AND (is_deleted = false OR is_deleted IS NULL)
       AND review_status = 'Reviewed'`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    // High risk vendors (based on risk_score)
    const highRiskResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM vendors
       WHERE organization_id = :organizationId
       AND (is_deleted = false OR is_deleted IS NULL)
       AND (risk_score >= 70 OR review_result = 'High risk')`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    return {
      totalVendors: parseInt(totalResult[0]?.count || "0"),
      assessedVendors: parseInt(assessedResult[0]?.count || "0"),
      highRiskVendors: parseInt(highRiskResult[0]?.count || "0"),
    };
  } catch {
    return { totalVendors: 0, assessedVendors: 0, highRiskVendors: 0 };
  }
}

interface ProjectGovernanceData {
  totalProjects: number;
  completedProjects: number;
  projectsWithFrameworks: number;
}

async function getProjectGovernanceData(
  organizationId: number
): Promise<ProjectGovernanceData> {
  try {
    // Total projects (excluding organizational)
    const totalResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM projects
       WHERE organization_id = :organizationId
       AND (is_organizational = false OR is_organizational IS NULL)`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    // Completed projects
    const completedResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM projects
       WHERE organization_id = :organizationId
       AND (is_organizational = false OR is_organizational IS NULL)
       AND status = 'Completed'`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    // Projects with frameworks
    const frameworksResult = (await sequelize.query(
      `SELECT COUNT(DISTINCT p.id) as count FROM projects p
       INNER JOIN projects_frameworks pf ON p.id = pf.project_id AND pf.organization_id = :organizationId
       WHERE p.organization_id = :organizationId
       AND (p.is_organizational = false OR p.is_organizational IS NULL)`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    return {
      totalProjects: parseInt(totalResult[0]?.count || "0"),
      completedProjects: parseInt(completedResult[0]?.count || "0"),
      projectsWithFrameworks: parseInt(frameworksResult[0]?.count || "0"),
    };
  } catch {
    return {
      totalProjects: 0,
      completedProjects: 0,
      projectsWithFrameworks: 0,
    };
  }
}

interface ModelLifecycleData {
  totalModels: number;
  approvedModels: number;
  pendingModels: number;
  blockedModels: number;
}

async function getModelLifecycleData(
  organizationId: number
): Promise<ModelLifecycleData> {
  try {
    // Total models
    const totalResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM model_inventories
       WHERE organization_id = :organizationId
       AND (is_deleted = false OR is_deleted IS NULL)`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    // Approved models
    const approvedResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM model_inventories
       WHERE organization_id = :organizationId
       AND (is_deleted = false OR is_deleted IS NULL)
       AND status = 'Approved'`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    // Pending models
    const pendingResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM model_inventories
       WHERE organization_id = :organizationId
       AND (is_deleted = false OR is_deleted IS NULL)
       AND status = 'Pending'`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    // Blocked models
    const blockedResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM model_inventories
       WHERE organization_id = :organizationId
       AND (is_deleted = false OR is_deleted IS NULL)
       AND status = 'Blocked'`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    return {
      totalModels: parseInt(totalResult[0]?.count || "0"),
      approvedModels: parseInt(approvedResult[0]?.count || "0"),
      pendingModels: parseInt(pendingResult[0]?.count || "0"),
      blockedModels: parseInt(blockedResult[0]?.count || "0"),
    };
  } catch {
    return { totalModels: 0, approvedModels: 0, pendingModels: 0, blockedModels: 0 };
  }
}

interface PolicyDocumentationData {
  totalPolicies: number;
  activePolicies: number;
  overduePolicies: number;
}

async function getPolicyDocumentationData(
  organizationId: number
): Promise<PolicyDocumentationData> {
  try {
    // Total policies
    const totalResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM policy_manager
       WHERE organization_id = :organizationId`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    // Active policies
    const activeResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM policy_manager
       WHERE organization_id = :organizationId
       AND status = 'Active'`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    // Overdue policies
    const overdueResult = (await sequelize.query(
      `SELECT COUNT(*) as count FROM policy_manager
       WHERE organization_id = :organizationId
       AND (status = 'Overdue' OR (next_review_date < NOW() AND status != 'Active'))`,
      { type: QueryTypes.SELECT, replacements: { organizationId } }
    )) as { count: string }[];

    return {
      totalPolicies: parseInt(totalResult[0]?.count || "0"),
      activePolicies: parseInt(activeResult[0]?.count || "0"),
      overduePolicies: parseInt(overdueResult[0]?.count || "0"),
    };
  } catch {
    return { totalPolicies: 0, activePolicies: 0, overduePolicies: 0 };
  }
}

// ==================== Score Calculation Functions ====================

function calculateRiskManagementScore(data: RiskManagementData): IModuleScore {
  const components: IComponentScore[] = [];

  // Risk Mitigation Rate (50% weight)
  // Return 0 when no data exists (empty database should show 0, not 100)
  const mitigationRate =
    data.totalRisks > 0 ? (data.mitigatedRisks / data.totalRisks) * 100 : 0;
  components.push({
    name: "Risk Mitigation Rate",
    score: Math.min(100, mitigationRate),
    weight: 0.5,
    dataPoints: data.totalRisks,
    details: { mitigated: data.mitigatedRisks, total: data.totalRisks },
  });

  // Critical Risk Management (50% weight) - penalize for unmitigated critical risks
  // Return 0 when no data exists
  const criticalRiskScore =
    data.totalRisks > 0
      ? (data.criticalRisks > 0 ? Math.max(0, 100 - data.criticalRisks * 20) : 100)
      : 0;
  components.push({
    name: "Critical Risk Management",
    score: criticalRiskScore,
    weight: 0.5,
    dataPoints: data.criticalRisks,
    details: { criticalRisks: data.criticalRisks, highRisks: data.highRisks },
  });

  const weightedScore = components.reduce(
    (sum, comp) => sum + comp.score * comp.weight,
    0
  );
  const totalDataPoints = data.totalRisks;
  const qualityScore = Math.min(1, totalDataPoints / 10);

  return {
    score: Math.round(weightedScore),
    weight: DEFAULT_COMPLIANCE_WEIGHTS.riskManagement,
    components,
    totalDataPoints,
    qualityScore,
  };
}

function calculateVendorManagementScore(
  data: VendorManagementData
): IModuleScore {
  const components: IComponentScore[] = [];

  // Vendor Assessment Rate (60% weight)
  // Return 0 when no data exists (empty database should show 0, not 100)
  const assessmentRate =
    data.totalVendors > 0
      ? (data.assessedVendors / data.totalVendors) * 100
      : 0;
  components.push({
    name: "Vendor Assessment Rate",
    score: Math.min(100, assessmentRate),
    weight: 0.6,
    dataPoints: data.totalVendors,
    details: { assessed: data.assessedVendors, total: data.totalVendors },
  });

  // High-Risk Vendor Management (40% weight)
  // Return 0 when no data exists
  const highRiskRate =
    data.totalVendors > 0
      ? (data.highRiskVendors / data.totalVendors) * 100
      : 0;
  const highRiskScore = data.totalVendors > 0 ? Math.max(0, 100 - highRiskRate * 2) : 0;
  components.push({
    name: "High-Risk Vendor Control",
    score: highRiskScore,
    weight: 0.4,
    dataPoints: data.highRiskVendors,
    details: { highRisk: data.highRiskVendors, total: data.totalVendors },
  });

  const weightedScore = components.reduce(
    (sum, comp) => sum + comp.score * comp.weight,
    0
  );
  const totalDataPoints = data.totalVendors;
  const qualityScore = Math.min(1, totalDataPoints / 5);

  return {
    score: Math.round(weightedScore),
    weight: DEFAULT_COMPLIANCE_WEIGHTS.vendorManagement,
    components,
    totalDataPoints,
    qualityScore,
  };
}

function calculateProjectGovernanceScore(
  data: ProjectGovernanceData
): IModuleScore {
  const components: IComponentScore[] = [];

  // Project Completion Rate (50% weight)
  const completionRate =
    data.totalProjects > 0
      ? (data.completedProjects / data.totalProjects) * 100
      : 0;
  components.push({
    name: "Project Completion Rate",
    score: Math.min(100, completionRate),
    weight: 0.5,
    dataPoints: data.totalProjects,
    details: { completed: data.completedProjects, total: data.totalProjects },
  });

  // Framework Adoption Rate (50% weight)
  const frameworkRate =
    data.totalProjects > 0
      ? (data.projectsWithFrameworks / data.totalProjects) * 100
      : 0;
  components.push({
    name: "Framework Adoption",
    score: Math.min(100, frameworkRate),
    weight: 0.5,
    dataPoints: data.projectsWithFrameworks,
    details: {
      withFrameworks: data.projectsWithFrameworks,
      total: data.totalProjects,
    },
  });

  const weightedScore = components.reduce(
    (sum, comp) => sum + comp.score * comp.weight,
    0
  );
  const totalDataPoints = data.totalProjects;
  const qualityScore = Math.min(1, totalDataPoints / 5);

  return {
    score: Math.round(weightedScore),
    weight: DEFAULT_COMPLIANCE_WEIGHTS.projectGovernance,
    components,
    totalDataPoints,
    qualityScore,
  };
}

function calculateModelLifecycleScore(data: ModelLifecycleData): IModuleScore {
  const components: IComponentScore[] = [];

  // Model Approval Rate (60% weight)
  const approvalRate =
    data.totalModels > 0 ? (data.approvedModels / data.totalModels) * 100 : 0;
  components.push({
    name: "Model Approval Rate",
    score: Math.min(100, approvalRate),
    weight: 0.6,
    dataPoints: data.totalModels,
    details: { approved: data.approvedModels, total: data.totalModels },
  });

  // Pending Review Management (40% weight) - penalize for blocked models
  // Return 0 when no data exists
  const blockedPenalty = data.blockedModels * 25;
  const pendingScore = data.totalModels > 0 ? Math.max(0, 100 - blockedPenalty) : 0;
  components.push({
    name: "Model Status Health",
    score: pendingScore,
    weight: 0.4,
    dataPoints: data.pendingModels + data.blockedModels,
    details: { pending: data.pendingModels, blocked: data.blockedModels },
  });

  const weightedScore = components.reduce(
    (sum, comp) => sum + comp.score * comp.weight,
    0
  );
  const totalDataPoints = data.totalModels;
  const qualityScore = Math.min(1, totalDataPoints / 5);

  return {
    score: Math.round(weightedScore),
    weight: DEFAULT_COMPLIANCE_WEIGHTS.modelLifecycle,
    components,
    totalDataPoints,
    qualityScore,
  };
}

function calculatePolicyDocumentationScore(
  data: PolicyDocumentationData
): IModuleScore {
  const components: IComponentScore[] = [];

  // Active Policy Rate (70% weight)
  const activeRate =
    data.totalPolicies > 0
      ? (data.activePolicies / data.totalPolicies) * 100
      : 0;
  components.push({
    name: "Active Policy Rate",
    score: Math.min(100, activeRate),
    weight: 0.7,
    dataPoints: data.totalPolicies,
    details: { active: data.activePolicies, total: data.totalPolicies },
  });

  // Policy Review Compliance (30% weight)
  // Return 0 when no data exists
  const overdueRate =
    data.totalPolicies > 0
      ? (data.overduePolicies / data.totalPolicies) * 100
      : 0;
  const reviewScore = data.totalPolicies > 0 ? Math.max(0, 100 - overdueRate * 2) : 0;
  components.push({
    name: "Policy Review Compliance",
    score: reviewScore,
    weight: 0.3,
    dataPoints: data.overduePolicies,
    details: { overdue: data.overduePolicies, total: data.totalPolicies },
  });

  const weightedScore = components.reduce(
    (sum, comp) => sum + comp.score * comp.weight,
    0
  );
  const totalDataPoints = data.totalPolicies;
  const qualityScore = Math.min(1, totalDataPoints / 3);

  return {
    score: Math.round(weightedScore),
    weight: DEFAULT_COMPLIANCE_WEIGHTS.policyDocumentation,
    components,
    totalDataPoints,
    qualityScore,
  };
}
