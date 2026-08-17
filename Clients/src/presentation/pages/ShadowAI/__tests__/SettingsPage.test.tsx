import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { IShadowAiApiKey, IShadowAiSyslogConfig, IShadowAiSettings } from "../../../../domain/interfaces/i.shadowAi";

const mockCreateApiKey = vi.fn();
const mockListApiKeys = vi.fn();
const mockRevokeApiKey = vi.fn();
const mockDeleteApiKey = vi.fn();
const mockGetSyslogConfigs = vi.fn();
const mockCreateSyslogConfig = vi.fn();
const mockUpdateSyslogConfig = vi.fn();
const mockDeleteSyslogConfig = vi.fn();
const mockGetSettingsConfig = vi.fn();
const mockUpdateSettingsConfig = vi.fn();

vi.mock("../../../../application/repository/shadowAi.repository", () => ({
  createApiKey: (...args: any[]) => mockCreateApiKey(...args),
  listApiKeys: (...args: any[]) => mockListApiKeys(...args),
  revokeApiKey: (...args: any[]) => mockRevokeApiKey(...args),
  deleteApiKey: (...args: any[]) => mockDeleteApiKey(...args),
  getSyslogConfigs: (...args: any[]) => mockGetSyslogConfigs(...args),
  createSyslogConfig: (...args: any[]) => mockCreateSyslogConfig(...args),
  updateSyslogConfig: (...args: any[]) => mockUpdateSyslogConfig(...args),
  deleteSyslogConfig: (...args: any[]) => mockDeleteSyslogConfig(...args),
  getSettingsConfig: (...args: any[]) => mockGetSettingsConfig(...args),
  updateSettingsConfig: (...args: any[]) => mockUpdateSettingsConfig(...args),
}));

