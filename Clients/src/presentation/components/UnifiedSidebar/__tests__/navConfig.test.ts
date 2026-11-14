import { describe, expect, it } from "vitest";
import { KEPT_ELSEWHERE, NAV_GROUPS, evalsDashboardRoute, resolveActive } from "../navConfig";
import type { NavItem, NavSubItem } from "../types";
import { navGroupColor } from "../../../themes/palette";

/**
 * Every navigation entry that exists today (phase 2 nav inventory §1–§3),
 * with where it comes from. Nothing may be lost: each path must be in
 * NAV_GROUPS or in KEPT_ELSEWHERE.
 */
const TODAY_NAV_PATHS: ReadonlyArray<{ path: string; source: string }> = [
  // §1 Main sidebar (17)
  { path: "/start-here", source: "Sidebar: Start here (Home claims it; it redirects to /home)" },
  { path: "/", source: "Sidebar: Dashboard" },
  { path: "/tasks", source: "Sidebar: Tasks" },
  { path: "/framework", source: "Sidebar: Frameworks" },
  { path: "/overview", source: "Sidebar: Use cases" },
  { path: "/model-inventory", source: "Sidebar: Model inventory" },
  { path: "/ai-apps", source: "Sidebar: AI apps" },
  { path: "/datasets", source: "Sidebar: Datasets" },
  { path: "/agent-discovery", source: "Sidebar: AI agents" },
  { path: "/risk-management", source: "Sidebar: Risk management" },
  { path: "/training", source: "Sidebar: Training registry" },
  { path: "/file-manager", source: "Sidebar: Evidence" },
  { path: "/reporting", source: "Sidebar: Reporting" },
  { path: "/ai-trust-center", source: "Sidebar: AI trust center" },
  { path: "/vendors", source: "Sidebar: Vendors" },
  { path: "/policies", source: "Sidebar: Policy manager" },
  { path: "/ai-incident-managements", source: "Sidebar: Incident management" },
  // §1b Footer Management (and the super admin variant)
  { path: "/event-tracker", source: "Footer: Event Tracker" },
  { path: "/settings", source: "Footer: Settings" },
  { path: "/super-admin/settings", source: "Footer (super admin): Settings" },
  // §2 App switcher landings
  { path: "/evals#overview", source: "Switcher: LLM Evals (/evals opens Overview)" },
  { path: "/ai-gateway/dashboard", source: "Switcher: AI Gateway" },
  { path: "/ai-trust-index/browse", source: "Switcher: AI Trust Index" },
  { path: "/shadow-ai/insights", source: "Switcher: Shadow AI" },
  { path: "/ai-detection/scan", source: "Switcher: AI Detection" },
  { path: "/super-admin", source: "Switcher: Super Admin" },
  // §3a LLM Evals (hash navigation)
  { path: "/evals#overview", source: "Evals: Overview" },
  { path: "/evals#experiments", source: "Evals: Experiments" },
  { path: "/evals#datasets", source: "Evals: Datasets" },
  { path: "/evals#scorers", source: "Evals: Scorers" },
  { path: "/evals#models", source: "Evals: Models" },
  { path: "/evals#bias-audits", source: "Evals: Bias audits" },
  { path: "/evals#playground", source: "Evals: Playground" },
  { path: "/evals#arena", source: "Evals: Arena" },
  { path: "/evals#reports", source: "Evals: Reports" },
  { path: "/evals#settings", source: "Evals: Settings" },
  { path: "/evals/settings", source: "Evals: organization settings route (from Arena)" },
  // §3b AI Detection
  { path: "/ai-detection/scan", source: "AI Detection: Scan" },
  { path: "/ai-detection/repositories", source: "AI Detection: Repositories" },
  { path: "/ai-detection/history", source: "AI Detection: Scan results" },
  { path: "/ai-detection/settings", source: "AI Detection: Settings" },
  // §3c Shadow AI
  { path: "/shadow-ai/insights", source: "Shadow AI: Insights" },
  { path: "/shadow-ai/user-activity/users", source: "Shadow AI: User activity" },
  { path: "/shadow-ai/tools", source: "Shadow AI: AI tools" },
  { path: "/shadow-ai/rules", source: "Shadow AI: Rules & alerts" },
  { path: "/shadow-ai/settings", source: "Shadow AI: Settings" },
  // §3d AI Gateway
  { path: "/ai-gateway/dashboard", source: "AI Gateway: Dashboard" },
  { path: "/ai-gateway/endpoints", source: "AI Gateway: Endpoints" },
  { path: "/ai-gateway/playground", source: "AI Gateway: Playground" },
  { path: "/ai-gateway/guardrails", source: "AI Gateway: Guardrails" },
  { path: "/ai-gateway/prompts", source: "AI Gateway: Prompts (flag-hidden)" },
  { path: "/ai-gateway/models", source: "AI Gateway: Models" },
  { path: "/ai-gateway/logs", source: "AI Gateway: Logs" },
  { path: "/ai-gateway/settings", source: "AI Gateway: Settings" },
  { path: "/ai-gateway/virtual-keys", source: "AI Gateway: virtual keys route (Settings tab)" },
  { path: "/ai-gateway/mcp/runs", source: "Agent Control: Runs" },
  { path: "/ai-gateway/mcp/audit", source: "Agent Control: Activity" },
  { path: "/ai-gateway/mcp/approvals", source: "Agent Control: Approvals" },
  { path: "/ai-gateway/mcp/guardrails", source: "Agent Control: Guardrails" },
  { path: "/ai-gateway/mcp/agent-keys", source: "Agent Control: Agent keys" },
  { path: "/ai-gateway/mcp/servers", source: "Agent Control: MCP servers" },
  { path: "/ai-gateway/mcp/tools", source: "Agent Control: MCP tools" },
  // §3e AI Trust Index
  { path: "/ai-trust-index/browse", source: "AI Trust Index: Browse" },
  { path: "/ai-trust-index/tracked", source: "AI Trust Index: Tracked" },
  { path: "/ai-trust-index/settings", source: "AI Trust Index: Settings (Admin)" },
  // §3f Super Admin
  { path: "/super-admin", source: "Super Admin: Organizations" },
  { path: "/super-admin/users", source: "Super Admin: Users" },
  { path: "/super-admin/settings", source: "Super Admin: footer Settings" },
];

