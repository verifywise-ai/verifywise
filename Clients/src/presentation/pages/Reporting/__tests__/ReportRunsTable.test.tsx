import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockRunsPage = vi.fn();
const mockArchive = vi.fn();
const mockRestore = vi.fn();
const mockDelete = vi.fn();
const mockAnalyses = vi.fn();

vi.mock("../../../../application/hooks/useReporting", () => ({
  useReportRunsPage: (...args: any[]) => mockRunsPage(...args),
  useArchiveRun: () => ({ mutate: mockArchive, isPending: false }),
  useRestoreRun: () => ({ mutate: mockRestore, isPending: false }),
  useDeleteRun: () => ({ mutate: mockDelete, isPending: false }),
  useRunAnalyses: (...args: any[]) => {
    mockAnalyses(...args);
    return { data: [], isLoading: false };
  },
}));

import ReportRunsTable from "../ReportRunsTable";

const run = (over: Record<string, unknown> = {}) => ({
  id: 1,
  organization_id: 1,
  status: "success",
  triggered_by: "manual",
  file_id: 10,
  output_filename: "Q3 risk review.pdf",
  output_mime_type: "application/pdf",
  error_message: null,
  archived_at: null,
  template_id: 2,
  created_at: "2026-07-28T10:00:00Z",
  completed_at: "2026-07-28T10:01:00Z",
  ...over,
});

describe("ReportRunsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunsPage.mockReturnValue({ data: { rows: [run()], total: 1 }, isLoading: false });
  });

  it("asks for live runs in the live variant", () => {
    renderWithProviders(<ReportRunsTable variant="live" />);
    expect(mockRunsPage).toHaveBeenCalledWith(expect.objectContaining({ archived: false }));
  });

  it("asks for archived runs in the archived variant", () => {
    renderWithProviders(<ReportRunsTable variant="archived" />);
    expect(mockRunsPage).toHaveBeenCalledWith(expect.objectContaining({ archived: true }));
  });

  it("shows a failed run with its status instead of hiding it", () => {
    mockRunsPage.mockReturnValue({
      data: { rows: [run({ status: "failed", file_id: null, error_message: "boom" })], total: 1 },
      isLoading: false,
    });

    renderWithProviders(<ReportRunsTable variant="live" />);

    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("treats partial_success as downloadable, not an error", () => {
    mockRunsPage.mockReturnValue({
      data: { rows: [run({ status: "partial_success" })], total: 1 },
      isLoading: false,
    });

    renderWithProviders(<ReportRunsTable variant="live" />);

    expect(screen.getByText("Partial success")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download/i })).toBeEnabled();
  });

  it("archives from the live variant", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await user.click(screen.getByRole("button", { name: /archive/i }));

    expect(mockArchive).toHaveBeenCalledWith(1);
  });

  it("restores from the archived variant", async () => {
    const user = userEvent.setup();
    mockRunsPage.mockReturnValue({
      data: { rows: [run({ archived_at: "2026-07-28T11:00:00Z" })], total: 1 },
      isLoading: false,
    });
    renderWithProviders(<ReportRunsTable variant="archived" />);

    await user.click(screen.getByRole("button", { name: /restore/i }));

    expect(mockRestore).toHaveBeenCalledWith(1);
  });

  it("shows the empty state per variant", () => {
    mockRunsPage.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false });

    renderWithProviders(<ReportRunsTable variant="archived" />);

    expect(screen.getByText(/no archived reports/i)).toBeInTheDocument();
  });

  it("opens the analyses drawer for the run whose action was clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await user.click(screen.getByRole("button", { name: /view analyses/i }));

    // Exact match: a substring/regex match also hits the panel's own empty
    // state ("No AI analyses were generated for this report run.").
    expect(screen.getByText("AI analyses")).toBeInTheDocument();
    expect(mockAnalyses).toHaveBeenLastCalledWith(1);
  });
});
