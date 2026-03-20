import type { ArticleContent } from '@user-guide-content/contentTypes';
import { welcomeContent } from './getting-started/welcome';
import { installingContent } from './getting-started/installing';
import { dashboardContent } from './getting-started/dashboard';
import { quickStartContent } from './getting-started/quick-start';
import { useCasesContent } from './ai-governance/use-cases';
import { intakeFormsContent } from './ai-governance/intake-forms';
import { modelInventoryContent } from './ai-governance/model-inventory';
import { modelLifecycleContent } from './ai-governance/model-lifecycle';
import { incidentManagementContent } from './ai-governance/incident-management';
import { evidenceCollectionContent } from './ai-governance/evidence-collection';
import { entityGraphContent } from './ai-governance/entity-graph';
import { riskAssessmentContent } from './risk-management/risk-assessment';
import { quantitativeRiskAssessmentContent } from './risk-management/quantitative-risk-assessment';
import { riskMitigationContent } from './risk-management/risk-mitigation';
import { vendorManagementContent } from './risk-management/vendor-management';
import { vendorRisksContent } from './risk-management/vendor-risks';
import { euAiActContent } from './compliance/eu-ai-act';
import { iso42001Content } from './compliance/iso-42001';
import { iso27001Content } from './compliance/iso-27001';
import { nistAiRmfContent } from './compliance/nist-ai-rmf';
import { assessmentsContent } from './compliance/assessments';
import { policyManagementContent } from './policies/policy-management';
import { policyVersioningContent } from './policies/policy-versioning';
import { policyApprovalContent } from './policies/policy-approval';
import { trainingTrackingContent } from './training/training-tracking';
import { dashboardAnalyticsContent } from './reporting/dashboard-analytics';
import { generatingReportsContent } from './reporting/generating-reports';
import { organizationSettingsContent } from './settings/organization-settings';
import { userManagementContent } from './settings/user-management';
import { roleConfigurationContent } from './settings/role-configuration';
import { notificationsContent } from './settings/notifications';
import { scanningContent } from './ai-detection/scanning';
import { riskScoringContent } from './ai-detection/risk-scoring';
import { repositoriesContent } from './ai-detection/repositories';
import { historyContent } from './ai-detection/history';
import { aiDetectionSettingsContent } from './ai-detection/settings';

// Map of article IDs to their content
// Format: 'collectionId/articleId': ArticleContent
export const articleContentMap: Record<string, ArticleContent> = {
  // Getting Started
  'getting-started/welcome': welcomeContent,
  'getting-started/installing': installingContent,
  'getting-started/dashboard': dashboardContent,
  'getting-started/quick-start': quickStartContent,
  // AI Governance
  'ai-governance/use-cases': useCasesContent,
  'ai-governance/intake-forms': intakeFormsContent,
  'ai-governance/model-inventory': modelInventoryContent,
  'ai-governance/model-lifecycle': modelLifecycleContent,
  'ai-governance/incident-management': incidentManagementContent,
  'ai-governance/evidence-collection': evidenceCollectionContent,
  'ai-governance/entity-graph': entityGraphContent,
  // Risk Management
  'risk-management/risk-assessment': riskAssessmentContent,
  'risk-management/quantitative-risk-assessment': quantitativeRiskAssessmentContent,
  'risk-management/risk-mitigation': riskMitigationContent,
  'risk-management/vendor-management': vendorManagementContent,
  'risk-management/vendor-risks': vendorRisksContent,
  // Compliance
  'compliance/eu-ai-act': euAiActContent,
  'compliance/iso-42001': iso42001Content,
  'compliance/iso-27001': iso27001Content,
  'compliance/nist-ai-rmf': nistAiRmfContent,
  'compliance/assessments': assessmentsContent,
  // Policies
  'policies/policy-management': policyManagementContent,
  'policies/policy-versioning': policyVersioningContent,
  'policies/policy-approval': policyApprovalContent,
  // Training
  'training/training-tracking': trainingTrackingContent,
  // Reporting
  'reporting/dashboard-analytics': dashboardAnalyticsContent,
  'reporting/generating-reports': generatingReportsContent,
  // Settings
  'settings/organization-settings': organizationSettingsContent,
  'settings/user-management': userManagementContent,
  'settings/role-configuration': roleConfigurationContent,
  'settings/notifications': notificationsContent,
  // AI Detection
  'ai-detection/scanning': scanningContent,
  'ai-detection/risk-scoring': riskScoringContent,
  'ai-detection/repositories': repositoriesContent,
  'ai-detection/history': historyContent,
  'ai-detection/settings': aiDetectionSettingsContent,
};

// Helper to get article content
export const getArticleContent = (
  collectionId: string,
  articleId: string
): ArticleContent | undefined => {
  const key = `${collectionId}/${articleId}`;
  return articleContentMap[key];
};
