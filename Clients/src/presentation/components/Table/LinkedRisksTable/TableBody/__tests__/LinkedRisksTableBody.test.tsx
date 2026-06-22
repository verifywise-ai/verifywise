import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import LinkedRisksTableBody from "../index";
import type { RiskModel } from "../../../../../../domain/models/Common/risks/risk.model";

const mockRows = [
  {
    id: 1,
    risk_name: "Data Breach",
    risk_description: "Potential data leak",
    risk_severity: "High",
    likelihood: "Likely",
    risk_category: "Security",
  },
  {
    id: 2,
    risk_name: "Model Bias",
    risk_description: "Algorithmic bias in outputs",
    risk_severity: "Medium",
    likelihood: "Possible",
    risk_category: "Fairness",
  },
  {
    id: 3,
    risk_name: "Third Party Risk",
    risk_description: "Vendor data handling",
    risk_severity: "Critical",
    likelihood: "Unlikely",
    risk_category: "Vendor",
  },
] as unknown as RiskModel[];

const defaultProps = {
  rows: mockRows,
  page: 0,
  setCurrentPagingation: vi.fn(),
  currentRisks: [] as number[],
  checkedRows: [] as number[],
  setCheckedRows: vi.fn(),
  deletedRisks: [] as number[],
  setDeletedRisks: vi.fn(),
};

describe("LinkedRisksTableBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all rows", () => {
    renderWithProviders(
      <table>
        <LinkedRisksTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Data Breach")).toBeInTheDocument();
    expect(screen.getByText("Model Bias")).toBeInTheDocument();
    expect(screen.getByText("Third Party Risk")).toBeInTheDocument();
  });

  it("renders risk descriptions", () => {
    renderWithProviders(
      <table>
        <LinkedRisksTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Potential data leak")).toBeInTheDocument();
    expect(screen.getByText("Algorithmic bias in outputs")).toBeInTheDocument();
  });

  it("renders severity chips", () => {
    renderWithProviders(
      <table>
        <LinkedRisksTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("renders likelihood values", () => {
    renderWithProviders(
      <table>
        <LinkedRisksTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Likely")).toBeInTheDocument();
    expect(screen.getByText("Possible")).toBeInTheDocument();
    expect(screen.getByText("Unlikely")).toBeInTheDocument();
  });

  it("renders risk categories", () => {
    renderWithProviders(
      <table>
        <LinkedRisksTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Fairness")).toBeInTheDocument();
    expect(screen.getByText("Vendor")).toBeInTheDocument();
  });

  it("renders checkboxes", () => {
    renderWithProviders(
      <table>
        <LinkedRisksTableBody {...defaultProps} />
      </table>,
    );
    const checkboxes = document.querySelectorAll('[type="checkbox"]');
    expect(checkboxes.length).toBe(mockRows.length);
  });

  it("checks row on click", async () => {
    const setCheckedRows = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <LinkedRisksTableBody {...defaultProps} setCheckedRows={setCheckedRows} />
      </table>,
    );
    const checkbox = document.querySelectorAll('[type="checkbox"]')[0];
    await user.click(checkbox);
    expect(setCheckedRows).toHaveBeenCalledWith([1]);
  });

  it("unchecks row on click when already checked", async () => {
    const setCheckedRows = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <LinkedRisksTableBody {...defaultProps} checkedRows={[1]} setCheckedRows={setCheckedRows} />
      </table>,
    );
    const checkbox = document.querySelectorAll('[type="checkbox"]')[0];
    await user.click(checkbox);
    expect(setCheckedRows).toHaveBeenCalledWith([]);
  });

  it("adds risk to deletedRisks when unchecking a currentRisk", async () => {
    const setDeletedRisks = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <LinkedRisksTableBody
          {...defaultProps}
          currentRisks={[1]}
          checkedRows={[1]}
          setCheckedRows={vi.fn()}
          setDeletedRisks={setDeletedRisks}
        />
      </table>,
    );
    const checkbox = document.querySelectorAll('[type="checkbox"]')[0];
    await user.click(checkbox);
    expect(setDeletedRisks).toHaveBeenCalledWith([1]);
  });

  it("removes risk from deletedRisks when rechecking", async () => {
    const setDeletedRisks = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <LinkedRisksTableBody
          {...defaultProps}
          deletedRisks={[1]}
          setCheckedRows={vi.fn()}
          setDeletedRisks={setDeletedRisks}
        />
      </table>,
    );
    const checkbox = document.querySelectorAll('[type="checkbox"]')[0];
    await user.click(checkbox);
    expect(setDeletedRisks).toHaveBeenCalledWith([]);
  });

  it("renders row number when id is present", () => {
    renderWithProviders(
      <table>
        <LinkedRisksTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders dash when risk_name is missing", () => {
    const rowsNoName = [{ id: 10, risk_name: null }] as unknown as RiskModel[];
    renderWithProviders(
      <table>
        <LinkedRisksTableBody {...defaultProps} rows={rowsNoName} />
      </table>,
    );
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("renders pagination", () => {
    renderWithProviders(
      <table>
        <LinkedRisksTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Risks per page")).toBeInTheDocument();
  });

  it("calls setCurrentPagingation on page change", async () => {
    const setCurrentPagingation = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <LinkedRisksTableBody {...defaultProps} setCurrentPagingation={setCurrentPagingation} />
      </table>,
    );
    const nextButton = document.querySelector('[aria-label="Go to next page"]');
    if (nextButton) {
      await user.click(nextButton);
      expect(setCurrentPagingation).toHaveBeenCalledWith(1);
    }
  });

  it("renders with empty rows", () => {
    renderWithProviders(
      <table>
        <LinkedRisksTableBody {...defaultProps} rows={[]} />
      </table>,
    );
    expect(screen.getByText("Risks per page")).toBeInTheDocument();
  });
});