const allItems = (): NavItem[] => NAV_GROUPS.flatMap((g) => g.items);
const findItem = (id: string): NavItem => {
  const item = allItems().find((i) => i.id === id);
  if (!item) throw new Error(`No nav item ${id}`);
  return item;
};
const findSub = (itemId: string, subId: string): NavSubItem => {
  const sub = findItem(itemId).children?.find((s) => s.id === subId);
  if (!sub) throw new Error(`No sub-item ${itemId}/${subId}`);
  return sub;
};
const navPaths = (): Set<string> =>
  new Set(
    allItems().flatMap((item) => [
      ...(item.path ? [item.path] : []),
      ...(item.children ?? []).map((s) => s.path),
    ]),
  );

/** Routes with no entry of their own that an item or sub-item explicitly claims (matchPrefixes). */
const claimedPaths = (): Set<string> =>
  new Set(
    allItems().flatMap((item) => [
      ...(item.matchPrefixes ?? []),
      ...(item.children ?? []).flatMap((s) => s.matchPrefixes ?? []),
    ]),
  );

describe("NAV_GROUPS: nothing lost", () => {
  it.each(TODAY_NAV_PATHS)("$path ($source) is in the sidebar or kept elsewhere", ({ path }) => {
    const kept = KEPT_ELSEWHERE.some((k) => k.path === path);
    expect(navPaths().has(path) || claimedPaths().has(path) || kept).toBe(true);
  });

  it("gives a reason for every path kept elsewhere", () => {
    for (const entry of KEPT_ELSEWHERE) {
      expect(entry.reason.trim().length).toBeGreaterThan(10);
      expect(navPaths().has(entry.path)).toBe(false);
    }
  });

  it("keeps the Evals project selector and recents, and the detection recents", () => {
    expect(findItem("llm-evals").extras).toEqual([
      "evalsProjectSelector",
      "evalsRecentExperiments",
      "evalsRecentProjects",
    ]);
    expect(findItem("ai-detection").extras).toEqual(["recentScans", "recentTools"]);
  });

  it("has a heading and icon colour for every group", () => {
    for (const group of NAV_GROUPS) {
      expect(navGroupColor[group.id].heading).toBeTruthy();
      expect(navGroupColor[group.id].icon).toBeTruthy();
    }
  });

  it("has unique item ids and unique sub-item ids within each item", () => {
    const ids = allItems().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of allItems()) {
      const subIds = (item.children ?? []).map((s) => s.id);
      expect(new Set(subIds).size).toBe(subIds.length);
    }
  });
});

