/**
 * Unified sidebar (phase 2): every entry, its route, gate and count, as data.
 *
 * The item map in docs/plans/2026-11-13-phase2-sidebar.md is binding: labels,
 * routes, groups and gates here copy it and today's navigation. Labels are
 * English source strings; the DOM translator renders them in de/fr/es.
 * navConfig.test.ts checks that every entry of today's navigation is here or
 * in KEPT_ELSEWHERE.
 */
import type { KeptElsewhere, NavActive, NavGroup, NavItem, NavSubItem } from "./types";

const EVALS_ITEM_ID = "llm-evals";

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "automate",
    items: [
      { id: "home", label: "Home", icon: "home", path: "/start-here" },
      { id: "dashboard", label: "Dashboard", icon: "dashboard", path: "/" },
      {
        id: "workflows",
        label: "Workflows",
        icon: "automation",
        children: [
          { id: "automations", label: "Automations", path: "/automations" },
          {
            id: "approval-workflows",
            label: "Approval workflows",
            path: "/approval-workflows",
            gate: { permission: "approvalWorkflow.admin" },
          },
        ],
      },
      {
        id: "incidents",
        label: "Incidents",
        icon: "incident-management",
        path: "/ai-incident-managements",
      },
      { id: "tasks", label: "Tasks", icon: "tasks", path: "/tasks", countKey: "openTasks" },
    ],
  },
  {
    id: "record",
    heading: "Record",
    items: [
      {
        id: "inventory",
        label: "Inventory",
        icon: "inventory",
        children: [
          {
            id: "use-cases",
            label: "Use cases",
            path: "/overview",
            matchPrefixes: ["/project-view"],
          },
          { id: "models", label: "Models", path: "/model-inventory" },
          { id: "ai-apps", label: "AI apps", path: "/ai-apps" },
          { id: "agents", label: "Agents", path: "/agent-discovery" },
          { id: "datasets", label: "Datasets", path: "/datasets" },
          {
            id: "ati-browse",
            label: "Browse",
            path: "/ai-trust-index/browse",
            section: "AI Trust Index",
            // Model detail pages (/ai-trust-index/:slug) belong to Browse, as today.
            matchPrefixes: ["/ai-trust-index"],
          },
          {
            id: "ati-tracked",
            label: "Tracked",
            path: "/ai-trust-index/tracked",
            section: "AI Trust Index",
            countKey: "aiTrustIndexTracked",
          },
          {
            id: "ati-settings",
            label: "Trust Index settings",
            path: "/ai-trust-index/settings",
            section: "AI Trust Index",
            gate: { role: "Admin" },
          },
        ],
      },
      {
        id: "ai-detection",
        label: "AI Detection",
        icon: "ai-detection",
        extras: ["recentScans", "recentTools"],
        children: [
          {
            id: "insights",
            label: "Insights",
            path: "/shadow-ai/insights",
            section: "Shadow AI",
            matchPrefixes: ["/shadow-ai"],
          },
          {
            id: "user-activity",
            label: "User activity",
            path: "/shadow-ai/user-activity/users",
            section: "Shadow AI",
            matchPrefixes: ["/shadow-ai/user-activity"],
          },
          {
            id: "ai-tools",
            label: "AI tools",
            path: "/shadow-ai/tools",
            section: "Shadow AI",
            countKey: "shadowAiTools",
          },
          {
            id: "rules",
            label: "Rules & alerts",
            path: "/shadow-ai/rules",
            section: "Shadow AI",
            countKey: "shadowAiAlerts",
          },
          {
            id: "shadow-ai-settings",
            label: "Shadow AI settings",
            path: "/shadow-ai/settings",
            section: "Shadow AI",
          },
          {
            id: "scan",
            label: "Scan",
            path: "/ai-detection/scan",
            section: "Code",
            matchPrefixes: ["/ai-detection"],
          },
          {
            id: "repositories",
            label: "Repositories",
            path: "/ai-detection/repositories",
            section: "Code",
            countKey: "aiDetectionRepositories",
          },
          {
            id: "scan-results",
            label: "Scan results",
            path: "/ai-detection/history",
            section: "Code",
            countKey: "aiDetectionHistory",
            matchPrefixes: ["/ai-detection/scans"],
          },
          {
            id: "scan-settings",
            label: "Scan settings",
            path: "/ai-detection/settings",
            section: "Code",
          },
        ],
      },
      {
        id: "evidence-reports",
        label: "Evidence & reports",
        icon: "evidence-management",
        children: [
          { id: "evidence", label: "Evidence", path: "/file-manager" },
          { id: "reporting", label: "Reporting", path: "/reporting" },
          { id: "ai-trust-center", label: "AI trust center", path: "/ai-trust-center" },
        ],
      },
      {
        id: "intake",
        label: "Intake",
        icon: "intake",
        path: "/intake-forms",
        // Today's top-bar link checks the role name: Editors may open the
        // routes too (intakeForm.edit), and no Admin-only key covers it.
        gate: { role: "Admin" },
      },
    ],
  },
  {
    id: "track",
    heading: "Track",
    items: [
      { id: "ai-risks", label: "AI risks", icon: "risk-management", path: "/risk-management" },
      { id: "vendors", label: "Vendors", icon: "vendor-management", path: "/vendors" },
      { id: "frameworks", label: "Frameworks", icon: "compliance-frameworks", path: "/framework" },
    ],
  },
  {
    id: "enforce",
    heading: "Enforce",
    items: [
      {
        id: "policy",
        label: "Policy",
        icon: "policies",
        children: [
          { id: "policy-manager", label: "Policy manager", path: "/policies" },
          { id: "training-registry", label: "Training registry", path: "/training" },
        ],
      },
      {
        id: EVALS_ITEM_ID,
        label: "LLM Evals",
        icon: "llm-evaluations",
        extras: ["evalsProjectSelector", "evalsRecentExperiments", "evalsRecentProjects"],
        children: [
          { id: "overview", label: "Overview", path: "/evals#overview" },
          {
            id: "experiments",
            label: "Experiments",
            path: "/evals#experiments",
            countKey: "evalsExperiments",
            requiresEvalsProject: true,
          },
          {
            id: "datasets",
            label: "Datasets",
            path: "/evals#datasets",
            countKey: "evalsDatasets",
          },
          { id: "scorers", label: "Scorers", path: "/evals#scorers", countKey: "evalsScorers" },
          { id: "models", label: "Models", path: "/evals#models", countKey: "evalsModels" },
          { id: "bias-audits", label: "Bias audits", path: "/evals#bias-audits" },
          { id: "playground", label: "Playground", path: "/evals#playground" },
          {
            id: "arena",
            label: "Arena",
            path: "/evals#arena",
            countKey: "evalsArena",
            gate: { evalsArena: true },
          },
          {
            id: "reports",
            label: "Reports",
            path: "/evals#reports",
            requiresEvalsProject: true,
          },
          { id: "settings", label: "Settings", path: "/evals#settings" },
        ],
      },
      {
        id: "ai-gateway",
        label: "AI Gateway",
        icon: "ai-gateway",
        children: [
          {
            id: "dashboard",
            label: "Dashboard",
            path: "/ai-gateway/dashboard",
            matchPrefixes: ["/ai-gateway"],
          },
          {
            id: "endpoints",
            label: "Endpoints",
            path: "/ai-gateway/endpoints",
            countKey: "aiGatewayEndpoints",
          },
          { id: "playground", label: "Playground", path: "/ai-gateway/playground" },
          { id: "guardrails", label: "Guardrails", path: "/ai-gateway/guardrails" },
          {
            id: "prompts",
            label: "Prompts",
            path: "/ai-gateway/prompts",
            countKey: "aiGatewayPrompts",
            gate: { flag: "SHOW_AI_GATEWAY_PROMPTS" },
          },
          { id: "models", label: "Models", path: "/ai-gateway/models" },
          { id: "logs", label: "Logs", path: "/ai-gateway/logs" },
          {
            id: "settings",
            label: "Settings",
            path: "/ai-gateway/settings",
            // The virtual keys page has no item of its own; Settings embeds it as a tab.
            matchPrefixes: ["/ai-gateway/virtual-keys"],
          },
        ],
      },
      {
        id: "agent-controls",
        label: "Agent controls",
        icon: "agent-control",
        // Owns /ai-gateway/mcp/*: the longer prefix wins over AI Gateway's.
        matchPrefixes: ["/ai-gateway/mcp"],
        children: [
          { id: "runs", label: "Runs", path: "/ai-gateway/mcp/runs" },
          { id: "activity", label: "Activity", path: "/ai-gateway/mcp/audit" },
          { id: "approvals", label: "Approvals", path: "/ai-gateway/mcp/approvals" },
          { id: "guardrails", label: "Guardrails", path: "/ai-gateway/mcp/guardrails" },
          { id: "agent-keys", label: "Agent keys", path: "/ai-gateway/mcp/agent-keys" },
          { id: "mcp-servers", label: "MCP servers", path: "/ai-gateway/mcp/servers" },
          { id: "mcp-tools", label: "MCP tools", path: "/ai-gateway/mcp/tools" },
        ],
      },
    ],
  },
  {
    id: "workspace",
    heading: "Workspace",
    items: [
      {
        id: "settings",
        label: "Settings",
        icon: "settings",
        children: [
          { id: "settings", label: "Settings", path: "/settings" },
          { id: "event-tracker", label: "Event tracker", path: "/event-tracker" },
          {
            id: "extensions",
            label: "Extensions",
            path: "/extensions",
            gate: {
              permission: "extension.admin",
              whenDenied: "disable",
              deniedTooltip: "Admin access required.",
            },
          },
          {
            id: "super-admin",
            label: "Super admin",
            path: "/super-admin",
            gate: { superAdmin: true },
          },
        ],
      },
    ],
  },
];

