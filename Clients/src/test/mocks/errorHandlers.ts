/**
 * Error-variant handlers for the domains covered in `handlers.ts`.
 *
 * These are NOT part of the default handler set. A test installs one for the
 * duration of that test:
 *
 *   server.use(shadowAiErrors.forbidden());
 *
 * Keeping them out of the defaults means adding an error variant can never
 * change the behaviour of an existing test — the alternative (branching inside
 * a default handler on a magic id or header) makes default behaviour depend on
 * fixture values and hides the branch in a shared file.
 *
 * Envelope: the backend wraps responses as `{ message, data }` via
 * `STATUS_CODE[n](...)` (Servers/utils/statusCode.utils.ts), so that is what
 * these return. Inventing `{ error: "..." }` would let components pass tests
 * while mishandling real failures.
 *
 * `transport()` is deliberately distinct from `serverError()`: a transport
 * failure and a 500 take different paths through the axios interceptors, and
 * only the former exercises the "network is down" branch.
 */

import { http, HttpResponse, type HttpHandler } from "msw";

type Method = "get" | "post" | "patch" | "put" | "delete";

function envelope(message: string) {
  return { message, data: null };
}

/** Build the four standard variants for one path+method. */
function variantsFor(method: Method, path: string) {
  return {
    /** 400 — validation rejected the request body or query. */
    validation: (message = "Bad request"): HttpHandler =>
      http[method](path, () => HttpResponse.json(envelope(message), { status: 400 })),

    /** 403 — authenticated but not permitted (wrong role, other tenant). */
    forbidden: (message = "Forbidden"): HttpHandler =>
      http[method](path, () => HttpResponse.json(envelope(message), { status: 403 })),

    /** 500 — the server answered, but failed. */
    serverError: (message = "Internal server error"): HttpHandler =>
      http[method](path, () => HttpResponse.json(envelope(message), { status: 500 })),

    /** Transport failure — no response at all. */
    transport: (): HttpHandler => http[method](path, () => HttpResponse.error()),
  };
}

// ─── Shadow AI ───────────────────────────────────────────────────────

export const shadowAiErrors = {
  ...variantsFor("get", "/api/shadow-ai/tools"),
  apiKeys: variantsFor("get", "/api/shadow-ai/api-keys"),
  createApiKey: variantsFor("post", "/api/shadow-ai/api-keys"),
  insightsSummary: variantsFor("get", "/api/shadow-ai/insights/summary"),
  settings: variantsFor("get", "/api/shadow-ai/settings"),
  updateSettings: variantsFor("patch", "/api/shadow-ai/settings"),
  syslog: variantsFor("get", "/api/shadow-ai/config/syslog"),
};

// ─── AI Detection: scans ─────────────────────────────────────────────

export const aiDetectionErrors = {
  ...variantsFor("get", "/api/ai-detection/scans"),
  activeScan: variantsFor("get", "/api/ai-detection/scans/active"),
  scan: variantsFor("get", "/api/ai-detection/scans/:scanId"),
  startScan: variantsFor("post", "/api/ai-detection/scans"),
  stats: variantsFor("get", "/api/ai-detection/stats"),
};

// ─── AI Detection: repositories ──────────────────────────────────────

export const aiDetectionRepositoryErrors = {
  ...variantsFor("get", "/api/ai-detection/repositories"),
  create: variantsFor("post", "/api/ai-detection/repositories"),
  update: variantsFor("patch", "/api/ai-detection/repositories/:id"),
  remove: variantsFor("delete", "/api/ai-detection/repositories/:id"),
};

// ─── Compliance frameworks ───────────────────────────────────────────

export const frameworkErrors = {
  ...variantsFor("get", "/api/frameworks"),
  assignToProject: variantsFor("post", "/api/frameworks/toProject"),
};

// ─── Settings ────────────────────────────────────────────────────────

export const settingsErrors = {
  preferences: variantsFor("get", "/api/users/me/preferences"),
  updatePreferences: variantsFor("patch", "/api/users/me/preferences"),
  ssoConfig: variantsFor("get", "/api/ssoConfig"),
  updateSsoConfig: variantsFor("put", "/api/ssoConfig"),
};

// ─── Invitations ─────────────────────────────────────────────────────

export const invitationErrors = {
  ...variantsFor("get", "/api/invitations"),
  revoke: variantsFor("delete", "/api/invitations/:id"),
  resend: variantsFor("post", "/api/invitations/:id/resend"),
};

// ─── Bulk update ─────────────────────────────────────────────────────

// Verbs matter and are not uniform: four of these are PATCH and three are POST.
// An override registered on the wrong verb does NOT fail loudly — it simply
// never matches, and the request falls through to the success handler, so the
// test sees a pass instead of the error it asked for. Verified against the
// repositories rather than assumed.
export const bulkErrors = {
  tasks: variantsFor("patch", "/api/tasks/bulk"),
  policies: variantsFor("patch", "/api/policies/bulk"),
  projectRisks: variantsFor("patch", "/api/projectRisks/bulk"),
  fileTags: variantsFor("patch", "/api/files/bulk-tags"),
  attachFiles: variantsFor("post", "/api/files/attach-bulk"),
  aiTrustIndex: variantsFor("post", "/api/ai-trust-index/tracked/bulk"),
  governanceOs: variantsFor("post", "/api/governance-os/mappings/bulk"),
};

// ─── Advisor ─────────────────────────────────────────────────────────

