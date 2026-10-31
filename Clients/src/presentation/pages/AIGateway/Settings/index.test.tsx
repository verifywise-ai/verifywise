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
import CustomException from "../../../../infrastructure/exceptions/customeException";
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

  it("asks for confirmation before purging guardrail logs and shows the deleted count", async () => {
    mockParams = { tab: "guardrails" };
    mockLoad({ gs: { log_retention_days: 45 } });
    mockPost.mockResolvedValue({ data: { purged: true, total_deleted: 7, retention_days: 45 } });
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Audit log retention")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Purge old logs" }));

    expect(
      await screen.findByText("Permanently delete guardrail logs older than 45 days?"),
    ).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Purge logs" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/ai-gateway/guardrails/logs/purge");
    });
    expect(await screen.findByText("7 logs deleted")).toBeInTheDocument();
  });

  it("does not purge when the confirmation is cancelled", async () => {
    mockParams = { tab: "guardrails" };
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Audit log retention")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Purge old logs" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(mockPost).not.toHaveBeenCalled();
  });

  it("shows the error message when the purge fails", async () => {
    mockParams = { tab: "guardrails" };
    // networkServices moves a 4xx reason from the response envelope into the message.
    mockPost.mockRejectedValue(new CustomException("Only admins can purge logs", 403, {}));
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Audit log retention")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Purge old logs" }));
    fireEvent.click(await screen.findByRole("button", { name: "Purge logs" }));

    expect(await screen.findByText("Only admins can purge logs")).toBeInTheDocument();
  });

  it("seeds and sends the spend log retention and automatic deletion settings", async () => {
    mockParams = { tab: "guardrails" };
    mockLoad({ gs: { spend_log_retention_days: 30, auto_purge_enabled: false } });
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Spend log retention (days)")).toHaveValue("30");
    });

    fireEvent.change(screen.getByLabelText("Spend log retention (days)"), {
      target: { value: "14" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Delete automatically" }));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    // Turning automatic deletion on is confirmed first, naming both periods.
    expect(
      await screen.findByText(
        "Guardrail logs older than 90 days and spend logs older than 14 days will be deleted permanently every day. Deleted logs cannot be restored.",
      ),
    ).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete records" }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        "/ai-gateway/guardrails/settings",
        expect.objectContaining({ spend_log_retention_days: 14, auto_purge_enabled: true }),
      );
    });
  });

  it("does not save when the automatic deletion confirmation is cancelled", async () => {
    mockParams = { tab: "guardrails" };
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Spend log retention (days)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("switch", { name: "Delete automatically" }));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(mockPut).not.toHaveBeenCalled();
  });

  it("confirms shortening a period while automatic deletion is on", async () => {
    mockParams = { tab: "guardrails" };
    mockLoad({
      gs: { log_retention_days: 60, spend_log_retention_days: 30, auto_purge_enabled: true },
    });
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Retention period (days)")).toHaveValue("60");
    });

    fireEvent.change(screen.getByLabelText("Retention period (days)"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(
      await screen.findByText(
        "Guardrail logs older than 20 days and spend logs older than 30 days will be deleted permanently every day. Deleted logs cannot be restored.",
      ),
    ).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete records" }));
    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        "/ai-gateway/guardrails/settings",
        expect.objectContaining({ log_retention_days: 20, auto_purge_enabled: true }),
      );
    });
  });

  it("saves a longer period without confirmation while automatic deletion is on", async () => {
    mockParams = { tab: "guardrails" };
    mockLoad({
      gs: { log_retention_days: 60, spend_log_retention_days: 30, auto_purge_enabled: true },
    });
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Spend log retention (days)")).toHaveValue("30");
    });

    fireEvent.change(screen.getByLabelText("Spend log retention (days)"), {
      target: { value: "45" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(
        "/ai-gateway/guardrails/settings",
        expect.objectContaining({ spend_log_retention_days: 45 }),
      );
    });
    expect(screen.queryByText(/will be deleted permanently every day/)).not.toBeInTheDocument();
  });

  it("rejects more than 3650 days without calling the server", async () => {
    mockParams = { tab: "guardrails" };
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Spend log retention (days)")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Spend log retention (days)"), {
      target: { value: "3651" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(
      await screen.findByText("Retention periods must be whole numbers from 1 to 3650 days"),
    ).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("defaults to 90 days and no automatic deletion when settings are missing", async () => {
    mockParams = { tab: "guardrails" };
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Spend log retention (days)")).toHaveValue("90");
    });
    expect(screen.getByRole("switch", { name: "Delete automatically" })).not.toBeChecked();
  });

  it("rejects an invalid number of days without calling the server", async () => {
    mockParams = { tab: "guardrails" };
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Spend log retention (days)")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Spend log retention (days)"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(
      await screen.findByText("Retention periods must be whole numbers from 1 to 3650 days"),
    ).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("shows the gateway detail from the error shape apiServices produces", async () => {
    mockParams = { tab: "guardrails" };
    // apiServices rejects with CustomException(message, status, rawBody)
    mockPut.mockRejectedValue(
      new CustomException("Request failed with status code 400", 400, {
        detail: "spend_log_retention_days must be an integer >= 1",
      }),
    );
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Error behavior")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(
      await screen.findByText("spend_log_retention_days must be an integer >= 1"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Request failed with status code 400")).not.toBeInTheDocument();
  });

  it("shows the gateway's message from an object detail", async () => {
    mockParams = { tab: "guardrails" };
    mockPut.mockRejectedValue(
      new CustomException("Request failed with status code 409", 409, {
        detail: { message: "Settings were changed by someone else", code: "settings_conflict" },
      }),
    );
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Error behavior")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(await screen.findByText("Settings were changed by someone else")).toBeInTheDocument();
  });

  it("hides the gateway's internal key error behind the generic message", async () => {
    mockParams = { tab: "guardrails" };
    mockPut.mockRejectedValue(
      new CustomException("Request failed with status code 401", 401, {
        detail: { message: "Invalid internal key", code: "internal_key_rejected" },
      }),
    );
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Error behavior")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(await screen.findByText("Failed to save settings")).toBeInTheDocument();
    expect(screen.queryByText("Invalid internal key")).not.toBeInTheDocument();
  });

  it.each([
    [
      "axios's generic message",
      new CustomException("Request failed with status code 500", 500, {}),
    ],
    ["a server error's reason", new CustomException("database exploded", 500, { error: "x" })],
    ["a network error", new Error("Network Error")],
  ])("shows the translated fallback instead of %s", async (_case, err) => {
    mockParams = { tab: "guardrails" };
    mockPut.mockRejectedValue(err);
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Error behavior")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(await screen.findByText("Failed to save settings")).toBeInTheDocument();
    expect(screen.queryByText((err as Error).message)).not.toBeInTheDocument();
  });

  it("shows the server error when saving settings fails", async () => {
    mockParams = { tab: "guardrails" };
    mockPut.mockRejectedValue(
      new CustomException("spend_log_retention_days must be at least 1", 400, {}),
    );
    renderWithProviders(<AIGatewaySettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Error behavior")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(
      await screen.findByText("spend_log_retention_days must be at least 1"),
    ).toBeInTheDocument();
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
