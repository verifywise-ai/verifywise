#!/usr/bin/env node

/**
 * Script to split endpoints.ts into separate category files for the website
 * Run: node scripts/split-api-endpoints.js
 */

const fs = require('fs');
const path = require('path');

const SOURCE_FILE = path.join(__dirname, '../docs/api-docs/src/config/endpoints.ts');
const OUTPUT_DIR = path.join(__dirname, '../../website/verifywise/content/api-docs/endpoints');

// Map from variable names to file names
const endpointMapping = {
  // Getting Started
  authenticationEndpoints: 'authentication',
  userEndpoints: 'users',
  organizationEndpoints: 'organizations',
  roleEndpoints: 'roles',
  tokenEndpoints: 'tokens',
  llmKeyEndpoints: 'llm-keys',
  // Core Resources
  projectEndpoints: 'projects',
  vendorEndpoints: 'vendors',
  policyEndpoints: 'policies',
  taskEndpoints: 'tasks',
  trainingEndpoints: 'training',
  evidenceHubEndpoints: 'evidence-hub',
  fileEndpoints: 'files',
  noteEndpoints: 'notes',
  shareLinkEndpoints: 'share-links',
  datasetEndpoints: 'datasets',
  // Risk Management
  projectRiskEndpoints: 'project-risks',
  vendorRiskEndpoints: 'vendor-risks',
  modelRiskEndpoints: 'model-risks',
  quantitativeRiskEndpoints: 'quantitative-risks',
  riskBenchmarkEndpoints: 'risk-benchmarks',
  riskHistoryEndpoints: 'risk-history',
  // AI Governance
  modelInventoryEndpoints: 'model-inventory',
  aiDetectionEndpoints: 'ai-detection',
  aiTrustCentreEndpoints: 'ai-trust-centre',
  aiIncidentEndpoints: 'ai-incidents',
  aiAdvisorEndpoints: 'ai-advisor',
  agentDiscoveryEndpoints: 'agent-discovery',
  shadowAiEndpoints: 'shadow-ai',
  // Compliance
  euAiActEndpoints: 'eu-ai-act',
  iso27001Endpoints: 'iso-27001',
  iso42001Endpoints: 'iso-42001',
  nistAiRmfEndpoints: 'nist-ai-rmf',
  complianceEndpoints: 'compliance',
  frameworkEndpoints: 'frameworks',
  assessmentEndpoints: 'assessments',
  ceMarkingEndpoints: 'ce-marking',
  friaEndpoints: 'fria',
  entityGraphEndpoints: 'entity-graph',
  approvalWorkflowEndpoints: 'approval-workflows',
  // Operations
  automationEndpoints: 'automation',
  notificationEndpoints: 'notifications',
  reportingEndpoints: 'reporting',
  dashboardEndpoints: 'dashboard',
  searchEndpoints: 'search',
  postMarketMonitoringEndpoints: 'post-market-monitoring',
  // Integrations
  integrationEndpoints: 'integrations',
  slackWebhookEndpoints: 'slack-webhooks',
  webhookEndpoints: 'webhooks',
  pluginEndpoints: 'plugins',
  // Settings & Admin
  settingEndpoints: 'settings',
  userPreferenceEndpoints: 'user-preferences',
  subscriptionEndpoints: 'subscriptions',
  tierEndpoints: 'tiers',
  emailEndpoints: 'email',
  invitationEndpoints: 'invitations',
  intakeFormEndpoints: 'intake-forms',
  superAdminEndpoints: 'super-admin',
  // System
  systemEndpoints: 'system',
  loggerEndpoints: 'logger',
  auditEndpoints: 'audit',
  changeHistoryEndpoints: 'change-history',
  internalEndpoints: 'internal',
  demoDataEndpoints: 'demo-data',
};

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Read the source file
const content = fs.readFileSync(SOURCE_FILE, 'utf-8');

// Extract each endpoint array
const endpointArrayRegex = /export const (\w+Endpoints): Endpoint\[\] = (\[[\s\S]*?\]);/g;

let match;
let count = 0;

while ((match = endpointArrayRegex.exec(content)) !== null) {
  const varName = match[1];
  const arrayContent = match[2];
  const fileName = endpointMapping[varName];

  if (fileName) {
    const outputContent = `import type { Endpoint } from '../types';

export const endpoints: Endpoint[] = ${arrayContent};
`;

    const outputPath = path.join(OUTPUT_DIR, `${fileName}.ts`);
    fs.writeFileSync(outputPath, outputContent);
    console.log(`✓ Created ${fileName}.ts`);
    count++;
  } else {
    console.log(`⚠ Unknown endpoint variable: ${varName}`);
  }
}

// Create index file
const indexContent = `// Auto-generated index of all endpoint files
${Object.values(endpointMapping).map(name =>
  `export { endpoints as ${name.replace(/-/g, '')}Endpoints } from './${name}';`
).join('\n')}

// Re-export for convenience
import type { Endpoint } from '../types';
${Object.values(endpointMapping).map(name =>
  `import { endpoints as ${name.replace(/-/g, '')} } from './${name}';`
).join('\n')}

export const allEndpoints: Record<string, Endpoint[]> = {
${Object.values(endpointMapping).map(name =>
  `  '${name}': ${name.replace(/-/g, '')},`
).join('\n')}
};

export const getEndpoints = (categoryId: string): Endpoint[] => {
  return allEndpoints[categoryId] || [];
};
`;

fs.writeFileSync(path.join(OUTPUT_DIR, 'index.ts'), indexContent);
console.log(`✓ Created index.ts`);

console.log(`\nDone! Split ${count} endpoint categories.`);
