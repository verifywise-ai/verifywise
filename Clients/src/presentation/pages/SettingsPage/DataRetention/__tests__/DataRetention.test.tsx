import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen, waitFor, fireEvent, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import type {
  DataRetentionOverview,
  RetentionRow,
} from "../../../../../application/repository/dataRetention.repository";
import CustomException from "../../../../../infrastructure/exceptions/customeException";

const mockGetDataRetention = vi.fn();
const mockPreview = vi.fn();
const mockUpdateAudit = vi.fn();
const mockUpdateGateway = vi.fn();
vi.mock("../../../../../application/repository/dataRetention.repository", () => ({
  getDataRetention: (...args: unknown[]) => mockGetDataRetention(...args),
  previewAuditRetention: (...args: unknown[]) => mockPreview(...args),
  updateAuditRetention: (...args: unknown[]) => mockUpdateAudit(...args),
  updateGatewayRetention: (...args: unknown[]) => mockUpdateGateway(...args),
}));

const mockUpdateMrm = vi.fn();
vi.mock("../../../../../application/repository/mrm.repository", () => ({
  updateMrmSettings: (...args: unknown[]) => mockUpdateMrm(...args),
}));
const mockUpdateFileOrg = vi.fn();
vi.mock("../../../../../application/repository/fileOrgSettings.repository", () => ({
  updateFileOrgSettings: (...args: unknown[]) => mockUpdateFileOrg(...args),
}));
const mockUpdateShadow = vi.fn();
vi.mock("../../../../../application/repository/shadowAi.repository", () => ({
  updateSettingsConfig: (...args: unknown[]) => mockUpdateShadow(...args),
}));

vi.mock("../../../../../application/hooks/useFormattedDate", () => ({
  default: () => (date: Date) => date.toISOString().slice(0, 10),
}));

import DataRetention from "../index";

const buildRows = (overrides: Partial<Record<RetentionRow["key"], Partial<RetentionRow>>> = {}) => {
  const rows: RetentionRow[] = [
    {
      key: "audit_records",
      period: { unit: "months", value: 36 },
      automaticDeletion: "yes",
      lastCleanup: { ranAt: "2026-10-01T03:00:00Z", deletedCount: 12, status: "success" },
      source: "app",
    },
    {
      key: "ai_gateway_guardrail_logs",
      period: { unit: "days", value: 90 },
      automaticDeletion: "no",
      lastCleanup: null,
      source: "app",
    },
    {
      key: "ai_gateway_spend_logs",
      period: { unit: "days", value: 60 },
      automaticDeletion: "no",
      lastCleanup: { ranAt: "2026-10-02T03:00:00Z", deletedCount: 5, status: "capped" },
      source: "app",
    },
    {
      key: "agent_control_logs",
      period: { unit: "days", value: 30 },
      automaticDeletion: "yes",
      lastCleanup: null,
      source: "app",
      usesDeploymentDefault: true,
      deploymentDefaultDays: 30,
      minDays: 7,
    },
    {
      key: "mrm_metrics",
      period: { unit: "months", value: 24 },
      automaticDeletion: "yes",
      lastCleanup: { ranAt: "2026-10-03T03:00:00Z", deletedCount: 0, status: "failed" },
      source: "app",
    },
    {
      key: "evidence_files",
      period: { unit: "policy", value: "1_year" },
      automaticDeletion: "archive",
      lastCleanup: null,
      source: "app",
    },
    {
      key: "shadow_ai_events",
      period: { unit: "days", value: 30 },
      automaticDeletion: "yes",
      lastCleanup: null,
      source: "app",
    },
    {
      key: "shadow_ai_daily_rollups",
      period: null,
      automaticDeletion: "no",
      lastCleanup: null,
      source: "app",
    },
    {
      key: "shadow_ai_alert_history",
      period: { unit: "days", value: 365 },
      automaticDeletion: "yes",
      lastCleanup: null,
      source: "app",
    },
    {
      key: "server_logs",
      period: { unit: "days", value: 14 },
      automaticDeletion: "rotate",
      lastCleanup: null,
      source: "deployment",
      deploymentSetting: "LOG_RETENTION_DAYS",
    },
  ];
  return rows.map((r) => ({ ...r, ...overrides[r.key] }));
};

const respond = (
  rows: RetentionRow[],
  auditPrunedThrough: DataRetentionOverview["auditPrunedThrough"] = null,
) => mockGetDataRetention.mockResolvedValue({ rows, auditPrunedThrough });

