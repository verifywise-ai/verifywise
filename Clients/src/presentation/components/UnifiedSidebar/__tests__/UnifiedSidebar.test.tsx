import { vi } from "vitest";
import type { UiPermissionKey } from "../../../../application/constants/permissions";

// ---- Mocked sources (gates, counts, footer helpers) ----

const authState = { isSuperAdmin: false, userRoleName: "Editor" };
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    token: "",
    userToken: null,
    userId: 1,
    organizationId: 1,
    isAuthenticated: false,
    ...authState,
  }),
}));

const permissions = new Set<UiPermissionKey>();
vi.mock("../../../../application/hooks/useCan", () => ({
  useCanCheck: () => (key: UiPermissionKey) => permissions.has(key),
  useCan: (key: UiPermissionKey) => permissions.has(key),
  usePermissionsSettled: () => true,
}));

const arena: { data?: { enabled: boolean } } = {};
/** The `enabled` option of the latest useArenaSetting call. */
let arenaQueryEnabled: boolean | undefined;
vi.mock("../../../../application/hooks/useArenaSetting", () => ({
  useArenaSetting: (options?: { enabled?: boolean }) => {
    arenaQueryEnabled = options?.enabled;
    return arena;
  },
}));

let openTasks = 0;
vi.mock("../../../../application/hooks/useOpenTasksCount", () => ({
  useOpenTasksCount: () => openTasks,
}));

let evalsCtx: Record<string, unknown> | null = null;
let detectionCtx: Record<string, unknown> | null = null;
let shadowCtx: Record<string, unknown> | null = null;
let gatewayCtx: Record<string, unknown> | null = null;
let trustCtx: Record<string, unknown> | null = null;
vi.mock("../../../../application/contexts/EvalsSidebar.context", () => ({
  useEvalsSidebarContextSafe: () => evalsCtx,
}));
vi.mock("../../../../application/contexts/AIDetectionSidebar.context", () => ({
  useAIDetectionSidebarContextSafe: () => detectionCtx,
}));
vi.mock("../../../../application/contexts/ShadowAISidebar.context", () => ({
  useShadowAISidebarContextSafe: () => shadowCtx,
}));
vi.mock("../../../../application/contexts/AIGatewaySidebar.context", () => ({
  useAIGatewaySidebarContextSafe: () => gatewayCtx,
}));
vi.mock("../../../../application/contexts/AITrustIndexSidebar.context", () => ({
  useAITrustIndexSidebarContextSafe: () => trustCtx,
}));

// The sidebar footer opens the right-hand helper panel; App.tsx provides it.
vi.mock("../../UserGuide/UserGuideSidebarContext", () => ({
  useUserGuideSidebarContext: () => ({ open: vi.fn(), openTab: vi.fn() }),
}));

