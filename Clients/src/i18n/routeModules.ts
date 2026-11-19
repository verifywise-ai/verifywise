/**
 * Pathname → i18n module ids for route-scoped dictionary loading.
 *
 * `common` and `changeNotice` always load with every non-English language.
 * Area modules load when the path matches a rule below (longest prefix wins).
 * English needs no dictionary chunks.
 */

export const I18N_MODULE_IDS = [
  "agentDiscovery",
  "aiApps",
  "aiAppsBulk",
  "aiAudit",
  "aiContentReview",
  "aiDetection",
  "aiGateway",
  "aiObservability",
  "aiTrustCenter",
  "aiTrustIndex",
  "approvals",
  "authentication",
  "automations",
  "changeNotice",
  "common",
  "dashboard",
  "datasets",
  "evals",
  "eventTracker",
  "evidence",
  "frameworks",
  "governance",
  "homeQueue",
  "incidents",
  "intakeLiveChecks",
  "intakeLogic",
  "intakePreview",
  "mcpServers",
  "modelInventory",
  "policies",
  "reporting",
  "riskManagement",
  "settings",
  "shadowAi",
  "startHere",
  "superAdmin",
  "tasks",
  "training",
  "useCaseLifecycle",
  "useCases",
  "vendors",
] as const;

export type I18nModuleId = (typeof I18N_MODULE_IDS)[number];

/** Loaded on every authenticated (and public) non-English screen. */
export const BASELINE_I18N_MODULES: readonly I18nModuleId[] = ["common", "changeNotice"];

/**
 * Longest-prefix rules. Order does not matter; matching picks the longest
 * matching prefix (or the first matching regex).
 */
const PREFIX_RULES: ReadonlyArray<{ prefix: string; modules: readonly I18nModuleId[] }> = [
  { prefix: "/ai-gateway/mcp", modules: ["aiGateway", "mcpServers"] },
  { prefix: "/ai-gateway", modules: ["aiGateway"] },
  { prefix: "/shadow-ai", modules: ["shadowAi"] },
  { prefix: "/ai-detection", modules: ["aiDetection"] },
  { prefix: "/ai-trust-index", modules: ["aiTrustIndex"] },
  { prefix: "/ai-trust-center", modules: ["aiTrustCenter"] },
  { prefix: "/aiTrustCentre", modules: ["aiTrustCenter"] },
  { prefix: "/ai-observability", modules: ["aiObservability"] },
  { prefix: "/ai-audit", modules: ["aiAudit"] },
  { prefix: "/ai-apps/assessments", modules: ["aiApps", "aiAppsBulk"] },
  { prefix: "/ai-apps", modules: ["aiApps", "aiAppsBulk"] },
  { prefix: "/agent-discovery", modules: ["agentDiscovery"] },
  { prefix: "/model-inventory", modules: ["modelInventory"] },
  { prefix: "/datasets", modules: ["datasets"] },
  { prefix: "/risk-management", modules: ["riskManagement"] },
  { prefix: "/risk-inheritance", modules: ["riskManagement"] },
  { prefix: "/vendors", modules: ["vendors"] },
  { prefix: "/policies", modules: ["policies"] },
  { prefix: "/file-manager", modules: ["evidence"] },
  { prefix: "/reporting", modules: ["reporting"] },
  { prefix: "/training", modules: ["training"] },
  { prefix: "/tasks", modules: ["tasks"] },
  { prefix: "/automations", modules: ["automations"] },
  { prefix: "/approval-workflows", modules: ["approvals"] },
  { prefix: "/ai-incident-managements", modules: ["incidents"] },
  { prefix: "/event-tracker", modules: ["eventTracker"] },
  { prefix: "/evals", modules: ["evals"] },
  { prefix: "/framework", modules: ["frameworks"] },
  { prefix: "/projects/", modules: ["frameworks", "useCases"] },
  { prefix: "/governance", modules: ["governance"] },
  { prefix: "/governance-os", modules: ["governance"] },
  { prefix: "/project-view", modules: ["useCases", "useCaseLifecycle"] },
  { prefix: "/monitoring", modules: ["useCases"] },
  {
    prefix: "/intake-forms",
    modules: ["useCases", "intakeLiveChecks", "intakeLogic", "intakePreview"],
  },
  { prefix: "/intake/", modules: ["useCases", "intakeLiveChecks", "intakeLogic", "intakePreview"] },
  { prefix: "/settings", modules: ["settings"] },
  { prefix: "/organization", modules: ["settings"] },
  { prefix: "/extensions", modules: ["settings"] },
  { prefix: "/super-admin", modules: ["superAdmin"] },
  { prefix: "/start-here", modules: ["startHere", "homeQueue"] },
  { prefix: "/home", modules: ["homeQueue", "startHere", "dashboard"] },
  { prefix: "/overview", modules: ["dashboard"] },
  { prefix: "/login", modules: ["authentication"] },
  { prefix: "/forgot-password", modules: ["authentication"] },
  { prefix: "/reset-password", modules: ["authentication"] },
  { prefix: "/set-new-password", modules: ["authentication"] },
  { prefix: "/reset-password-continue", modules: ["authentication"] },
  { prefix: "/user-reg", modules: ["authentication"] },
  { prefix: "/join", modules: ["authentication"] },
  { prefix: "/auth/", modules: ["authentication"] },
  { prefix: "/shared/", modules: ["useCases", "policies"] },
];

const PUBLIC_INTAKE_SUFFIX = /\/use-case-form-intake(\/success)?$/;

function modulesForPrefix(pathname: string): readonly I18nModuleId[] {
  let best: { prefix: string; modules: readonly I18nModuleId[] } | null = null;
  for (const rule of PREFIX_RULES) {
    if (!pathname.startsWith(rule.prefix)) continue;
    if (!best || rule.prefix.length > best.prefix.length) best = rule;
  }
  return best?.modules ?? [];
}

/**
 * Dictionary modules needed for `pathname`, including the baseline set.
 * Deduplicated; order is baseline first, then area modules.
 */
export function modulesForPath(pathname: string): I18nModuleId[] {
  const path = pathname.split("?")[0] || "/";
  const area: I18nModuleId[] = [];

  if (path === "/" || path === "") {
    area.push("dashboard", "homeQueue", "startHere");
  } else if (PUBLIC_INTAKE_SUFFIX.test(path)) {
    area.push("useCases", "intakeLiveChecks", "intakeLogic", "intakePreview");
  } else {
    area.push(...modulesForPrefix(path));
  }

  const seen = new Set<I18nModuleId>();
  const out: I18nModuleId[] = [];
  for (const name of [...BASELINE_I18N_MODULES, ...area]) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