const chooseOption = (comboboxIndex: number, optionName: string) => {
  fireEvent.mouseDown(screen.getAllByRole("combobox")[comboboxIndex]);
  fireEvent.click(within(screen.getByRole("listbox")).getByText(optionName));
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateAudit.mockResolvedValue({ months: null });
  mockUpdateGateway.mockResolvedValue(undefined);
  mockUpdateMrm.mockResolvedValue({});
  mockUpdateShadow.mockResolvedValue({});
  mockUpdateFileOrg.mockResolvedValue({});
});

describe("DataRetention table", () => {
  it("renders ten rows from the response", async () => {
    respond(buildRows());
    renderWithProviders(<DataRetention />);
    await waitFor(() => expect(screen.getAllByTestId(/^retention-row-/)).toHaveLength(10));
    expect(screen.getByText("Audit records")).toBeInTheDocument();
    expect(screen.getByText("Server logs")).toBeInTheDocument();
  });

  it("formats the kept-for, automatic deletion and last cleanup columns", async () => {
    respond(buildRows());
    renderWithProviders(<DataRetention />);
    const audit = await screen.findByTestId("retention-row-audit_records");
    expect(within(audit).getByText("3 years")).toBeInTheDocument();
    expect(within(audit).getByText("2026-10-01 · 12 removed")).toBeInTheDocument();
    const spend = screen.getByTestId("retention-row-ai_gateway_spend_logs");
    expect(within(spend).getByText("60 days")).toBeInTheDocument();
    expect(within(spend).getByText("2026-10-02 · 5 removed (more pending)")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("retention-row-mrm_metrics")).getByText("Failed"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("retention-row-agent_control_logs")).getByText("Daily"),
    ).toBeInTheDocument();
    const server = screen.getByTestId("retention-row-server_logs");
    expect(within(server).getAllByText("Rotated daily")).toHaveLength(2);
    expect(
      within(screen.getByTestId("retention-row-shadow_ai_daily_rollups")).getByText("Indefinitely"),
    ).toBeInTheDocument();
  });

  it.each([
    ["internal_key_not_configured", "Purge refused: internal key not configured"],
    ["internal_key_rejected", "Purge refused: internal key rejected"],
  ] as const)("shows a gateway purge refused with %s", async (refusal, text) => {
    respond(
      buildRows({
        ai_gateway_guardrail_logs: {
          lastCleanup: {
            ranAt: "2026-10-04T03:00:00Z",
            deletedCount: 0,
            status: "failed",
            refusal,
          },
        },
      }),
    );
    renderWithProviders(<DataRetention />);
    const guardrail = await screen.findByTestId("retention-row-ai_gateway_guardrail_logs");
    expect(within(guardrail).getByText(text)).toBeInTheDocument();
    expect(within(guardrail).queryByText("Failed")).not.toBeInTheDocument();
  });

  it.each([
    ["has no period (kept indefinitely)", { period: null, automaticDeletion: "no" }],
    ["is unavailable", { period: null, automaticDeletion: "no", unavailable: true }],
  ])("shows no Agent Control cleanup schedule when it %s", async (_case, override) => {
    respond(buildRows({ agent_control_logs: override as Partial<RetentionRow> }));
    renderWithProviders(<DataRetention />);
    const row = await screen.findByTestId("retention-row-agent_control_logs");
    expect(within(row).queryByText("Daily")).not.toBeInTheDocument();
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the removed-through notice when records were pruned", async () => {
    respond(buildRows(), { cutoff: "2025-06-01T00:00:00Z" });
    renderWithProviders(<DataRetention />);
    expect(
      await screen.findByText(
        "Audit records before 2025-06-01 were removed by the retention policy.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an error state, not an empty table, when loading fails", async () => {
    mockGetDataRetention.mockRejectedValue(new Error("network"));
    renderWithProviders(<DataRetention />);
    expect(await screen.findByText("Retention settings could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    respond(buildRows());
    fireEvent.click(screen.getByTestId("retention-retry"));
    expect(await screen.findByTestId("retention-row-audit_records")).toBeInTheDocument();
  });

  it("shows the Agent Control default and lets an Admin edit it", async () => {
    respond(buildRows());
    renderWithProviders(<DataRetention />);
    const row = await screen.findByTestId("retention-row-agent_control_logs");
    expect(within(row).getByText("30 days (deployment default)")).toBeInTheDocument();
    expect(within(row).getByTestId("retention-edit-agent_control_logs")).toBeInTheDocument();
  });

  it("gives deployment rows no Edit button", async () => {
    respond(buildRows());
    renderWithProviders(<DataRetention />);
    await screen.findByTestId("retention-row-server_logs");
    expect(screen.queryByTestId("retention-edit-server_logs")).not.toBeInTheDocument();
    expect(screen.getByText("Set by deployment: LOG_RETENTION_DAYS")).toBeInTheDocument();
    expect(screen.getByTestId("retention-edit-audit_records")).toBeInTheDocument();
  });

  it("gives unavailable rows no Edit button and no stated values", async () => {
    respond(
      buildRows({
        ai_gateway_guardrail_logs: { period: null, unavailable: true },
        ai_gateway_spend_logs: { period: null, unavailable: true },
      }),
    );
    renderWithProviders(<DataRetention />);
    const row = await screen.findByTestId("retention-row-ai_gateway_guardrail_logs");
    expect(within(row).getByText("Unavailable")).toBeInTheDocument();
    expect(within(row).queryByText("Indefinitely")).not.toBeInTheDocument();
    expect(within(row).queryByText("No")).not.toBeInTheDocument();
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.queryByTestId("retention-edit-ai_gateway_guardrail_logs"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("retention-edit-ai_gateway_spend_logs")).not.toBeInTheDocument();
  });
});

describe("Edit retention modal", () => {
  const open = async (key: RetentionRow["key"], overrides = {}) => {
    respond(buildRows(overrides));
    renderWithProviders(<DataRetention />);
    fireEvent.click(await screen.findByTestId(`retention-edit-${key}`));
  };

  it("previews and asks for confirmation before shortening audit retention", async () => {
    mockPreview.mockResolvedValue({ count: 1234 });
    await open("audit_records");
    chooseOption(0, "1 year");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "The next cleanup will permanently delete 1,234 records older than 1 year. Deleted records cannot be restored.",
      ),
    ).toBeInTheDocument();
    expect(mockPreview).toHaveBeenCalledWith(12);
    expect(mockUpdateAudit).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Export CSV first" })).toHaveAttribute(
      "href",
      "/settings/audit-ledger",
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete records" }));
    await waitFor(() => expect(mockUpdateAudit).toHaveBeenCalledWith(12));
  });

  it("confirms a shorter period even when no records are old enough yet", async () => {
    mockPreview.mockResolvedValue({ count: 0 });
    await open("audit_records");
    chooseOption(0, "1 year");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "No records are old enough to delete yet. From now on, records older than 1 year will be deleted permanently. Deleted records cannot be restored.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Export CSV first" })).toBeInTheDocument();
    expect(mockUpdateAudit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete records" }));
    await waitFor(() => expect(mockUpdateAudit).toHaveBeenCalledWith(12));
  });

  it("renders modal fields and selects at 30px, beating the house 34px stylesheets", async () => {
    // jsdom does not load the components' CSS files, so inject them as written.
    const style = document.createElement("style");
    const dir = resolve(__dirname, "../../../../components/Inputs");
    style.textContent = ["Field", "Select"]
      .map((c) => readFileSync(resolve(dir, c, "index.css"), "utf8"))
      .join("\n");
    document.head.appendChild(style);
    try {
      await open("mrm_metrics");
      const input = screen.getByLabelText(/Keep for \(months\)/);
      expect(getComputedStyle(input.closest(".MuiInputBase-root") as Element).height).toBe("30px");
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      fireEvent.click(await screen.findByTestId("retention-edit-audit_records"));
      const select = screen.getAllByRole("combobox")[0];
      expect(getComputedStyle(select).height).toBe("30px");
    } finally {
      style.remove();
    }
  });

  it("treats indefinitely as the longest period when shortening", async () => {
    mockPreview.mockResolvedValue({ count: 7 });
    await open("audit_records", { audit_records: { period: null } });
    chooseOption(0, "10 years");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Delete records" });
    expect(mockPreview).toHaveBeenCalledWith(120);
    expect(mockUpdateAudit).not.toHaveBeenCalled();
  });

  it("saves a longer audit period without a preview", async () => {
    await open("audit_records");
    chooseOption(0, "5 years");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockUpdateAudit).toHaveBeenCalledWith(60));
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("sends null when audit retention is set to indefinitely", async () => {
    await open("audit_records");
    chooseOption(0, "Keep indefinitely");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockUpdateAudit).toHaveBeenCalledWith(null));
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("keeps the modal open when the save fails", async () => {
    mockUpdateAudit.mockRejectedValue(new Error("boom"));
    await open("audit_records");
    chooseOption(0, "5 years");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockUpdateAudit).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("sends only the changed days key for a gateway row", async () => {
    await open("ai_gateway_guardrail_logs");
    fireEvent.change(screen.getByLabelText(/Keep for \(days\)/), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockUpdateGateway).toHaveBeenCalledWith({ log_retention_days: 30 }));
  });

  it("confirms before turning on automatic deletion, then sends only the toggle", async () => {
    await open("ai_gateway_spend_logs");
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        // Automatic deletion covers both log types, so both periods are named:
        // the guardrail row's current 90 days and the spend row's 60 days.
        "Guardrail logs older than 90 days and spend logs older than 60 days will be deleted permanently every day. Deleted logs cannot be restored.",
      ),
    ).toBeInTheDocument();
    expect(mockUpdateGateway).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete records" }));
    await waitFor(() =>
      expect(mockUpdateGateway).toHaveBeenCalledWith({ auto_purge_enabled: true }),
    );
  });

  it("confirms before shortening a gateway period while automatic deletion is on", async () => {
    await open("ai_gateway_guardrail_logs", {
      ai_gateway_guardrail_logs: { automaticDeletion: "yes" },
    });
    fireEvent.change(screen.getByLabelText(/Keep for \(days\)/), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        // The new guardrail value and the spend row's current value.
        "Guardrail logs older than 30 days and spend logs older than 60 days will be deleted permanently every day. Deleted logs cannot be restored.",
      ),
    ).toBeInTheDocument();
    expect(mockUpdateGateway).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete records" }));
    await waitFor(() => expect(mockUpdateGateway).toHaveBeenCalledWith({ log_retention_days: 30 }));
  });

  it("saves a longer gateway period without confirmation while automatic deletion is on", async () => {
    await open("ai_gateway_guardrail_logs", {
      ai_gateway_guardrail_logs: { automaticDeletion: "yes" },
    });
    fireEvent.change(screen.getByLabelText(/Keep for \(days\)/), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockUpdateGateway).toHaveBeenCalledWith({ log_retention_days: 120 }),
    );
    expect(screen.queryByText(/will be deleted permanently every day/)).not.toBeInTheDocument();
  });

  it("uses the spend key for the spend logs row", async () => {
    await open("ai_gateway_spend_logs");
    fireEvent.change(screen.getByLabelText(/Keep for \(days\)/), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete records" }));
    await waitFor(() =>
      expect(mockUpdateGateway).toHaveBeenCalledWith({
        spend_log_retention_days: 45,
        auto_purge_enabled: true,
      }),
    );
  });

  it("shows the gateway's validation detail on the form", async () => {
    mockUpdateGateway.mockRejectedValue(
      new CustomException("Request failed with status code 403", 403, {
        detail: "Admin access required",
      }),
    );
    await open("ai_gateway_guardrail_logs");
    fireEvent.change(screen.getByLabelText(/Keep for \(days\)/), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Admin access required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("returns from the confirmation to the form with the gateway's detail", async () => {
    mockUpdateGateway.mockRejectedValue(
      new CustomException("Request failed with status code 403", 403, {
        detail: "Admin role required",
      }),
    );
    await open("ai_gateway_spend_logs");
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete records" }));
    expect(await screen.findByText("Admin role required")).toBeInTheDocument();
    expect(screen.getByLabelText(/Keep for \(days\)/)).toBeInTheDocument();
  });

  it("blocks invalid gateway days", async () => {
    await open("ai_gateway_guardrail_logs");
    fireEvent.change(screen.getByLabelText(/Keep for \(days\)/), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a number of at least 1")).toBeInTheDocument();
    expect(mockUpdateGateway).not.toHaveBeenCalled();
  });

  it("caps gateway days at 3650 (10 years)", async () => {
    await open("ai_gateway_spend_logs");
    const field = screen.getByLabelText(/Keep for \(days\)/);
    fireEvent.change(field, { target: { value: "3651" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a number no greater than 3650")).toBeInTheDocument();
    expect(mockUpdateGateway).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: "3650" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockUpdateGateway).toHaveBeenCalledWith({ spend_log_retention_days: 3650 }),
    );
  });

  it("blocks MRM retention below 13 months and saves 13", async () => {
    await open("mrm_metrics");
    const field = screen.getByLabelText(/Keep for \(months\)/);
    fireEvent.change(field, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a number of at least 13")).toBeInTheDocument();
    expect(mockUpdateMrm).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: "13" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockUpdateMrm).toHaveBeenCalledWith({ retention_months: 13 }));
  });

  it("treats an empty Shadow AI value as indefinitely and caps at 3650", async () => {
    await open("shadow_ai_events");
    const field = screen.getByLabelText(/Keep for \(days\)/);
    fireEvent.change(field, { target: { value: "3651" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a number no greater than 3650")).toBeInTheDocument();
    expect(mockUpdateShadow).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockUpdateShadow).toHaveBeenCalledWith({ retention_events_days: 0 }),
    );
  });

  it("saves the evidence default policy", async () => {
    await open("evidence_files");
    chooseOption(0, "3 years");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockUpdateFileOrg).toHaveBeenCalledWith({ default_retention_policy: "3_years" }),
    );
  });
});
