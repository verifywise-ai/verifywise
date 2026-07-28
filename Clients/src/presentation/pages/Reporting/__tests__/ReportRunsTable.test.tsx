import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockRunsPage = vi.fn();
const mockArchive = vi.fn();
const mockRestore = vi.fn();
const mockDelete = vi.fn();
const mockAnalyses = vi.fn();
const mockDownloadReportRun = vi.fn();

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

vi.mock("../../../../application/repository/reporting.repository", () => ({
  downloadReportRun: (...args: any[]) => mockDownloadReportRun(...args),
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

  it("downloads the run's file as a saved blob when Download is clicked", async () => {
    const blob = new Blob(["pdf-bytes"], { type: "application/pdf" });
    mockDownloadReportRun.mockResolvedValue(blob);

    // jsdom does not implement Blob object URLs; stub them so the handler's
    // createObjectURL/revokeObjectURL calls resolve instead of throwing.
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    (URL as any).createObjectURL = createObjectURL;
    (URL as any).revokeObjectURL = revokeObjectURL;

    let downloadedFilename: string | undefined;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadedFilename = this.download;
      });

    try {
      const user = userEvent.setup();
      renderWithProviders(<ReportRunsTable variant="live" />);

      await user.click(screen.getByRole("button", { name: "Download" }));

      // The handler is async (await downloadReportRun before touching the DOM).
      await waitFor(() => expect(clickSpy).toHaveBeenCalledOnce());

      expect(mockDownloadReportRun).toHaveBeenCalledWith(1);
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
      expect(downloadedFilename).toBe("Q3 risk review.pdf");
    } finally {
      clickSpy.mockRestore();
      delete (URL as any).createObjectURL;
      delete (URL as any).revokeObjectURL;
    }
  });

  it("asks for confirmation before deleting a run, and does not delete without it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText("Delete report run permanently?")).toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes the run once the confirmation is accepted", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: /delete permanently/i }));

    expect(mockDelete).toHaveBeenCalledWith(1);
  });

  it("deletes only the run whose Delete action was clicked", async () => {
    // pendingDeleteId is a single value shared across rows; this proves the
    // confirmation fires for the clicked row, not always the first one.
    mockRunsPage.mockReturnValue({
      data: {
        rows: [run(), run({ id: 2, output_filename: "Q4 risk review.pdf" })],
        total: 2,
      },
      isLoading: false,
    });
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await user.click(screen.getAllByRole("button", { name: "Delete" })[1]);
    await user.click(screen.getByRole("button", { name: /delete permanently/i }));

    expect(mockDelete).toHaveBeenCalledWith(2);
    expect(mockDelete).not.toHaveBeenCalledWith(1);
  });

  it("asks for confirmation before deleting from the archived variant too", async () => {
    mockRunsPage.mockReturnValue({
      data: { rows: [run({ archived_at: "2026-07-28T11:00:00Z" })], total: 1 },
      isLoading: false,
    });
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="archived" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /delete permanently/i }));
    expect(mockDelete).toHaveBeenCalledWith(1);
  });

  it("does not delete when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.queryByText("Delete report run permanently?")).not.toBeInTheDocument();
  });
});
