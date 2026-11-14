/**
 * Maps the page the user is on to the user guide page that documents it, so
 * clicking the "User guide" tab opens on that page instead of wherever the
 * guide was left.
 *
 * A target is "collection/article" (the topic for that sidebar item) or just
 * "collection" (the module's guide page, used when no single topic fits).
 * Rules are checked in order, so more specific prefixes come first.
 */

export interface GuideTarget {
  collectionId: string;
  articleId?: string;
}

interface GuideRouteRule {
  /** Pathname prefix, matched on whole segments ("/evals" matches "/evals/12", not "/evalsx"). */
  prefix?: string;
  /** For paths with an id in the middle, which a prefix can't express. */
  pattern?: RegExp;
  /** Guide page for a matching path. */
  target: string;
  /** Targets keyed by URL hash, for modules that switch sections by hash (LLM Evals). */
  byHash?: Record<string, string>;
}

const LLM_EVALS_BY_HASH: Record<string, string> = {
  "overview": "llm-evals/llm-evals-overview",
  "experiments": "llm-evals/running-experiments",
  "datasets": "llm-evals/managing-datasets",
  "scorers": "llm-evals/configuring-scorers",
  "bias-audits": "llm-evals/bias-audits",
  "models": "llm-evals/models",
  "arena": "llm-evals/llm-arena",
  "playground": "llm-evals/playground",
  "reports": "llm-evals/reports",
  "settings": "llm-evals/settings",
  // Legacy deep link; the dashboard redirects it to Settings
  "configuration": "llm-evals/settings",
};