// Note the asymmetry in what the advisor controller returns: the conversation
// CRUD handlers send a RAW body on success (`{ domain, conversations }`) but a
// STATUS_CODE-wrapped body on error. Only the error side is modelled here, and
// it is wrapped — matching Servers/controllers/advisor.ctrl.ts.
export const advisorErrors = {
  ...variantsFor("get", "/api/advisor/conversations/:domain"),
  createConversation: variantsFor("post", "/api/advisor/conversations/:domain"),
  conversation: variantsFor("get", "/api/advisor/conversations/:domain/:id"),
  updateConversation: variantsFor("put", "/api/advisor/conversations/:domain/:id"),
  deleteConversation: variantsFor("delete", "/api/advisor/conversations/:domain/:id"),
  roadmap: variantsFor("get", "/api/advisor/tools/roadmap"),
  memory: variantsFor("get", "/api/advisor/memory"),
  deleteMemory: variantsFor("delete", "/api/advisor/memory"),
};

// ─── Approval requests ───────────────────────────────────────────────

// The three list endpoints are separate paths rather than one path with a
// query param, so each needs its own override.
export const approvalRequestErrors = {
  ...variantsFor("get", "/api/approval-requests/my-requests"),
  pending: variantsFor("get", "/api/approval-requests/pending-approvals"),
  all: variantsFor("get", "/api/approval-requests/all"),
  byId: variantsFor("get", "/api/approval-requests/:id"),
  create: variantsFor("post", "/api/approval-requests"),
  approve: variantsFor("post", "/api/approval-requests/:id/approve"),
  reject: variantsFor("post", "/api/approval-requests/:id/reject"),
  withdraw: variantsFor("post", "/api/approval-requests/:id/withdraw"),
};

// ─── Automations ─────────────────────────────────────────────────────

// Update is PUT, not PATCH — the bulk-update comment above applies here too.
export const automationsErrors = {
  ...variantsFor("get", "/api/automations"),
  triggers: variantsFor("get", "/api/automations/triggers"),
  byId: variantsFor("get", "/api/automations/:id"),
  history: variantsFor("get", "/api/automations/:id/history"),
  stats: variantsFor("get", "/api/automations/:id/stats"),
  create: variantsFor("post", "/api/automations"),
  update: variantsFor("put", "/api/automations/:id"),
  remove: variantsFor("delete", "/api/automations/:id"),
};

// ─── File manager ────────────────────────────────────────────────────

// Upload and list share the "/api/file-manager" path and differ only by verb.
// Metadata update is PATCH.
export const fileManagerErrors = {
  ...variantsFor("get", "/api/file-manager"),
  upload: variantsFor("post", "/api/file-manager"),
  search: variantsFor("get", "/api/file-manager/search"),
  withMetadata: variantsFor("get", "/api/file-manager/with-metadata"),
  download: variantsFor("get", "/api/file-manager/:id"),
  remove: variantsFor("delete", "/api/file-manager/:id"),
  metadata: variantsFor("get", "/api/file-manager/:id/metadata"),
  updateMetadata: variantsFor("patch", "/api/file-manager/:id/metadata"),
  preview: variantsFor("get", "/api/file-manager/:id/preview"),
  versions: variantsFor("get", "/api/file-manager/:id/versions"),
};

// ─── AI Trust Centre ─────────────────────────────────────────────────

// Overview updates are PUT. The camelCase segment is the real route
// ("/api/aiTrustCentre"), not a typo for the kebab-case used elsewhere.
export const aiTrustCentreErrors = {
  ...variantsFor("get", "/api/aiTrustCentre/overview"),
  updateOverview: variantsFor("put", "/api/aiTrustCentre/overview"),
  resources: variantsFor("get", "/api/aiTrustCentre/resources"),
  createResource: variantsFor("post", "/api/aiTrustCentre/resources"),
  updateResource: variantsFor("put", "/api/aiTrustCentre/resources/:id"),
  deleteResource: variantsFor("delete", "/api/aiTrustCentre/resources/:id"),
  subprocessors: variantsFor("get", "/api/aiTrustCentre/subprocessors"),
  createSubprocessor: variantsFor("post", "/api/aiTrustCentre/subprocessors"),
  updateSubprocessor: variantsFor("put", "/api/aiTrustCentre/subprocessors/:id"),
  deleteSubprocessor: variantsFor("delete", "/api/aiTrustCentre/subprocessors/:id"),
  uploadLogo: variantsFor("post", "/api/aiTrustCentre/logo"),
  deleteLogo: variantsFor("delete", "/api/aiTrustCentre/logo"),
};

// ─── Post-market monitoring ──────────────────────────────────────────

// Config is addressed by projectId on read but configId on write, so the two
// are separate entries even though both render as "/api/pmm/config/:x".
export const postMarketMonitoringErrors = {
  ...variantsFor("get", "/api/pmm/config/:projectId"),
  createConfig: variantsFor("post", "/api/pmm/config"),
  updateConfig: variantsFor("put", "/api/pmm/config/:configId"),
  deleteConfig: variantsFor("delete", "/api/pmm/config/:configId"),
  questions: variantsFor("get", "/api/pmm/config/:configId/questions"),
  orgQuestions: variantsFor("get", "/api/pmm/org/questions"),
  addQuestion: variantsFor("post", "/api/pmm/config/:configId/questions"),
  updateQuestion: variantsFor("put", "/api/pmm/questions/:questionId"),
  deleteQuestion: variantsFor("delete", "/api/pmm/questions/:questionId"),
  activeCycle: variantsFor("get", "/api/pmm/active-cycle/:projectId"),
  responses: variantsFor("get", "/api/pmm/cycles/:cycleId/responses"),
  saveResponses: variantsFor("post", "/api/pmm/cycles/:cycleId/responses"),
  submitCycle: variantsFor("post", "/api/pmm/cycles/:cycleId/submit"),
  reports: variantsFor("get", "/api/pmm/reports"),
};
