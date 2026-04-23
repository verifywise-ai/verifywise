// Auto-generated from swagger.yaml for version 2.0.0
// DO NOT EDIT MANUALLY — run: cd Servers && npx ts-node scripts/generateEndpointsTs.ts
// This file contains all API endpoint definitions

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header';
  type: string;
  required: boolean;
  description: string;
}

export interface Response {
  status: number;
  description: string;
}

export interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  description?: string;
  requiresAuth: boolean;
  parameters?: Parameter[];
  requestBody?: Record<string, string>;
  responses: Response[];
  tag: string;
}

// Agent Discovery endpoints
export const agentDiscoveryEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/agent-primitives',
    summary: "Get All Agent Primitives",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Agent Discovery",
  },
  {
    method: 'POST',
    path: '/agent-primitives',
    summary: "Create Agent Primitive",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Agent Discovery",
  },
  {
    method: 'GET',
    path: '/agent-primitives/stats',
    summary: "Get Agent Stats",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Agent Discovery",
  },
  {
    method: 'POST',
    path: '/agent-primitives/sync',
    summary: "Trigger Sync",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Agent Discovery",
  },
  {
    method: 'GET',
    path: '/agent-primitives/sync/logs',
    summary: "Get Sync Logs",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Agent Discovery",
  },
  {
    method: 'GET',
    path: '/agent-primitives/sync/status',
    summary: "Get Sync Status",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Agent Discovery",
  },
  {
    method: 'GET',
    path: '/agent-primitives/{id}',
    summary: "Get Agent Primitive By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Agent Discovery",
  },
  {
    method: 'PATCH',
    path: '/agent-primitives/{id}',
    summary: "Update Agent Primitive",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Agent Discovery",
  },
  {
    method: 'DELETE',
    path: '/agent-primitives/{id}',
    summary: "Delete Agent Primitive By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Agent Discovery",
  },
  {
    method: 'GET',
    path: '/agent-primitives/{id}/audit-logs',
    summary: "Get Agent Audit Logs",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Agent Discovery",
  },
  {
    method: 'PATCH',
    path: '/agent-primitives/{id}/link-model',
    summary: "Link Model To Agent",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Agent Discovery",
  },
  {
    method: 'PATCH',
    path: '/agent-primitives/{id}/review',
    summary: "Review Agent Primitive",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Agent Discovery",
  },
  {
    method: 'PATCH',
    path: '/agent-primitives/{id}/unlink-model',
    summary: "Unlink Model From Agent",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Agent Discovery",
  },
];

