import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const useReportRunsPageSpy = vi.fn();
const useRunAnalysesSpy = vi.fn();

vi.mock("../../../../application/hooks/useReporting", () => ({
  useReportRunsPage: (params: unknown) => useReportRunsPageSpy(params),
  useRunAnalyses: (runId: unknown) => useRunAnalysesSpy(runId),
}));

// Keeps the axios instance (and its env lookups) out of the test.
vi.mock("../../../../application/repository/reporting.repository", () => ({
  downloadReportRun: vi.fn(),
}));

import ArchiveTab from "../ArchiveTab";

const RUN_WITH_ANALYSES = {
  id: 1,
  name: "Weekly compliance digest",
  status: "completed",
  created_at: "2026-06-01T09:00:00Z",
  delivery_status: { storage: { enabled: true, status: "sent" } },
  file_id: 11,
  output_filename: "digest.pdf",
};

// A report generated without AI blocks: it exists, but has no analyses rows.
const RUN_WITHOUT_ANALYSES = {
  id: 2,
  name: "Quarterly board pack",
  status: "completed",
  created_at: "2026-06-02T09:00:00Z",
  delivery_status: null,
  file_id: null,
  output_filename: null,
};

const ANALYSIS = {
  id: 90,
  report_run_id: 1,
  section_key: "executiveSummary",
  payload: { summary: "Controls are largely in place.", abstain_reason: null },
  analysis_model: "gpt-4o-mini",
  analysis_version: 1,
  analyzed_at: "2026-06-01T09:05:00Z",
  analyzed_by: 7,
  audit_metadata: null,
};

/** Envelope shape returned by GET /reporting/runs. */
const page = (rows: unknown[], total: number) => ({
  data: { rows, total, limit: 10, offset: 0 },
  isLoading: false,
});

const openAnalysesFor = (index: number) =>
  fireEvent.click(screen.getAllByRole("button", { name: /View analyses/i })[index]);

describe("ArchiveTab", () => {
  beforeEach(() => {
    useReportRunsPageSpy.mockReset();
    useRunAnalysesSpy.mockReset();

    useReportRunsPageSpy.mockReturnValue(
      page([RUN_WITH_ANALYSES, RUN_WITHOUT_ANALYSES], 12),
    );
    // Only run 1 produced analyses.
    useRunAnalysesSpy.mockImplementation((runId: number | undefined) => ({
      data: runId === 1 ? [ANALYSIS] : [],
      isLoading: false,
    }));
  });

  it("renders rows from the paginated envelope", () => {
    renderWithProviders(<ArchiveTab />);

    expect(screen.getByText("Weekly compliance digest")).toBeInTheDocument();
    expect(screen.getByText("Quarterly board pack")).toBeInTheDocument();
    // Delivery summary, not a raw object.
    expect(screen.getByText("storage: sent")).toBeInTheDocument();
    // Total comes from the envelope, not the row count.
    expect(screen.getByText(/Showing 1 - 10 of 12 runs/)).toBeInTheDocument();
  });

  it("requests the next offset when the page changes", () => {
    renderWithProviders(<ArchiveTab />);

    expect(useReportRunsPageSpy).toHaveBeenLastCalledWith({ limit: 10, offset: 0 });

    fireEvent.click(screen.getByRole("button", { name: "next page" }));

    expect(useReportRunsPageSpy).toHaveBeenLastCalledWith({ limit: 10, offset: 10 });
  });

  it("loads and renders the analyses of the run whose action was clicked", () => {
    renderWithProviders(<ArchiveTab />);

    // Closed drawer must not fetch anything.
    expect(useRunAnalysesSpy).toHaveBeenLastCalledWith(undefined);

    openAnalysesFor(0);

    expect(useRunAnalysesSpy).toHaveBeenLastCalledWith(RUN_WITH_ANALYSES.id);
    expect(screen.getByText("Executive summary")).toBeInTheDocument();
    expect(screen.getByText("Controls are largely in place.")).toBeInTheDocument();
  });

  it("shows the panel's empty state for a run that has no analyses", () => {
    renderWithProviders(<ArchiveTab />);

    openAnalysesFor(1);

    expect(useRunAnalysesSpy).toHaveBeenLastCalledWith(RUN_WITHOUT_ANALYSES.id);
    expect(
      screen.getByText("No AI analyses were generated for this report run."),
    ).toBeInTheDocument();
  });

  it("shows the empty state when there are no runs at all", () => {
    useReportRunsPageSpy.mockReturnValue(page([], 0));
    renderWithProviders(<ArchiveTab />);

    expect(screen.getByText("No scheduled report runs yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "next page" })).not.toBeInTheDocument();
  });
});