export const GUIDE_ROUTE_RULES: GuideRouteRule[] = [
  // LLM Evals
  { prefix: "/evals/settings", target: "llm-evals/settings" },
  { pattern: /^\/evals\/[^/]+\/datasets(\/|$)/, target: "llm-evals/managing-datasets" },
  { prefix: "/evals", target: "llm-evals", byHash: LLM_EVALS_BY_HASH },

  // AI Detection
  { prefix: "/ai-detection/scan", target: "ai-detection/scanning" },
  { prefix: "/ai-detection/scans", target: "ai-detection/scanning" },
  { prefix: "/ai-detection/history", target: "ai-detection/history" },
  { prefix: "/ai-detection/repositories", target: "ai-detection/repositories" },
  { prefix: "/ai-detection/settings", target: "ai-detection/settings" },
  { prefix: "/ai-detection", target: "ai-detection" },

  // Shadow AI
  { prefix: "/shadow-ai/insights", target: "shadow-ai/insights" },
  { prefix: "/shadow-ai/tools", target: "shadow-ai/ai-tools" },
  { prefix: "/shadow-ai/user-activity", target: "shadow-ai/user-activity" },
  { prefix: "/shadow-ai/rules", target: "shadow-ai/rules" },
  { prefix: "/shadow-ai/settings", target: "shadow-ai/settings" },
  { prefix: "/shadow-ai", target: "shadow-ai" },

  // AI Gateway
  { prefix: "/ai-gateway/dashboard", target: "ai-gateway/analytics" },
  { prefix: "/ai-gateway/endpoints", target: "ai-gateway/endpoints" },
  { prefix: "/ai-gateway/playground", target: "ai-gateway/playground" },
  { prefix: "/ai-gateway/guardrails", target: "ai-gateway/guardrails" },
  { prefix: "/ai-gateway/settings", target: "ai-gateway/settings" },
  { prefix: "/ai-gateway/virtual-keys", target: "ai-gateway/virtual-keys" },
  { prefix: "/ai-gateway/logs", target: "ai-gateway/logs" },
  { prefix: "/ai-gateway/models", target: "ai-gateway/models" },
  { prefix: "/ai-gateway/mcp/servers", target: "ai-gateway/mcp-servers" },
  { prefix: "/ai-gateway/mcp/tools", target: "ai-gateway/mcp-tools" },
  { prefix: "/ai-gateway/mcp/agent-keys", target: "ai-gateway/mcp-agent-keys" },
  { prefix: "/ai-gateway/mcp/audit", target: "ai-gateway/mcp-audit" },
  { prefix: "/ai-gateway/mcp/runs", target: "ai-gateway/mcp-runs" },
  { prefix: "/ai-gateway/mcp/approvals", target: "ai-gateway/mcp-approvals" },
  { prefix: "/ai-gateway/mcp/guardrails", target: "ai-gateway/mcp-guardrails" },
  { prefix: "/ai-gateway/mcp", target: "ai-gateway/mcp-overview" },
  { prefix: "/ai-gateway", target: "ai-gateway" },

  // AI Trust Index
  { prefix: "/ai-trust-index/browse", target: "ai-trust-index/browse" },
  { prefix: "/ai-trust-index/tracked", target: "ai-trust-index/tracked" },
  { prefix: "/ai-trust-index/settings", target: "ai-trust-index/settings" },
  { prefix: "/ai-trust-index", target: "ai-trust-index" },

  // Governance
  { prefix: "/home", target: "getting-started/home" },
  { prefix: "/start-here", target: "getting-started/quick-start" },
  { prefix: "/overview", target: "ai-governance/use-cases" },
  { prefix: "/project-view", target: "ai-governance/use-cases" },
  { prefix: "/intake-forms", target: "ai-governance/intake-forms" },
  { prefix: "/model-inventory/model-risk-management", target: "ai-governance/mrm" },
  { prefix: "/model-inventory/evidence-hub", target: "ai-governance/evidence-collection" },
  { prefix: "/model-inventory", target: "ai-governance/model-inventory" },
  { prefix: "/ai-apps", target: "ai-governance/ai-apps" },
  { prefix: "/agent-discovery", target: "ai-governance/agent-discovery" },
  { prefix: "/tasks", target: "ai-governance/task-management" },
  { prefix: "/ai-incident-managements", target: "ai-governance/incident-management" },
  { prefix: "/file-manager", target: "ai-governance/evidence-collection" },
  { prefix: "/ai-trust-center", target: "ai-governance/ai-trust-center" },
  { prefix: "/datasets", target: "ai-governance/datasets" },
  { prefix: "/approval-workflows", target: "ai-governance/approval-workflows" },
  { prefix: "/risk-management", target: "risk-management/risk-assessment" },
  { prefix: "/vendors/risks", target: "risk-management/vendor-risks" },
  { prefix: "/vendors", target: "risk-management/vendor-management" },
  { prefix: "/framework", target: "compliance/assessments" },
  { prefix: "/projects", target: "compliance/assessments" },
  { prefix: "/monitoring", target: "compliance/post-market-monitoring" },
  { prefix: "/policies", target: "policies/policy-management" },
  { prefix: "/training/evidence-hub", target: "ai-governance/evidence-collection" },
  { prefix: "/training", target: "training/training-tracking" },
  { prefix: "/reporting", target: "reporting/generating-reports" },
  { prefix: "/automations", target: "integrations/automations" },
  { prefix: "/extensions", target: "integrations/extensions" },

  // Settings
  { prefix: "/settings/organization", target: "settings/organization-settings" },
  { prefix: "/settings/team", target: "settings/user-management" },
  { prefix: "/settings/roles", target: "settings/role-configuration" },
  { prefix: "/settings/groups", target: "settings/user-groups" },
  { prefix: "/settings/apikeys", target: "integrations/api-access" },
  { prefix: "/settings", target: "settings" },
  { prefix: "/super-admin", target: "settings/super-admin" },
];

const matches = (pathname: string, rule: GuideRouteRule): boolean => {
  if (rule.pattern) return rule.pattern.test(pathname);
  const { prefix } = rule;
  return !!prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`));
};

const toTarget = (value: string): GuideTarget => {
  const [collectionId, articleId] = value.split("/");
  return articleId ? { collectionId, articleId } : { collectionId };
};

/**
 * Returns the guide page for a location, or undefined when no page documents
 * it (the guide then keeps whatever it last showed).
 */
export function getGuideTargetForLocation(pathname: string, hash = ""): GuideTarget | undefined {
  // The dashboard is "/" exactly; a prefix match would swallow every route.
  if (pathname === "/") return toTarget("getting-started/dashboard");

  const rule = GUIDE_ROUTE_RULES.find((r) => matches(pathname, r));
  if (!rule) return undefined;

  const section = hash.replace(/^#/, "");
  const target = (section && rule.byHash?.[section]) || rule.target;
  return toTarget(target);
}
