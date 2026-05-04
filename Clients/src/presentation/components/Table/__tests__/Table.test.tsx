import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import CustomizableBasicTable from "../index";

// Mock vendor repository
vi.mock("../../../../application/repository/vendor.repository", () => ({
  getAllVendors: vi.fn().mockResolvedValue({ data: [] }),
}));

// Stub localStorage if not available in test environment
if (
  typeof globalThis.localStorage === "undefined" ||
  typeof globalThis.localStorage.getItem !== "function"
) {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
      get length() {
        return Object.keys(store).length;
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
    },
    writable: true,
  });
}

const mockColumns = [
  { id: "risk_name", name: "Risk Name" },
  { id: "impact", name: "Impact" },
  { id: "risk_owner", name: "Owner" },
  { id: "risk_level_autocalculated", name: "Risk Level" },
  { id: "likelihood", name: "Likelihood" },
  { id: "risk_level_display", name: "Score" },
  { id: "mitigation_status", name: "Status" },
  { id: "final_risk_level", name: "Final Level" },
];

const mockRows = [
  {
    id: 1,
    risk_name: "Data Breach Risk",
    impact: "High business impact",
    risk_owner: "Alice",
    risk_level_autocalculated: "2",
    likelihood: "Medium",
    mitigation_status: "In Progress",
    final_risk_level: "Medium",
  },
  {
    id: 2,
    risk_name: "Model Bias Risk",
    impact: "Moderate impact",
    risk_owner: "Bob",
    risk_level_autocalculated: "7",
    likelihood: "High",
    mitigation_status: "Open",
    final_risk_level: "High",
  },
];

const defaultProps = {
  data: { rows: mockRows, cols: mockColumns },
  bodyData: mockRows,
  table: "test-risks",
  setSelectedRow: vi.fn(),
  setAnchorEl: vi.fn(),
};

describe("CustomizableBasicTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress MUI TablePagination DOM nesting warning (<td> inside <div>)
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render column headers", () => {
    renderWithProviders(<CustomizableBasicTable {...defaultProps} />);
    expect(screen.getByText("Risk Name")).toBeInTheDocument();
    expect(screen.getByText("Impact")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Likelihood")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
  });

  it("should render row data", () => {
    renderWithProviders(<CustomizableBasicTable {...defaultProps} />);
    expect(screen.getByText("Data Breach Risk")).toBeInTheDocument();
    expect(screen.getByText("Model Bias Risk")).toBeInTheDocument();
  });

  it("should truncate long risk names to 30 chars", () => {
    const longNameRow = {
      ...mockRows[0],
      id: 3,
      risk_name: "A very long risk name that exceeds thirty characters easily",
    };
    const propsWithLong = {
      ...defaultProps,
      data: { rows: [longNameRow], cols: mockColumns },
    };

    renderWithProviders(<CustomizableBasicTable {...propsWithLong} />);
    expect(screen.getByText("A very long risk name that exc...")).toBeInTheDocument();
  });

  it("should call setSelectedRow and setAnchorEl on row click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomizableBasicTable {...defaultProps} />);

    const row = screen.getByText("Data Breach Risk").closest("tr")!;
    await user.click(row);

    expect(defaultProps.setSelectedRow).toHaveBeenCalledWith(mockRows[0]);
    expect(defaultProps.setAnchorEl).toHaveBeenCalled();
  });

  it("should render empty table when no rows", () => {
    const emptyProps = {
      ...defaultProps,
      data: { rows: [], cols: mockColumns },
    };
    renderWithProviders(<CustomizableBasicTable {...emptyProps} />);

    // Headers should still render
    expect(screen.getByText("Risk Name")).toBeInTheDocument();
    // No data rows
    const tbody = screen.getByRole("table").querySelector("tbody");
    expect(tbody?.children).toHaveLength(0);
  });

  it("should show pagination when paginated prop is true", () => {
    renderWithProviders(<CustomizableBasicTable {...defaultProps} paginated />);
    expect(screen.getByText(/Showing/)).toBeInTheDocument();
    expect(screen.getByText(/Rows per page/)).toBeInTheDocument();
  });

  it("should not show pagination when paginated is false", () => {
    renderWithProviders(<CustomizableBasicTable {...defaultProps} />);
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });
});
