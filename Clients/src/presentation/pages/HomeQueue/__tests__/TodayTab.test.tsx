import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { HomeQueueResponse } from "../../../../domain/types/homeQueue.types";
import { navGroupColor } from "../../../themes/palette";

const hook = vi.hoisted(() => ({ useHomeQueue: vi.fn() }));
vi.mock("../../../../application/hooks/useHomeQueue", () => hook);

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userToken: { name: "Ada Lovelace", email: "ada@example.com" }, userId: 1 }),
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import TodayTab from "../TodayTab";

const queryState = (overrides: Record<string, unknown>) => ({
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  ...overrides,
});

const RESPONSE: HomeQueueResponse = {
  items: [
    {
      id: "tasks:7",
      source: "tasks",
      part: "automate",
      entityType: "task",
      entityId: 7,
      name: "Update DPIA",
      url: "/tasks?taskId=7",
      dueDate: "2026-11-10",
      waitingSince: null,
      overdue: true,
      meta: { status: "Open", priority: "High" },
    },
    {
      id: "approvals:3",
      source: "approvals",
      part: "enforce",
      entityType: "approval_request",
      entityId: 3,
      name: "Deploy CV screener",
      url: "/approval-workflows?request=3",
      dueDate: null,
      waitingSince: "2026-11-12T09:00:00Z",
      overdue: false,
      meta: { stepNumber: 2, stepCount: 3 },
    },
    {
      id: "intake:9",
      source: "intake",
      part: "record",
      entityType: "intake_submission",
      entityId: 9,
      name: "Legal team",
      url: "/intake-forms/submissions?submission=9",
      dueDate: null,
      waitingSince: "2026-11-11T10:00:00Z",
      overdue: false,
      meta: { kind: "review", formName: "AI use request", lane: null },
    },
    {
      id: "risks:4",
      source: "risks",
      part: "track",
      entityType: "risk",
      entityId: 4,
      name: "Bias in hiring",
      url: "/risk-management?riskId=4",
      dueDate: null,
      waitingSince: null,
      overdue: false,
      meta: { mitigationStatus: "Not Started", riskLevel: null },
    },
  ],
  sources: {
    approvals: { status: "ok", count: 1 },
    tasks: { status: "ok", count: 1 },
    intake: { status: "ok", count: 1 },
    risks: { status: "ok", count: 1 },
    incidents: { status: "unavailable", count: 0 },
  },
  counts: {
    agentsToReview: 3,
    aiOnRecord: 30,
    untreatedRisks: 4,
    vendorReviewsDue: 2,
    policyReviewsDue: 1,
    promptsBlockedMasked24h: null,
  },
};

const rows = () => screen.getAllByTestId(/^home-queue-item-/);

