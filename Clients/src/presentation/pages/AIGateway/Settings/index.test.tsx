import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockNavigate = vi.fn();
let mockParams: { tab?: string } = {};

vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
  };
});

vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

// VirtualKeysTab has its own dedicated test file — stub it here to keep this
// page's test focused on Settings' own logic.
vi.mock("../VirtualKeys/index", () => ({
  default: () => <div data-testid="virtual-keys-tab" />,
}));

import { apiServices } from "../../../../infrastructure/api/networkServices";
import AIGatewaySettingsPage from "./index";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiServices.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiServices.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiServices.delete as unknown as ReturnType<typeof vi.fn>;

function makeApiKey(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    key_name: "Prod OpenAI",
    provider: "openai",
    masked_key: "sk-...abcd",
    is_active: true,
    ...overrides,
  };
}

function mockLoad(overrides: { keys?: any[]; budget?: any; gs?: any } = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes("/ai-gateway/keys")) {
      return Promise.resolve({ data: { data: overrides.keys ?? [] } });
    }
    if (url.includes("/ai-gateway/budget")) {
      return Promise.resolve({ data: { data: overrides.budget ?? null } });
    }
    if (url.includes("/ai-gateway/providers")) {
      return Promise.resolve({ data: { data: { providers: [] } } });
    }
    if (url.includes("/ai-gateway/guardrails/settings")) {
      return Promise.resolve({ data: { settings: overrides.gs ?? null } });
    }
    return Promise.resolve({ data: {} });
  });
}