import { fireEvent, screen, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { navGroupColor, brand } from "../../../themes/palette";
import UnifiedSidebar from "../index";

/** Shows the router location, so tests can follow navigation for real. */
const LocationProbe = () => {
  const { pathname, hash } = useLocation();
  return <div data-testid="location">{`${pathname}${hash}`}</div>;
};

const renderAt = (route: string) =>
  renderWithProviders(
    <>
      <UnifiedSidebar />
      <LocationProbe />
    </>,
    { route },
  );

const item = (id: string) => screen.getByTestId(`nav-item-${id}`);
const sub = (itemId: string, subId: string) => screen.getByTestId(`nav-sub-${itemId}-${subId}`);
const querySub = (itemId: string, subId: string) =>
  screen.queryByTestId(`nav-sub-${itemId}-${subId}`);
const location = () => screen.getByTestId("location").textContent;
const isSelected = (el: HTMLElement) => el.classList.contains("selected-path");

beforeEach(() => {
  authState.isSuperAdmin = false;
  authState.userRoleName = "Editor";
  permissions.clear();
  delete arena.data;
  arenaQueryEnabled = undefined;
  openTasks = 0;
  evalsCtx = null;
  detectionCtx = null;
  shadowCtx = null;
  gatewayCtx = null;
  trustCtx = null;
});

describe("UnifiedSidebar: groups", () => {
  it("shows Record, Track, Enforce and Workspace headings in their part colours", () => {
    renderAt("/");
    for (const [label, id] of [
      ["Record", "record"],
      ["Track", "track"],
      ["Enforce", "enforce"],
      ["Workspace", "workspace"],
    ] as const) {
      const heading = screen.getByTestId(`nav-group-heading-${id}`);
      expect(heading).toHaveTextContent(label);
      expect(heading).toHaveStyle({ color: navGroupColor[id].heading });
    }
  });

  it("gives the Automate group no heading", () => {
    renderAt("/");
    expect(screen.queryByTestId("nav-group-heading-automate")).not.toBeInTheDocument();
    expect(item("home")).toBeInTheDocument();
  });

  it("colours item icons in their group's part colour, and the selected icon in brand", () => {
    renderAt("/");
    const riskIcon = item("ai-risks").querySelector("svg")!;
    expect(riskIcon).toHaveStyle({ color: navGroupColor.track.icon });
    const dashboardIcon = item("dashboard").querySelector("svg")!;
    expect(dashboardIcon).toHaveStyle({ color: brand.primary });
  });
});

describe("UnifiedSidebar: active item per route (Review focus 1)", () => {
  it.each([
    ["/", "dashboard", undefined],
    ["/tasks", "tasks", undefined],
    ["/project-view?projectId=3", "inventory", "use-cases"],
    ["/ai-trust-index/tracked", "inventory", "ati-tracked"],
    ["/ai-trust-index/gpt-4o", "inventory", "ati-browse"],
    ["/shadow-ai/tools", "ai-detection", "ai-tools"],
    ["/shadow-ai/user-activity/departments", "ai-detection", "user-activity"],
    ["/ai-detection/scans/12", "ai-detection", "scan-results"],
    ["/ai-gateway/endpoints", "ai-gateway", "endpoints"],
    ["/ai-gateway/virtual-keys", "ai-gateway", "settings"],
    ["/ai-gateway/mcp/runs", "agent-controls", "runs"],
    ["/evals/p1#datasets", "llm-evals", "datasets"],
    ["/settings", "settings", "settings"],
    ["/event-tracker", "settings", "event-tracker"],
  ])("%s → %s / %s", (route, itemId, subId) => {
    renderAt(route);
    if (subId) {
      expect(item(itemId)).toHaveAttribute("aria-expanded", "true");
      expect(isSelected(sub(itemId, subId))).toBe(true);
    } else {
      expect(isSelected(item(itemId))).toBe(true);
    }
  });

  it("opens Agent controls, not AI Gateway, on /ai-gateway/mcp/*", () => {
    renderAt("/ai-gateway/mcp/audit");
    expect(item("agent-controls")).toHaveAttribute("aria-expanded", "true");
    expect(item("ai-gateway")).toHaveAttribute("aria-expanded", "false");
    expect(isSelected(sub("agent-controls", "activity"))).toBe(true);
  });

  it("selects nothing on a route outside the sidebar", () => {
    renderAt("/ai-audit");
    expect(document.querySelectorAll(".selected-path")).toHaveLength(0);
  });
});

describe("UnifiedSidebar: expandable items", () => {
  it("keeps one item open at a time and reports it with aria-expanded", () => {
    renderAt("/automations");
    expect(item("workflows")).toHaveAttribute("aria-expanded", "true");
    expect(item("inventory")).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(item("inventory"));
    expect(item("inventory")).toHaveAttribute("aria-expanded", "true");
    expect(item("workflows")).toHaveAttribute("aria-expanded", "false");
    expect(querySub("workflows", "automations")).not.toBeInTheDocument();
    expect(sub("inventory", "models")).toBeInTheDocument();

    // A second click closes it.
    fireEvent.click(item("inventory"));
    expect(item("inventory")).toHaveAttribute("aria-expanded", "false");
  });

  it("does not navigate when an expandable item is toggled", () => {
    renderAt("/tasks");
    fireEvent.click(item("policy"));
    expect(location()).toBe("/tasks");
  });

  it("opens the item of the new route after navigating", () => {
    renderAt("/automations");
    fireEvent.click(item("policy"));
    fireEvent.click(sub("policy", "training-registry"));
    expect(location()).toBe("/training");
    expect(item("policy")).toHaveAttribute("aria-expanded", "true");
    expect(isSelected(sub("policy", "training-registry"))).toBe(true);
  });

  it("navigates plain items by path", () => {
    renderAt("/");
    fireEvent.click(item("vendors"));
    expect(location()).toBe("/vendors");
  });

  it("shows section headings inside an item", () => {
    renderAt("/shadow-ai/insights");
    const section = screen.getByTestId("nav-section-ai-detection");
    expect(within(section).getByText("Shadow AI")).toBeInTheDocument();
    expect(within(section).getByText("Code")).toBeInTheDocument();
  });
});

describe("UnifiedSidebar: gates", () => {
  it("hides Approval workflows without approvalWorkflow.admin", () => {
    renderAt("/automations");
    expect(querySub("workflows", "approval-workflows")).not.toBeInTheDocument();
  });

  it("shows Approval workflows with approvalWorkflow.admin", () => {
    permissions.add("approvalWorkflow.admin");
    renderAt("/automations");
    expect(sub("workflows", "approval-workflows")).toBeInTheDocument();
  });

  it("shows Trust Index settings to Admins only", () => {
    renderAt("/ai-trust-index/browse");
    expect(querySub("inventory", "ati-settings")).not.toBeInTheDocument();
  });

  it("shows Trust Index settings and Intake to an Admin", () => {
    authState.userRoleName = "Admin";
    renderAt("/ai-trust-index/browse");
    expect(sub("inventory", "ati-settings")).toBeInTheDocument();
    expect(item("intake")).toBeInTheDocument();
  });

  it("hides Intake from non-Admins", () => {
    renderAt("/");
    expect(screen.queryByTestId("nav-item-intake")).not.toBeInTheDocument();
  });

  it("hides Arena unless the organization setting is on (also while loading)", () => {
    renderAt("/evals#overview");
    expect(querySub("llm-evals", "arena")).not.toBeInTheDocument();
  });

  it("shows Arena when the organization setting is on", () => {
    arena.data = { enabled: true };
    renderAt("/evals#overview");
    expect(sub("llm-evals", "arena")).toBeInTheDocument();
  });

  it("asks for the Arena setting only on /evals or with LLM Evals open", () => {
    renderAt("/tasks");
    expect(arenaQueryEnabled).toBe(false);
    fireEvent.click(item("llm-evals"));
    expect(arenaQueryEnabled).toBe(true);
    fireEvent.click(item("llm-evals"));
    expect(arenaQueryEnabled).toBe(false);
  });

  it("asks for the Arena setting on an /evals route", () => {
    renderAt("/evals/p1#overview");
    expect(arenaQueryEnabled).toBe(true);
  });

  it("shows Super admin to super admins only", () => {
    renderAt("/settings");
    expect(querySub("settings", "super-admin")).not.toBeInTheDocument();
  });

  it("shows Super admin to a super admin", () => {
    authState.isSuperAdmin = true;
    renderAt("/settings");
    fireEvent.click(sub("settings", "super-admin"));
    expect(location()).toBe("/super-admin");
  });

  it("disables Extensions with a tooltip without extension.admin", async () => {
    renderAt("/settings");
    const ext = sub("settings", "extensions");
    expect(ext).toHaveClass("Mui-disabled");
    fireEvent.mouseOver(ext.parentElement!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Admin access required.");
  });

  it("enables Extensions with extension.admin", () => {
    permissions.add("extension.admin");
    renderAt("/settings");
    fireEvent.click(sub("settings", "extensions"));
    expect(location()).toBe("/extensions");
  });

  it("disables Experiments and Reports without an Evals project", () => {
    evalsCtx = { disabled: true };
    renderAt("/evals#overview");
    expect(sub("llm-evals", "experiments")).toHaveClass("Mui-disabled");
    expect(sub("llm-evals", "reports")).toHaveClass("Mui-disabled");
    expect(sub("llm-evals", "datasets")).not.toHaveClass("Mui-disabled");
  });

  it("disables them when no Evals context is mounted, as today", () => {
    renderAt("/evals#overview");
    expect(sub("llm-evals", "experiments")).toHaveClass("Mui-disabled");
  });

  it("enables them with a project", () => {
    evalsCtx = { disabled: false };
    renderAt("/evals#overview");
    expect(sub("llm-evals", "experiments")).not.toHaveClass("Mui-disabled");
  });
});

describe("UnifiedSidebar: counts", () => {
  it("shows the open-task count on Tasks", () => {
    openTasks = 7;
    renderAt("/");
    expect(item("tasks")).toHaveAccessibleName("Tasks 7");
  });

  it("shows the module counts from today's sidebar contexts", () => {
    evalsCtx = { disabled: false, experimentsCount: 3, datasetsCount: 4, scorersCount: 5 };
    renderAt("/evals#overview");
    expect(sub("llm-evals", "experiments")).toHaveAccessibleName("Experiments 3");
    expect(sub("llm-evals", "datasets")).toHaveAccessibleName("Datasets 4");
    expect(sub("llm-evals", "scorers")).toHaveAccessibleName("Scorers 5");
  });

  it("shows the AI Detection and Shadow AI counts", () => {
    shadowCtx = { toolsCount: 11, alertsCount: 2, recentTools: [] };
    detectionCtx = { repositoryCount: 6, historyCount: 9, recentScans: [] };
    renderAt("/shadow-ai/insights");
    expect(sub("ai-detection", "ai-tools")).toHaveAccessibleName("AI tools 11");
    expect(sub("ai-detection", "rules")).toHaveAccessibleName("Rules & alerts 2");
    expect(sub("ai-detection", "repositories")).toHaveAccessibleName("Repositories 6");
    expect(sub("ai-detection", "scan-results")).toHaveAccessibleName("Scan results 9");
  });

  it("shows the AI Gateway endpoints count", () => {
    gatewayCtx = { endpointsCount: 8 };
    renderAt("/ai-gateway/dashboard");
    expect(sub("ai-gateway", "endpoints")).toHaveAccessibleName("Endpoints 8");
  });

  it("shows the Evals models and Arena counts", () => {
    arena.data = { enabled: true };
    evalsCtx = { disabled: false, modelsCount: 2, arenaCount: 6 };
    renderAt("/evals#overview");
    expect(sub("llm-evals", "models")).toHaveAccessibleName("Models 2");
    expect(sub("llm-evals", "arena")).toHaveAccessibleName("Arena 6");
  });

  it("shows the tracked count", () => {
    trustCtx = { trackedCount: 4 };
    renderAt("/ai-trust-index/browse");
    expect(sub("inventory", "ati-tracked")).toHaveAccessibleName("Tracked 4");
  });
});

describe("UnifiedSidebar: collapsed", () => {
  it("navigates an expandable item to its first visible sub-item", () => {
    renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    fireEvent.click(item("inventory"));
    expect(location()).toBe("/overview");
    fireEvent.click(item("agent-controls"));
    expect(location()).toBe("/ai-gateway/mcp/runs");
  });

  it("hides headings and sub-items", () => {
    renderAt("/automations");
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.queryByTestId("nav-group-heading-record")).not.toBeInTheDocument();
    expect(querySub("workflows", "automations")).not.toBeInTheDocument();
    expect(isSelected(item("workflows"))).toBe(true);
  });
});

describe("UnifiedSidebar: LLM Evals", () => {
  const project = { id: "p1", name: "Alpha project" };

  it("goes to /evals#<tab> without a current project", () => {
    renderAt("/tasks");
    fireEvent.click(item("llm-evals"));
    fireEvent.click(sub("llm-evals", "datasets"));
    expect(location()).toBe("/evals#datasets");
  });

  it("goes to /evals/<projectId>#<tab> with a current project", () => {
    evalsCtx = { disabled: false, currentProject: project };
    renderAt("/tasks");
    fireEvent.click(item("llm-evals"));
    fireEvent.click(sub("llm-evals", "datasets"));
    expect(location()).toBe("/evals/p1#datasets");
  });

  it("moves to the current project from /evals", () => {
    evalsCtx = { disabled: false, currentProject: project };
    renderAt("/evals#overview");
    fireEvent.click(sub("llm-evals", "scorers"));
    expect(location()).toBe("/evals/p1#scorers");
  });

  it("keeps the project in the URL when one is there", () => {
    evalsCtx = { disabled: false, currentProject: project };
    renderAt("/evals/p2#overview");
    fireEvent.click(sub("llm-evals", "models"));
    expect(location()).toBe("/evals/p2#models");
  });

  it("applies the project rule when collapsed", () => {
    evalsCtx = { disabled: false, currentProject: project };
    renderAt("/tasks");
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    fireEvent.click(item("llm-evals"));
    expect(location()).toBe("/evals/p1#overview");
  });

  it("renders the project selector and recents inside the open LLM Evals item", () => {
    const onProjectChange = vi.fn();
    const onExperimentClick = vi.fn();
    const onProjectClick = vi.fn();
    evalsCtx = {
      disabled: false,
      currentProject: project,
      allProjects: [project, { id: "p2", name: "Beta project" }],
      onProjectChange,
      recentExperiments: [{ id: "e1", name: "Run one", projectId: "p1" }],
      recentProjects: [{ id: "p2", name: "Beta project" }],
      onExperimentClick,
      onProjectClick,
    };
    renderAt("/evals/p1#overview");
    const section = screen.getByTestId("nav-section-llm-evals");
    expect(within(section).getByText("Alpha project")).toBeInTheDocument();
    expect(within(section).getByText("Recent experiments")).toBeInTheDocument();
    expect(within(section).getByText("Recent projects")).toBeInTheDocument();

    fireEvent.click(within(section).getByText("Run one"));
    expect(onExperimentClick).toHaveBeenCalledWith("e1", "p1");
    fireEvent.click(within(section).getByText("Beta project"));
    expect(onProjectClick).toHaveBeenCalledWith("p2");

    fireEvent.click(within(section).getByText("Alpha project"));
    fireEvent.click(screen.getByText("All projects"));
    expect(onProjectChange).toHaveBeenCalledWith("all_projects");
  });

  it("renders no selector or recents while LLM Evals is closed", () => {
    evalsCtx = {
      disabled: false,
      currentProject: project,
      allProjects: [project],
      onProjectChange: vi.fn(),
      recentExperiments: [{ id: "e1", name: "Run one", projectId: "p1" }],
    };
    renderAt("/tasks");
    expect(screen.queryByText("Alpha project")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent experiments")).not.toBeInTheDocument();
  });
});

describe("UnifiedSidebar: AI Detection recents", () => {
  it("renders recent scans and recent tools inside AI Detection and opens them", () => {
    detectionCtx = { recentScans: [{ id: 5, name: "acme/api" }] };
    shadowCtx = { recentTools: [{ id: 9, name: "ChatGPT" }] };
    renderAt("/shadow-ai/insights");
    const section = screen.getByTestId("nav-section-ai-detection");
    expect(within(section).getByText("Recent scans")).toBeInTheDocument();
    expect(within(section).getByText("Recent tools")).toBeInTheDocument();
    fireEvent.click(within(section).getByText("acme/api"));
    expect(location()).toBe("/ai-detection/scans/5");
    fireEvent.click(within(section).getByText("ChatGPT"));
    expect(location()).toBe("/shadow-ai/tools/9");
  });

  it("leaves out empty recents", () => {
    detectionCtx = { recentScans: [] };
    renderAt("/ai-detection/scan");
    expect(screen.queryByText("Recent scans")).not.toBeInTheDocument();
  });
});

describe("UnifiedSidebar: footer", () => {
  it("renders today's sidebar footer", () => {
    renderAt("/");
    expect(screen.getByRole("button", { name: "Open user options" })).toBeInTheDocument();
  });
});
