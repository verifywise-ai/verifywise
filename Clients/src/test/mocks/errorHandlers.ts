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
