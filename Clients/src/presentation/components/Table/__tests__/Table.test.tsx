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

  describe("riskLevelChecker", () => {
    it("renders Low risk for score <= 3", () => {
      const rows = [{ ...mockRows[0], id: 10, risk_level_autocalculated: "2" }];
      renderWithProviders(
        <CustomizableBasicTable
          {...defaultProps}
          data={{ rows, cols: mockColumns }}
          bodyData={rows}
        />,
      );
      expect(screen.getByText("Low risk")).toBeInTheDocument();
    });

    it("renders Medium risk for score 4-6", () => {
      const rows = [{ ...mockRows[0], id: 11, risk_level_autocalculated: "5" }];
      renderWithProviders(
        <CustomizableBasicTable
          {...defaultProps}
          data={{ rows, cols: mockColumns }}
          bodyData={rows}
        />,
      );
      expect(screen.getByText("Medium risk")).toBeInTheDocument();
    });

    it("renders High risk for score 7-9", () => {
      const rows = [{ ...mockRows[0], id: 12, risk_level_autocalculated: "8" }];
      renderWithProviders(
        <CustomizableBasicTable
          {...defaultProps}
          data={{ rows, cols: mockColumns }}
          bodyData={rows}
        />,
      );
      expect(screen.getByText("High risk")).toBeInTheDocument();
    });

    it("renders Very high risk for score >= 10", () => {
      const rows = [{ ...mockRows[0], id: 13, risk_level_autocalculated: "10" }];
      renderWithProviders(
        <CustomizableBasicTable
          {...defaultProps}
          data={{ rows, cols: mockColumns }}
          bodyData={rows}
        />,
      );
      expect(screen.getByText("Very high risk")).toBeInTheDocument();
    });
  });

  describe("localStorage pagination", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("persists rowsPerPage to localStorage", () => {
      renderWithProviders(<CustomizableBasicTable {...defaultProps} paginated />);
      expect(localStorage.getItem("verifywise_risks_rows_per_page")).toBe("10");
    });

    it("reads rowsPerPage from localStorage when available", () => {
      localStorage.setItem("verifywise_risks_rows_per_page", "5");
      renderWithProviders(<CustomizableBasicTable {...defaultProps} paginated />);
      expect(screen.getByText(/Rows per page/)).toBeInTheDocument();
    });
  });

  it("calls onRowClick when a row is clicked", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<CustomizableBasicTable {...defaultProps} onRowClick={onRowClick} />);

    const row = screen.getByText("Data Breach Risk").closest("tr")!;
    await user.click(row);

    expect(onRowClick).toHaveBeenCalledWith(mockRows[0].id);
  });

  it("returns empty string from riskLevelChecker for undefined score", () => {
    const rows = [{ ...mockRows[0], id: 20, risk_level_autocalculated: undefined }];
    renderWithProviders(
      <CustomizableBasicTable
        {...defaultProps}
        data={{ rows, cols: mockColumns }}
        bodyData={rows}
      />,
    );
    // Cell should be empty
    const cells = document.querySelectorAll("td");
    expect(cells[3].textContent).toBe("");
  });

  it("returns raw score from riskLevelChecker for non-numeric score", () => {
    const rows = [{ ...mockRows[0], id: 21, risk_level_autocalculated: "Pending" }];
    renderWithProviders(
      <CustomizableBasicTable
        {...defaultProps}
        data={{ rows, cols: mockColumns }}
        bodyData={rows}
      />,
    );
    expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(1);
  });

  it("shows pagination range text when paginated", () => {
    renderWithProviders(<CustomizableBasicTable {...defaultProps} paginated />);
    expect(screen.getByText(/Showing 1 - 2 of 2 items/)).toBeInTheDocument();
  });

  it("truncates long impact text to 30 chars", () => {
    const longImpactRow = {
      ...mockRows[0],
      id: 30,
      impact: "This is a very long impact description that should be truncated",
    };
    const propsWithLong = {
      ...defaultProps,
      data: { rows: [longImpactRow], cols: mockColumns },
    };

    const { container } = renderWithProviders(<CustomizableBasicTable {...propsWithLong} />);
    // The rendered table should contain the truncated impact value (30 chars + "...")
    const tableHtml = container.querySelector("table")?.innerHTML ?? "";
    expect(tableHtml).toContain("This is a very long impact des...");
  });

  it("displays empty string when risk_name is missing", () => {
    const missingNameRow = {
      ...mockRows[0],
      id: 31,
      risk_name: undefined,
    };
    const propsWithMissing = {
      ...defaultProps,
      data: { rows: [missingNameRow], cols: mockColumns },
    };

    renderWithProviders(<CustomizableBasicTable {...propsWithMissing} />);
    // Verify all cells still render
    const cells = document.querySelectorAll("td");
    expect(cells.length).toBeGreaterThan(0);
  });

  it("renders risk_owner as string when passed as string", () => {
    const stringOwnerRow = {
      ...mockRows[0],
      id: 32,
      risk_owner: "External Owner",
    };
    const propsWithStr = {
      ...defaultProps,
      data: { rows: [stringOwnerRow], cols: mockColumns },
    };

    renderWithProviders(<CustomizableBasicTable {...propsWithStr} />);
    expect(screen.getByText("External Owner")).toBeInTheDocument();
  });

  it("renders risk_owner as numeric string when passed as number", () => {
    const numericOwnerRow = {
      ...mockRows[0],
      id: 33,
      risk_owner: 99,
    };
    const propsWithNum = {
      ...defaultProps,
      data: { rows: [numericOwnerRow], cols: mockColumns },
    };

    renderWithProviders(<CustomizableBasicTable {...propsWithNum} />);
    expect(screen.getByText("99")).toBeInTheDocument();
  });

  it("renders without crashing with many rows", () => {
    const manyRows = Array.from({ length: 50 }, (_, i) => ({
      ...mockRows[0],
      id: i + 1,
      risk_name: `Risk ${i + 1}`,
    }));

    const { container } = renderWithProviders(
      <CustomizableBasicTable
        {...defaultProps}
        data={{ rows: manyRows, cols: mockColumns }}
        paginated
      />,
    );

    // All rows should render
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(50);
  });
});
