import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { IShadowAiRule, IShadowAiAlertHistory } from "../../../../domain/interfaces/i.shadowAi";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockGetRules = vi.fn();
const mockCreateRule = vi.fn();
const mockUpdateRule = vi.fn();
const mockDeleteRule = vi.fn();
const mockGetAlertHistory = vi.fn();

vi.mock("../../../../application/repository/shadowAi.repository", () => ({
  getRules: (...args: any[]) => mockGetRules(...args),
  createRule: (...args: any[]) => mockCreateRule(...args),
  updateRule: (...args: any[]) => mockUpdateRule(...args),
  deleteRule: (...args: any[]) => mockDeleteRule(...args),
  getAlertHistory: (...args: any[]) => mockGetAlertHistory(...args),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title, alert }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {alert}
      {children}
    </div>
  ),
}));

import RulesPage from "../RulesPage";

const rules: IShadowAiRule[] = [
  {
    id: 1,
    name: "Alert on new tools",
    description: "Fires when a new AI tool is detected",
    is_active: true,
    trigger_type: "new_tool_detected",
    trigger_config: {},
    actions: [{ type: "send_alert" }],
    cooldown_minutes: 1440,
    notification_user_ids: [1],
    created_by: 1,
  },
  {
    id: 2,
    name: "High risk score",
    is_active: false,
    trigger_type: "risk_score_exceeded",
    trigger_config: { risk_score_min: 80 },
    actions: [{ type: "send_alert" }],
    created_by: 1,
  },
];

const alerts: IShadowAiAlertHistory[] = [
  {
    id: 1,
    rule_id: 1,
    rule_name: "Alert on new tools",
    trigger_type: "new_tool_detected",
    fired_at: "2026-02-01T00:00:00Z",
  },
];

describe("ShadowAI - RulesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRules.mockResolvedValue(rules);
    mockGetAlertHistory.mockResolvedValue({ alerts, total: 1 });
  });

  it("renders without crashing", () => {
    renderWithProviders(<RulesPage />, { route: "/shadow-ai/rules" });
    expect(screen.getByTestId("page-header")).toBeInTheDocument();
  });

  it("shows an empty state when there are no rules", async () => {
    mockGetRules.mockResolvedValue([]);
    renderWithProviders(<RulesPage />, { route: "/shadow-ai/rules" });

    await waitFor(() => {
      expect(screen.getByText(/No rules configured yet/)).toBeInTheDocument();
    });
  });

  it("renders configured rules with their trigger label and cooldown", async () => {
    renderWithProviders(<RulesPage />, { route: "/shadow-ai/rules" });

    await waitFor(() => {
      expect(screen.getByText("Alert on new tools")).toBeInTheDocument();
    });
    expect(screen.getByText("New tool detected")).toBeInTheDocument();
    expect(screen.getByText("Cooldown: 1d")).toBeInTheDocument();
    expect(screen.getByText("High risk score")).toBeInTheDocument();
    expect(screen.getByText(/Threshold: risk score/)).toBeInTheDocument();
  });

  it("toggles a rule's active state", async () => {
    mockUpdateRule.mockResolvedValue({});
    renderWithProviders(<RulesPage />, { route: "/shadow-ai/rules" });

    await waitFor(() => {
      expect(screen.getByText("Alert on new tools")).toBeInTheDocument();
    });

    const toggles = screen.getAllByRole("switch");
    fireEvent.click(toggles[0]);

    await waitFor(() => {
      expect(mockUpdateRule).toHaveBeenCalledWith(1, { is_active: false });
    });
    await waitFor(() => {
      expect(
        screen.getByText('Rule "Alert on new tools" disabled successfully'),
      ).toBeInTheDocument();
    });
  });

  it("shows an error toast when toggling fails", async () => {
    mockUpdateRule.mockRejectedValue(new Error("failed"));
    renderWithProviders(<RulesPage />, { route: "/shadow-ai/rules" });

    await waitFor(() => {
      expect(screen.getByText("Alert on new tools")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("switch")[0]);

    await waitFor(() => {
      expect(screen.getByText("Failed to update rule")).toBeInTheDocument();
    });
  });

  it("deletes a rule after confirming", async () => {
    mockDeleteRule.mockResolvedValue(undefined);
    renderWithProviders(<RulesPage />, { route: "/shadow-ai/rules" });

    await waitFor(() => {
      expect(screen.getByText("Alert on new tools")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button", { name: "" });
    // First icon button in each rule card row is the delete trash icon.
    const trashButton = deleteButtons.find((btn) => btn.querySelector("svg.lucide-trash2"));
    fireEvent.click(trashButton!);

    await waitFor(() => {
      expect(screen.getByText('Delete "Alert on new tools"?')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDeleteRule).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(screen.getByText("Rule deleted successfully")).toBeInTheDocument();
    });
  });

  it("switches to the alert history tab", async () => {
    renderWithProviders(<RulesPage />, { route: "/shadow-ai/rules" });

    await waitFor(() => {
      expect(screen.getByText("Alert on new tools")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /Alert history/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/shadow-ai/rules/alerts");
  });

  it("renders the alert history table on the alerts route", async () => {
    renderWithProviders(<RulesPage />, { route: "/shadow-ai/rules/alerts" });

    await waitFor(() => {
      expect(mockGetAlertHistory).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getAllByText("Alert on new tools").length).toBeGreaterThan(0);
    });
  });

  it("shows an empty state on the alerts tab when there is no history", async () => {
    mockGetAlertHistory.mockResolvedValue({ alerts: [], total: 0 });
    renderWithProviders(<RulesPage />, { route: "/shadow-ai/rules/alerts" });

    await waitFor(() => {
      expect(screen.getByText("No alerts have been triggered yet.")).toBeInTheDocument();
    });
  });

  it("validates the create-rule form before submitting", async () => {
    renderWithProviders(<RulesPage />, { route: "/shadow-ai/rules" });

    await waitFor(() => {
      expect(screen.getByText("Alert on new tools")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Create rule"));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(screen.getByText("Rule name is required")).toBeInTheDocument();
    });
    expect(mockCreateRule).not.toHaveBeenCalled();
  });

  it("creates a new rule with default trigger config and shows a success toast", async () => {
    mockCreateRule.mockResolvedValue({});
    renderWithProviders(<RulesPage />, { route: "/shadow-ai/rules" });

    await waitFor(() => {
      expect(screen.getByText("Alert on new tools")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Create rule"));
    fireEvent.change(screen.getByLabelText("Rule name"), {
      target: { value: "Notify on blocked attempts" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(mockCreateRule).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Notify on blocked attempts",
          is_active: true,
          trigger_type: "new_tool_detected",
          trigger_config: {},
          actions: [{ type: "send_alert" }],
          cooldown_minutes: 1440,
          notification_user_ids: [1],
        }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Rule created successfully")).toBeInTheDocument();
    });
  });

  it("logs and recovers when loading rules fails", async () => {
    mockGetRules.mockRejectedValue(new Error("network error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(<RulesPage />, { route: "/shadow-ai/rules" });

    await waitFor(() => {
      expect(screen.getByTestId("page-header")).toBeInTheDocument();
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
