import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import OverviewTab from "./OverviewTab";
import {
  MrmAttestationStatus,
  MrmFindingSeverity,
  MrmTier,
} from "../../../../domain/enums/mrm.enum";
import { IMrmAttestationSummary } from "../../../../domain/interfaces/i.mrm";

const mockUseAttestationSummary = vi.fn();

vi.mock("../../../../application/hooks/useMrm", () => ({
  useAttestationSummary: () => mockUseAttestationSummary(),
}));

const mockDownloadAttestationReport = vi.fn();
vi.mock("../../../../application/repository/mrm.repository", () => ({
  downloadAttestationReport: (...args: unknown[]) => mockDownloadAttestationReport(...args),
}));

const summary: IMrmAttestationSummary = {
  generated_at: "2026-08-01T00:00:00Z",
  models_total: 5,
  models_untiered: 1,
  models_by_tier: { [MrmTier.TIER_1]: 2, [MrmTier.TIER_2]: 1, [MrmTier.TIER_3]: 2 },
  validation_coverage: { validated: 3, in_review: 1, not_started: 1, overdue: 0 },
  open_findings_by_severity: {
    [MrmFindingSeverity.CRITICAL]: 1,
    [MrmFindingSeverity.HIGH]: 2,
    [MrmFindingSeverity.MEDIUM]: 0,
    [MrmFindingSeverity.LOW]: 0,
  },
  overdue_validations: 2,
  per_tier: [
    {
      tier: MrmTier.TIER_1,
      models: 2,
      tiering_current: 2,
      validated: 1,
      monitoring_active: 1,
      open_findings: 1,
      critical_high_findings: 1,
      attestation_status: MrmAttestationStatus.BLOCKED,
    },
  ],
  attestation_status: MrmAttestationStatus.BLOCKED,
};

describe("OverviewTab", () => {
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a skeleton while loading", () => {
    mockUseAttestationSummary.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderWithProviders(<OverviewTab onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText(/Generate attestation report/i)).toBeInTheDocument();
  });

  it("shows an error empty state when the query fails", () => {
    mockUseAttestationSummary.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderWithProviders(<OverviewTab onError={onError} onSuccess={onSuccess} />);
    expect(
      screen.getByText("Could not load the portfolio summary. Try again shortly."),
    ).toBeInTheDocument();
  });

  it("shows a no-models empty state when the fleet is empty", () => {
    mockUseAttestationSummary.mockReturnValue({
      data: { ...summary, models_total: 0 },
      isLoading: false,
      isError: false,
    });
    renderWithProviders(<OverviewTab onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText(/No models in the inventory yet/)).toBeInTheDocument();
  });

  it("renders the portfolio cards and per-tier table", () => {
    mockUseAttestationSummary.mockReturnValue({ data: summary, isLoading: false, isError: false });
    renderWithProviders(<OverviewTab onError={onError} onSuccess={onSuccess} />);

    expect(screen.getByText("Models by tier")).toBeInTheDocument();
    expect(screen.getByText("2 · 1 · 2")).toBeInTheDocument();
    expect(screen.getByText("Validation coverage")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("Overdue validations")).toBeInTheDocument();
    expect(screen.getAllByText("Open findings").length).toBeGreaterThan(0);
    expect(screen.getByText("1 critical · 2 high")).toBeInTheDocument();
  });

  it("shows a no-tiered-models row when per_tier is empty", () => {
    mockUseAttestationSummary.mockReturnValue({
      data: { ...summary, per_tier: [] },
      isLoading: false,
      isError: false,
    });
    renderWithProviders(<OverviewTab onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText(/No tiered models yet/)).toBeInTheDocument();
  });

  it("generates the attestation report on button click", async () => {
    mockUseAttestationSummary.mockReturnValue({ data: summary, isLoading: false, isError: false });
    mockDownloadAttestationReport.mockResolvedValue(undefined);
    renderWithProviders(<OverviewTab onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByText("Generate attestation report"));

    await waitFor(() => {
      expect(mockDownloadAttestationReport).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledWith("Attestation report generated");
    });
  });

  it("surfaces an error when report generation fails", async () => {
    mockUseAttestationSummary.mockReturnValue({ data: summary, isLoading: false, isError: false });
    mockDownloadAttestationReport.mockRejectedValue(new Error("boom"));
    renderWithProviders(<OverviewTab onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByText("Generate attestation report"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Failed to generate attestation report");
    });
  });

  it("shows no open findings text when nothing is open", () => {
    mockUseAttestationSummary.mockReturnValue({
      data: {
        ...summary,
        open_findings_by_severity: {
          [MrmFindingSeverity.CRITICAL]: 0,
          [MrmFindingSeverity.HIGH]: 0,
          [MrmFindingSeverity.MEDIUM]: 0,
          [MrmFindingSeverity.LOW]: 0,
        },
      },
      isLoading: false,
      isError: false,
    });
    renderWithProviders(<OverviewTab onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText("No open findings")).toBeInTheDocument();
  });
});