/** Routes from today's navigation that stay where they are, with the reason. */
export const KEPT_ELSEWHERE: readonly KeptElsewhere[] = [
  {
    path: "/evals/settings",
    reason:
      "Evals organization settings route, reached from the Arena page as today; the LLM Evals Settings sub-item opens the #settings tab.",
  },
  {
    path: "/super-admin/users",
    reason:
      "Super admin has its own layout (SuperAdminLayout + SuperAdminSidebar); the Super admin entry opens it and Users stays in that sidebar.",
  },
  {
    path: "/super-admin/settings",
    reason:
      "Super admin settings stay in the SuperAdminLayout sidebar footer, which the Super admin entry opens.",
  },
];

/** Path part of a nav path: `/evals#arena` → `/evals`. */
const routeOf = (path: string): string => path.split("#")[0];

/** True when `pathname` is `prefix` or below it. `/` matches only itself. */
const isUnder = (pathname: string, prefix: string): boolean =>
  prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Length of the longest prefix that `pathname` is under, or -1. */
const bestMatch = (pathname: string, prefixes: readonly string[]): number =>
  prefixes.reduce((best, p) => (isUnder(pathname, p) ? Math.max(best, p.length) : best), -1);

const subPrefixes = (sub: NavSubItem): string[] => [
  routeOf(sub.path),
  ...(sub.matchPrefixes ?? []),
];

