import type { ArticleContent } from '../contentTypes';
import { welcomeContent } from './getting-started/welcome';
import { installingContent } from './getting-started/installing';
import { dashboardContent } from './getting-started/dashboard';
import { quickStartContent } from './getting-started/quick-start';
import { useCasesContent } from './ai-governance/use-cases';
import { intakeFormsContent } from './ai-governance/intake-forms';
import { modelInventoryContent } from './ai-governance/model-inventory';
import { modelLifecycleContent } from './ai-governance/model-lifecycle';
import { taskManagementContent } from './ai-governance/task-management';
import { incidentManagementContent } from './ai-governance/incident-management';
import { evidenceCollectionContent } from './ai-governance/evidence-collection';
import { watchtowerContent } from './ai-governance/watchtower';
import { aiTrustCenterContent } from './ai-governance/ai-trust-center';
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
import { integrationOverviewContent } from './integrations/integration-overview';
import { slackIntegrationContent } from './integrations/slack-integration';
import { apiAccessContent } from './integrations/api-access';
import { llmEvalsOverviewContent } from './llm-evals/llm-evals-overview';
import { runningExperimentsContent } from './llm-evals/running-experiments';
import { managingDatasetsContent } from './llm-evals/managing-datasets';
import { configuringScorersContent } from './llm-evals/configuring-scorers';
import { biasAuditsContent } from './llm-evals/bias-audits';
import { modelsContent } from './llm-evals/models';
import { llmArenaContent } from './llm-evals/llm-arena';
import { scanningContent } from './ai-detection/scanning';
import { riskScoringContent } from './ai-detection/risk-scoring';
import { repositoriesContent } from './ai-detection/repositories';
import { historyContent } from './ai-detection/history';
import { aiDetectionSettingsContent } from './ai-detection/settings';
import { insightsContent } from './shadow-ai/insights';
import { aiToolsContent } from './shadow-ai/ai-tools';
import { userActivityContent } from './shadow-ai/user-activity';
import { rulesContent } from './shadow-ai/rules';
import { settingsContent as shadowAiSettingsContent } from './shadow-ai/settings';
import { integrationGuideContent } from './shadow-ai/integration-guide';
import { gettingStartedContent as aiGatewayGettingStartedContent } from './ai-gateway/getting-started';
import { analyticsContent as aiGatewayAnalyticsContent } from './ai-gateway/analytics';
import { endpointsContent as aiGatewayEndpointsContent } from './ai-gateway/endpoints';
import { playgroundContent as aiGatewayPlaygroundContent } from './ai-gateway/playground';
import { guardrailsContent as aiGatewayGuardrailsContent } from './ai-gateway/guardrails';
import { aiGatewaySettingsContent } from './ai-gateway/settings';
import { virtualKeysContent as aiGatewayVirtualKeysContent } from './ai-gateway/virtual-keys';
import { logsContent as aiGatewayLogsContent } from './ai-gateway/logs';
import { promptsContent as aiGatewayPromptsContent } from './ai-gateway/prompts';

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
  'ai-governance/task-management': taskManagementContent,
  'ai-governance/incident-management': incidentManagementContent,
  'ai-governance/evidence-collection': evidenceCollectionContent,
  'ai-governance/watchtower': watchtowerContent,
  'ai-governance/ai-trust-center': aiTrustCenterContent,
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
  // Integrations
  'integrations/integration-overview': integrationOverviewContent,
  'integrations/slack-integration': slackIntegrationContent,
  'integrations/api-access': apiAccessContent,
  // LLM Evals
  'llm-evals/llm-evals-overview': llmEvalsOverviewContent,
  'llm-evals/running-experiments': runningExperimentsContent,
  'llm-evals/managing-datasets': managingDatasetsContent,
  'llm-evals/configuring-scorers': configuringScorersContent,
  'llm-evals/bias-audits': biasAuditsContent,
  'llm-evals/models': modelsContent,
  'llm-evals/llm-arena': llmArenaContent,
  // AI Detection
  'ai-detection/scanning': scanningContent,
  'ai-detection/risk-scoring': riskScoringContent,
  'ai-detection/repositories': repositoriesContent,
  'ai-detection/history': historyContent,
  'ai-detection/settings': aiDetectionSettingsContent,
  // Shadow AI
  'shadow-ai/insights': insightsContent,
  'shadow-ai/ai-tools': aiToolsContent,
  'shadow-ai/user-activity': userActivityContent,
  'shadow-ai/rules': rulesContent,
  'shadow-ai/settings': shadowAiSettingsContent,
  'shadow-ai/integration-guide': integrationGuideContent,
  // AI Gateway
  'ai-gateway/getting-started': aiGatewayGettingStartedContent,
  'ai-gateway/analytics': aiGatewayAnalyticsContent,
  'ai-gateway/endpoints': aiGatewayEndpointsContent,
  'ai-gateway/playground': aiGatewayPlaygroundContent,
  'ai-gateway/guardrails': aiGatewayGuardrailsContent,
  'ai-gateway/settings': aiGatewaySettingsContent,
  'ai-gateway/virtual-keys': aiGatewayVirtualKeysContent,
  'ai-gateway/logs': aiGatewayLogsContent,
  'ai-gateway/prompts': aiGatewayPromptsContent,
};

// Helper to get article content
export const getArticleContent = (
  collectionId: string,
  articleId: string
): ArticleContent | undefined => {
  const key = `${collectionId}/${articleId}`;
  return articleContentMap[key];
};