describe("NAV_GROUPS: item map", () => {
  it("groups and labels match the binding item map", () => {
    expect(
      NAV_GROUPS.map((g) => ({ id: g.id, heading: g.heading, items: g.items.map((i) => i.label) })),
    ).toEqual([
      {
        id: "automate",
        heading: undefined,
        items: ["Home", "Dashboard", "Workflows", "Incidents", "Tasks"],
      },
      {
        id: "record",
        heading: "Record",
        items: ["Inventory", "AI Trust Index", "AI Detection", "Evidence & reports", "Intake"],
      },
      { id: "track", heading: "Track", items: ["AI risks", "Vendors", "Frameworks"] },
      {
        id: "enforce",
        heading: "Enforce",
        items: ["Policy", "LLM Evals", "AI Gateway", "Agent controls"],
      },
      { id: "workspace", heading: "Workspace", items: ["Settings"] },
    ]);
  });

  it("sub-items match the item map", () => {
    const subs = (id: string) =>
      (findItem(id).children ?? []).map((s) =>
        s.section ? `${s.section}: ${s.label} ${s.path}` : `${s.label} ${s.path}`,
      );
    expect(findItem("home").path).toBe("/home");
    expect(findItem("home").matchPrefixes).toContain("/start-here");
    expect(findItem("dashboard").path).toBe("/");
    expect(findItem("incidents").path).toBe("/ai-incident-managements");
    expect(findItem("tasks").path).toBe("/tasks");
    expect(findItem("intake").path).toBe("/intake-forms");
    expect(findItem("ai-risks").path).toBe("/risk-management");
    expect(findItem("vendors").path).toBe("/vendors");
    expect(findItem("frameworks").path).toBe("/framework");
    expect(subs("workflows")).toEqual([
      "Automations /automations",
      "Approval workflows /approval-workflows",
    ]);
    expect(subs("inventory")).toEqual([
      "Use cases /overview",
      "Models /model-inventory",
      "AI apps /ai-apps",
      "Agents /agent-discovery",
      "Datasets /datasets",
    ]);
    expect(subs("ai-trust-index")).toEqual([
      "Browse /ai-trust-index/browse",
      "Tracked /ai-trust-index/tracked",
      "Trust Index settings /ai-trust-index/settings",
    ]);
    expect(subs("ai-detection")).toEqual([
      "Shadow AI: Insights /shadow-ai/insights",
      "Shadow AI: User activity /shadow-ai/user-activity/users",
      "Shadow AI: AI tools /shadow-ai/tools",
      "Shadow AI: Rules & alerts /shadow-ai/rules",
      "Shadow AI: Shadow AI settings /shadow-ai/settings",
      "Code: Scan /ai-detection/scan",
      "Code: Repositories /ai-detection/repositories",
      "Code: Scan results /ai-detection/history",
      "Code: Scan settings /ai-detection/settings",
    ]);
    expect(subs("evidence-reports")).toEqual([
      "Evidence /file-manager",
      "Reporting /reporting",
      "AI trust center /ai-trust-center",
    ]);
    expect(subs("policy")).toEqual(["Policy manager /policies", "Training registry /training"]);
    expect(subs("llm-evals")).toEqual([
      "Overview /evals#overview",
      "Experiments /evals#experiments",
      "Datasets /evals#datasets",
      "Scorers /evals#scorers",
      "Models /evals#models",
      "Bias audits /evals#bias-audits",
      "Playground /evals#playground",
      "Arena /evals#arena",
      "Reports /evals#reports",
      "Settings /evals#settings",
    ]);
    expect(subs("ai-gateway")).toEqual([
      "Dashboard /ai-gateway/dashboard",
      "Endpoints /ai-gateway/endpoints",
      "Playground /ai-gateway/playground",
      "Guardrails /ai-gateway/guardrails",
      "Prompts /ai-gateway/prompts",
      "Models /ai-gateway/models",
      "Logs /ai-gateway/logs",
      "Settings /ai-gateway/settings",
    ]);
    expect(subs("agent-controls")).toEqual([
      "Runs /ai-gateway/mcp/runs",
      "Activity /ai-gateway/mcp/audit",
      "Approvals /ai-gateway/mcp/approvals",
      "Guardrails /ai-gateway/mcp/guardrails",
      "Agent keys /ai-gateway/mcp/agent-keys",
      "MCP servers /ai-gateway/mcp/servers",
      "MCP tools /ai-gateway/mcp/tools",
    ]);
    expect(subs("settings")).toEqual([
      "Settings /settings",
      "Event tracker /event-tracker",
      "Extensions /extensions",
      "Super admin /super-admin",
    ]);
  });

  it("encodes today's gates", () => {
    expect(findSub("workflows", "approval-workflows").gate).toEqual({
      permission: "approvalWorkflow.admin",
    });
    expect(findItem("intake").gate).toEqual({ permission: "intakeForm.edit" });
    expect(findSub("ai-trust-index", "ati-settings").gate).toEqual({
      permission: "aiTrustIndex.admin",
    });
    expect(findSub("llm-evals", "arena").gate).toEqual({ evalsArena: true });
    expect(findSub("ai-gateway", "prompts").gate).toEqual({ flag: "SHOW_AI_GATEWAY_PROMPTS" });
    expect(findSub("settings", "extensions").gate).toEqual({
      permission: "extension.admin",
      whenDenied: "disable",
      deniedTooltip: "Admin access required.",
    });
    expect(findSub("settings", "super-admin").gate).toEqual({ superAdmin: true });
  });

  it("disables Experiments and Reports without an Evals project, as today", () => {
    const disabled = (findItem("llm-evals").children ?? [])
      .filter((s) => s.requiresEvalsProject)
      .map((s) => s.id);
    expect(disabled).toEqual(["experiments", "reports"]);
  });

  it("keeps every count today's sidebars show", () => {
    const counts = allItems().flatMap((item) => [
      ...(item.countKey ? [`${item.id}:${item.countKey}`] : []),
      ...(item.children ?? [])
        .filter((s) => s.countKey)
        .map((s) => `${item.id}/${s.id}:${s.countKey}`),
    ]);
    expect(counts.sort()).toEqual(
      [
        "tasks:openTasks",
        "ai-trust-index/ati-tracked:aiTrustIndexTracked",
        "ai-detection/ai-tools:shadowAiTools",
        "ai-detection/rules:shadowAiAlerts",
        "ai-detection/repositories:aiDetectionRepositories",
        "ai-detection/scan-results:aiDetectionHistory",
        "llm-evals/experiments:evalsExperiments",
        "llm-evals/datasets:evalsDatasets",
        "llm-evals/scorers:evalsScorers",
        "llm-evals/models:evalsModels",
        "llm-evals/arena:evalsArena",
        "ai-gateway/endpoints:aiGatewayEndpoints",
        "ai-gateway/prompts:aiGatewayPrompts",
      ].sort(),
    );
  });
});

