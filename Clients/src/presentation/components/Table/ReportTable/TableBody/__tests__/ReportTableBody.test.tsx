import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import ReportTableBody from "../index";
import type { IReportTableProps } from "../../../../../types/interfaces/i.table";

const mockRows = [
  {
    id: 1,
    filename: "Q4_AI_Assessment_Report.pdf",
    source: "Q4 AI Assessment Report",
    project_title: "Project Alpha",
    uploaded_time: "2025-06-01T12:00:00Z",
    uploader_name: "John",
    uploader_surname: "Doe",
  },
  {
    id: 2,
    filename: "Monthly_Review.docx",
    source: "All Reports",
    project_title: "Project Beta",
    uploaded_time: "2025-05-15T08:30:00Z",
    uploader_name: "Jane",
    uploader_surname: "Smith",
  },
  {
    id: 3,
    filename: "Compliance_Report_v2.pdf",
    project_title: "",
    uploaded_time: "2025-04-10T14:00:00Z",
    uploader_name: "",
    uploader_surname: "",
  },
];

const defaultProps: IReportTableProps = {
  rows: mockRows,
  onRemoveReport: vi.fn(),
  page: 0,
  rowsPerPage: 10,
  sortConfig: { key: "", direction: null },
  visibleColumns: new Set([
    "reportName",
    "typeOfReport",
    "project",
    "dateGenerated",
    "generatedBy",
    "action",
  ]),
};

describe("ReportTableBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all filenames", () => {
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Q4_AI_Assessment_Report.pdf")).toBeInTheDocument();
    expect(screen.getByText("Monthly_Review.docx")).toBeInTheDocument();
  });

  it("renders AI chip for filenames containing _AI_", () => {
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("does not render AI chip for non-AI files", () => {
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} />
      </table>,
    );
    const aiChips = screen.getAllByText("AI");
    expect(aiChips.length).toBe(1);
  });

  it("renders formatted source names", () => {
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Q4 AI Assessment")).toBeInTheDocument();
  });

  it("renders 'All Reports' source as-is", () => {
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("All Reports")).toBeInTheDocument();
  });

  it("renders project titles", () => {
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    expect(screen.getByText("Project Beta")).toBeInTheDocument();
  });

  it("renders dash for empty project title", () => {
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} />
      </table>,
    );
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("renders uploader name and surname", () => {
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
  });

  it("renders dash for empty uploader name", () => {
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} />
      </table>,
    );
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("renders formatted date", () => {
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText(/01-06-2025/)).toBeInTheDocument();
  });

  it("renders NA for missing date", () => {
    const rowsNoDate = [
      {
        ...mockRows[0],
        id: 99,
        uploaded_time: undefined,
      },
    ];
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} rows={rowsNoDate} />
      </table>,
    );
    expect(screen.getByText("NA")).toBeInTheDocument();
  });

  it("renders dash for missing filename", () => {
    const rowsNoFile = [
      {
        ...mockRows[0],
        id: 100,
        filename: "",
      },
    ];
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} rows={rowsNoFile} />
      </table>,
    );
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("renders icon buttons in action column", () => {
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onRemoveReport when delete action is triggered", async () => {
    const onRemoveReport = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} onRemoveReport={onRemoveReport} />
      </table>,
    );
    const settingsButton = screen.getAllByRole("button")[0];
    await user.click(settingsButton);
    await user.click(screen.getByText("Remove"));
    await user.click(screen.getByText("Delete report"));
    expect(onRemoveReport).toHaveBeenCalledWith(1);
  });

  it("hides columns not in visibleColumns set", () => {
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} visibleColumns={new Set(["reportName", "action"])} />
      </table>,
    );
    expect(screen.getByText("Q4_AI_Assessment_Report.pdf")).toBeInTheDocument();
    expect(screen.queryByText("All Reports")).not.toBeInTheDocument();
    expect(screen.queryByText("Project Alpha")).not.toBeInTheDocument();
  });

  it("shows all columns when visibleColumns is empty", () => {
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} visibleColumns={new Set()} />
      </table>,
    );
    expect(screen.getByText("Q4_AI_Assessment_Report.pdf")).toBeInTheDocument();
    expect(screen.getByText("All Reports")).toBeInTheDocument();
    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
  });

  it("respects rowsPerPage pagination", () => {
    renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} page={0} rowsPerPage={2} />
      </table>,
    );
    expect(screen.getByText("Q4_AI_Assessment_Report.pdf")).toBeInTheDocument();
    expect(screen.getByText("Monthly_Review.docx")).toBeInTheDocument();
    expect(screen.queryByText("Compliance_Report_v2.pdf")).not.toBeInTheDocument();
  });

  it("renders with empty rows", () => {
    const { container } = renderWithProviders(
      <table>
        <ReportTableBody {...defaultProps} rows={[]} />
      </table>,
    );
    expect(container.querySelector("tbody")?.children).toHaveLength(0);
  });
});