describe("TodayTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hook.useHomeQueue.mockReturnValue(queryState({ data: RESPONSE, isSuccess: true }));
  });

  it("greets the user by first name", () => {
    renderWithProviders(<TodayTab />);
    expect(screen.getByText(/Ada/)).toBeInTheDocument();
    expect(screen.queryByText(/Lovelace/)).not.toBeInTheDocument();
  });

  it("renders items in server order with title, context and a link to the record", () => {
    renderWithProviders(<TodayTab />);

    expect(rows().map((row) => row.getAttribute("data-testid"))).toEqual([
      "home-queue-item-tasks:7",
      "home-queue-item-approvals:3",
      "home-queue-item-intake:9",
      "home-queue-item-risks:4",
    ]);

    const approval = screen.getByTestId("home-queue-item-approvals:3");
    const link = within(approval).getByRole("link", { name: "Approval: Deploy CV screener" });
    expect(link).toHaveAttribute("href", "/approval-workflows?request=3");
    expect(within(approval).getByText(/^Approval workflows · step 2 of 3 · waiting/)).toBeTruthy();
    expect(within(approval).getByRole("button", { name: "Review" })).toBeInTheDocument();
  });

  it("colours the dot by part, neutral for the top group", () => {
    renderWithProviders(<TodayTab />);
    const dot = (id: string) => screen.getByTestId(`home-queue-dot-${id}`);
    expect(dot("tasks:7")).toHaveStyle({ backgroundColor: navGroupColor.automate.icon });
    expect(dot("approvals:3")).toHaveStyle({ backgroundColor: navGroupColor.enforce.icon });
    expect(dot("intake:9")).toHaveStyle({ backgroundColor: navGroupColor.record.icon });
    expect(dot("risks:4")).toHaveStyle({ backgroundColor: navGroupColor.track.icon });
  });

  it("shows the overdue chip only on overdue items", () => {
    renderWithProviders(<TodayTab />);
    expect(
      within(screen.getByTestId("home-queue-item-tasks:7")).getByText("Overdue"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Overdue")).toHaveLength(1);
  });

  it("narrows the list to one source with the filter", () => {
    renderWithProviders(<TodayTab />);

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Filter by source" }));
    fireEvent.click(screen.getByRole("option", { name: "Tasks" }));

    expect(rows().map((row) => row.getAttribute("data-testid"))).toEqual([
      "home-queue-item-tasks:7",
    ]);
  });

  it("says when a source couldn't be loaded", () => {
    renderWithProviders(<TodayTab />);
    expect(screen.getByText("Incidents couldn't be loaded.")).toBeInTheDocument();
  });

  it("shows a dash for a failed count and leaves out a count the user may not see", () => {
    renderWithProviders(<TodayTab />);

    const prompts = screen.getByTestId("home-count-promptsBlockedMasked24h");
    expect(within(prompts).getByText("—")).toBeInTheDocument();
    expect(within(prompts).getByText("Prompts blocked or masked (last 24 hours)")).toBeTruthy();

    const risks = screen.getByTestId("home-count-untreatedRisks");
    expect(within(risks).getByText("4")).toBeInTheDocument();
    expect(within(risks).getByRole("link")).toHaveAttribute("href", "/risk-management");

    // intakeWaiting is absent from the response: the user may not see it.
    expect(screen.queryByTestId("home-count-intakeWaiting")).not.toBeInTheDocument();
    expect(screen.queryByText("Intake waiting")).not.toBeInTheDocument();
  });

  it("shows the empty state with a link to Get started for a brand-new user", () => {
    hook.useHomeQueue.mockReturnValue(
      queryState({
        data: {
          items: [],
          sources: {
            approvals: { status: "ok", count: 0 },
            tasks: { status: "ok", count: 0 },
            risks: { status: "ok", count: 0 },
          },
          counts: { untreatedRisks: 0 },
        },
        isSuccess: true,
      }),
    );
    renderWithProviders(<TodayTab />);

    expect(screen.getByText("Nothing needs you right now.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      "/home?tab=get-started",
    );
  });

  it("does not claim nothing needs you when a source failed", () => {
    hook.useHomeQueue.mockReturnValue(
      queryState({
        data: {
          items: [],
          sources: {
            tasks: { status: "ok", count: 0 },
            approvals: { status: "unavailable", count: 0 },
          },
          counts: {},
        },
        isSuccess: true,
      }),
    );
    renderWithProviders(<TodayTab />);

    expect(screen.queryByText("Nothing needs you right now.")).not.toBeInTheDocument();
    expect(screen.getByText("Approvals couldn't be loaded.")).toBeInTheDocument();
  });

  it("shows the house loading state while the queue loads", () => {
    hook.useHomeQueue.mockReturnValue(queryState({ isLoading: true }));
    renderWithProviders(<TodayTab />);

    expect(screen.getByRole("status", { name: "Loading your queue" })).toBeInTheDocument();
    expect(screen.queryByTestId(/^home-count-/)).not.toBeInTheDocument();
  });

  it("shows the house error state when the request fails", () => {
    hook.useHomeQueue.mockReturnValue(queryState({ isError: true, error: new Error("boom") }));
    renderWithProviders(<TodayTab />);

    expect(screen.getByText("Home couldn't be loaded")).toBeInTheDocument();
    expect(screen.queryByText("Nothing needs you right now.")).not.toBeInTheDocument();
  });
});
