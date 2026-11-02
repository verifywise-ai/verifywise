import { act, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import {
  IShadowAiApiKey,
  IShadowAiSyslogConfig,
  IShadowAiSettings,
} from "../../../../domain/interfaces/i.shadowAi";

const mockCreateApiKey = vi.fn();
const mockListApiKeys = vi.fn();
const mockRevokeApiKey = vi.fn();
const mockDeleteApiKey = vi.fn();
const mockGetSyslogConfigs = vi.fn();
const mockCreateSyslogConfig = vi.fn();
const mockUpdateSyslogConfig = vi.fn();
const mockDeleteSyslogConfig = vi.fn();
const mockRegenerateSyslogKey = vi.fn();
const mockGetSyslogListenerStatus = vi.fn();
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
  regenerateSyslogKey: (...args: any[]) => mockRegenerateSyslogKey(...args),
  getSyslogListenerStatus: (...args: any[]) => mockGetSyslogListenerStatus(...args),
  getSettingsConfig: (...args: any[]) => mockGetSettingsConfig(...args),
  updateSettingsConfig: (...args: any[]) => mockUpdateSettingsConfig(...args),
}));

const mockOpenGuide = vi.fn();
vi.mock("../../../components/UserGuide/UserGuideSidebarContext", () => ({
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
    source_identifier: "203.0.113.7",
    parser_type: "zscaler",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    key_prefix: "vwsl_abcd1234efgh",
    last_event_at: null,
    events_accepted: 12,
    events_dropped: 3,
    last_drop_reason: "no_user",
  },
];

const listenerOn = {
  enabled: true,
  port: 6514,
  tls: true,
  plaintext: false,
  ipOnly: false,
  running: true,
  startError: null,
};

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
    mockGetSyslogListenerStatus.mockResolvedValue(listenerOn);
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
      expect(screen.getByText("203.0.113.7")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Zscaler").length).toBeGreaterThan(0);
    expect(screen.getByText("vwsl_abcd1234efgh...")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows the listener as on with the host, port and TLS", async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          `Syslog listener is on. Send to ${window.location.hostname}:6514 over TLS.`,
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows the listener as off with the env var to set", async () => {
    mockGetSyslogListenerStatus.mockResolvedValue({ ...listenerOn, enabled: false });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Syslog listener is off. Set SHADOW_AI_SYSLOG_ENABLED=true on the server to turn it on.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows the plain words for a drop reason", async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("No user email in the log line")).toBeInTheDocument();
    });
  });

  it("shows No key yet and a Generate key button when the key is missing", async () => {
    mockGetSyslogConfigs.mockResolvedValue([{ ...syslogConfigs[0], key_prefix: null }]);
    mockRegenerateSyslogKey.mockResolvedValue({
      ...syslogConfigs[0],
      key: "vwsl_fullsecretkey",
    });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("No key yet")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate key" }));

    await waitFor(() => {
      expect(mockRegenerateSyslogKey).toHaveBeenCalledWith(1);
    });
    expect(await screen.findByText("vw_source=vwsl_fullsecretkey")).toBeInTheDocument();
  });

  it("flags a legacy source identifier that is not an IP address", async () => {
    mockGetSyslogConfigs.mockResolvedValue([
      { ...syslogConfigs[0], source_identifier: "proxy-01.corp.com" },
    ]);
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("proxy-01.corp.com")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Not an IP address. Clear it or enter the sender's IP."),
    ).toBeInTheDocument();
  });

  it("does not flag a valid IPv6 sender address", async () => {
    mockGetSyslogConfigs.mockResolvedValue([
      { ...syslogConfigs[0], source_identifier: "2001:db8::1" },
    ]);
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("2001:db8::1")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Not an IP address/)).not.toBeInTheDocument();
  });

  it("adds a source and shows its key once in a dialog", async () => {
    mockCreateSyslogConfig.mockResolvedValue({
      ...syslogConfigs[0],
      id: 2,
      key: "vwsl_fullsecretkey",
    });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("203.0.113.7")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add source"));
    fireEvent.change(screen.getByLabelText("Allowed sender IP (optional)"), {
      target: { value: "198.51.100.4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockCreateSyslogConfig).toHaveBeenCalledWith({
        source_identifier: "198.51.100.4",
        parser_type: "generic_kv",
        is_active: true,
      });
    });
    expect(await screen.findByText("vw_source=vwsl_fullsecretkey")).toBeInTheDocument();
    expect(
      screen.getByText("Copy this key now. You won't be able to see it again."),
    ).toBeInTheDocument();

    // Closing the dialog drops the key from the page.
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByText("vw_source=vwsl_fullsecretkey")).not.toBeInTheDocument();
    });
  });

  it("adds a source without a sender IP", async () => {
    mockCreateSyslogConfig.mockResolvedValue({ ...syslogConfigs[0], key: "vwsl_k" });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("203.0.113.7")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Add source"));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(mockCreateSyslogConfig).toHaveBeenCalledWith({
        source_identifier: null,
        parser_type: "generic_kv",
        is_active: true,
      });
    });
  });

  it("blocks a sender IP that is not an IP address", async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("203.0.113.7")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Add source"));
    fireEvent.change(screen.getByLabelText("Allowed sender IP (optional)"), {
      target: { value: "proxy.corp.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Enter an IPv4 or IPv6 address.")).toBeInTheDocument();
    expect(mockCreateSyslogConfig).not.toHaveBeenCalled();
  });

  it("regenerates a key after confirming and shows the new key once", async () => {
    mockRegenerateSyslogKey.mockResolvedValue({ ...syslogConfigs[0], key: "vwsl_newsecret" });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("203.0.113.7")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Regenerate key" }));
    expect(
      await screen.findByText(
        "The current key stops working right away. Update the sender's log format with the new key.",
      ),
    ).toBeInTheDocument();
    expect(mockRegenerateSyslogKey).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    await waitFor(() => {
      expect(mockRegenerateSyslogKey).toHaveBeenCalledWith(1);
    });
    expect(await screen.findByText("vw_source=vwsl_newsecret")).toBeInTheDocument();
  });

  it("shows an error and no key dialog when regenerating fails", async () => {
    mockRegenerateSyslogKey.mockRejectedValue(new Error("boom"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("203.0.113.7")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Regenerate key" }));
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));

    expect(await screen.findByText("Could not generate a key. Try again.")).toBeInTheDocument();
    expect(screen.queryByText(/vw_source=/)).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it("edits an existing syslog source", async () => {
    mockUpdateSyslogConfig.mockResolvedValue({});
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("203.0.113.7")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("203.0.113.7"));

    await waitFor(() => {
      expect(screen.getByText("Edit syslog source")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      // The sender IP did not change, so it is not sent.
      expect(mockUpdateSyslogConfig).toHaveBeenCalledWith(1, { parser_type: "zscaler" });
    });
  });

  it("removes a syslog source after confirming", async () => {
    mockDeleteSyslogConfig.mockResolvedValue(undefined);
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("203.0.113.7")).toBeInTheDocument();
    });

    const rows = screen.getAllByRole("row");
    const dataRow = rows.find((r) => within(r).queryByText("203.0.113.7"))!;
    const trashButton = Array.from(dataRow.querySelectorAll("button")).find((btn) =>
      btn.querySelector("svg.lucide-trash"),
    )!;
    fireEvent.click(trashButton);

    await waitFor(() => {
      expect(screen.getByText('Remove "203.0.113.7"?')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(mockDeleteSyslogConfig).toHaveBeenCalledWith(1);
    });
  });

  it("issues only one key when Generate key is clicked twice quickly", async () => {
    mockGetSyslogConfigs.mockResolvedValue([{ ...syslogConfigs[0], key_prefix: null }]);
    mockRegenerateSyslogKey.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ...syslogConfigs[0], key: "vwsl_one" }), 20),
        ),
    );
    renderWithProviders(<SettingsPage />);

    const button = await screen.findByRole("button", { name: "Generate key" });
    // Both clicks land inside one act(), before React re-renders the button
    // as disabled, so only the ref guard can stop the second request.
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(await screen.findByText("vw_source=vwsl_one")).toBeInTheDocument();
    expect(mockRegenerateSyslogKey).toHaveBeenCalledTimes(1);
  });

  it("issues only one key when Regenerate is confirmed twice quickly", async () => {
    mockRegenerateSyslogKey.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ...syslogConfigs[0], key: "vwsl_two" }), 20),
        ),
    );
    renderWithProviders(<SettingsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Regenerate key" }));
    const confirm = await screen.findByRole("button", { name: "Regenerate" });
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });

    expect(await screen.findByText("vw_source=vwsl_two")).toBeInTheDocument();
    expect(mockRegenerateSyslogKey).toHaveBeenCalledTimes(1);
  });

  describe("legacy source identifier", () => {
    const legacy = { ...syslogConfigs[0], source_identifier: "proxy-01.corp.com" };

    it("removes the row", async () => {
      mockGetSyslogConfigs.mockResolvedValueOnce([legacy]).mockResolvedValue([]);
      mockDeleteSyslogConfig.mockResolvedValue(undefined);
      renderWithProviders(<SettingsPage />);

      await screen.findByText("proxy-01.corp.com");
      fireEvent.click(screen.getByRole("button", { name: "Remove source" }));
      fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

      await waitFor(() => {
        expect(mockDeleteSyslogConfig).toHaveBeenCalledWith(1);
      });
      await waitFor(() => {
        expect(screen.queryByText("proxy-01.corp.com")).not.toBeInTheDocument();
      });
    });

    it("changes the parser without sending the unchanged hostname", async () => {
      mockGetSyslogConfigs.mockResolvedValue([legacy]);
      mockUpdateSyslogConfig.mockResolvedValue({});
      renderWithProviders(<SettingsPage />);

      fireEvent.click(await screen.findByText("proxy-01.corp.com"));
      fireEvent.click(await screen.findByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(mockUpdateSyslogConfig).toHaveBeenCalledWith(1, { parser_type: "zscaler" });
      });
      expect(screen.queryByText("Enter an IPv4 or IPv6 address.")).not.toBeInTheDocument();
    });

    it("blocks Save for a changed value that is not an IP, then saves a valid one", async () => {
      mockGetSyslogConfigs.mockResolvedValue([legacy]);
      mockUpdateSyslogConfig.mockResolvedValue({});
      renderWithProviders(<SettingsPage />);

      fireEvent.click(await screen.findByText("proxy-01.corp.com"));
      fireEvent.change(await screen.findByLabelText("Allowed sender IP (optional)"), {
        target: { value: "proxy-02.corp.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(await screen.findByText("Enter an IPv4 or IPv6 address.")).toBeInTheDocument();
      expect(mockUpdateSyslogConfig).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText("Allowed sender IP (optional)"), {
        target: { value: "198.51.100.9" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(mockUpdateSyslogConfig).toHaveBeenCalledWith(1, {
          source_identifier: "198.51.100.9",
          parser_type: "zscaler",
        });
      });
    });

    it("clears the identifier by sending null", async () => {
      mockGetSyslogConfigs.mockResolvedValue([legacy]);
      mockUpdateSyslogConfig.mockResolvedValue({});
      renderWithProviders(<SettingsPage />);

      fireEvent.click(await screen.findByText("proxy-01.corp.com"));
      fireEvent.change(await screen.findByLabelText("Allowed sender IP (optional)"), {
        target: { value: "" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(mockUpdateSyslogConfig).toHaveBeenCalledWith(1, {
          source_identifier: null,
          parser_type: "zscaler",
        });
      });
    });
  });

  it("says the listener failed when it is enabled but not running", async () => {
    mockGetSyslogListenerStatus.mockResolvedValue({
      ...listenerOn,
      running: false,
      startError: { code: "EADDRINUSE", message: "listen EADDRINUSE" },
    });
    renderWithProviders(<SettingsPage />);

    expect(await screen.findByTestId("syslog-listener-status")).toHaveTextContent(
      "Syslog listener failed to start. Check the server log.",
    );
    expect(screen.queryByText(/Syslog listener is on/)).not.toBeInTheDocument();
  });

  it("says the listener is on when it is running", async () => {
    renderWithProviders(<SettingsPage />);

    expect(await screen.findByTestId("syslog-listener-status")).toHaveTextContent(
      /Syslog listener is on\. Send to .*:6514 over TLS\./,
    );
  });

  it("says the listener is off when it is disabled, not that it failed", async () => {
    mockGetSyslogListenerStatus.mockResolvedValue({
      ...listenerOn,
      enabled: false,
      running: false,
    });
    renderWithProviders(<SettingsPage />);

    expect(await screen.findByTestId("syslog-listener-status")).toHaveTextContent(
      /Syslog listener is off/,
    );
  });

  it("explains IP matching in IP-only mode", async () => {
    mockGetSyslogListenerStatus.mockResolvedValue({ ...listenerOn, ipOnly: true });
    renderWithProviders(<SettingsPage />);

    await screen.findByText("203.0.113.7");
    await screen.findByTestId("syslog-listener-status");
    fireEvent.click(screen.getByText("Add source"));
    expect(
      await screen.findByText("In IP-only mode, log lines without a key are matched by this IP."),
    ).toBeInTheDocument();
  });

  it("does not show the IP-only hint outside IP-only mode", async () => {
    renderWithProviders(<SettingsPage />);

    await screen.findByTestId("syslog-listener-status");
    fireEvent.click(screen.getByText("Add source"));
    await screen.findByLabelText("Allowed sender IP (optional)");
    expect(screen.queryByText(/IP-only mode/)).not.toBeInTheDocument();
  });

  it("tells the user when copying fails", async () => {
    mockCreateSyslogConfig.mockResolvedValue({ ...syslogConfigs[0], key: "vwsl_copyfail" });
    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
    writeText.mockRejectedValueOnce(new Error("denied"));
    renderWithProviders(<SettingsPage />);

    await screen.findByText("203.0.113.7");
    fireEvent.click(screen.getByText("Add source"));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await screen.findByText("vw_source=vwsl_copyfail");
    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));

    expect(
      await screen.findByText("Could not copy. Select the key and copy it by hand."),
    ).toBeInTheDocument();
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
    mockUpdateSettingsConfig.mockResolvedValue({
      ...settings,
      rate_limit_max_events_per_hour: 1000,
    });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Currently limited to 500 events/hour")).toBeInTheDocument();
    });

    // Wait for the field to reflect the loaded settings before editing it:
    // the settings-sync effect resets the input, so an edit that lands first is
    // overwritten, leaving Save disabled (it keys off `hasChanged`).
    const maxEventsField = screen.getByLabelText("Max events per hour") as HTMLInputElement;
    await waitFor(() => {
      expect(maxEventsField.value).toBe("500");
    });

    fireEvent.change(maxEventsField, { target: { value: "1000" } });

    const saveButton = screen.getByRole("button", { name: "Save" });
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
    fireEvent.click(saveButton);

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

    // Same settings-sync race as the rate-limit test: edit only once the field
    // holds the loaded value, and click only once Save has become enabled.
    const rawEventsField = screen.getByLabelText("Raw events (days)") as HTMLInputElement;
    await waitFor(() => {
      expect(rawEventsField.value).toBe("30");
    });

    fireEvent.change(rawEventsField, { target: { value: "60" } });

    const saveButton = screen.getByRole("button", { name: "Save retention settings" });
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
    fireEvent.click(saveButton);

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