const mockOpenGuide = vi.fn();
vi.mock("../../../components/UserGuide", () => ({
  useUserGuideSidebarContext: () => ({ open: mockOpenGuide }),
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

Object.assign(navigator, { clipboard: { writeText: vi.fn() } });

import SettingsPage from "../SettingsPage";

const apiKeys: IShadowAiApiKey[] = [
  {
    id: 1,
    key_prefix: "sk_live_abc",
    label: "Zscaler proxy",
    created_by: 1,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    last_used_at: "2026-01-15T00:00:00Z",
  },
];

const syslogConfigs: IShadowAiSyslogConfig[] = [
  {
    id: 1,
    source_identifier: "proxy-01.corp.com",
    parser_type: "zscaler",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
];

const settings: IShadowAiSettings = {
  id: 1,
  rate_limit_max_events_per_hour: 500,
  retention_events_days: 30,
  retention_daily_rollups_days: 365,
  retention_alert_history_days: 90,
};

describe("ShadowAI - SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListApiKeys.mockResolvedValue(apiKeys);
    mockGetSyslogConfigs.mockResolvedValue(syslogConfigs);
    mockGetSettingsConfig.mockResolvedValue(settings);
  });

  it("renders without crashing", () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByTestId("page-header")).toBeInTheDocument();
  });

  it("renders section headings", async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("API keys")).toBeInTheDocument();
    });
    expect(screen.getByText("Syslog sources")).toBeInTheDocument();
    expect(screen.getByText("Data formats")).toBeInTheDocument();
    expect(screen.getByText("Rate limiting")).toBeInTheDocument();
    expect(screen.getByText("Data retention")).toBeInTheDocument();
    expect(screen.getByText("Risk score calculation")).toBeInTheDocument();
  });

  // ─── API keys ───────────────────────────────────────────────────────

  it("shows a message when there are no API keys", async () => {
    mockListApiKeys.mockResolvedValue([]);
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("No API keys created yet")).toBeInTheDocument();
    });
  });

  it("renders the API keys table", async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Zscaler proxy")).toBeInTheDocument();
    });
    expect(screen.getByText("sk_live_abc...")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  });

  it("creates a new API key and shows the created-key banner", async () => {
    mockCreateApiKey.mockResolvedValue({ key: "sk_live_full_secret" });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Zscaler proxy")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Create API key"));
    fireEvent.change(screen.getByLabelText("Label (optional)"), {
      target: { value: "New key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(mockCreateApiKey).toHaveBeenCalledWith("New key");
    });
    await waitFor(() => {
      expect(screen.getByText("sk_live_full_secret")).toBeInTheDocument();
    });
  });

  it("revokes an active API key after confirming", async () => {
    mockRevokeApiKey.mockResolvedValue(undefined);
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Zscaler proxy")).toBeInTheDocument();
    });

    const revokeButton = screen.getByTitle("Revoke key");
    fireEvent.click(revokeButton);

    await waitFor(() => {
      expect(screen.getByText('Revoke "Zscaler proxy"?')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => {
      expect(mockRevokeApiKey).toHaveBeenCalledWith(1);
    });
  });

  it("deletes a revoked API key after confirming", async () => {
    mockListApiKeys.mockResolvedValue([{ ...apiKeys[0], is_active: false }]);
    mockDeleteApiKey.mockResolvedValue(undefined);
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Zscaler proxy")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle("Delete key"));

    await waitFor(() => {
      expect(screen.getByText('Delete "Zscaler proxy"?')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockDeleteApiKey).toHaveBeenCalledWith(1);
    });
  });

  // ─── Syslog config ──────────────────────────────────────────────────

  it("shows a message when there are no syslog sources", async () => {
    mockGetSyslogConfigs.mockResolvedValue([]);
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("No syslog sources configured")).toBeInTheDocument();
    });
  });

  it("renders the syslog sources table", async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("proxy-01.corp.com")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Zscaler").length).toBeGreaterThan(0);
  });

  it("adds a new syslog source", async () => {
    mockCreateSyslogConfig.mockResolvedValue({});
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("proxy-01.corp.com")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add source"));
    fireEvent.change(screen.getByLabelText("Source identifier"), {
      target: { value: "proxy-02.corp.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockCreateSyslogConfig).toHaveBeenCalledWith({
        source_identifier: "proxy-02.corp.com",
        parser_type: "generic_kv",
        is_active: true,
      });
    });
  });

  it("edits an existing syslog source", async () => {
    mockUpdateSyslogConfig.mockResolvedValue({});
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("proxy-01.corp.com")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("proxy-01.corp.com"));

    await waitFor(() => {
      expect(screen.getByText("Edit syslog source")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateSyslogConfig).toHaveBeenCalledWith(1, {
        source_identifier: "proxy-01.corp.com",
        parser_type: "zscaler",
      });
    });
  });

  it("removes a syslog source after confirming", async () => {
    mockDeleteSyslogConfig.mockResolvedValue(undefined);
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("proxy-01.corp.com")).toBeInTheDocument();
    });

    const rows = screen.getAllByRole("row");
    const dataRow = rows.find((r) => r.textContent?.includes("proxy-01.corp.com"))!;
    const trashButton = Array.from(dataRow.querySelectorAll("button")).find((btn) =>
      btn.querySelector("svg.lucide-trash2"),
    )!;
    fireEvent.click(trashButton);

    await waitFor(() => {
      expect(screen.getByText('Remove "proxy-01.corp.com"?')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(mockDeleteSyslogConfig).toHaveBeenCalledWith(1);
    });
  });

  // ─── Data formats ───────────────────────────────────────────────────

  it("renders the REST API schema reference and syslog format examples", async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("REST API event schema")).toBeInTheDocument();
    });
    expect(screen.getByText("Syslog format examples")).toBeInTheDocument();
    expect(screen.getByText("Field mapping")).toBeInTheDocument();
    expect(screen.getAllByText("user_email").length).toBeGreaterThan(0);
  });

  // ─── Rate limiting ──────────────────────────────────────────────────

  it("shows the current rate limit and saves a new one", async () => {
    mockUpdateSettingsConfig.mockResolvedValue({ ...settings, rate_limit_max_events_per_hour: 1000 });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Currently limited to 500 events/hour")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Max events per hour"), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateSettingsConfig).toHaveBeenCalledWith({
        rate_limit_max_events_per_hour: 1000,
      });
    });
  });

  it("shows 'No rate limit applied' when the limit is 0", async () => {
    mockGetSettingsConfig.mockResolvedValue({ ...settings, rate_limit_max_events_per_hour: 0 });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("No rate limit applied")).toBeInTheDocument();
    });
  });

  // ─── Data retention ─────────────────────────────────────────────────

  it("saves updated retention settings", async () => {
    mockUpdateSettingsConfig.mockResolvedValue(settings);
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Raw events (days)")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Raw events (days)"), {
      target: { value: "60" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save retention settings" }));

    await waitFor(() => {
      expect(mockUpdateSettingsConfig).toHaveBeenCalledWith({
        retention_events_days: 60,
        retention_daily_rollups_days: 365,
        retention_alert_history_days: 90,
      });
    });
  });

  // ─── Risk score ─────────────────────────────────────────────────────

  it("renders the risk score weighting breakdown", async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Approval status")).toBeInTheDocument();
    });
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("Data & compliance")).toBeInTheDocument();
    expect(screen.getByText("Usage volume")).toBeInTheDocument();
    expect(screen.getByText("Department sensitivity")).toBeInTheDocument();
  });

  it("logs and recovers when a load call fails", async () => {
    mockListApiKeys.mockRejectedValue(new Error("network error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("page-header")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });
    consoleSpy.mockRestore();
  });
});