const itemPrefixes = (item: NavItem): string[] => [
  ...(item.path ? [item.path] : []),
  ...(item.matchPrefixes ?? []),
  ...(item.children ?? []).flatMap(subPrefixes),
];

/**
 * LLM Evals navigates by hash (`/evals#<tab>`, `/evals/<projectId>#<tab>`).
 * Without a known tab, routes under a project point at the tab they came from;
 * anything else is Overview, as today.
 */
const resolveEvalsTab = (item: NavItem, pathname: string, hash: string): string => {
  const tab = hash.replace(/^#/, "").split(/[?/&]/)[0];
  if (item.children?.some((s) => s.id === tab)) return tab;
  if (pathname === "/evals/settings") return "settings";
  if (/^\/evals\/[^/]+\/experiment(\/|$)/.test(pathname)) return "experiments";
  if (/^\/evals\/[^/]+\/datasets(\/|$)/.test(pathname)) return "datasets";
  return "overview";
};

/**
 * Which item, and which of its sub-items, the current route belongs to.
 * The longest matching route prefix wins, so `/ai-gateway/mcp/*` lands on
 * Agent controls rather than AI Gateway. Returns null for routes that are not
 * in the sidebar (they were not in today's navigation either).
 */
export function resolveActive(pathname: string, hash: string): NavActive | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  let found: NavItem | null = null;
  let foundScore = -1;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const score = bestMatch(path, itemPrefixes(item));
      if (score > foundScore) {
        found = item;
        foundScore = score;
      }
    }
  }
  if (!found) return null;

  if (found.id === EVALS_ITEM_ID) {
    return { itemId: found.id, subId: resolveEvalsTab(found, path, hash) };
  }

  let subId: string | undefined;
  let subScore = -1;
  for (const sub of found.children ?? []) {
    const score = bestMatch(path, subPrefixes(sub));
    if (score > subScore) {
      subId = sub.id;
      subScore = score;
    }
  }
  return subId === undefined ? { itemId: found.id } : { itemId: found.id, subId };
}