// AI Advisor endpoints
export const aiAdvisorEndpoints: Endpoint[] = [
  {
    method: 'POST',
    path: '/advisor',
    summary: "Run Advisor",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Advisor",
  },
  {
    method: 'POST',
    path: '/advisor/chat',
    summary: "Stream Advisor V2",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Advisor",
  },
  {
    method: 'GET',
    path: '/advisor/conversations/{domain}',
    summary: "Get Conversation",
    requiresAuth: true,
    parameters: [
      { name: 'domain', in: 'path', type: 'string', required: true, description: "The domain" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Advisor",
  },
  {
    method: 'POST',
    path: '/advisor/conversations/{domain}',
    summary: "Save Conversation",
    requiresAuth: true,
    parameters: [
      { name: 'domain', in: 'path', type: 'string', required: true, description: "The domain" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Advisor",
  },
  {
    method: 'POST',
    path: '/advisor/stream',
    summary: "Stream Advisor",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Advisor",
  },
];

// AI Detection endpoints
export const aiDetectionEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/ai-detection/repositories',
    summary: "List Repositories",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'POST',
    path: '/ai-detection/repositories',
    summary: "Create Repository",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/repositories/{id}',
    summary: "Get Repository",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'PATCH',
    path: '/ai-detection/repositories/{id}',
    summary: "Update Repository",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'DELETE',
    path: '/ai-detection/repositories/{id}',
    summary: "Delete Repository",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'POST',
    path: '/ai-detection/repositories/{id}/scan',
    summary: "Trigger Repository Scan",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/repositories/{id}/scans',
    summary: "Get Repository Scans",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'POST',
    path: '/ai-detection/repositories/{id}/webhook-secret',
    summary: "Generate Webhook Secret Controller",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/risk-scoring/config',
    summary: "Get Risk Scoring Config Controller",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'PATCH',
    path: '/ai-detection/risk-scoring/config',
    summary: "Update Risk Scoring Config Controller",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/scans',
    summary: "Get Scans Controller",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'POST',
    path: '/ai-detection/scans',
    summary: "Start Scan Controller",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/scans/active',
    summary: "Get Active Scan Controller",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/scans/{scanId}',
    summary: "Get Scan Controller",
    requiresAuth: true,
    parameters: [
      { name: 'scanId', in: 'path', type: 'integer', required: true, description: "The scanId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'DELETE',
    path: '/ai-detection/scans/{scanId}',
    summary: "Delete Scan Controller",
    requiresAuth: true,
    parameters: [
      { name: 'scanId', in: 'path', type: 'integer', required: true, description: "The scanId" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'POST',
    path: '/ai-detection/scans/{scanId}/cancel',
    summary: "Cancel Scan Controller",
    requiresAuth: true,
    parameters: [
      { name: 'scanId', in: 'path', type: 'integer', required: true, description: "The scanId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/scans/{scanId}/compliance',
    summary: "Get Compliance Mapping Controller",
    requiresAuth: true,
    parameters: [
      { name: 'scanId', in: 'path', type: 'integer', required: true, description: "The scanId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/scans/{scanId}/dependency-graph',
    summary: "Get Dependency Graph Controller",
    requiresAuth: true,
    parameters: [
      { name: 'scanId', in: 'path', type: 'integer', required: true, description: "The scanId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/scans/{scanId}/export/ai-bom',
    summary: "Export A I B O M Controller",
    requiresAuth: true,
    parameters: [
      { name: 'scanId', in: 'path', type: 'integer', required: true, description: "The scanId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/scans/{scanId}/findings',
    summary: "Get Scan Findings Controller",
    requiresAuth: true,
    parameters: [
      { name: 'scanId', in: 'path', type: 'integer', required: true, description: "The scanId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'PATCH',
    path: '/ai-detection/scans/{scanId}/findings/{findingId}/governance',
    summary: "Update Governance Status Controller",
    requiresAuth: true,
    parameters: [
      { name: 'scanId', in: 'path', type: 'integer', required: true, description: "The scanId" },
      { name: 'findingId', in: 'path', type: 'integer', required: true, description: "The findingId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/scans/{scanId}/governance-summary',
    summary: "Get Governance Summary Controller",
    requiresAuth: true,
    parameters: [
      { name: 'scanId', in: 'path', type: 'integer', required: true, description: "The scanId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/scans/{scanId}/risk-score',
    summary: "Get Risk Score Controller",
    requiresAuth: true,
    parameters: [
      { name: 'scanId', in: 'path', type: 'integer', required: true, description: "The scanId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'POST',
    path: '/ai-detection/scans/{scanId}/risk-score/recalculate',
    summary: "Recalculate Risk Score Controller",
    requiresAuth: true,
    parameters: [
      { name: 'scanId', in: 'path', type: 'integer', required: true, description: "The scanId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/scans/{scanId}/security-findings',
    summary: "Get Security Findings Controller",
    requiresAuth: true,
    parameters: [
      { name: 'scanId', in: 'path', type: 'integer', required: true, description: "The scanId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/scans/{scanId}/security-summary',
    summary: "Get Security Summary Controller",
    requiresAuth: true,
    parameters: [
      { name: 'scanId', in: 'path', type: 'integer', required: true, description: "The scanId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/scans/{scanId}/status',
    summary: "Get Scan Status Controller",
    requiresAuth: true,
    parameters: [
      { name: 'scanId', in: 'path', type: 'integer', required: true, description: "The scanId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
  {
    method: 'GET',
    path: '/ai-detection/stats',
    summary: "Get A I Detection Stats Controller",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Detection",
  },
];

// Incidents endpoints
export const aiIncidentEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/ai-incident-managements',
    summary: "Get All Incidents",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Incidents",
  },
  {
    method: 'POST',
    path: '/ai-incident-managements',
    summary: "Create New Incident",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Incidents",
  },
  {
    method: 'GET',
    path: '/ai-incident-managements/{id}',
    summary: "Get Incident By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Incidents",
  },
  {
    method: 'PATCH',
    path: '/ai-incident-managements/{id}',
    summary: "Update Incident By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Incidents",
  },
  {
    method: 'DELETE',
    path: '/ai-incident-managements/{id}',
    summary: "Delete Incident By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Incidents",
  },
  {
    method: 'PATCH',
    path: '/ai-incident-managements/{id}/archive',
    summary: "Archive Incident By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Incidents",
  },
];

// AI Trust Centre endpoints
export const aiTrustCentreEndpoints: Endpoint[] = [
  {
    method: 'POST',
    path: '/aiTrustCentre/logo',
    summary: "Upload company logo",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
  {
    method: 'DELETE',
    path: '/aiTrustCentre/logo',
    summary: "Delete Company Logo",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
  {
    method: 'GET',
    path: '/aiTrustCentre/overview',
    summary: "Get A I Trust Centre Overview",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
  {
    method: 'PUT',
    path: '/aiTrustCentre/overview',
    summary: "Update A I Trust Overview",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
  {
    method: 'GET',
    path: '/aiTrustCentre/resources',
    summary: "Get A I Trust Centre Resources",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
  {
    method: 'POST',
    path: '/aiTrustCentre/resources',
    summary: "Create A I Trust Resource",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
  {
    method: 'PUT',
    path: '/aiTrustCentre/resources/{id}',
    summary: "Update A I Trust Resource",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
  {
    method: 'DELETE',
    path: '/aiTrustCentre/resources/{id}',
    summary: "Delete A I Trust Resource",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
  {
    method: 'GET',
    path: '/aiTrustCentre/subprocessors',
    summary: "Get A I Trust Centre Subprocessors",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
  {
    method: 'POST',
    path: '/aiTrustCentre/subprocessors',
    summary: "Create A I Trust Subprocessor",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
  {
    method: 'PUT',
    path: '/aiTrustCentre/subprocessors/{id}',
    summary: "Update A I Trust Subprocessor",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
  {
    method: 'DELETE',
    path: '/aiTrustCentre/subprocessors/{id}',
    summary: "Delete A I Trust Subprocessor",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
  {
    method: 'GET',
    path: '/aiTrustCentre/{hash}',
    summary: "Get A I Trust Centre Public Page",
    requiresAuth: false,
    parameters: [
      { name: 'hash', in: 'path', type: 'string', required: true, description: "The hash" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
  {
    method: 'GET',
    path: '/aiTrustCentre/{hash}/logo',
    summary: "Get Company Logo",
    requiresAuth: false,
    parameters: [
      { name: 'hash', in: 'path', type: 'string', required: true, description: "The hash" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
  {
    method: 'GET',
    path: '/aiTrustCentre/{hash}/resources/{id}',
    summary: "Get A I Trust Centre Public Resource",
    requiresAuth: false,
    parameters: [
      { name: 'hash', in: 'path', type: 'string', required: true, description: "The hash" },
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "AI Trust Centre",
  },
];

// Approval Workflows endpoints
export const approvalWorkflowEndpoints: Endpoint[] = [
  {
    method: 'POST',
    path: '/approval-requests',
    summary: "Create Approval Request",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Approval Workflows",
  },
  {
    method: 'GET',
    path: '/approval-requests/all',
    summary: "Get All Approval Requests",
    description: "Requires role: Admin",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Approval Workflows",
  },
  {
    method: 'GET',
    path: '/approval-requests/my-requests',
    summary: "Get My Approval Requests",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Approval Workflows",
  },
  {
    method: 'GET',
    path: '/approval-requests/pending-approvals',
    summary: "Get Pending Approvals",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Approval Workflows",
  },
  {
    method: 'GET',
    path: '/approval-requests/{id}',
    summary: "Get Approval Request By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Approval Workflows",
  },
  {
    method: 'POST',
    path: '/approval-requests/{id}/approve',
    summary: "Approve Request",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Approval Workflows",
  },
  {
    method: 'POST',
    path: '/approval-requests/{id}/reject',
    summary: "Reject Request",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Approval Workflows",
  },
  {
    method: 'POST',
    path: '/approval-requests/{id}/withdraw',
    summary: "Withdraw approval request",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Approval Workflows",
  },
  {
    method: 'GET',
    path: '/approval-workflows',
    summary: "Get All Approval Workflows",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Approval Workflows",
  },
  {
    method: 'POST',
    path: '/approval-workflows',
    summary: "Create Approval Workflow",
    description: "Requires role: Admin",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Approval Workflows",
  },
  {
    method: 'GET',
    path: '/approval-workflows/{id}',
    summary: "Get Approval Workflow By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Approval Workflows",
  },
  {
    method: 'PUT',
    path: '/approval-workflows/{id}',
    summary: "Update Approval Workflow",
    description: "Requires role: Admin",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Approval Workflows",
  },
  {
    method: 'DELETE',
    path: '/approval-workflows/{id}',
    summary: "Delete Approval Workflow",
    description: "Requires role: Admin",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Approval Workflows",
  },
];

// Assessments endpoints
export const assessmentEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/assessments',
    summary: "Get All Assessments",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Assessments",
  },
  {
    method: 'GET',
    path: '/assessments/getAnswers/{id}',
    summary: "Get Answers",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Assessments",
  },
  {
    method: 'GET',
    path: '/assessments/project/byid/{id}',
    summary: "Get Assessment By Project Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Assessments",
  },
  {
    method: 'GET',
    path: '/assessments/{id}',
    summary: "Get Assessment By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Assessments",
  },
  {
    method: 'GET',
    path: '/questions',
    summary: "Get All Questions",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Assessments",
  },
  {
    method: 'GET',
    path: '/questions/bysubtopic/{id}',
    summary: "Get Questions By Subtopic Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Assessments",
  },
  {
    method: 'GET',
    path: '/questions/bytopic/{id}',
    summary: "Get Questions By Topic Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Assessments",
  },
  {
    method: 'GET',
    path: '/questions/{id}',
    summary: "Get Question By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Assessments",
  },
];

// Audit endpoints
export const auditEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/audit-ledger',
    summary: "Get Audit Ledger",
    description: "Requires role: Admin or SuperAdmin",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Audit",
  },
  {
    method: 'GET',
    path: '/audit-ledger/verify',
    summary: "Verify Audit Ledger",
    description: "Requires role: Admin",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Audit",
  },
];

// Authentication endpoints
export const authenticationEndpoints: Endpoint[] = [
  {
    method: 'POST',
    path: '/users/login',
    summary: "Authenticate user",
    description: "Validates email/password credentials via bcrypt. Returns a JWT access token in the response body and sets a refresh token in an HTTP-only cookie. Rate-limited to 5 requests per minute per IP.",
    requiresAuth: false,
    requestBody: {
      "email": "string (required)",
      "password": "string (required)",
    },
    responses: [
      { status: 202, description: "Authentication successful" },
      { status: 401, description: "Invalid email or password" },
      { status: 429, description: "Too many login attempts" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Authentication",
  },
  {
    method: 'POST',
    path: '/users/refresh-token',
    summary: "Refresh access token",
    description: "Reads the refresh_token from an HTTP-only cookie and issues a new JWT access token if the refresh token is still valid.",
    requiresAuth: false,
    responses: [
      { status: 200, description: "New access token issued" },
      { status: 400, description: "Refresh token missing from cookie" },
      { status: 401, description: "Invalid refresh token" },
      { status: 406, description: "Refresh token expired" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Authentication",
  },
];

// Automations endpoints
export const automationEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/automations',
    summary: "Get All Automations",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Automations",
  },
  {
    method: 'POST',
    path: '/automations',
    summary: "Create Automation",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Automations",
  },
  {
    method: 'GET',
    path: '/automations/actions/by-triggerId/{triggerId}',
    summary: "Get All Automation Actions By Trigger Id",
    requiresAuth: true,
    parameters: [
      { name: 'triggerId', in: 'path', type: 'integer', required: true, description: "The triggerId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Automations",
  },
  {
    method: 'GET',
    path: '/automations/triggers',
    summary: "Get All Automation Triggers",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Automations",
  },
  {
    method: 'GET',
    path: '/automations/{id}',
    summary: "Get Automation By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Automations",
  },
  {
    method: 'PUT',
    path: '/automations/{id}',
    summary: "Update Automation",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Automations",
  },
  {
    method: 'DELETE',
    path: '/automations/{id}',
    summary: "Delete Automation By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Automations",
  },
  {
    method: 'GET',
    path: '/automations/{id}/history',
    summary: "Get Automation History",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Automations",
  },
  {
    method: 'GET',
    path: '/automations/{id}/stats',
    summary: "Get Automation Stats",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Automations",
  },
];

// CE Marking endpoints
export const ceMarkingEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/ce-marking/{projectId}',
    summary: "Get C E Marking",
    requiresAuth: true,
    parameters: [
      { name: 'projectId', in: 'path', type: 'integer', required: true, description: "The projectId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "CE Marking",
  },
  {
    method: 'PUT',
    path: '/ce-marking/{projectId}',
    summary: "Update C E Marking",
    requiresAuth: true,
    parameters: [
      { name: 'projectId', in: 'path', type: 'integer', required: true, description: "The projectId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "CE Marking",
  },
];

// Change History endpoints
export const changeHistoryEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/dataset-change-history/{id}',
    summary: "Get Dataset Change History By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Change History",
  },
  {
    method: 'GET',
    path: '/file-change-history/{id}',
    summary: "Get File Change History By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Change History",
  },
  {
    method: 'GET',
    path: '/incident-change-history/{incidentId}',
    summary: "Get Incident History",
    requiresAuth: true,
    parameters: [
      { name: 'incidentId', in: 'path', type: 'integer', required: true, description: "The incidentId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Change History",
  },
  {
    method: 'GET',
    path: '/model-risk-change-history/{id}',
    summary: "Get Model Risk Change History By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Change History",
  },
  {
    method: 'GET',
    path: '/model-inventory-change-history/{id}',
    summary: "Get Model Inventory Change History By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Change History",
  },
  {
    method: 'GET',
    path: '/policy-change-history/{id}',
    summary: "Get Policy Change History By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Change History",
  },
  {
    method: 'GET',
    path: '/risk-change-history/{projectRiskId}',
    summary: "Get Project Risk Change History By Risk Id",
    requiresAuth: true,
    parameters: [
      { name: 'projectRiskId', in: 'path', type: 'integer', required: true, description: "The projectRiskId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Change History",
  },
  {
    method: 'GET',
    path: '/task-change-history/{id}',
    summary: "Get Task Change History By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Change History",
  },
  {
    method: 'GET',
    path: '/training-change-history/{id}',
    summary: "Get Training Change History By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Change History",
  },
  {
    method: 'GET',
    path: '/use-case-change-history/{useCaseId}',
    summary: "Get Use Case History",
    requiresAuth: true,
    parameters: [
      { name: 'useCaseId', in: 'path', type: 'integer', required: true, description: "The useCaseId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Change History",
  },
  {
    method: 'GET',
    path: '/vendor-change-history/{id}',
    summary: "Get Vendor Change History By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Change History",
  },
  {
    method: 'GET',
    path: '/vendor-risk-change-history/{id}',
    summary: "Get Vendor Risk Change History By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Change History",
  },
];

// Compliance endpoints
export const complianceEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/compliance/details/{organizationId}',
    summary: "Get Compliance Details",
    requiresAuth: true,
    parameters: [
      { name: 'organizationId', in: 'path', type: 'integer', required: true, description: "The organizationId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Compliance",
  },
  {
    method: 'GET',
    path: '/compliance/score',
    summary: "Get Compliance Score",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Compliance",
  },
  {
    method: 'GET',
    path: '/compliance/score/{organizationId}',
    summary: "Get Compliance Score By Organization",
    requiresAuth: true,
    parameters: [
      { name: 'organizationId', in: 'path', type: 'integer', required: true, description: "The organizationId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Compliance",
  },
];

// Dashboard endpoints
export const dashboardEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/dashboard',
    summary: "Get Dashboard Data",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Dashboard",
  },
];

// Datasets endpoints
export const datasetEndpoints: Endpoint[] = [
  {
    method: 'POST',
    path: '/dataset-bulk-upload/upload',
    summary: "Handle Multer Error",
    description: "Requires role: Admin or Editor",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Datasets",
  },
  {
    method: 'GET',
    path: '/datasets',
    summary: "Get All Datasets",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Datasets",
  },
  {
    method: 'POST',
    path: '/datasets',
    summary: "Create New Dataset",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Datasets",
  },
  {
    method: 'GET',
    path: '/datasets/by-model/{modelId}',
    summary: "Get Datasets By Model Id",
    requiresAuth: true,
    parameters: [
      { name: 'modelId', in: 'path', type: 'integer', required: true, description: "The modelId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Datasets",
  },
  {
    method: 'GET',
    path: '/datasets/by-project/{projectId}',
    summary: "Get Datasets By Project Id",
    requiresAuth: true,
    parameters: [
      { name: 'projectId', in: 'path', type: 'integer', required: true, description: "The projectId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Datasets",
  },
  {
    method: 'GET',
    path: '/datasets/{id}',
    summary: "Get Dataset By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Datasets",
  },
  {
    method: 'PATCH',
    path: '/datasets/{id}',
    summary: "Update Dataset By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Datasets",
  },
  {
    method: 'DELETE',
    path: '/datasets/{id}',
    summary: "Delete Dataset By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Datasets",
  },
  {
    method: 'GET',
    path: '/datasets/{id}/history',
    summary: "Get Dataset History",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Datasets",
  },
];

// Demo Data endpoints
export const demoDataEndpoints: Endpoint[] = [
  {
    method: 'POST',
    path: '/autoDrivers',
    summary: "Post Auto Driver",
    description: "Requires role: Admin",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Demo Data",
  },
  {
    method: 'DELETE',
    path: '/autoDrivers',
    summary: "Delete Auto Driver",
    description: "Requires role: Admin",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Demo Data",
  },
];

// Mail endpoints
export const emailEndpoints: Endpoint[] = [
  {
    method: 'POST',
    path: '/mail/invite',
    summary: "Invite Limiter",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Mail",
  },
  {
    method: 'POST',
    path: '/mail/reset-password',
    summary: "Email",
    requiresAuth: false,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Mail",
  },
];

// Entity Graph endpoints
export const entityGraphEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/entity-graph/annotations',
    summary: "Get Annotations",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Entity Graph",
  },
  {
    method: 'POST',
    path: '/entity-graph/annotations',
    summary: "Save Annotation",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Entity Graph",
  },
  {
    method: 'DELETE',
    path: '/entity-graph/annotations/entity/{entityType}/{entityId}',
    summary: "Delete Annotation By Entity",
    requiresAuth: true,
    parameters: [
      { name: 'entityType', in: 'path', type: 'string', required: true, description: "The entityType" },
      { name: 'entityId', in: 'path', type: 'integer', required: true, description: "The entityId" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Entity Graph",
  },
  {
    method: 'GET',
    path: '/entity-graph/annotations/{entityType}/{entityId}',
    summary: "Get Annotation By Entity",
    requiresAuth: true,
    parameters: [
      { name: 'entityType', in: 'path', type: 'string', required: true, description: "The entityType" },
      { name: 'entityId', in: 'path', type: 'integer', required: true, description: "The entityId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Entity Graph",
  },
  {
    method: 'DELETE',
    path: '/entity-graph/annotations/{id}',
    summary: "Delete Annotation",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Entity Graph",
  },
  {
    method: 'GET',
    path: '/entity-graph/gap-rules',
    summary: "Get Gap Rules",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Entity Graph",
  },
  {
    method: 'POST',
    path: '/entity-graph/gap-rules',
    summary: "Save Gap Rules",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Entity Graph",
  },
  {
    method: 'DELETE',
    path: '/entity-graph/gap-rules',
    summary: "Reset Gap Rules",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Entity Graph",
  },
  {
    method: 'GET',
    path: '/entity-graph/gap-rules/defaults',
    summary: "Get Default Gap Rules",
    requiresAuth: false,
    responses: [
      { status: 200, description: "Success" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Entity Graph",
  },
  {
    method: 'GET',
    path: '/entity-graph/views',
    summary: "Get Views",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Entity Graph",
  },
  {
    method: 'POST',
    path: '/entity-graph/views',
    summary: "Create View",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Entity Graph",
  },
  {
    method: 'GET',
    path: '/entity-graph/views/{id}',
    summary: "Get View By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Entity Graph",
  },
  {
    method: 'PUT',
    path: '/entity-graph/views/{id}',
    summary: "Update View",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Entity Graph",
  },
  {
    method: 'DELETE',
    path: '/entity-graph/views/{id}',
    summary: "Delete View",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Entity Graph",
  },
];

// EU AI Act endpoints
export const euAiActEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/eu-ai-act/all/assessments/progress',
    summary: "Get All Projects Assessment Progress",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
  {
    method: 'GET',
    path: '/eu-ai-act/all/compliances/progress',
    summary: "Get All Projects Compliance Progress",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
  {
    method: 'GET',
    path: '/eu-ai-act/assessments/byProjectId/{id}',
    summary: "Get Assessments By Project Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
  {
    method: 'DELETE',
    path: '/eu-ai-act/assessments/byProjectId/{id}',
    summary: "Delete Assessments By Project Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
  {
    method: 'GET',
    path: '/eu-ai-act/assessments/progress/{id}',
    summary: "Get Project Assessment Progress",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
  {
    method: 'GET',
    path: '/eu-ai-act/compliances/byProjectId/{id}',
    summary: "Get Compliances By Project Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
  {
    method: 'DELETE',
    path: '/eu-ai-act/compliances/byProjectId/{id}',
    summary: "Delete Compliances By Project Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
  {
    method: 'GET',
    path: '/eu-ai-act/compliances/progress/{id}',
    summary: "Get Project Compliance Progress",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
  {
    method: 'GET',
    path: '/eu-ai-act/controlById',
    summary: "Get Control By Id",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
  {
    method: 'GET',
    path: '/eu-ai-act/controlCategories',
    summary: "Get All Control Categories",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
  {
    method: 'GET',
    path: '/eu-ai-act/controls/byControlCategoryId/{id}',
    summary: "Get Controls By Control Category Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
  {
    method: 'PATCH',
    path: '/eu-ai-act/saveAnswer/{id}',
    summary: "Update Question By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
  {
    method: 'PATCH',
    path: '/eu-ai-act/saveControls/{id}',
    summary: "Save Controls",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
  {
    method: 'GET',
    path: '/eu-ai-act/topicById',
    summary: "Get Topic By Id",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
  {
    method: 'GET',
    path: '/eu-ai-act/topics',
    summary: "Get All Topics",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "EU AI Act",
  },
];

// Evidence endpoints
export const evidenceHubEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/evidenceHub',
    summary: "Get All Evidences",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Evidence",
  },
  {
    method: 'POST',
    path: '/evidenceHub',
    summary: "Create New Evidence",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Evidence",
  },
  {
    method: 'GET',
    path: '/evidenceHub/{id}',
    summary: "Get Evidence By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Evidence",
  },
  {
    method: 'PATCH',
    path: '/evidenceHub/{id}',
    summary: "Update Evidence By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Evidence",
  },
  {
    method: 'DELETE',
    path: '/evidenceHub/{id}',
    summary: "Delete Evidence By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Evidence",
  },
];

// Files endpoints
export const fileEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/file-manager',
    summary: "List Files",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'POST',
    path: '/file-manager',
    summary: "Upload File",
    description: "Requires role: Admin or Reviewer or Editor",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/file-manager/highlighted',
    summary: "Get Highlighted",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/file-manager/search',
    summary: "Search Files",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/file-manager/with-metadata',
    summary: "List Files With Metadata",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/file-manager/{id}',
    summary: "Download File",
    description: "Requires role: Admin",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'DELETE',
    path: '/file-manager/{id}',
    summary: "Remove File",
    description: "Requires role: Admin or Reviewer or Editor",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/file-manager/{id}/metadata',
    summary: "Get File Metadata",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'PATCH',
    path: '/file-manager/{id}/metadata',
    summary: "Update Metadata",
    description: "Requires role: Admin or Reviewer or Editor",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/file-manager/{id}/preview',
    summary: "Preview File",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/file-manager/{id}/versions',
    summary: "Get File Version History",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/files',
    summary: "Get User Files Meta Data",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'POST',
    path: '/files',
    summary: "Post File Content",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'POST',
    path: '/files/attach',
    summary: "Attach File To Entity",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'POST',
    path: '/files/attach-bulk',
    summary: "Attach Files To Entity",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/files/by-projid/{id}',
    summary: "Get File Meta By Project Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'DELETE',
    path: '/files/detach',
    summary: "Detach File From Entity",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/files/entity/{framework_type}/{entity_type}/{entity_id}',
    summary: "Get Entity Files",
    requiresAuth: true,
    parameters: [
      { name: 'framework_type', in: 'path', type: 'string', required: true, description: "The framework_type" },
      { name: 'entity_type', in: 'path', type: 'string', required: true, description: "The entity_type" },
      { name: 'entity_id', in: 'path', type: 'integer', required: true, description: "The entity_id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/files/tree',
    summary: "Get Folder Tree",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/files/uncategorized',
    summary: "Get Uncategorized Files",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/files/{id}',
    summary: "Get File Content By Id",
    description: "Requires role: Admin",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'PATCH',
    path: '/files/{id}',
    summary: "Update Folder",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'DELETE',
    path: '/files/{id}',
    summary: "Delete Folder",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/files/{id}/files',
    summary: "Get Files In Folder",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'POST',
    path: '/files/{id}/files',
    summary: "Assign Files To Folder",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'DELETE',
    path: '/files/{id}/files/{fileId}',
    summary: "Remove File From Folder",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
      { name: 'fileId', in: 'path', type: 'integer', required: true, description: "The fileId" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/files/{id}/path',
    summary: "Get Folder Path",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/virtual-folders',
    summary: "Get All Folders",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'POST',
    path: '/virtual-folders',
    summary: "Create Folder",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/virtual-folders/tree',
    summary: "Get Folder Tree",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/virtual-folders/uncategorized',
    summary: "Get Uncategorized Files",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/virtual-folders/{id}',
    summary: "Get Folder By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'PATCH',
    path: '/virtual-folders/{id}',
    summary: "Update Folder",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'DELETE',
    path: '/virtual-folders/{id}',
    summary: "Delete Folder",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/virtual-folders/{id}/files',
    summary: "Get Files In Folder",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'POST',
    path: '/virtual-folders/{id}/files',
    summary: "Assign Files To Folder",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'DELETE',
    path: '/virtual-folders/{id}/files/{fileId}',
    summary: "Remove File From Folder",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
      { name: 'fileId', in: 'path', type: 'integer', required: true, description: "The fileId" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
  {
    method: 'GET',
    path: '/virtual-folders/{id}/path',
    summary: "Get Folder Path",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Files",
  },
];

// Frameworks endpoints
export const frameworkEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/frameworks',
    summary: "Get All Frameworks",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Frameworks",
  },
  {
    method: 'DELETE',
    path: '/frameworks/fromProject',
    summary: "Delete Framework From Project",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Frameworks",
  },
  {
    method: 'POST',
    path: '/frameworks/toProject',
    summary: "Add Framework To Project",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Frameworks",
  },
  {
    method: 'GET',
    path: '/frameworks/{id}',
    summary: "Get Framework By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Frameworks",
  },
];

// FRIA endpoints
export const friaEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/fria/{friaId}/evidence',
    summary: "Get Fria Evidence",
    requiresAuth: true,
    parameters: [
      { name: 'friaId', in: 'path', type: 'integer', required: true, description: "The friaId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'POST',
    path: '/fria/{friaId}/evidence',
    summary: "Link Fria Evidence",
    description: "Requires role: Admin or Editor",
    requiresAuth: true,
    parameters: [
      { name: 'friaId', in: 'path', type: 'integer', required: true, description: "The friaId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'DELETE',
    path: '/fria/{friaId}/evidence/{linkId}',
    summary: "Unlink Fria Evidence",
    description: "Requires role: Admin or Editor",
    requiresAuth: true,
    parameters: [
      { name: 'friaId', in: 'path', type: 'integer', required: true, description: "The friaId" },
      { name: 'linkId', in: 'path', type: 'integer', required: true, description: "The linkId" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'GET',
    path: '/fria/{friaId}/models',
    summary: "Get Model Links",
    requiresAuth: true,
    parameters: [
      { name: 'friaId', in: 'path', type: 'integer', required: true, description: "The friaId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'POST',
    path: '/fria/{friaId}/models/{modelId}',
    summary: "Link Model",
    description: "Requires role: Admin or Editor",
    requiresAuth: true,
    parameters: [
      { name: 'friaId', in: 'path', type: 'integer', required: true, description: "The friaId" },
      { name: 'modelId', in: 'path', type: 'integer', required: true, description: "The modelId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'DELETE',
    path: '/fria/{friaId}/models/{modelId}',
    summary: "Unlink Model",
    description: "Requires role: Admin or Editor",
    requiresAuth: true,
    parameters: [
      { name: 'friaId', in: 'path', type: 'integer', required: true, description: "The friaId" },
      { name: 'modelId', in: 'path', type: 'integer', required: true, description: "The modelId" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'PUT',
    path: '/fria/{friaId}/rights',
    summary: "Update Fria Rights",
    description: "Requires role: Admin or Editor",
    requiresAuth: true,
    parameters: [
      { name: 'friaId', in: 'path', type: 'integer', required: true, description: "The friaId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'GET',
    path: '/fria/{friaId}/risk-items',
    summary: "Get Risk Items",
    requiresAuth: true,
    parameters: [
      { name: 'friaId', in: 'path', type: 'integer', required: true, description: "The friaId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'POST',
    path: '/fria/{friaId}/risk-items',
    summary: "Add Risk Item",
    description: "Requires role: Admin or Editor",
    requiresAuth: true,
    parameters: [
      { name: 'friaId', in: 'path', type: 'integer', required: true, description: "The friaId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'PATCH',
    path: '/fria/{friaId}/risk-items/{itemId}',
    summary: "Update Risk Item",
    description: "Requires role: Admin or Editor",
    requiresAuth: true,
    parameters: [
      { name: 'friaId', in: 'path', type: 'integer', required: true, description: "The friaId" },
      { name: 'itemId', in: 'path', type: 'integer', required: true, description: "The itemId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'DELETE',
    path: '/fria/{friaId}/risk-items/{itemId}',
    summary: "Delete Risk Item",
    description: "Requires role: Admin or Editor",
    requiresAuth: true,
    parameters: [
      { name: 'friaId', in: 'path', type: 'integer', required: true, description: "The friaId" },
      { name: 'itemId', in: 'path', type: 'integer', required: true, description: "The itemId" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'POST',
    path: '/fria/{friaId}/submit',
    summary: "Submit Fria",
    description: "Requires role: Admin or Editor",
    requiresAuth: true,
    parameters: [
      { name: 'friaId', in: 'path', type: 'integer', required: true, description: "The friaId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'GET',
    path: '/fria/{friaId}/versions',
    summary: "Get Versions",
    requiresAuth: true,
    parameters: [
      { name: 'friaId', in: 'path', type: 'integer', required: true, description: "The friaId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'GET',
    path: '/fria/{friaId}/versions/{version}',
    summary: "Get Version",
    requiresAuth: true,
    parameters: [
      { name: 'friaId', in: 'path', type: 'integer', required: true, description: "The friaId" },
      { name: 'version', in: 'path', type: 'integer', required: true, description: "The version" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'GET',
    path: '/fria/{projectId}',
    summary: "Get Fria",
    requiresAuth: true,
    parameters: [
      { name: 'projectId', in: 'path', type: 'integer', required: true, description: "The projectId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
  {
    method: 'PUT',
    path: '/fria/{projectId}',
    summary: "Update Fria",
    description: "Requires role: Admin or Editor",
    requiresAuth: true,
    parameters: [
      { name: 'projectId', in: 'path', type: 'integer', required: true, description: "The projectId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "FRIA",
  },
];

// Intake Forms endpoints
export const intakeFormEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/intake/forms',
    summary: "Get All Intake Forms",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'POST',
    path: '/intake/forms',
    summary: "Create Intake Form",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'POST',
    path: '/intake/forms/field-guidance',
    summary: "Get Field Guidance",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'POST',
    path: '/intake/forms/suggested-questions',
    summary: "Get L L M Suggested Questions",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'GET',
    path: '/intake/forms/{id}',
    summary: "Get Intake Form By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'PATCH',
    path: '/intake/forms/{id}',
    summary: "Update Intake Form",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'DELETE',
    path: '/intake/forms/{id}',
    summary: "Delete Intake Form",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'POST',
    path: '/intake/forms/{id}/archive',
    summary: "Archive Intake Form",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'GET',
    path: '/intake/forms/{id}/preview',
    summary: "Preview Form",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'GET',
    path: '/intake/forms/{id}/submissions',
    summary: "Get Form Submissions",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'GET',
    path: '/intake/public/by-id/{publicId}',
    summary: "Get Public Form By Public Id",
    requiresAuth: false,
    parameters: [
      { name: 'publicId', in: 'path', type: 'integer', required: true, description: "The publicId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'POST',
    path: '/intake/public/by-id/{publicId}',
    summary: "Submit Public Form By Public Id",
    requiresAuth: false,
    parameters: [
      { name: 'publicId', in: 'path', type: 'integer', required: true, description: "The publicId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'GET',
    path: '/intake/public/captcha',
    summary: "Get Captcha",
    requiresAuth: false,
    responses: [
      { status: 200, description: "Success" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'GET',
    path: '/intake/public/{tenantSlug}/{formSlug}',
    summary: "Get Public Form",
    requiresAuth: false,
    parameters: [
      { name: 'tenantSlug', in: 'path', type: 'string', required: true, description: "The tenantSlug" },
      { name: 'formSlug', in: 'path', type: 'string', required: true, description: "The formSlug" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'POST',
    path: '/intake/public/{tenantSlug}/{formSlug}',
    summary: "Submit Public Form",
    requiresAuth: false,
    parameters: [
      { name: 'tenantSlug', in: 'path', type: 'string', required: true, description: "The tenantSlug" },
      { name: 'formSlug', in: 'path', type: 'string', required: true, description: "The formSlug" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'GET',
    path: '/intake/submissions',
    summary: "Get Pending Submissions",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'GET',
    path: '/intake/submissions/by-entity/{entityType}/{entityId}',
    summary: "Get Submission By Entity",
    requiresAuth: true,
    parameters: [
      { name: 'entityType', in: 'path', type: 'string', required: true, description: "The entityType" },
      { name: 'entityId', in: 'path', type: 'integer', required: true, description: "The entityId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'GET',
    path: '/intake/submissions/stats',
    summary: "Get Submission Stats",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'GET',
    path: '/intake/submissions/{id}',
    summary: "Get Submission By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'POST',
    path: '/intake/submissions/{id}/approve',
    summary: "Approve Submission",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'GET',
    path: '/intake/submissions/{id}/preview',
    summary: "Get Submission Preview",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'POST',
    path: '/intake/submissions/{id}/reject',
    summary: "Reject Submission",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
  {
    method: 'PATCH',
    path: '/intake/submissions/{id}/risk-override',
    summary: "Override Submission Risk",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Intake Forms",
  },
];

// Integrations endpoints
export const integrationEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/integrations/github/token',
    summary: "Get Git Hub Token Status Controller",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Integrations",
  },
  {
    method: 'POST',
    path: '/integrations/github/token',
    summary: "Save Git Hub Token Controller",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Integrations",
  },
  {
    method: 'DELETE',
    path: '/integrations/github/token',
    summary: "Delete Git Hub Token Controller",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Integrations",
  },
  {
    method: 'POST',
    path: '/integrations/github/token/test',
    summary: "Test Git Hub Token Controller",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Integrations",
  },
];

// Internal endpoints
export const internalEndpoints: Endpoint[] = [
  {
    method: 'POST',
    path: '/internal/ai-gateway/notify',
    summary: "AI Gateway notification callback",
    requiresAuth: false,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Internal",
  },
];

// Invitations endpoints
export const invitationEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/invitations',
    summary: "Get Invitations",
    description: "Requires role: Admin or SuperAdmin",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Invitations",
  },
  {
    method: 'DELETE',
    path: '/invitations/{id}',
    summary: "Revoke Invitation",
    description: "Requires role: Admin or SuperAdmin",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Invitations",
  },
  {
    method: 'POST',
    path: '/invitations/{id}/resend',
    summary: "Resend Invitation",
    description: "Requires role: Admin or SuperAdmin",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Invitations",
  },
];

// ISO 27001 endpoints
export const iso27001Endpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/iso-27001/all/annexes/progress',
    summary: "Get All Projects Annxes Progress",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/all/clauses/progress',
    summary: "Get All Projects Clauses Progress",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/annexControl/byId/{id}',
    summary: "Get Annex Control By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/annexControls/byAnnexId/{id}',
    summary: "Get Annex Controls By Annex Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/annexes',
    summary: "Get All Annexes",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/annexes/assignments/{id}',
    summary: "Get Project Annexes Assignments",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/annexes/byProjectId/{id}',
    summary: "Get Annexes By Project Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'DELETE',
    path: '/iso-27001/annexes/byProjectId/{id}',
    summary: "Delete Reference Controls",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/annexes/progress/{id}',
    summary: "Get Project Annxes Progress",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/annexes/struct/byProjectId/{id}',
    summary: "Get All Annexes Struct For Project",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/clauses',
    summary: "Get All Clauses",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/clauses/assignments/{id}',
    summary: "Get Project Clauses Assignments",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/clauses/byProjectId/{id}',
    summary: "Get Clauses By Project Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'DELETE',
    path: '/iso-27001/clauses/byProjectId/{id}',
    summary: "Delete Management System Clauses",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/clauses/progress/{id}',
    summary: "Get Project Clauses Progress",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/clauses/struct/byProjectId/{id}',
    summary: "Get All Clauses Struct For Project",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'PATCH',
    path: '/iso-27001/saveAnnexes/{id}',
    summary: "Save Annexes",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'PATCH',
    path: '/iso-27001/saveClauses/{id}',
    summary: "Save Clauses",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/subClause/byId/{id}',
    summary: "Get Sub Clause By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
  {
    method: 'GET',
    path: '/iso-27001/subClauses/byClauseId/{id}',
    summary: "Get Sub Clauses By Clause Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 27001",
  },
];

// ISO 42001 endpoints
export const iso42001Endpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/iso-42001/all/annexes/progress',
    summary: "Get All Projects Annxes Progress",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/all/clauses/progress',
    summary: "Get All Projects Clauses Progress",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/annexCategories/byAnnexId/{id}',
    summary: "Get Annex Categories By Annex Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/annexCategories/{id}/risks',
    summary: "Get Annex Category Risks",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/annexCategory/byId/{id}',
    summary: "Get Annex Category By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/annexes',
    summary: "Get All Annexes",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/annexes/assignments/{id}',
    summary: "Get Project Annexes Assignments",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/annexes/byProjectId/{id}',
    summary: "Get Annexes By Project Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'DELETE',
    path: '/iso-42001/annexes/byProjectId/{id}',
    summary: "Delete Reference Controls",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/annexes/progress/{id}',
    summary: "Get Project Annxes Progress",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/annexes/struct/byProjectId/{id}',
    summary: "Get All Annexes Struct For Project",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/clauses',
    summary: "Get All Clauses",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/clauses/assignments/{id}',
    summary: "Get Project Clauses Assignments",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/clauses/byProjectId/{id}',
    summary: "Get Clauses By Project Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'DELETE',
    path: '/iso-42001/clauses/byProjectId/{id}',
    summary: "Delete Management System Clauses",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/clauses/progress/{id}',
    summary: "Get Project Clauses Progress",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/clauses/struct/byProjectId/{id}',
    summary: "Get All Clauses Struct For Project",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'PATCH',
    path: '/iso-42001/saveAnnexes/{id}',
    summary: "Save Annexes",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'PATCH',
    path: '/iso-42001/saveClauses/{id}',
    summary: "Save Clauses",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/subClause/byId/{id}',
    summary: "Get Sub Clause By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/subClauses/byClauseId/{id}',
    summary: "Get Sub Clauses By Clause Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
  {
    method: 'GET',
    path: '/iso-42001/subclauses/{id}/risks',
    summary: "Get Sub Clause Risks",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "ISO 42001",
  },
];

// LLM Keys endpoints
export const llmKeyEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/evaluation-llm-keys',
    summary: "Get All Evaluation LLM Keys",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "LLM Keys",
  },
  {
    method: 'POST',
    path: '/evaluation-llm-keys',
    summary: "Add Evaluation LLM Key",
    description: "Requires role: Admin",
    requiresAuth: true,
    requestBody: {
      "provider": "openai | anthropic | google | xai | mistral | huggingface (required)",
      "apiKey": "string (required)",
    },
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "LLM Keys",
  },
  {
    method: 'POST',
    path: '/evaluation-llm-keys/verify',
    summary: "Verify Evaluation LLM Key",
    description: "Requires role: Admin",
    requiresAuth: true,
    requestBody: {
      "provider": "openai | anthropic | google | xai | mistral | huggingface | openrouter (required)",
      "apiKey": "string (required)",
    },
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "LLM Keys",
  },
  {
    method: 'DELETE',
    path: '/evaluation-llm-keys/{provider}',
    summary: "Delete Evaluation LLM Key",
    description: "Requires role: Admin",
    requiresAuth: true,
    parameters: [
      { name: 'provider', in: 'path', type: 'string', required: true, description: "The provider" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "LLM Keys",
  },
  {
    method: 'GET',
    path: '/llm-keys',
    summary: "Get L L M Keys",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "LLM Keys",
  },
  {
    method: 'POST',
    path: '/llm-keys',
    summary: "Create L L M Key",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "LLM Keys",
  },
  {
    method: 'GET',
    path: '/llm-keys/status',
    summary: "Get L L M Key Status",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "LLM Keys",
  },
  {
    method: 'PATCH',
    path: '/llm-keys/{id}',
    summary: "Update L L M Key",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "LLM Keys",
  },
  {
    method: 'DELETE',
    path: '/llm-keys/{id}',
    summary: "Delete L L M Key",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "LLM Keys",
  },
  {
    method: 'GET',
    path: '/llm-keys/{name}',
    summary: "Get L L M Key",
    requiresAuth: true,
    parameters: [
      { name: 'name', in: 'path', type: 'string', required: true, description: "The name" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "LLM Keys",
  },
];

// Model Inventory endpoints
export const modelInventoryEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/modelInventory',
    summary: "Get all model inventories",
    description: "Returns every model inventory record belonging to the caller's organization, ordered by created_at DESC, id ASC. Each record includes its associated project and framework IDs.",
    requiresAuth: true,
    responses: [
      { status: 200, description: "List of model inventories (may be empty)" },
      { status: 401, description: "Missing or invalid JWT" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Inventory",
  },
  {
    method: 'POST',
    path: '/modelInventory',
    summary: "Create a new model inventory",
    description: "Creates a model inventory record, links it to the supplied project and framework IDs, records a change-history entry, fires any \"model_added\" automations, and notifies the approver (if set).",
    requiresAuth: true,
    requestBody: {
      "(schema)": "ModelInventoryCreateRequest",
    },
    responses: [
      { status: 201, description: "Model inventory created" },
      { status: 401, description: "Missing or invalid JWT" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Inventory",
  },
  {
    method: 'GET',
    path: '/modelInventory/evaluations',
    summary: "Get All Model Evaluations",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Inventory",
  },
  {
    method: 'GET',
    path: '/modelInventory/{id}/evaluations',
    summary: "Get Model Evaluations",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Inventory",
  },
  {
    method: 'GET',
    path: '/modelInventory/by-frameworkId/{frameworkId}',
    summary: "Get model inventories by framework ID",
    description: "Returns all model inventories associated with a framework (via the model_inventories_projects_frameworks join table where framework_id matches).",
    requiresAuth: true,
    parameters: [
      { name: 'frameworkId', in: 'path', type: 'integer', required: true, description: "Framework ID" },
    ],
    responses: [
      { status: 200, description: "List of model inventories for the framework (may be empty)" },
      { status: 401, description: "Missing or invalid JWT" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Inventory",
  },
  {
    method: 'GET',
    path: '/modelInventory/by-projectId/{projectId}',
    summary: "Get model inventories by project ID",
    description: "Returns all model inventories associated with a project (via the model_inventories_projects_frameworks join table where framework_id IS NULL). Non-numeric project IDs (e.g. plugin-sourced) return an empty array.",
    requiresAuth: true,
    parameters: [
      { name: 'projectId', in: 'path', type: 'integer', required: true, description: "Project ID (integer). Non-numeric values return an empty array." },
    ],
    responses: [
      { status: 200, description: "List of model inventories for the project (may be empty)" },
      { status: 401, description: "Missing or invalid JWT" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Inventory",
  },
  {
    method: 'GET',
    path: '/modelInventory/{id}',
    summary: "Get a model inventory by ID",
    description: "Returns a single model inventory record with its associated project and framework IDs. Returns 204 if the record does not exist.",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "Model inventory ID" },
    ],
    responses: [
      { status: 200, description: "Model inventory found" },
      { status: 204, description: "No model inventory found for the given ID" },
      { status: 401, description: "Missing or invalid JWT" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Inventory",
  },
  {
    method: 'PATCH',
    path: '/modelInventory/{id}',
    summary: "Update a model inventory by ID",
    description: "Partially updates a model inventory record. All body fields are optional; only provided fields are changed. Project and framework associations can be replaced or cleared. Fires \"model_updated\" automations and notifies a new approver if changed.",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "Model inventory ID" },
    ],
    requestBody: {
      "(schema)": "ModelInventoryUpdateRequest",
    },
    responses: [
      { status: 200, description: "Model inventory updated" },
      { status: 401, description: "Missing or invalid JWT" },
      { status: 404, description: "Model inventory not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Inventory",
  },
  {
    method: 'DELETE',
    path: '/modelInventory/{id}',
    summary: "Delete a model inventory by ID",
    description: "Deletes a model inventory record and its project/framework associations. Optionally deletes linked model risks when deleteRisks=true. Records deletion in change history and fires \"model_deleted\" automations.",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "Model inventory ID" },
      { name: 'deleteRisks', in: 'query', type: 'string', required: false, description: "When \"true\", also deletes associated rows from the model_risks table.\n" },
    ],
    responses: [
      { status: 200, description: "Model inventory deleted" },
      { status: 401, description: "Missing or invalid JWT" },
      { status: 404, description: "Model inventory not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Inventory",
  },
  {
    method: 'GET',
    path: '/modelInventoryHistory/current-counts',
    summary: "Get Current Counts",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Inventory",
  },
  {
    method: 'POST',
    path: '/modelInventoryHistory/snapshot',
    summary: "Create Snapshot",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Inventory",
  },
  {
    method: 'GET',
    path: '/modelInventoryHistory/timeseries',
    summary: "Get Timeseries",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Inventory",
  },
];

// Model Risks endpoints
export const modelRiskEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/modelRisks',
    summary: "Get All Model Risks",
    requiresAuth: true,
    parameters: [
      { name: 'filter', in: 'query', type: 'string', required: false, description: "The filter" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Risks",
  },
  {
    method: 'POST',
    path: '/modelRisks',
    summary: "Create New Model Risk",
    requiresAuth: true,
    requestBody: {
      "(schema)": "ModelRiskInput",
    },
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Risks",
  },
  {
    method: 'GET',
    path: '/modelRisks/{id}',
    summary: "Get Model Risk By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Risks",
  },
  {
    method: 'PUT',
    path: '/modelRisks/{id}',
    summary: "Update Model Risk By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    requestBody: {
      "(schema)": "ModelRiskInput",
    },
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Risks",
  },
  {
    method: 'PATCH',
    path: '/modelRisks/{id}',
    summary: "Update Model Risk By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    requestBody: {
      "(schema)": "ModelRiskInput",
    },
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Risks",
  },
  {
    method: 'DELETE',
    path: '/modelRisks/{id}',
    summary: "Delete Model Risk By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Model Risks",
  },
];

// NIST AI RMF endpoints
export const nistAiRmfEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/nist-ai-rmf/assignments',
    summary: "Get N I S T A I R M F Assignments",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "NIST AI RMF",
  },
  {
    method: 'GET',
    path: '/nist-ai-rmf/assignments-by-function',
    summary: "Get N I S T A I R M F Assignments By Function",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "NIST AI RMF",
  },
  {
    method: 'GET',
    path: '/nist-ai-rmf/categories/{title}',
    summary: "Get All N I S T A I R M F Categories Byfunction Id",
    requiresAuth: true,
    parameters: [
      { name: 'title', in: 'path', type: 'string', required: true, description: "The title" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "NIST AI RMF",
  },
  {
    method: 'GET',
    path: '/nist-ai-rmf/functions',
    summary: "Get All N I S T A I R M Ffunctions",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "NIST AI RMF",
  },
  {
    method: 'GET',
    path: '/nist-ai-rmf/functions/{id}',
    summary: "Get N I S T A I R M Ffunction By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "NIST AI RMF",
  },
  {
    method: 'GET',
    path: '/nist-ai-rmf/overview',
    summary: "Get N I S T A I R M F Overview",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "NIST AI RMF",
  },
  {
    method: 'GET',
    path: '/nist-ai-rmf/progress',
    summary: "Get N I S T A I R M F Progress",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "NIST AI RMF",
  },
  {
    method: 'GET',
    path: '/nist-ai-rmf/progress-by-function',
    summary: "Get N I S T A I R M F Progress By Function",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "NIST AI RMF",
  },
  {
    method: 'GET',
    path: '/nist-ai-rmf/status-breakdown',
    summary: "Get N I S T A I R M F Status Breakdown",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "NIST AI RMF",
  },
  {
    method: 'GET',
    path: '/nist-ai-rmf/subcategories/byId/{id}',
    summary: "Get N I S T A I R M F Subcategory By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "NIST AI RMF",
  },
  {
    method: 'GET',
    path: '/nist-ai-rmf/subcategories/{categoryId}/{title}',
    summary: "Get All N I S T A I R M F Subcategories Bycategory Id Andtitle",
    requiresAuth: true,
    parameters: [
      { name: 'categoryId', in: 'path', type: 'integer', required: true, description: "The categoryId" },
      { name: 'title', in: 'path', type: 'string', required: true, description: "The title" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "NIST AI RMF",
  },
  {
    method: 'PATCH',
    path: '/nist-ai-rmf/subcategories/{id}',
    summary: "Update N I S T A I R M F Subcategory By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "NIST AI RMF",
  },
  {
    method: 'GET',
    path: '/nist-ai-rmf/subcategories/{id}/risks',
    summary: "Get N I S T A I R M F Subcategory Risks",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "NIST AI RMF",
  },
  {
    method: 'PATCH',
    path: '/nist-ai-rmf/subcategories/{id}/status',
    summary: "Update N I S T A I R M F Subcategory Status",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "NIST AI RMF",
  },
];

// Notes endpoints
export const noteEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/notes',
    summary: "Get Notes",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Notes",
  },
  {
    method: 'POST',
    path: '/notes',
    summary: "Create Note",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Notes",
  },
  {
    method: 'PUT',
    path: '/notes/{id}',
    summary: "Update Note",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Notes",
  },
  {
    method: 'DELETE',
    path: '/notes/{id}',
    summary: "Delete Note",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Notes",
  },
];

// Notifications endpoints
export const notificationEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/notifications',
    summary: "Get Notifications",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Notifications",
  },
  {
    method: 'PATCH',
    path: '/notifications/read-all',
    summary: "Mark All As Read",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Notifications",
  },
  {
    method: 'GET',
    path: '/notifications/stream',
    summary: "Stream Notifications",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Notifications",
  },
  {
    method: 'GET',
    path: '/notifications/summary',
    summary: "Get Notification Summary",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Notifications",
  },
  {
    method: 'GET',
    path: '/notifications/unread-count',
    summary: "Get Unread Count",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Notifications",
  },
  {
    method: 'DELETE',
    path: '/notifications/{id}',
    summary: "Delete Notification",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Notifications",
  },
  {
    method: 'PATCH',
    path: '/notifications/{id}/read',
    summary: "Mark As Read",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Notifications",
  },
];

// Organizations endpoints
export const organizationEndpoints: Endpoint[] = [
  {
    method: 'POST',
    path: '/organizations',
    summary: "Create Organization",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Organizations",
  },
  {
    method: 'GET',
    path: '/organizations/exists',
    summary: "Get Organizations Exists",
    requiresAuth: false,
    responses: [
      { status: 200, description: "Success" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Organizations",
  },
  {
    method: 'GET',
    path: '/organizations/{id}',
    summary: "Get Organization By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Organizations",
  },
  {
    method: 'PATCH',
    path: '/organizations/{id}',
    summary: "Update Organization By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Organizations",
  },
  {
    method: 'PATCH',
    path: '/organizations/{id}/onboarding-status',
    summary: "Update Onboarding Status",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Organizations",
  },
];

// Plugins endpoints
export const pluginEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/plugins/categories',
    summary: "Get Categories",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Plugins",
  },
  {
    method: 'POST',
    path: '/plugins/install',
    summary: "Install Plugin",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Plugins",
  },
  {
    method: 'GET',
    path: '/plugins/installations',
    summary: "Get Installed Plugins",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Plugins",
  },
  {
    method: 'DELETE',
    path: '/plugins/installations/{id}',
    summary: "Uninstall Plugin",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Plugins",
  },
  {
    method: 'PUT',
    path: '/plugins/installations/{id}/configuration',
    summary: "Update Plugin Configuration",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Plugins",
  },
  {
    method: 'GET',
    path: '/plugins/marketplace',
    summary: "Get All Plugins",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Plugins",
  },
  {
    method: 'GET',
    path: '/plugins/marketplace/search',
    summary: "Search Plugins",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Plugins",
  },
  {
    method: 'GET',
    path: '/plugins/marketplace/{key}',
    summary: "Get Plugin By Key",
    requiresAuth: true,
    parameters: [
      { name: 'key', in: 'path', type: 'string', required: true, description: "The key" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Plugins",
  },
  {
    method: 'POST',
    path: '/plugins/{key}/test-connection',
    summary: "Test Plugin Connection",
    requiresAuth: true,
    parameters: [
      { name: 'key', in: 'path', type: 'string', required: true, description: "The key" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Plugins",
  },
  {
    method: 'GET',
    path: '/plugins/{key}/ui/dist/{filename}',
    summary: "Serve plugin UI assets",
    requiresAuth: true,
    parameters: [
      { name: 'key', in: 'path', type: 'string', required: true, description: "The key" },
      { name: 'filename', in: 'path', type: 'string', required: true, description: "The filename" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Plugins",
  },
];

// Policies endpoints
export const policyEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/policies',
    summary: "Get all policies",
    description: "Returns all policies for the authenticated user's organization, including assigned reviewer IDs.",
    requiresAuth: true,
    responses: [
      { status: 200, description: "List of policies retrieved successfully" },
      { status: 500, description: "No description" },
    ],
    tag: "Policies",
  },
  {
    method: 'POST',
    path: '/policies',
    summary: "Create a new policy",
    description: "Creates a new policy. The author_id and last_updated_by are set from the JWT token automatically.",
    requiresAuth: true,
    requestBody: {
      "(schema)": "PolicyCreateRequest",
    },
    responses: [
      { status: 201, description: "Policy created successfully" },
      { status: 500, description: "No description" },
      { status: 503, description: "Service unavailable — policy creation failed" },
    ],
    tag: "Policies",
  },
  {
    method: 'GET',
    path: '/policies/tags',
    summary: "Get available policy tags",
    description: "Returns the static list of allowed policy tags.",
    requiresAuth: true,
    responses: [
      { status: 200, description: "List of available tags" },
      { status: 500, description: "No description" },
    ],
    tag: "Policies",
  },
  {
    method: 'POST',
    path: '/policies/import/docx',
    summary: "Import DOCX and convert to HTML",
    description: "Uploads a .docx file (max 10 MB) and converts it to HTML suitable for the policy content editor. Returns the converted HTML and any conversion warnings.",
    requiresAuth: true,
    requestBody: {
      "file": "string (required)",
    },
    responses: [
      { status: 200, description: "DOCX converted to HTML successfully" },
      { status: 400, description: "Bad request — no file uploaded or invalid file type" },
      { status: 500, description: "No description" },
    ],
    tag: "Policies",
  },
  {
    method: 'GET',
    path: '/policies/{id}',
    summary: "Get policy by ID",
    description: "Returns a single policy by its ID, including assigned reviewer IDs.",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Policy retrieved successfully" },
      { status: 404, description: "No description" },
      { status: 500, description: "No description" },
    ],
    tag: "Policies",
  },
  {
    method: 'PUT',
    path: '/policies/{id}',
    summary: "Update a policy",
    description: "Updates an existing policy. Only provided fields are updated. The last_updated_by and last_updated_at are set automatically from the JWT token. If assigned_reviewer_ids is provided, the reviewer list is fully replaced.",
    requiresAuth: true,
    requestBody: {
      "(schema)": "PolicyUpdateRequest",
    },
    responses: [
      { status: 202, description: "Policy updated successfully" },
      { status: 404, description: "No description" },
      { status: 500, description: "No description" },
    ],
    tag: "Policies",
  },
  {
    method: 'DELETE',
    path: '/policies/{id}',
    summary: "Delete a policy by ID",
    description: "Permanently deletes a policy and its associated reviewer mappings (via CASCADE).",
    requiresAuth: true,
    responses: [
      { status: 202, description: "Policy deleted successfully" },
      { status: 404, description: "No description" },
      { status: 500, description: "No description" },
    ],
    tag: "Policies",
  },
  {
    method: 'GET',
    path: '/policies/{id}/export/pdf',
    summary: "Export policy as PDF",
    description: "Generates and downloads the policy as a PDF file.",
    requiresAuth: true,
    responses: [
      { status: 200, description: "PDF file stream" },
      { status: 400, description: "Invalid policy ID" },
      { status: 404, description: "No description" },
      { status: 500, description: "No description" },
    ],
    tag: "Policies",
  },
  {
    method: 'GET',
    path: '/policies/{id}/export/docx',
    summary: "Export policy as DOCX",
    description: "Generates and downloads the policy as a DOCX file.",
    requiresAuth: true,
    responses: [
      { status: 200, description: "DOCX file stream" },
      { status: 400, description: "Invalid policy ID" },
      { status: 404, description: "No description" },
      { status: 500, description: "No description" },
    ],
    tag: "Policies",
  },
  {
    method: 'POST',
    path: '/policies/{id}/review/request',
    summary: "Request review for a policy",
    description: "Sets the policy review status to pending_review and sends in-app notifications to each specified reviewer.",
    requiresAuth: true,
    requestBody: {
      "reviewer_ids": "array (required)",
      "message": "string (optional)",
    },
    responses: [
      { status: 200, description: "Review requested successfully; returns the updated policy" },
      { status: 400, description: "Invalid policy ID or missing reviewer_ids" },
      { status: 404, description: "No description" },
      { status: 500, description: "No description" },
    ],
    tag: "Policies",
  },
  {
    method: 'PUT',
    path: '/policies/{id}/review/approve',
    summary: "Approve a policy review",
    description: "Sets the policy review status to approved and sends an in-app notification to the policy author.",
    requiresAuth: true,
    requestBody: {
      "comment": "string (optional)",
    },
    responses: [
      { status: 200, description: "Policy review approved; returns the updated policy" },
      { status: 400, description: "Invalid policy ID" },
      { status: 404, description: "No description" },
      { status: 500, description: "No description" },
    ],
    tag: "Policies",
  },
  {
    method: 'PUT',
    path: '/policies/{id}/review/reject',
    summary: "Reject a policy review (request changes)",
    description: "Sets the policy review status to changes_requested and sends an in-app notification to the policy author. A comment is required.",
    requiresAuth: true,
    requestBody: {
      "comment": "string (required)",
    },
    responses: [
      { status: 200, description: "Policy review rejected; returns the updated policy" },
      { status: 400, description: "Invalid policy ID or missing comment" },
      { status: 404, description: "No description" },
      { status: 500, description: "No description" },
    ],
    tag: "Policies",
  },
  {
    method: 'GET',
    path: '/policies/folders/{folderId}/policies',
    summary: "Get Policies In Folder",
    requiresAuth: true,
    parameters: [
      { name: 'folderId', in: 'path', type: 'integer', required: true, description: "The folderId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Policies",
  },
  {
    method: 'GET',
    path: '/policies/{id}/folders',
    summary: "Get Policy Folders",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Policies",
  },
  {
    method: 'PATCH',
    path: '/policies/{id}/folders',
    summary: "Update Policy Folders",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Policies",
  },
  {
    method: 'GET',
    path: '/policy-linked',
    summary: "Get All Linked Objects",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Policies",
  },
  {
    method: 'GET',
    path: '/policy-linked/{policyId}/linked-objects',
    summary: "Get Linked Objects For Policy",
    requiresAuth: true,
    parameters: [
      { name: 'policyId', in: 'path', type: 'integer', required: true, description: "The policyId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Policies",
  },
  {
    method: 'POST',
    path: '/policy-linked/{policyId}/linked-objects',
    summary: "Create Linked Object For Policy",
    requiresAuth: true,
    parameters: [
      { name: 'policyId', in: 'path', type: 'integer', required: true, description: "The policyId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Policies",
  },
  {
    method: 'DELETE',
    path: '/policy-linked/{policyId}/linked-objects',
    summary: "Delete Linked Object For Policy",
    requiresAuth: true,
    parameters: [
      { name: 'policyId', in: 'path', type: 'integer', required: true, description: "The policyId" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Policies",
  },
  {
    method: 'DELETE',
    path: '/policy-linked/risk/{riskId}/unlink-all',
    summary: "Unlink Risk From All Policies",
    requiresAuth: true,
    parameters: [
      { name: 'riskId', in: 'path', type: 'integer', required: true, description: "The riskId" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Policies",
  },
  {
    method: 'DELETE',
    path: '/policy-linked/evidence/{evidenceId}/unlink-all',
    summary: "Unlink Evidence From All Policies",
    requiresAuth: true,
    parameters: [
      { name: 'evidenceId', in: 'path', type: 'integer', required: true, description: "The evidenceId" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Policies",
  },
];

// Post-Market Monitoring endpoints
export const postMarketMonitoringEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/pmm/active-cycle/{projectId}',
    summary: "Get Active Cycle",
    requiresAuth: true,
    parameters: [
      { name: 'projectId', in: 'path', type: 'integer', required: true, description: "The projectId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'POST',
    path: '/pmm/config',
    summary: "Create Config",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'PUT',
    path: '/pmm/config/{configId}',
    summary: "Update Config",
    requiresAuth: true,
    parameters: [
      { name: 'configId', in: 'path', type: 'integer', required: true, description: "The configId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'DELETE',
    path: '/pmm/config/{configId}',
    summary: "Delete Config",
    requiresAuth: true,
    parameters: [
      { name: 'configId', in: 'path', type: 'integer', required: true, description: "The configId" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'GET',
    path: '/pmm/config/{configId}/questions',
    summary: "Get Questions",
    requiresAuth: true,
    parameters: [
      { name: 'configId', in: 'path', type: 'integer', required: true, description: "The configId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'POST',
    path: '/pmm/config/{configId}/questions',
    summary: "Add Question",
    requiresAuth: true,
    parameters: [
      { name: 'configId', in: 'path', type: 'integer', required: true, description: "The configId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'GET',
    path: '/pmm/config/{projectId}',
    summary: "Get Config By Project Id",
    requiresAuth: true,
    parameters: [
      { name: 'projectId', in: 'path', type: 'integer', required: true, description: "The projectId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'GET',
    path: '/pmm/cycles/{cycleId}',
    summary: "Get Cycle By Id",
    requiresAuth: true,
    parameters: [
      { name: 'cycleId', in: 'path', type: 'integer', required: true, description: "The cycleId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'POST',
    path: '/pmm/cycles/{cycleId}/flag',
    summary: "Flag Concern",
    requiresAuth: true,
    parameters: [
      { name: 'cycleId', in: 'path', type: 'integer', required: true, description: "The cycleId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'POST',
    path: '/pmm/cycles/{cycleId}/reassign',
    summary: "Reassign Stakeholder",
    requiresAuth: true,
    parameters: [
      { name: 'cycleId', in: 'path', type: 'integer', required: true, description: "The cycleId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'GET',
    path: '/pmm/cycles/{cycleId}/responses',
    summary: "Get Responses",
    requiresAuth: true,
    parameters: [
      { name: 'cycleId', in: 'path', type: 'integer', required: true, description: "The cycleId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'POST',
    path: '/pmm/cycles/{cycleId}/responses',
    summary: "Save Responses",
    requiresAuth: true,
    parameters: [
      { name: 'cycleId', in: 'path', type: 'integer', required: true, description: "The cycleId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'POST',
    path: '/pmm/cycles/{cycleId}/submit',
    summary: "Submit Cycle",
    requiresAuth: true,
    parameters: [
      { name: 'cycleId', in: 'path', type: 'integer', required: true, description: "The cycleId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'GET',
    path: '/pmm/org/questions',
    summary: "Get Questions",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'POST',
    path: '/pmm/projects/{projectId}/start-cycle',
    summary: "Start New Cycle",
    requiresAuth: true,
    parameters: [
      { name: 'projectId', in: 'path', type: 'integer', required: true, description: "The projectId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'POST',
    path: '/pmm/questions/reorder',
    summary: "Reorder Questions",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'PUT',
    path: '/pmm/questions/{questionId}',
    summary: "Update Question",
    requiresAuth: true,
    parameters: [
      { name: 'questionId', in: 'path', type: 'integer', required: true, description: "The questionId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'DELETE',
    path: '/pmm/questions/{questionId}',
    summary: "Delete Question",
    requiresAuth: true,
    parameters: [
      { name: 'questionId', in: 'path', type: 'integer', required: true, description: "The questionId" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'GET',
    path: '/pmm/reports',
    summary: "Get Reports",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
  {
    method: 'GET',
    path: '/pmm/reports/{reportId}/download',
    summary: "Download Report",
    requiresAuth: true,
    parameters: [
      { name: 'reportId', in: 'path', type: 'integer', required: true, description: "The reportId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Post-Market Monitoring",
  },
];

// Projects endpoints
export const projectEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/projects',
    summary: "Get all projects",
    description: "Returns all projects visible to the authenticated user. Admins and SuperAdmins see all projects in the organization; other roles see only projects they own or are members of.",
    requiresAuth: true,
    responses: [
      { status: 200, description: "List of projects retrieved successfully" },
      { status: 401, description: "Unauthorized — missing or invalid JWT" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Projects",
  },
  {
    method: 'POST',
    path: '/projects',
    summary: "Create a new project (use case)",
    description: "Creates a new project with associated members and frameworks. If an approval_workflow_id is provided, framework creation is deferred until the approval request is approved.",
    requiresAuth: true,
    requestBody: {
      "(schema)": "CreateProjectRequest",
    },
    responses: [
      { status: 201, description: "Project created successfully" },
      { status: 400, description: "Validation error" },
      { status: 403, description: "Business logic error (e.g. framework not allowed)" },
      { status: 500, description: "Internal server error" },
      { status: 503, description: "Service unavailable — project creation returned null" },
    ],
    tag: "Projects",
  },
  {
    method: 'GET',
    path: '/projects/all/assessment/progress',
    summary: "Get assessment progress across all projects",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Aggregated assessment progress returned" },
      { status: 401, description: "Unauthorized" },
      { status: 404, description: "No projects found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Projects",
  },
  {
    method: 'GET',
    path: '/projects/all/compliance/progress',
    summary: "Get compliance progress across all projects",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Aggregated compliance progress returned" },
      { status: 401, description: "Unauthorized" },
      { status: 404, description: "No projects found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Projects",
  },
  {
    method: 'GET',
    path: '/projects/assessment/progress/{id}',
    summary: "Get assessment progress for a single project",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Assessment progress returned" },
      { status: 404, description: "Project not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Projects",
  },
  {
    method: 'GET',
    path: '/projects/calculateProjectRisks/{id}',
    summary: "Calculate project risk distribution",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Risk calculations returned" },
      { status: 204, description: "No risk data available" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Projects",
  },
  {
    method: 'GET',
    path: '/projects/calculateVendorRisks/{id}',
    summary: "Calculate vendor risk distribution",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Vendor risk calculations returned" },
      { status: 204, description: "No vendor risk data available" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Projects",
  },
  {
    method: 'GET',
    path: '/projects/complainces/{projid}',
    summary: "Get compliance data for a project",
    requiresAuth: true,
    parameters: [
      { name: 'projid', in: 'path', type: 'integer', required: true, description: "The project ID" },
    ],
    responses: [
      { status: 200, description: "Compliance data returned" },
      { status: 404, description: "Project not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Projects",
  },
  {
    method: 'GET',
    path: '/projects/compliance/progress/{id}',
    summary: "Get compliance progress for a single project",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Compliance progress returned" },
      { status: 404, description: "Project not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Projects",
  },
  {
    method: 'POST',
    path: '/projects/saveControls',
    summary: "Save Controls",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Projects",
  },
  {
    method: 'GET',
    path: '/projects/stats/{id}',
    summary: "Get project statistics by ID",
    requiresAuth: true,
    responses: [
      { status: 202, description: "Project stats retrieved" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Projects",
  },
  {
    method: 'GET',
    path: '/projects/{id}',
    summary: "Get a project by ID",
    description: "Returns a single project with its frameworks, owner name, members, and approval status.",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Project found" },
      { status: 404, description: "Project not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Projects",
  },
  {
    method: 'PATCH',
    path: '/projects/{id}',
    summary: "Update a project by ID",
    description: "Partially updates a project and its member list. Only provided fields are updated.",
    requiresAuth: true,
    requestBody: {
      "(schema)": "UpdateProjectRequest",
    },
    responses: [
      { status: 202, description: "Project updated successfully" },
      { status: 400, description: "Validation error" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Business logic error" },
      { status: 404, description: "Project not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Projects",
  },
  {
    method: 'DELETE',
    path: '/projects/{id}',
    summary: "Delete a project by ID",
    description: "Deletes a project and all dependent entities (files, risks, members, framework data).",
    requiresAuth: true,
    responses: [
      { status: 202, description: "Project deleted successfully" },
      { status: 404, description: "Project not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Projects",
  },
  {
    method: 'PATCH',
    path: '/projects/{id}/status',
    summary: "Update project status",
    requiresAuth: true,
    requestBody: {
      "status": "ProjectStatus (required)",
    },
    responses: [
      { status: 200, description: "Project status updated successfully" },
      { status: 404, description: "Project not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Projects",
  },
];

// Project Risks endpoints
export const projectRiskEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/projectRisks',
    summary: "Get All Risks",
    requiresAuth: true,
    parameters: [
      { name: 'filter', in: 'query', type: 'string', required: false, description: "Filter by soft-delete state." },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Project Risks",
  },
  {
    method: 'POST',
    path: '/projectRisks',
    summary: "Create Risk",
    requiresAuth: true,
    requestBody: {
      "(schema)": "ProjectRiskInput",
    },
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Project Risks",
  },
  {
    method: 'GET',
    path: '/projectRisks/by-frameworkid/{id}',
    summary: "Get Risks By Framework",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
      { name: 'filter', in: 'query', type: 'string', required: false, description: "The filter" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Project Risks",
  },
  {
    method: 'GET',
    path: '/projectRisks/by-projid/{id}',
    summary: "Get Risks By Project",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'string', required: true, description: "The id" },
      { name: 'filter', in: 'query', type: 'string', required: false, description: "The filter" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Project Risks",
  },
  {
    method: 'GET',
    path: '/projectRisks/{id}',
    summary: "Get Risk By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Project Risks",
  },
  {
    method: 'PUT',
    path: '/projectRisks/{id}',
    summary: "Update Risk By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    requestBody: {
      "(schema)": "ProjectRiskInput",
    },
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Project Risks",
  },
  {
    method: 'DELETE',
    path: '/projectRisks/{id}',
    summary: "Delete Risk By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Project Risks",
  },
];

// Quantitative Risks endpoints
export const quantitativeRiskEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/quantitative-risks/assessment-mode',
    summary: "Get Risk Assessment Mode",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Quantitative Risks",
  },
  {
    method: 'PUT',
    path: '/quantitative-risks/assessment-mode',
    summary: "Update Risk Assessment Mode",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Quantitative Risks",
  },
  {
    method: 'GET',
    path: '/quantitative-risks/portfolio/org',
    summary: "Get Org Portfolio",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Quantitative Risks",
  },
  {
    method: 'GET',
    path: '/quantitative-risks/portfolio/project/{projectId}',
    summary: "Get Project Portfolio",
    requiresAuth: true,
    parameters: [
      { name: 'projectId', in: 'path', type: 'integer', required: true, description: "The projectId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Quantitative Risks",
  },
  {
    method: 'GET',
    path: '/quantitative-risks/portfolio/trend',
    summary: "Get Portfolio Trend Handler",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Quantitative Risks",
  },
  {
    method: 'POST',
    path: '/quantitative-risks/{riskId}/apply-benchmark/{benchmarkId}',
    summary: "Apply Benchmark",
    requiresAuth: true,
    parameters: [
      { name: 'riskId', in: 'path', type: 'integer', required: true, description: "The riskId" },
      { name: 'benchmarkId', in: 'path', type: 'integer', required: true, description: "The benchmarkId" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Quantitative Risks",
  },
];

// Reporting endpoints
export const reportingEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/reporting/generate-report',
    summary: "Get All Generated Reports",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Reporting",
  },
  {
    method: 'POST',
    path: '/reporting/generate-report',
    summary: "Generate Reports",
    description: "Requires role: Admin",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Reporting",
  },
  {
    method: 'POST',
    path: '/reporting/v2/generate-report',
    summary: "Generate Reports V2",
    description: "Requires role: Admin",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Reporting",
  },
  {
    method: 'DELETE',
    path: '/reporting/{id}',
    summary: "Delete Generated Report By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Reporting",
  },
];

// Risk Benchmarks endpoints
export const riskBenchmarkEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/risk-benchmarks',
    summary: "Get All Benchmarks",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Risk Benchmarks",
  },
  {
    method: 'GET',
    path: '/risk-benchmarks/filters',
    summary: "Get Benchmark Filters",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Risk Benchmarks",
  },
  {
    method: 'GET',
    path: '/risk-benchmarks/{id}',
    summary: "Get Benchmark By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Risk Benchmarks",
  },
];

// Risk History endpoints
export const riskHistoryEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/riskHistory/current-counts',
    summary: "Get Current Counts",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Risk History",
  },
  {
    method: 'POST',
    path: '/riskHistory/snapshot',
    summary: "Create Snapshot",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Risk History",
  },
  {
    method: 'GET',
    path: '/riskHistory/timeseries',
    summary: "Get Timeseries",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Risk History",
  },
];

// Roles endpoints
export const roleEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/roles',
    summary: "Get All Roles",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Roles",
  },
  {
    method: 'GET',
    path: '/roles/{id}',
    summary: "Get Role By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Roles",
  },
];

// Search endpoints
export const searchEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/search',
    summary: "Search",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Search",
  },
];

// Settings endpoints
export const settingEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/feature-settings',
    summary: "Get Feature Settings",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Settings",
  },
  {
    method: 'PATCH',
    path: '/feature-settings',
    summary: "Update Feature Settings",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Settings",
  },
];

// Shadow AI endpoints
export const shadowAiEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/shadow-ai/api-keys',
    summary: "List Api Keys",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'POST',
    path: '/shadow-ai/api-keys',
    summary: "Create Api Key",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'DELETE',
    path: '/shadow-ai/api-keys/{id}',
    summary: "Revoke Api Key",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'DELETE',
    path: '/shadow-ai/api-keys/{id}/permanent',
    summary: "Delete Api Key",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'GET',
    path: '/shadow-ai/config/syslog',
    summary: "Get Syslog Configs",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'POST',
    path: '/shadow-ai/config/syslog',
    summary: "Create Syslog Config",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'PATCH',
    path: '/shadow-ai/config/syslog/{id}',
    summary: "Update Syslog Config",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'DELETE',
    path: '/shadow-ai/config/syslog/{id}',
    summary: "Delete Syslog Config",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'GET',
    path: '/shadow-ai/departments',
    summary: "Get Department Activity",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'GET',
    path: '/shadow-ai/insights/summary',
    summary: "Get Insights Summary",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'GET',
    path: '/shadow-ai/insights/tools-by-events',
    summary: "Get Tools By Events",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'GET',
    path: '/shadow-ai/insights/tools-by-users',
    summary: "Get Tools By Users",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'GET',
    path: '/shadow-ai/insights/trend',
    summary: "Get Trend",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'GET',
    path: '/shadow-ai/insights/users-by-department',
    summary: "Get Users By Department",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'GET',
    path: '/shadow-ai/rules',
    summary: "Get Rules",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'POST',
    path: '/shadow-ai/rules',
    summary: "Create Rule",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'GET',
    path: '/shadow-ai/rules/alert-history',
    summary: "Get Alert History",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'PATCH',
    path: '/shadow-ai/rules/{id}',
    summary: "Update Rule",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'DELETE',
    path: '/shadow-ai/rules/{id}',
    summary: "Delete Rule",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'GET',
    path: '/shadow-ai/settings',
    summary: "Get Settings",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'PATCH',
    path: '/shadow-ai/settings',
    summary: "Update Settings",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'GET',
    path: '/shadow-ai/tools',
    summary: "Get Tools",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'GET',
    path: '/shadow-ai/tools/{id}',
    summary: "Get Tool By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'POST',
    path: '/shadow-ai/tools/{id}/start-governance',
    summary: "Start Governance",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'PATCH',
    path: '/shadow-ai/tools/{id}/status',
    summary: "Update Tool Status",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'GET',
    path: '/shadow-ai/users',
    summary: "Get Users",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'GET',
    path: '/shadow-ai/users/{email}/activity',
    summary: "Get User Detail",
    requiresAuth: true,
    parameters: [
      { name: 'email', in: 'path', type: 'string', required: true, description: "The email" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
  {
    method: 'POST',
    path: '/v1/shadow-ai/events',
    summary: "Ingest Events",
    requiresAuth: false,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Shadow AI",
  },
];

// Share Links endpoints
export const shareLinkEndpoints: Endpoint[] = [
  {
    method: 'POST',
    path: '/shares',
    summary: "Create Share Link",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Share Links",
  },
  {
    method: 'GET',
    path: '/shares/token/{token}',
    summary: "Get Share Link By Token",
    requiresAuth: false,
    parameters: [
      { name: 'token', in: 'path', type: 'string', required: true, description: "The token" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Share Links",
  },
  {
    method: 'GET',
    path: '/shares/view/{token}',
    summary: "Get Shared Data By Token",
    requiresAuth: false,
    parameters: [
      { name: 'token', in: 'path', type: 'string', required: true, description: "The token" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Share Links",
  },
  {
    method: 'PATCH',
    path: '/shares/{id}',
    summary: "Update Share Link",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Share Links",
  },
  {
    method: 'DELETE',
    path: '/shares/{id}',
    summary: "Delete Share Link",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Share Links",
  },
  {
    method: 'GET',
    path: '/shares/{resourceType}/{resourceId}',
    summary: "Get Share Links For Resource",
    requiresAuth: true,
    parameters: [
      { name: 'resourceType', in: 'path', type: 'string', required: true, description: "The resourceType" },
      { name: 'resourceId', in: 'path', type: 'integer', required: true, description: "The resourceId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Share Links",
  },
];

// Slack Webhooks endpoints
export const slackWebhookEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/slackWebhooks',
    summary: "Get All Slack Webhooks",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Slack Webhooks",
  },
  {
    method: 'POST',
    path: '/slackWebhooks',
    summary: "Create New Slack Webhook",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Slack Webhooks",
  },
  {
    method: 'GET',
    path: '/slackWebhooks/{id}',
    summary: "Get Slack Webhook By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Slack Webhooks",
  },
  {
    method: 'PATCH',
    path: '/slackWebhooks/{id}',
    summary: "Update Slack Webhook By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Slack Webhooks",
  },
  {
    method: 'DELETE',
    path: '/slackWebhooks/{id}',
    summary: "Delete Slack Webhook By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Slack Webhooks",
  },
  {
    method: 'POST',
    path: '/slackWebhooks/{id}/send',
    summary: "Send Slack Message",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Slack Webhooks",
  },
];

// Subscriptions endpoints
export const subscriptionEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/subscriptions',
    summary: "Get Subscription Controller",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Subscriptions",
  },
  {
    method: 'POST',
    path: '/subscriptions',
    summary: "Create Subscription Controller",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Subscriptions",
  },
  {
    method: 'PUT',
    path: '/subscriptions/{id}',
    summary: "Update Subscription Controller",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Subscriptions",
  },
  {
    method: 'GET',
    path: '/tiers/features/{id}',
    summary: "Get Tiers Features",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Subscriptions",
  },
];

// Super Admin endpoints
export const superAdminEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/super-admin/organizations',
    summary: "List Organizations",
    description: "Requires role: Super Admin",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Super Admin",
  },
  {
    method: 'POST',
    path: '/super-admin/organizations',
    summary: "Create Org",
    description: "Requires role: Super Admin",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Super Admin",
  },
  {
    method: 'PATCH',
    path: '/super-admin/organizations/{id}',
    summary: "Update Org",
    description: "Requires role: Super Admin",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Super Admin",
  },
  {
    method: 'DELETE',
    path: '/super-admin/organizations/{id}',
    summary: "Delete Org",
    description: "Requires role: Super Admin",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Super Admin",
  },
  {
    method: 'POST',
    path: '/super-admin/organizations/{id}/invite',
    summary: "Invite User To Org",
    description: "Requires role: Super Admin",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Super Admin",
  },
  {
    method: 'GET',
    path: '/super-admin/organizations/{id}/users',
    summary: "List Org Users",
    description: "Requires role: Super Admin",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Super Admin",
  },
  {
    method: 'GET',
    path: '/super-admin/users',
    summary: "List All Users",
    description: "Requires role: Super Admin",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Super Admin",
  },
  {
    method: 'GET',
    path: '/super-admin/users/count',
    summary: "Get User Count",
    description: "Requires role: Super Admin",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Super Admin",
  },
  {
    method: 'DELETE',
    path: '/super-admin/users/{id}',
    summary: "Remove User",
    description: "Requires role: Super Admin",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 403, description: "Forbidden - insufficient role" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Super Admin",
  },
];

// System endpoints
export const systemEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/health',
    summary: "Health Check",
    requiresAuth: false,
    responses: [
      { status: 200, description: "Success" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "System",
  },
  {
    method: 'GET',
    path: '/logger/events',
    summary: "Get Events",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "System",
  },
  {
    method: 'GET',
    path: '/logger/logs',
    summary: "Get Logs",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "System",
  },
  {
    method: 'GET',
    path: '/version',
    summary: "Get application version",
    requiresAuth: false,
    responses: [
      { status: 200, description: "Success" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "System",
  },
];

// Tasks endpoints
export const taskEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/tasks',
    summary: "Get All Tasks",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Tasks",
  },
  {
    method: 'POST',
    path: '/tasks',
    summary: "Create Task",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Tasks",
  },
  {
    method: 'GET',
    path: '/tasks/{id}',
    summary: "Get Task By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Tasks",
  },
  {
    method: 'PUT',
    path: '/tasks/{id}',
    summary: "Update Task",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Tasks",
  },
  {
    method: 'DELETE',
    path: '/tasks/{id}',
    summary: "Delete Task",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Tasks",
  },
  {
    method: 'GET',
    path: '/tasks/{id}/entities',
    summary: "Get Task Entity Links",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Tasks",
  },
  {
    method: 'POST',
    path: '/tasks/{id}/entities',
    summary: "Add Task Entity Link",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Tasks",
  },
  {
    method: 'DELETE',
    path: '/tasks/{id}/entities/{linkId}',
    summary: "Remove Task Entity Link",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
      { name: 'linkId', in: 'path', type: 'integer', required: true, description: "The linkId" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Tasks",
  },
  {
    method: 'DELETE',
    path: '/tasks/{id}/hard',
    summary: "Hard Delete Task",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Tasks",
  },
  {
    method: 'PUT',
    path: '/tasks/{id}/restore',
    summary: "Restore Task",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Tasks",
  },
];

// Tokens endpoints
export const tokenEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/tokens',
    summary: "Get Api Tokens",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Tokens",
  },
  {
    method: 'POST',
    path: '/tokens',
    summary: "Create Api Token",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Tokens",
  },
  {
    method: 'DELETE',
    path: '/tokens/{id}',
    summary: "Delete Api Token",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Tokens",
  },
];

// Training endpoints
export const trainingEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/training',
    summary: "Get All Training Registar",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Training",
  },
  {
    method: 'POST',
    path: '/training',
    summary: "Create New Training Registar",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Training",
  },
  {
    method: 'GET',
    path: '/training/training-id/{id}',
    summary: "Get Training Registar By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Training",
  },
  {
    method: 'PATCH',
    path: '/training/{id}',
    summary: "Update Training Registar By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Training",
  },
  {
    method: 'DELETE',
    path: '/training/{id}',
    summary: "Delete Training Registar By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Deleted successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Training",
  },
];

// Users - CRUD endpoints
export const userEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/users',
    summary: "List all users in organization",
    description: "Returns all users belonging to the authenticated user's organization, ordered by created_at DESC, id ASC. Password hashes are excluded.",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Users found" },
      { status: 204, description: "No users found (empty organization)" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Users - CRUD",
  },
  {
    method: 'GET',
    path: '/users/check/exists',
    summary: "Check if any user exists",
    description: "Returns a boolean indicating whether any user record exists in the database. Used during initial setup flow to determine if onboarding is needed.",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Check result" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Users - Utility",
  },
  {
    method: 'PATCH',
    path: '/users/chng-pass/{id}',
    summary: "Change password (authenticated)",
    description: "Changes the password for the authenticated user. Requires the current password for verification. Protected by selfOnly middleware (users can only change their own password). Rate-limited.",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "User ID (must match authenticated user via selfOnly middleware)" },
    ],
    requestBody: {
      "id": "integer (required)",
      "currentPassword": "string (required)",
      "newPassword": "string (required)",
    },
    responses: [
      { status: 202, description: "Password changed successfully" },
      { status: 400, description: "Validation error (weak password, missing fields)" },
      { status: 403, description: "Business logic error (wrong current password)" },
      { status: 404, description: "User not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Users - Password",
  },
  {
    method: 'POST',
    path: '/users/register',
    summary: "Register a new user",
    description: "Creates a new user account. Requires a valid registration JWT (set by registerJWT middleware). Validates email uniqueness, password strength, and required fields. Marks any pending invitation as accepted after successful creation.",
    requiresAuth: true,
    requestBody: {
      "name": "string (required)",
      "surname": "string (required)",
      "email": "string (required)",
      "password": "string (required)",
      "roleId": "integer (required)",
      "organizationId": "integer (required)",
    },
    responses: [
      { status: 201, description: "User created successfully" },
      { status: 400, description: "Validation error (missing fields, weak password, invalid email)" },
      { status: 403, description: "Business logic error" },
      { status: 409, description: "User with this email already exists" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Users - Registration",
  },
  {
    method: 'POST',
    path: '/users/reset-password',
    summary: "Reset user password",
    description: "Resets the password for a user identified by email. Protected by resetPasswordMiddleware (validates reset token/permission). Password is hashed via bcrypt before storage.",
    requiresAuth: false,
    requestBody: {
      "email": "string (required)",
      "newPassword": "string (required)",
    },
    responses: [
      { status: 202, description: "Password reset successfully" },
      { status: 400, description: "Validation error (weak password)" },
      { status: 403, description: "Business logic error" },
      { status: 404, description: "User not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Users - Password",
  },
  {
    method: 'GET',
    path: '/users/{id}',
    summary: "Get user by ID",
    description: "Retrieves a single user by their numeric ID. Super-admins can access any user; regular users can only access users within their organization (or their own record).",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "User ID" },
    ],
    responses: [
      { status: 200, description: "User found" },
      { status: 403, description: "Access denied (user belongs to different organization)" },
      { status: 404, description: "User not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Users - CRUD",
  },
  {
    method: 'PATCH',
    path: '/users/{id}',
    summary: "Update user by ID",
    description: "Updates user fields (name, surname, email, roleId, last_login). Only provided fields are updated. Organization isolation enforced. Sends Slack notification on role change. Sends email notification when role changes from Editor (3) to Admin (1).",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "User ID to update" },
    ],
    requestBody: {
      "name": "string (optional)",
      "surname": "string (optional)",
      "email": "string (optional)",
      "roleId": "integer (optional)",
      "last_login": "string (optional)",
    },
    responses: [
      { status: 202, description: "User updated" },
      { status: 400, description: "Validation error" },
      { status: 403, description: "Access denied or business logic error" },
      { status: 404, description: "User not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Users - CRUD",
  },
  {
    method: 'DELETE',
    path: '/users/{id}',
    summary: "Delete user by ID",
    description: "Deletes a user and nullifies all their foreign key references across projects, vendors, risks, vendor risks, files, automations, and invitations. Also removes the user from projects_members. Demo users and super-admins cannot be deleted.",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "User ID to delete" },
    ],
    responses: [
      { status: 202, description: "User deleted" },
      { status: 403, description: "Forbidden: demo user, super-admin, or wrong organization" },
      { status: 404, description: "User not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Users - CRUD",
  },
  {
    method: 'GET',
    path: '/users/{id}/calculate-progress',
    summary: "Calculate user project progress",
    description: "Computes completion metrics across all projects the user is a member of. Calculates subcontrol completion (status=\"Done\") and assessment question completion (has answer) per project and as aggregated totals.",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "User ID to calculate progress for" },
    ],
    responses: [
      { status: 200, description: "Progress calculated" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Users - Analytics",
  },
  {
    method: 'GET',
    path: '/users/{id}/profile-photo',
    summary: "Get profile photo",
    description: "Returns the profile photo binary content for the specified user. The response includes the raw file content and its MIME type.",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "User ID" },
    ],
    responses: [
      { status: 200, description: "Profile photo returned" },
      { status: 404, description: "No profile photo found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Users - Profile Photo",
  },
  {
    method: 'POST',
    path: '/users/{id}/profile-photo',
    summary: "Upload profile photo",
    description: "Uploads a profile photo for the specified user. The file is stored in the tenant-scoped files table. If the user already has a profile photo, the old one is deleted and replaced. Uses multer for multipart file handling.",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "User ID" },
    ],
    requestBody: {
      "photo": "string (required)",
    },
    responses: [
      { status: 200, description: "Profile photo uploaded" },
      { status: 400, description: "No file provided" },
      { status: 403, description: "Access denied (wrong organization)" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Users - Profile Photo",
  },
  {
    method: 'DELETE',
    path: '/users/{id}/profile-photo',
    summary: "Delete profile photo",
    description: "Removes the profile photo from the user record and deletes the associated file from the files table.",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "User ID" },
    ],
    responses: [
      { status: 200, description: "Profile photo deleted" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Users - Profile Photo",
  },
];

// User Preferences endpoints
export const userPreferenceEndpoints: Endpoint[] = [
  {
    method: 'POST',
    path: '/user-preferences',
    summary: "Create User Preferences",
    requiresAuth: true,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "User Preferences",
  },
  {
    method: 'GET',
    path: '/user-preferences/{userId}',
    summary: "Get Preferences By User",
    requiresAuth: true,
    parameters: [
      { name: 'userId', in: 'path', type: 'integer', required: true, description: "The userId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "User Preferences",
  },
  {
    method: 'PATCH',
    path: '/user-preferences/{userId}',
    summary: "Update User Preferences",
    requiresAuth: true,
    parameters: [
      { name: 'userId', in: 'path', type: 'integer', required: true, description: "The userId" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "User Preferences",
  },
];

// Vendors endpoints
export const vendorEndpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/vendors',
    summary: "Get all vendors",
    description: "Retrieves all vendors for the authenticated user's organization, ordered by creation date descending. Each vendor includes its associated project IDs and the reviewer's full name.",
    requiresAuth: true,
    responses: [
      { status: 200, description: "Vendors retrieved successfully" },
      { status: 204, description: "No vendors found" },
      { status: 401, description: "Unauthorized - missing or invalid JWT" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Vendors",
  },
  {
    method: 'POST',
    path: '/vendors',
    summary: "Create a vendor",
    description: "Creates a new vendor in the authenticated user's organization. Validates required fields, checks demo restrictions, associates projects via the vendors_projects join table, records creation in change history, fires automation triggers (vendor_added), and sends in-app assignment notifications to assignee and reviewer.",
    requiresAuth: true,
    requestBody: {
      "(schema)": "VendorInput",
    },
    responses: [
      { status: 201, description: "Vendor created successfully" },
      { status: 400, description: "Validation error (missing or invalid required fields)" },
      { status: 401, description: "Unauthorized - missing or invalid JWT" },
      { status: 403, description: "Business logic error (e.g. demo vendor restriction)" },
      { status: 500, description: "Internal server error" },
      { status: 503, description: "Service unavailable - vendor creation returned null" },
    ],
    tag: "Vendors",
  },
  {
    method: 'GET',
    path: '/vendors/project-id/{id}',
    summary: "Get vendors by project ID",
    description: "Retrieves all vendors associated with a specific project. Returns 404 if the project does not exist.",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "Project ID" },
    ],
    responses: [
      { status: 200, description: "Vendors retrieved successfully" },
      { status: 401, description: "Unauthorized - missing or invalid JWT" },
      { status: 404, description: "Project not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Vendors",
  },
  {
    method: 'GET',
    path: '/vendors/{id}',
    summary: "Get vendor by ID",
    description: "Retrieves a single vendor by its ID, including associated project IDs.",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "Vendor ID" },
    ],
    responses: [
      { status: 200, description: "Vendor retrieved successfully" },
      { status: 401, description: "Unauthorized - missing or invalid JWT" },
      { status: 404, description: "Vendor not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Vendors",
  },
  {
    method: 'PATCH',
    path: '/vendors/{id}',
    summary: "Update a vendor",
    description: "Partially updates an existing vendor. Only provided fields are updated. Review and scorecard fields can be explicitly set to null to clear them. Required fields (vendor_name, vendor_provides, website, vendor_contact_person) are only updated if they have a non-empty value. Records field-level changes in change history, fires automation triggers (vendor_updated), and sends in-app notifications when assignee or reviewer changes.",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "Vendor ID" },
    ],
    requestBody: {
      "(schema)": "VendorUpdate",
    },
    responses: [
      { status: 202, description: "Vendor updated successfully" },
      { status: 400, description: "Validation error" },
      { status: 401, description: "Unauthorized - missing or invalid JWT, or missing userId/role" },
      { status: 403, description: "Business logic error (e.g. demo vendor restriction)" },
      { status: 404, description: "Vendor not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Vendors",
  },
  {
    method: 'DELETE',
    path: '/vendors/{id}',
    summary: "Delete a vendor",
    description: "Deletes a vendor and all associated data in a transaction: 1. Deletes vendor risks (vendor_risks table) 2. Deletes project associations (vendors_projects table) 3. Deletes the vendor record itself Fires automation triggers (vendor_deleted).",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "Vendor ID" },
    ],
    responses: [
      { status: 202, description: "Vendor deleted successfully" },
      { status: 401, description: "Unauthorized - missing or invalid JWT" },
      { status: 404, description: "Vendor not found" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Vendors",
  },
];

// Vendor Risks endpoints
export const vendorRiskEndpoints: Endpoint[] = [
  {
    method: 'POST',
    path: '/vendorRisks',
    summary: "Create Vendor Risk",
    requiresAuth: true,
    requestBody: {
      "(schema)": "VendorRiskInput",
    },
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Vendor Risks",
  },
  {
    method: 'GET',
    path: '/vendorRisks/all',
    summary: "Get All Vendor Risks All Projects",
    requiresAuth: true,
    parameters: [
      { name: 'filter', in: 'query', type: 'string', required: false, description: "The filter" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Vendor Risks",
  },
  {
    method: 'GET',
    path: '/vendorRisks/by-projid/{id}',
    summary: "Get All Vendor Risks",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'string', required: true, description: "The id" },
      { name: 'filter', in: 'query', type: 'string', required: false, description: "The filter" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Vendor Risks",
  },
  {
    method: 'GET',
    path: '/vendorRisks/by-vendorid/{id}',
    summary: "Get All Vendor Risks By Vendor Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
      { name: 'filter', in: 'query', type: 'string', required: false, description: "The filter" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Vendor Risks",
  },
  {
    method: 'GET',
    path: '/vendorRisks/{id}',
    summary: "Get Vendor Risk By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 200, description: "Success" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Vendor Risks",
  },
  {
    method: 'PATCH',
    path: '/vendorRisks/{id}',
    summary: "Update Vendor Risk By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    requestBody: {
      "(schema)": "VendorRiskInput",
    },
    responses: [
      { status: 202, description: "Accepted" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Vendor Risks",
  },
  {
    method: 'DELETE',
    path: '/vendorRisks/{id}',
    summary: "Delete Vendor Risk By Id",
    requiresAuth: true,
    parameters: [
      { name: 'id', in: 'path', type: 'integer', required: true, description: "The id" },
    ],
    responses: [
      { status: 202, description: "Accepted" },
      { status: 401, description: "Unauthorized" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Vendor Risks",
  },
];

// Webhooks endpoints
export const webhookEndpoints: Endpoint[] = [
  {
    method: 'POST',
    path: '/webhooks/github',
    summary: "Github Webhook Controller",
    requiresAuth: false,
    responses: [
      { status: 201, description: "Created successfully" },
      { status: 500, description: "Internal server error" },
    ],
    tag: "Webhooks",
  },
];

// Export all endpoints grouped
export const allEndpoints = {
  agentDiscovery: agentDiscoveryEndpoints,
  aiAdvisor: aiAdvisorEndpoints,
  aiDetection: aiDetectionEndpoints,
  aiIncident: aiIncidentEndpoints,
  aiTrustCentre: aiTrustCentreEndpoints,
  approvalWorkflow: approvalWorkflowEndpoints,
  assessment: assessmentEndpoints,
  audit: auditEndpoints,
  authentication: authenticationEndpoints,
  automation: automationEndpoints,
  ceMarking: ceMarkingEndpoints,
  changeHistory: changeHistoryEndpoints,
  compliance: complianceEndpoints,
  dashboard: dashboardEndpoints,
  dataset: datasetEndpoints,
  demoData: demoDataEndpoints,
  email: emailEndpoints,
  entityGraph: entityGraphEndpoints,
  euAiAct: euAiActEndpoints,
  evidenceHub: evidenceHubEndpoints,
  file: fileEndpoints,
  framework: frameworkEndpoints,
  fria: friaEndpoints,
  intakeForm: intakeFormEndpoints,
  integration: integrationEndpoints,
  internal: internalEndpoints,
  invitation: invitationEndpoints,
  iso27001: iso27001Endpoints,
  iso42001: iso42001Endpoints,
  llmKey: llmKeyEndpoints,
  modelInventory: modelInventoryEndpoints,
  modelRisk: modelRiskEndpoints,
  nistAiRmf: nistAiRmfEndpoints,
  note: noteEndpoints,
  notification: notificationEndpoints,
  organization: organizationEndpoints,
  plugin: pluginEndpoints,
  policy: policyEndpoints,
  postMarketMonitoring: postMarketMonitoringEndpoints,
  project: projectEndpoints,
  projectRisk: projectRiskEndpoints,
  quantitativeRisk: quantitativeRiskEndpoints,
  reporting: reportingEndpoints,
  riskBenchmark: riskBenchmarkEndpoints,
  riskHistory: riskHistoryEndpoints,
  role: roleEndpoints,
  search: searchEndpoints,
  setting: settingEndpoints,
  shadowAi: shadowAiEndpoints,
  shareLink: shareLinkEndpoints,
  slackWebhook: slackWebhookEndpoints,
  subscription: subscriptionEndpoints,
  superAdmin: superAdminEndpoints,
  system: systemEndpoints,
  task: taskEndpoints,
  token: tokenEndpoints,
  training: trainingEndpoints,
  user: userEndpoints,
  userPreference: userPreferenceEndpoints,
  vendor: vendorEndpoints,
  vendorRisk: vendorRiskEndpoints,
  webhook: webhookEndpoints,
};
