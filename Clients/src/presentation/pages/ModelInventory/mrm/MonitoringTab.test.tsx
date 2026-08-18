import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import MonitoringTab from "./MonitoringTab";
import {
  MrmEvalStatus,
  MrmThresholdOp,
  MrmThresholdSeverity,
  MrmTier,
} from "../../../../domain/enums/mrm.enum";
import {
  IMrmBreachHistoryRow,
  IMrmFleetRow,
  IMrmMonitoringRow,
  IMrmThreshold,
} from "../../../../domain/interfaces/i.mrm";

const mockUseFleetTiering = vi.fn();
const mockUseModelMonitoring = vi.fn();
const mockUseThresholds = vi.fn();
const mockUseModelBreaches = vi.fn();
const mockUseMetricTrend = vi.fn();

vi.mock("../../../../application/hooks/useMrm", () => ({
  useFleetTiering: () => mockUseFleetTiering(),
  useModelMonitoring: () => mockUseModelMonitoring(),
  useThresholds: () => mockUseThresholds(),
  useModelBreaches: () => mockUseModelBreaches(),
  useMetricTrend: () => mockUseMetricTrend(),
}));

const fleet: IMrmFleetRow[] = [
  {
    id: 1,
    provider: "OpenAI",
    model: "GPT-4",
    version: "1.0",
    status: "Approved",
    external_key: "gpt4",
    mrm_tier: MrmTier.TIER_1,
    mrm_materiality_drivers: null,
    mrm_tiered_at: null,
    mrm_tiered_by: null,
  },
];

const monitoringRow: IMrmMonitoringRow = {
  metric: "psi",
  segment: "subprime",
  window: "daily",
  value: 0.24,
  at: "2026-08-16T00:00:00Z",
  metric_id: 1,
  status: MrmEvalStatus.WARN,
  threshold_id: 1,
  evaluated_at: "2026-08-16T01:00:00Z",
};

const threshold: IMrmThreshold = {
  id: 1,
  organization_id: 1,
  model_inventory_id: 1,
  metric: "psi",
  segment: "subprime",
  window: "daily",
  op: MrmThresholdOp.GTE,
  value_num: 0.2,
  severity: MrmThresholdSeverity.WARN,
  breach_action: "notify" as never,
  active: true,
};

const breach: IMrmBreachHistoryRow = {
  evaluation_id: 1,
  metric_id: 1,
  metric: "psi",
  value: 0.3,
  at: "2026-08-15T00:00:00Z",
  segment: "overall",
  window: "daily",
  status: MrmEvalStatus.BREACH,
  threshold_id: 1,
  threshold_snapshot: { op: MrmThresholdOp.GTE, value_num: 0.2 },
  evaluated_at: "2026-08-15T01:00:00Z",
};

describe("MonitoringTab", () => {
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFleetTiering.mockReturnValue({ data: fleet });
    mockUseThresholds.mockReturnValue({ data: [], isError: false, error: null });
    mockUseModelBreaches.mockReturnValue({ data: [] });
    mockUseMetricTrend.mockReturnValue({ data: [] });
    mockUseModelMonitoring.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it("prompts to select a model before showing anything", () => {
    renderWithProviders(<MonitoringTab onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText("Select a model to view its monitored metrics.")).toBeInTheDocument();
  });

  it("selects a model and shows a loading skeleton", async () => {
    mockUseModelMonitoring.mockReturnValue({
      data: [],
      isLoading: true,
      isError: false,
      error: null,
    });
    renderWithProviders(<MonitoringTab onError={onError} onSuccess={onSuccess} />);

    const modelSelect = screen.getByRole("combobox");
    fireEvent.mouseDown(modelSelect);
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI · GPT-4 (v1.0)" }));

    expect(screen.getByText(/Five threshold shapes cover the common cases/)).toBeInTheDocument();
  });

  it("shows a no-data empty state for a model with no metrics yet", async () => {
    renderWithProviders(<MonitoringTab onError={onError} onSuccess={onSuccess} />);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI · GPT-4 (v1.0)" }));

    expect(
      screen.getByText(/awaiting its first metric from your monitoring feed/),
    ).toBeInTheDocument();
  });

  it("renders monitoring rows with their matching threshold and breach history", async () => {
    mockUseModelMonitoring.mockReturnValue({
      data: [monitoringRow],
      isLoading: false,
      isError: false,
      error: null,
    });
    mockUseThresholds.mockReturnValue({ data: [threshold], isError: false, error: null });
    mockUseModelBreaches.mockReturnValue({ data: [breach] });

    renderWithProviders(<MonitoringTab onError={onError} onSuccess={onSuccess} />);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI · GPT-4 (v1.0)" }));

    expect(screen.getAllByText("psi").length).toBeGreaterThan(0);
    expect(screen.getByText("(subprime)")).toBeInTheDocument();
    expect(screen.getAllByText("≥ 0.2").length).toBeGreaterThan(0);
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Breach history")).toBeInTheDocument();
    expect(screen.getByText("Breach")).toBeInTheDocument();
  });

  it("shows a no-breaches empty state when the model has none", async () => {
    mockUseModelMonitoring.mockReturnValue({
      data: [monitoringRow],
      isLoading: false,
      isError: false,
      error: null,
    });
    renderWithProviders(<MonitoringTab onError={onError} onSuccess={onSuccess} />);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI · GPT-4 (v1.0)" }));

    expect(
      screen.getByText("No breaches recorded. Every metric is within its threshold."),
    ).toBeInTheDocument();
  });

  it("surfaces monitoring and threshold query errors", async () => {
    mockUseModelMonitoring.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error("monitoring failed"),
    });
    mockUseThresholds.mockReturnValue({
      data: [],
      isError: true,
      error: new Error("thresholds failed"),
    });
    renderWithProviders(<MonitoringTab onError={onError} onSuccess={onSuccess} />);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI · GPT-4 (v1.0)" }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("monitoring failed");
      expect(onError).toHaveBeenCalledWith("thresholds failed");
    });
  });
});