describe("AIGateway - Settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = {};
    mockLoad();
    mockPost.mockResolvedValue({ data: {} });
    mockPut.mockResolvedValue({ data: {} });
    mockDelete.mockResolvedValue({ data: {} });
  });

  it("shows a loading skeleton initially", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<AIGatewaySettingsPage />);
    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("shows an error state with a working retry button", async () => {
    mockGet.mockRejectedValueOnce(new Error("boom"));
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load AI Gateway settings. Please try again."),
      ).toBeInTheDocument();
    });

    mockLoad({ keys: [makeApiKey()] });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("Prod OpenAI")).toBeInTheDocument();
    });
  });

  it("shows an API-keys empty state with tips by default", async () => {
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No API keys configured/)).toBeInTheDocument();
    });
    expect(screen.getByText("Keys are encrypted at rest")).toBeInTheDocument();
  });

  it("renders API key rows with provider, masked key, and active status", async () => {
    mockLoad({
      keys: [makeApiKey(), makeApiKey({ id: 2, key_name: "Old key", is_active: false })],
    });
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Prod OpenAI")).toBeInTheDocument();
    });
    expect(screen.getAllByText(/sk-\.\.\.abcd/).length).toBeGreaterThan(0);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("validates the API key format before submitting", async () => {
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add key" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add key" }));
    fireEvent.change(screen.getByLabelText(/^Key name/), { target: { value: "Test key" } });

    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[0]);
    fireEvent.click(screen.getByRole("option", { name: "OpenAI" }));

    fireEvent.change(screen.getByLabelText(/^API key/), { target: { value: "not-a-valid-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Add key" }));

    await waitFor(() => {
      expect(screen.getByText(/Invalid key format/)).toBeInTheDocument();
    });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("verifies and creates a well-formed API key", async () => {
    mockPost.mockImplementation((url: string) => {
      if (url.includes("/keys/verify")) {
        return Promise.resolve({ data: { data: { valid: true } } });
      }
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add key" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add key" }));
    fireEvent.change(screen.getByLabelText(/^Key name/), { target: { value: "Test key" } });

    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[0]);
    fireEvent.click(screen.getByRole("option", { name: "OpenAI" }));

    fireEvent.change(screen.getByLabelText(/^API key/), {
      target: { value: "sk-abcdefghijklmnopqrstuvwxyz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add key" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/ai-gateway/keys/verify", {
        provider: "openai",
        api_key: "sk-abcdefghijklmnopqrstuvwxyz",
      });
    });
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/keys",
        expect.objectContaining({ provider: "openai" }),
      );
    });
  });

  it("shows a verification failure message without saving the key", async () => {
    mockPost.mockImplementation((url: string) => {
      if (url.includes("/keys/verify")) {
        return Promise.resolve({
          data: { data: { valid: false, message: "Key rejected by provider" } },
        });
      }
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add key" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add key" }));
    fireEvent.change(screen.getByLabelText(/^Key name/), { target: { value: "Test key" } });
    const combos = screen.getAllByRole("combobox");
    fireEvent.mouseDown(combos[0]);
    fireEvent.click(screen.getByRole("option", { name: "OpenAI" }));
    fireEvent.change(screen.getByLabelText(/^API key/), {
      target: { value: "sk-abcdefghijklmnopqrstuvwxyz" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add key" }));

    await waitFor(() => {
      expect(screen.getByText("Key rejected by provider")).toBeInTheDocument();
    });
    expect(mockPost).not.toHaveBeenCalledWith("/ai-gateway/keys", expect.anything());
  });

  it("deletes an API key after confirming", async () => {
    mockLoad({ keys: [makeApiKey()] });
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Prod OpenAI")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "" })); // trash icon button
    expect(screen.getByRole("heading", { name: "Remove API key" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove key" }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/ai-gateway/keys/1");
    });
  });

  it("shows a budget-empty state and creates a new budget", async () => {
    mockParams = { tab: "budget" };
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No budget configured/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Set budget" }));
    fireEvent.change(screen.getByLabelText(/^Monthly limit/), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Set budget" }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        "/ai-gateway/budget",
        expect.objectContaining({ monthly_limit_usd: 100, alert_threshold_pct: 80 }),
      );
    });
  });

  it("renders existing budget details with usage bar", async () => {
    mockParams = { tab: "budget" };
    mockLoad({
      budget: {
        monthly_limit_usd: 100,
        current_spend_usd: 42.5,
        alert_threshold_pct: 80,
        is_hard_limit: true,
      },
    });
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("$100.00")).toBeInTheDocument();
    });
    expect(screen.getByText("$42.5000")).toBeInTheDocument();
    expect(screen.getByText("Yes (requests rejected)")).toBeInTheDocument();
  });

  it("renders the embedded VirtualKeysTab on the virtual-keys tab", async () => {
    mockParams = { tab: "virtual-keys" };
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("virtual-keys-tab")).toBeInTheDocument();
    });
  });

  it("saves guardrail error-behavior and replacement settings", async () => {
    mockParams = { tab: "guardrails" };
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Error behavior")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("PII replacement format"), {
      target: { value: "<REDACTED>" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        "/ai-gateway/guardrails/settings",
        expect.objectContaining({ pii_replacement_format: "<REDACTED>" }),
      );
    });
  });

  it("purges old guardrail logs", async () => {
    mockParams = { tab: "guardrails" };
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Audit log retention")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Purge old logs" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/ai-gateway/guardrails/logs/purge");
    });
  });

  it("purges old spend logs and shows the deleted count", async () => {
    mockParams = { tab: "guardrails" };
    mockPost.mockImplementation((url: string) => {
      if (url.includes("/spend/logs/purge")) {
        return Promise.resolve({ data: { deleted: 42 } });
      }
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Spend log cleanup")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Purge old spend logs" }));

    await waitFor(() => {
      expect(screen.getByText("Deleted 42 logs")).toBeInTheDocument();
    });
  });

  it("toggles global caching and saves cache settings", async () => {
    mockParams = { tab: "guardrails" };
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Response caching")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Default TTL (seconds)"), {
      target: { value: "7200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save cache settings" }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        "/ai-gateway/cache/settings",
        expect.objectContaining({ cache_default_ttl_seconds: 7200 }),
      );
    });
  });

  it("shows a risks loading skeleton then renders risk conditions", async () => {
    mockParams = { tab: "risks" };
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/ai-gateway/risk-settings")) {
        return Promise.resolve({
          data: {
            settings: [
              {
                condition_id: "pii_exposure",
                label: "PII exposure",
                default_threshold: { count: 5, period_days: 7 },
                default_severity: "high",
                is_enabled: true,
                threshold: { count: 5, period_days: 7 },
                severity_override: null,
              },
            ],
          },
        });
      }
      if (url.includes("/ai-gateway/risk-suggestions")) {
        return Promise.resolve({ data: { suggestions: [] } });
      }
      if (url.includes("/ai-gateway/keys")) return Promise.resolve({ data: { data: [] } });
      if (url.includes("/ai-gateway/budget")) return Promise.resolve({ data: { data: null } });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("PII exposure")).toBeInTheDocument();
    });
    expect(screen.getByText(/No pending risk suggestions/)).toBeInTheDocument();
  });

  it("toggles a risk condition and saves settings", async () => {
    mockParams = { tab: "risks" };
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/ai-gateway/risk-settings")) {
        return Promise.resolve({
          data: {
            settings: [
              {
                condition_id: "no_guardrails",
                label: "No guardrails",
                default_threshold: {},
                default_severity: "medium",
                is_enabled: true,
                threshold: {},
                severity_override: null,
              },
            ],
          },
        });
      }
      if (url.includes("/ai-gateway/risk-suggestions")) {
        return Promise.resolve({ data: { suggestions: [] } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("No guardrails")).toBeInTheDocument();
    });

    const saveButton = screen.getByRole("button", { name: "Save settings" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("switch"));
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        "/ai-gateway/risk-settings/no_guardrails",
        expect.objectContaining({ is_enabled: false }),
      );
    });
  });

  it("runs risk detection and shows the result message", async () => {
    mockParams = { tab: "risks" };
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/ai-gateway/risk-settings"))
        return Promise.resolve({ data: { settings: [] } });
      if (url.includes("/ai-gateway/risk-suggestions"))
        return Promise.resolve({ data: { suggestions: [] } });
      return Promise.resolve({ data: { data: [] } });
    });
    mockPost.mockImplementation((url: string) => {
      if (url.includes("/risk-suggestions/detect")) {
        return Promise.resolve({ data: { new_suggestions_count: 2 } });
      }
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No pending risk suggestions/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Run detection now" }));

    await waitFor(() => {
      expect(screen.getByText("2 new suggestions found")).toBeInTheDocument();
    });
  });

  it("accepts a pending risk suggestion", async () => {
    mockParams = { tab: "risks" };
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/ai-gateway/risk-settings"))
        return Promise.resolve({ data: { settings: [] } });
      if (url.includes("/ai-gateway/risk-suggestions")) {
        return Promise.resolve({
          data: {
            suggestions: [
              {
                id: 9,
                condition_id: "budget_exhaustion",
                title: "Budget nearly exhausted",
                description: "Spend is at 90% of monthly budget.",
                severity: "high",
                evidence: { pct: 90 },
                compliance_tags: ["EU AI Act"],
                suggested_mitigation: "Increase budget or reduce usage.",
                status: "pending",
                created_at: "2025-01-01T00:00:00Z",
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Budget nearly exhausted")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Accept as risk" }));
    expect(screen.getByRole("heading", { name: "Accept as risk" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create risk" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/risk-suggestions/9/accept",
        expect.objectContaining({ risk_name: "Budget nearly exhausted", severity: "high" }),
      );
    });
  });

  it("dismisses a pending risk suggestion with a reason", async () => {
    mockParams = { tab: "risks" };
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/ai-gateway/risk-settings"))
        return Promise.resolve({ data: { settings: [] } });
      if (url.includes("/ai-gateway/risk-suggestions")) {
        return Promise.resolve({
          data: {
            suggestions: [
              {
                id: 9,
                condition_id: "budget_exhaustion",
                title: "Budget nearly exhausted",
                description: "Spend is at 90%.",
                severity: "high",
                evidence: {},
                compliance_tags: [],
                suggested_mitigation: null,
                status: "pending",
                created_at: "2025-01-01T00:00:00Z",
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Budget nearly exhausted")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: "Already handled" } });

    const dismissButtons = screen.getAllByRole("button", { name: "Dismiss" });
    fireEvent.click(dismissButtons[dismissButtons.length - 1]);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/ai-gateway/risk-suggestions/9/dismiss", {
        dismiss_reason: "Already handled",
      });
    });
  });

  it("expands the history section for reviewed suggestions", async () => {
    mockParams = { tab: "risks" };
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/ai-gateway/risk-settings"))
        return Promise.resolve({ data: { settings: [] } });
      if (url.includes("/ai-gateway/risk-suggestions")) {
        return Promise.resolve({
          data: {
            suggestions: [
              {
                id: 3,
                condition_id: "budget_exhaustion",
                title: "Old suggestion",
                description: "desc",
                severity: "low",
                evidence: {},
                compliance_tags: [],
                suggested_mitigation: null,
                status: "accepted",
                reviewed_by_name: "Jane Doe",
                reviewed_at: "2025-01-05T00:00:00Z",
                created_at: "2025-01-01T00:00:00Z",
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("History (1)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("History (1)"));
    expect(screen.getByText("Old suggestion")).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
  });

  it("tolerates risk-settings/risk-suggestions fetch failures without crashing", async () => {
    // Both requests are individually `.catch(() => null)`-guarded in the
    // component, so a rejection here resolves to an empty risks view rather
    // than surfacing the (effectively unreachable) riskError state.
    mockParams = { tab: "risks" };
    mockGet.mockImplementation((url: string) => {
      if (
        url.includes("/ai-gateway/risk-settings") ||
        url.includes("/ai-gateway/risk-suggestions")
      ) {
        return Promise.reject(new Error("boom"));
      }
      return Promise.resolve({ data: { data: [] } });
    });
    renderWithProviders(<AIGatewaySettingsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No pending risk suggestions/)).toBeInTheDocument();
    });
  });
});