describe("resolveActive", () => {
  const cases: ReadonlyArray<[string, string, string | null, string | undefined]> = [
    // Top items
    ["/home", "", "home", undefined],
    ["/start-here", "", "home", undefined],
    ["/", "", "dashboard", undefined],
    ["/tasks", "", "tasks", undefined],
    ["/ai-incident-managements", "", "incidents", undefined],
    ["/automations", "", "workflows", "automations"],
    ["/approval-workflows", "", "workflows", "approval-workflows"],
    // Record
    ["/overview", "", "inventory", "use-cases"],
    ["/project-view", "", "inventory", "use-cases"],
    ["/model-inventory/models/3", "", "inventory", "models"],
    ["/ai-apps", "", "inventory", "ai-apps"],
    ["/agent-discovery", "", "inventory", "agents"],
    ["/datasets", "", "inventory", "datasets"],
    ["/ai-trust-index/browse", "", "ai-trust-index", "ati-browse"],
    ["/ai-trust-index/openai", "", "ai-trust-index", "ati-browse"],
    ["/ai-trust-index/tracked", "", "ai-trust-index", "ati-tracked"],
    ["/ai-trust-index/settings", "", "ai-trust-index", "ati-settings"],
    ["/shadow-ai/insights", "", "ai-detection", "insights"],
    ["/shadow-ai/user-activity/users", "", "ai-detection", "user-activity"],
    ["/shadow-ai/user-activity/departments", "", "ai-detection", "user-activity"],
    ["/shadow-ai/tools", "", "ai-detection", "ai-tools"],
    ["/shadow-ai/tools/12", "", "ai-detection", "ai-tools"],
    ["/shadow-ai/rules/alerts", "", "ai-detection", "rules"],
    ["/shadow-ai/settings", "", "ai-detection", "shadow-ai-settings"],
    ["/ai-detection/scan", "", "ai-detection", "scan"],
    ["/ai-detection/repositories", "", "ai-detection", "repositories"],
    ["/ai-detection/history", "", "ai-detection", "scan-results"],
    ["/ai-detection/scans/7", "", "ai-detection", "scan-results"],
    ["/ai-detection/scans/7/findings", "", "ai-detection", "scan-results"],
    ["/ai-detection/settings", "", "ai-detection", "scan-settings"],
    ["/file-manager", "", "evidence-reports", "evidence"],
    ["/reporting", "", "evidence-reports", "reporting"],
    ["/ai-trust-center", "", "evidence-reports", "ai-trust-center"],
    ["/intake-forms", "", "intake", undefined],
    ["/intake-forms/4/edit", "", "intake", undefined],
    // Track
    ["/risk-management", "", "ai-risks", undefined],
    ["/vendors", "", "vendors", undefined],
    ["/framework", "", "frameworks", undefined],
    // Enforce: Policy
    ["/policies", "", "policy", "policy-manager"],
    ["/training", "", "policy", "training-registry"],
    // Enforce: LLM Evals (hash navigation)
    ["/evals", "", "llm-evals", "overview"],
    ["/evals", "#experiments", "llm-evals", "experiments"],
    ["/evals/proj-1", "#overview", "llm-evals", "overview"],
    ["/evals/proj-1", "#datasets", "llm-evals", "datasets"],
    ["/evals/proj-1", "#scorers", "llm-evals", "scorers"],
    ["/evals/proj-1", "#models", "llm-evals", "models"],
    ["/evals/proj-1", "#bias-audits", "llm-evals", "bias-audits"],
    ["/evals/proj-1", "#playground", "llm-evals", "playground"],
    ["/evals/proj-1", "#arena", "llm-evals", "arena"],
    ["/evals/proj-1", "#reports", "llm-evals", "reports"],
    ["/evals/proj-1", "#settings", "llm-evals", "settings"],
    ["/evals/proj-1", "#unknown-tab", "llm-evals", "overview"],
    ["/evals/proj-1/experiment/9", "", "llm-evals", "experiments"],
    ["/evals/proj-1/datasets/editor", "", "llm-evals", "datasets"],
    ["/evals/settings", "", "llm-evals", "settings"],
    // Off the dashboard routes the hash names no tab.
    ["/evals/settings", "#experiments", "llm-evals", "settings"],
    ["/evals/proj-1/datasets/editor", "#experiments", "llm-evals", "datasets"],
    // Enforce: AI Gateway
    ["/ai-gateway", "", "ai-gateway", "dashboard"],
    ["/ai-gateway/dashboard", "", "ai-gateway", "dashboard"],
    ["/ai-gateway/endpoints", "", "ai-gateway", "endpoints"],
    ["/ai-gateway/playground", "", "ai-gateway", "playground"],
    ["/ai-gateway/guardrails/pii", "", "ai-gateway", "guardrails"],
    ["/ai-gateway/prompts/3", "", "ai-gateway", "prompts"],
    ["/ai-gateway/models/catalog", "", "ai-gateway", "models"],
    ["/ai-gateway/logs", "", "ai-gateway", "logs"],
    ["/ai-gateway/settings/api-keys", "", "ai-gateway", "settings"],
    ["/ai-gateway/virtual-keys", "", "ai-gateway", "settings"],
    // Enforce: Agent controls owns /ai-gateway/mcp/*
    ["/ai-gateway/mcp", "", "agent-controls", undefined],
    ["/ai-gateway/mcp/runs", "", "agent-controls", "runs"],
    ["/ai-gateway/mcp/audit", "", "agent-controls", "activity"],
    ["/ai-gateway/mcp/approvals", "", "agent-controls", "approvals"],
    ["/ai-gateway/mcp/guardrails", "", "agent-controls", "guardrails"],
    ["/ai-gateway/mcp/agent-keys", "", "agent-controls", "agent-keys"],
    ["/ai-gateway/mcp/servers", "", "agent-controls", "mcp-servers"],
    ["/ai-gateway/mcp/tools", "", "agent-controls", "mcp-tools"],
    // Workspace: global pages highlight Settings
    ["/settings", "", "settings", "settings"],
    ["/settings/team", "", "settings", "settings"],
    ["/event-tracker", "", "settings", "event-tracker"],
    ["/event-tracker/logs", "", "settings", "event-tracker"],
    ["/extensions", "", "settings", "extensions"],
    ["/extensions/slack/settings", "", "settings", "extensions"],
    ["/super-admin", "", "settings", "super-admin"],
    ["/super-admin/users", "", "settings", "super-admin"],
    // Not in today's nav either: nothing selected
    ["/ai-audit", "", null, undefined],
    ["/governance/overview", "", null, undefined],
    ["/organization", "", null, undefined],
  ];

  it.each(cases)("%s%s → %s / %s", (pathname, hash, itemId, subId) => {
    const active = resolveActive(pathname, hash);
    if (itemId === null) {
      expect(active).toBeNull();
      return;
    }
    expect(active).toEqual(subId === undefined ? { itemId } : { itemId, subId });
  });

  it("does not treat a lookalike prefix as a match", () => {
    expect(resolveActive("/tasks-archive", "")).toBeNull();
    expect(resolveActive("/evalsx", "")).toBeNull();
  });

  it("ignores a trailing slash and a query after the hash", () => {
    expect(resolveActive("/vendors/", "")).toEqual({ itemId: "vendors" });
    expect(resolveActive("/evals/proj-1", "#experiments?sort=asc")).toEqual({
      itemId: "llm-evals",
      subId: "experiments",
    });
  });
});

describe("evalsDashboardRoute", () => {
  it.each([
    ["/evals", {}],
    ["/evals/", {}],
    ["/evals/proj-1", { projectId: "proj-1" }],
    ["/evals/proj-1/", { projectId: "proj-1" }],
    ["/evals/settings", null],
    ["/evals/proj-1/datasets/editor", null],
    ["/evals/proj-1/experiment/9", null],
    ["/tasks", null],
  ])("%s → %j", (pathname, expected) => {
    expect(evalsDashboardRoute(pathname)).toEqual(expected);
  });
});

describe("NAV_GROUPS: gates", () => {
  // UnifiedSidebar decides item visibility before it asks for the Arena setting.
  it("puts the Arena gate on sub-items only", () => {
    for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
      expect(item.gate && "evalsArena" in item.gate).toBeFalsy();
    }
  });
});
