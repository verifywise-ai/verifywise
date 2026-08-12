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
  delivery_status: null,
  archived_at: null,
  template_id: 2,
  template_name: "Risk template",
  scope_project_id: "7",
  scope_project_title: "Chatbot",
  created_at: "2026-07-28T10:00:00Z",
  completed_at: "2026-07-28T10:01:00Z",
  ...over,
});

// Row actions live behind the shared row-actions menu (components/IconButton):
// open the row's gear menu, then pick the item.
const openRowMenu = (user: ReturnType<typeof userEvent.setup>, index = 0) =>
  user.click(screen.getAllByRole("button", { name: "Report actions" })[index]);

const clickRowAction = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  index = 0,
) => {
  await openRowMenu(user, index);
  await user.click(screen.getByRole("menuitem", { name }));
};

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

  // Spec line 104: report name, template name, status, scope, date, triggered by.
  it("shows every column the spec asks for", () => {
    renderWithProviders(<ReportRunsTable variant="live" />);

    for (const header of ["Report", "Template", "Status", "Scope", "Created", "Triggered by"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }
    expect(screen.getByRole("cell", { name: "Q3 risk review.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Risk template" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Chatbot" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "manual" })).toBeInTheDocument();
  });

  it("names an organization-scoped run by its scope, not a blank cell", () => {
    mockRunsPage.mockReturnValue({
      data: {
        rows: [run({ scope_project_id: null, scope_project_title: null })],
        total: 1,
      },
      isLoading: false,
    });

    renderWithProviders(<ReportRunsTable variant="live" />);

    expect(screen.getByRole("cell", { name: "Organization" })).toBeInTheDocument();
  });

  // output_filename is NULL until a run succeeds, so these rows used to render
  // as "— | Failed | manual | <date>" with nothing saying which report broke.
  it.each(["queued", "running", "failed"])(
    "gives a %s run an identity even with no output file",
    (status) => {
      mockRunsPage.mockReturnValue({
        data: { rows: [run({ status, file_id: null, output_filename: null })], total: 1 },
        isLoading: false,
      });

      renderWithProviders(<ReportRunsTable variant="live" />);

      expect(screen.getByRole("cell", { name: "Run #1" })).toBeInTheDocument();
      expect(screen.getByRole("cell", { name: "Risk template" })).toBeInTheDocument();
    },
  );

  it("shows a failed run with its status instead of hiding it", () => {
    mockRunsPage.mockReturnValue({
      data: { rows: [run({ status: "failed", file_id: null, error_message: "boom" })], total: 1 },
      isLoading: false,
    });

    renderWithProviders(<ReportRunsTable variant="live" />);

    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("treats partial_success as downloadable, not an error", async () => {
    mockRunsPage.mockReturnValue({
      data: { rows: [run({ status: "partial_success" })], total: 1 },
      isLoading: false,
    });
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    expect(screen.getByText("Partial success")).toBeInTheDocument();
    // The menu only offers Download for a run that has a file.
    await openRowMenu(user);
    expect(screen.getByRole("menuitem", { name: "Download" })).toBeInTheDocument();
  });

  // error_message is NULL on the partial_success path; which channel failed is
  // only recorded in delivery_status, so without this the status is a dead end.
  it("says which delivery channel failed behind a partial success", async () => {
    mockRunsPage.mockReturnValue({
      data: {
        rows: [
          run({
            status: "partial_success",
            delivery_status: {
              storage: { status: "success" },
              emailLink: { status: "failed" },
            },
          }),
        ],
        total: 1,
      },
      isLoading: false,
    });
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await user.hover(screen.getByText("Partial success"));

    expect(await screen.findByText("Delivery failed: email link")).toBeInTheDocument();
  });

  it("archives from the live variant", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await clickRowAction(user, "Archive");
    // Archive neighbours a permanent delete in the menu, so it confirms first.
    expect(mockArchive).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Archive report" }));

    expect(mockArchive).toHaveBeenCalledWith(1);
  });

  it("restores from the archived variant", async () => {
    const user = userEvent.setup();
    mockRunsPage.mockReturnValue({
      data: { rows: [run({ archived_at: "2026-07-28T11:00:00Z" })], total: 1 },
      isLoading: false,
    });
    renderWithProviders(<ReportRunsTable variant="archived" />);

    await clickRowAction(user, "Restore");

    expect(mockRestore).toHaveBeenCalledWith(1);
  });

  it("shows the empty state per variant", () => {
    mockRunsPage.mockReturnValue({ data: { rows: [], total: 0 }, isLoading: false });

    renderWithProviders(<ReportRunsTable variant="archived" />);

    expect(screen.getByText(/no archived reports/i)).toBeInTheDocument();
    // No runs means no pager either — there is nothing to page through.
    // ("next page" is StandardTablePagination's label, via TablePaginationActions.)
    expect(screen.queryByRole("button", { name: "next page" })).not.toBeInTheDocument();
  });

  it("requests the next offset when the page changes", async () => {
    mockRunsPage.mockReturnValue({ data: { rows: [run()], total: 12 }, isLoading: false });
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    expect(mockRunsPage).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }));

    await user.click(screen.getByRole("button", { name: "next page" }));

    expect(mockRunsPage).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 10 }));
  });

  it("paginates by the envelope's total, not the row count on the page", () => {
    // Only one row comes back (as a real paginated response would), but the
    // envelope says there are 12 — the pager must reflect that, not "of 1".
    mockRunsPage.mockReturnValue({ data: { rows: [run()], total: 12 }, isLoading: false });

    renderWithProviders(<ReportRunsTable variant="live" />);

    expect(screen.getByText("Showing 1 - 10 of 12 reports")).toBeInTheDocument();
  });

  // Archiving or deleting the last row of the last page shrinks the total out
  // from under `page`, leaving the user asking the server for an offset it has
  // nothing at.
  it("pulls the page back in range when the total shrinks below it", async () => {
    mockRunsPage.mockReturnValue({ data: { rows: [run()], total: 12 }, isLoading: false });
    const user = userEvent.setup();
    const { rerender } = renderWithProviders(<ReportRunsTable variant="live" />);

    await user.click(screen.getByRole("button", { name: "next page" }));
    expect(mockRunsPage).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 10 }));

    // The 11th run is archived away: one page's worth of rows is left.
    mockRunsPage.mockReturnValue({ data: { rows: [run()], total: 10 }, isLoading: false });
    rerender(<ReportRunsTable variant="live" />);

    await waitFor(() =>
      expect(mockRunsPage).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 })),
    );
  });

  it("opens the analyses drawer for the run whose action was clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await clickRowAction(user, "View analyses");

    // Exact match: a substring/regex match also hits the panel's own empty
    // state ("No AI analyses were generated for this report run.").
    expect(screen.getByText("AI analyses")).toBeInTheDocument();
    expect(mockAnalyses).toHaveBeenLastCalledWith(1);
  });

  it("opens the analyses of the run whose action was clicked, not the first row's", async () => {
    // selectedRunId is a single value shared across rows; this proves the
    // drawer fetches the clicked row's analyses, not always the first one.
    mockRunsPage.mockReturnValue({
      data: {
        rows: [run(), run({ id: 2, output_filename: "Q4 risk review.pdf" })],
        total: 2,
      },
      isLoading: false,
    });
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await clickRowAction(user, "View analyses", 1);

    expect(mockAnalyses).toHaveBeenLastCalledWith(2);
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
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedFilename = this.download;
    });

    try {
      const user = userEvent.setup();
      renderWithProviders(<ReportRunsTable variant="live" />);

      await clickRowAction(user, "Download");

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

    await clickRowAction(user, "Delete permanently");

    expect(screen.getByText("Delete report run permanently?")).toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes the run once the confirmation is accepted", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await clickRowAction(user, "Delete permanently");
    await user.click(screen.getByRole("button", { name: /delete permanently/i }));

    expect(mockDelete).toHaveBeenCalledWith(1);
  });

  it("deletes only the run whose Delete action was clicked", async () => {
    // Each row owns its own menu and confirmation; this proves the delete
    // fires for the clicked row, not always the first one.
    mockRunsPage.mockReturnValue({
      data: {
        rows: [run(), run({ id: 2, output_filename: "Q4 risk review.pdf" })],
        total: 2,
      },
      isLoading: false,
    });
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await clickRowAction(user, "Delete permanently", 1);
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

    await clickRowAction(user, "Delete permanently");
    expect(mockDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /delete permanently/i }));
    expect(mockDelete).toHaveBeenCalledWith(1);
  });

  it("does not delete when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReportRunsTable variant="live" />);

    await clickRowAction(user, "Delete permanently");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.queryByText("Delete report run permanently?")).not.toBeInTheDocument();
  });
});
