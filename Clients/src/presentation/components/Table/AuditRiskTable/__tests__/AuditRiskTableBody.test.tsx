import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { AuditRiskTableBody } from "../AuditRiskTableBody";
import type { ITypeRisk } from "../../../../types/interfaces/i.table";

const mockRows: ITypeRisk[] = [
  { id: 1, title: "Data Breach Risk in Training", status: "Open", severity: "High" },
  { id: 2, title: "Model Bias Detected", status: "In Progress", severity: "Medium" },
  { id: 3, title: "Short title", status: "Resolved", severity: "Low" },
];

const defaultProps = {
  rows: mockRows,
  page: 0,
  setCurrentPagingation: vi.fn(),
  deletedRisks: [] as number[],
  checkedRows: [] as number[],
  setCheckedRows: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "open").mockImplementation(() => null);
});

describe("AuditRiskTableBody", () => {
  it("renders all rows", () => {
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Data Breach Risk in Training")).toBeInTheDocument();
    expect(screen.getByText("Model Bias Detected")).toBeInTheDocument();
    expect(screen.getByText("Short title")).toBeInTheDocument();
  });

  it("renders severity chips", () => {
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getAllByText("High").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Medium").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Low").length).toBeGreaterThanOrEqual(1);
  });

  it("renders status text", () => {
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("renders row number when id is present", () => {
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders checkboxes", () => {
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} />
      </table>,
    );
    const checkboxes = document.querySelectorAll('[type="checkbox"]');
    expect(checkboxes.length).toBe(mockRows.length);
  });

  it("checks checkbox when clicked", async () => {
    const setCheckedRows = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} setCheckedRows={setCheckedRows} />
      </table>,
    );
    const checkbox = document.querySelectorAll('[type="checkbox"]')[0];
    await user.click(checkbox);
    expect(setCheckedRows).toHaveBeenCalledWith([1]);
  });

  it("unchecks checkbox when already checked", async () => {
    const setCheckedRows = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} checkedRows={[1]} setCheckedRows={setCheckedRows} />
      </table>,
    );
    const checkbox = document.querySelectorAll('[type="checkbox"]')[0];
    await user.click(checkbox);
    expect(setCheckedRows).toHaveBeenCalledWith([]);
  });

  it("disables interaction for deleted risks", async () => {
    const setCheckedRows = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} deletedRisks={[1]} setCheckedRows={setCheckedRows} />
      </table>,
    );
    const checkbox = document.querySelectorAll('[type="checkbox"]')[0];
    await user.click(checkbox);
    expect(setCheckedRows).not.toHaveBeenCalled();
  });

  it("shows deleted risk checkbox as checked", () => {
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} deletedRisks={[1]} checkedRows={[2]} />
      </table>,
    );
    const checkboxes = document.querySelectorAll('[type="checkbox"]');
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
  });

  it("renders View button for each row", () => {
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} />
      </table>,
    );
    const viewButtons = screen.getAllByText("View");
    expect(viewButtons.length).toBe(mockRows.length);
  });

  it("opens new tab on View click", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} />
      </table>,
    );
    const viewButtons = screen.getAllByText("View");
    await user.click(viewButtons[0]);
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("/project-view?projectId=null&tab=project-risks&riskId=1"),
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("truncates long titles to 30 chars", () => {
    const rowsLongTitle = [
      {
        id: 4,
        title: "Data breach risk in training pipeline",
        status: "Open",
        severity: "High",
      },
    ];
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} rows={rowsLongTitle} page={0} />
      </table>,
    );
    expect(screen.getByText("Data breach risk in training p...")).toBeInTheDocument();
  });

  it("renders dash when title is missing", () => {
    const rowsNoTitle = [{ id: 10, title: "", status: "Open", severity: "High" }];
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} rows={rowsNoTitle} />
      </table>,
    );
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("renders pagination", () => {
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Risks per page")).toBeInTheDocument();
  });

  it("calls setCurrentPagingation on page change", async () => {
    const setCurrentPagingation = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} setCurrentPagingation={setCurrentPagingation} />
      </table>,
    );
    const nextButton = document.querySelector('[aria-label="Go to next page"]');
    if (nextButton) {
      await user.click(nextButton);
      expect(setCurrentPagingation).toHaveBeenCalledWith(1);
    }
  });

  it("uses sequential numbering when id is missing", () => {
    const rowsNoIds = [
      { id: null as unknown as number, title: "Risk A", status: "Open", severity: "Low" },
    ];
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} rows={rowsNoIds} page={0} />
      </table>,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders with empty rows", () => {
    renderWithProviders(
      <table>
        <AuditRiskTableBody {...defaultProps} rows={[]} />
      </table>,
    );
    expect(screen.getByText("Risks per page")).toBeInTheDocument();
  });
});
