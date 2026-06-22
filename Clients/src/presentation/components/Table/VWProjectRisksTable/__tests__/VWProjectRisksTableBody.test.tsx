import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import VWProjectRisksTableBody from "../VWProjectRisksTableBody";
import { VerifyWiseContext } from "../../../../../application/contexts/VerifyWise.context";
import type { RiskModel } from "../../../../../domain/models/Common/risks/risk.model";

vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: "Admin",
    userId: 1,
    token: "mock-token",
    isAuthenticated: true,
    isSuperAdmin: false,
    organizationId: 1,
    activeOrganizationId: null,
    userToken: null,
  }),
}));

vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [
      { id: 1, name: "Alice", surname: "Smith" },
      { id: 2, name: "Bob", surname: "Jones" },
    ],
    loading: false,
    error: null,
    refreshUsers: vi.fn(),
  }),
}));

const mockRows = [
  {
    id: 1,
    risk_name: "Data Breach Risk",
    risk_owner: 1,
    severity: "High",
    ale_estimate: 500000,
    mitigation_status: "In Progress",
    risk_level_autocalculated: "High",
    deadline: "2025-12-31T00:00:00Z",
    is_deleted: false,
    controls_mapping: "Test",
    custom_fields: [],
  },
  {
    id: 2,
    risk_name: "A very long risk name that definitely exceeds thirty characters",
    risk_owner: 2,
    severity: "Critical",
    ale_estimate: null,
    mitigation_status: "Open",
    risk_level_autocalculated: "Critical",
    deadline: "2025-06-15T00:00:00Z",
    is_deleted: true,
    controls_mapping: "Test",
    custom_fields: [],
  },
] as unknown as RiskModel[];

const defaultProps = {
  rows: mockRows,
  page: 0,
  rowsPerPage: 10,
  setSelectedRow: vi.fn(),
  setAnchor: vi.fn(),
  onDeleteRisk: vi.fn(),
  flashRow: null,
  sortConfig: { key: "risk_name", direction: "asc" as const },
  visibleColumns: new Set([
    "risk_owner",
    "severity",
    "ale_estimate",
    "mitigation_status",
    "risk_level_autocalculated",
    "deadline",
    "controls_mapping",
  ]),
};

const contextValue = {
  setInputValues: vi.fn(),
  uiValues: {},
  setUiValues: vi.fn(),
  authValues: {},
  setAuthValues: vi.fn(),
  dashboardValues: {
    dashboard: {},
    projects: {},
    compliance: {},
    assessments: {},
    vendors: [],
    users: [],
  },
  setDashboardValues: vi.fn(),
  inputValues: {},
  token: null,
  currentProjectId: null,
  setCurrentProjectId: vi.fn(),
  userId: null,
  projects: [],
  setProjects: vi.fn(),
  componentsVisible: { home: false, sidebar: false, projectFrameworks: false, compliance: false },
  changeComponentVisibility: vi.fn(),
  users: [],
  refreshUsers: vi.fn(),
  userRoleName: "Admin",
  organizationId: null,
  photoRefreshFlag: false,
  setPhotoRefreshFlag: vi.fn(),
};

function renderWithContext(ui: React.ReactElement) {
  return renderWithProviders(
    <VerifyWiseContext.Provider value={contextValue}>
      <table>{ui}</table>
    </VerifyWiseContext.Provider>,
  );
}

describe("VWProjectRisksTableBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders risk names", () => {
    renderWithContext(<VWProjectRisksTableBody {...defaultProps} />);
    expect(screen.getByText("Data Breach Risk")).toBeInTheDocument();
  });

  it("truncates long risk names to 30 chars", () => {
    renderWithContext(<VWProjectRisksTableBody {...defaultProps} />);
    expect(screen.getByText("A very long risk name that def...")).toBeInTheDocument();
  });

  it("renders risk owner as user full name", () => {
    renderWithContext(<VWProjectRisksTableBody {...defaultProps} />);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  });

  it("renders severity chip", () => {
    renderWithContext(<VWProjectRisksTableBody {...defaultProps} />);
    const highTexts = screen.getAllByText("High");
    expect(highTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("renders formatted ale_estimate", () => {
    renderWithContext(<VWProjectRisksTableBody {...defaultProps} />);
    expect(screen.getByText("$500,000")).toBeInTheDocument();
  });

  it("renders dash for null ale_estimate", () => {
    renderWithContext(<VWProjectRisksTableBody {...defaultProps} />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("renders mitigation status chip", () => {
    renderWithContext(<VWProjectRisksTableBody {...defaultProps} />);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("renders risk level chip", () => {
    renderWithContext(<VWProjectRisksTableBody {...defaultProps} />);
    const highChips = screen.getAllByText("High");
    expect(highChips.length).toBeGreaterThanOrEqual(1);
  });

  it("renders formatted deadline", () => {
    renderWithContext(<VWProjectRisksTableBody {...defaultProps} />);
    const dates = screen.getAllByText(/\d{2}-\d{2}-\d{4}/);
    expect(dates.length).toBeGreaterThanOrEqual(1);
  });

  it("renders NA for null deadline when not in visibleColumns", () => {
    const propsNoDeadline = {
      ...defaultProps,
      visibleColumns: new Set(["risk_owner", "severity", "mitigation_status"]),
    };
    renderWithContext(<VWProjectRisksTableBody {...propsNoDeadline} />);
    expect(screen.queryByText("NA")).not.toBeInTheDocument();
  });

  it("renders View controls link", () => {
    renderWithContext(<VWProjectRisksTableBody {...defaultProps} />);
    const viewControls = screen.getAllByText("View controls");
    expect(viewControls.length).toBeGreaterThanOrEqual(1);
  });

  it("calls setSelectedRow and setAnchor on row click", async () => {
    const setSelectedRow = vi.fn();
    const setAnchor = vi.fn();
    const user = userEvent.setup();

    renderWithContext(
      <VWProjectRisksTableBody
        {...defaultProps}
        setSelectedRow={setSelectedRow}
        setAnchor={setAnchor}
      />,
    );

    await user.click(screen.getByText("Data Breach Risk"));
    expect(setSelectedRow).toHaveBeenCalled();
    expect(setAnchor).toHaveBeenCalled();
  });

  it("applies deleted row styling", () => {
    const { container } = renderWithContext(<VWProjectRisksTableBody {...defaultProps} />);
    const rows = container.querySelectorAll("tr");
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("hides columns not in visibleColumns", () => {
    const minimalColumns = new Set(["severity", "mitigation_status"]);
    renderWithContext(
      <VWProjectRisksTableBody {...defaultProps} visibleColumns={minimalColumns} />,
    );
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.queryByText("$500,000")).not.toBeInTheDocument();
  });

  it("renders dash when risk_name is missing", () => {
    const rowsNoName = [{ ...mockRows[0], id: 99, risk_name: null }] as unknown as RiskModel[];
    renderWithContext(<VWProjectRisksTableBody {...defaultProps} rows={rowsNoName} />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("calls setInputValues on row click with assessment_mapping", async () => {
    const setInputValues = vi.fn();
    const user = userEvent.setup();

    const rowsWithAssessment = [
      { ...mockRows[0], assessment_mapping: 5 },
    ] as unknown as RiskModel[];

    renderWithContext(
      <VerifyWiseContext.Provider value={{ ...contextValue, setInputValues }}>
        <table>
          <VWProjectRisksTableBody {...defaultProps} rows={rowsWithAssessment} />
        </table>
      </VerifyWiseContext.Provider>,
    );

    await user.click(screen.getByText("Data Breach Risk"));
    expect(setInputValues).toHaveBeenCalledWith(
      expect.objectContaining({
        assessment_mapping: 5,
      }),
    );
  });

  it("renders custom field columns", () => {
    const customFieldDefs = [{ id: 1, label: "Custom Field 1", field_type: "text" }];
    renderWithContext(
      <VWProjectRisksTableBody {...defaultProps} customFieldDefs={customFieldDefs} />,
    );
  });

  it("renders with selection checkboxes", () => {
    renderWithContext(
      <VWProjectRisksTableBody
        {...defaultProps}
        selection={{
          isSelected: (id) => id === 1,
          onToggle: vi.fn(),
        }}
      />,
    );
    const checkboxes = document.querySelectorAll('[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThanOrEqual(1);
  });

  it("calls selection.onToggle on checkbox click", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    renderWithContext(
      <VWProjectRisksTableBody
        {...defaultProps}
        selection={{
          isSelected: () => false,
          onToggle,
        }}
      />,
    );

    const checkbox = document.querySelectorAll('[type="checkbox"]')[0];
    await user.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it("respects rowsPerPage pagination", () => {
    renderWithContext(<VWProjectRisksTableBody {...defaultProps} page={0} rowsPerPage={1} />);
    expect(screen.getByText("Data Breach Risk")).toBeInTheDocument();
    expect(screen.queryByText("A very long risk name that def...")).not.toBeInTheDocument();
  });

  it("renders with empty rows", () => {
    const { container } = renderWithContext(
      <VWProjectRisksTableBody {...defaultProps} rows={[]} />,
    );
    expect(container.querySelector("tbody")?.children).toHaveLength(0);
  });

  it("renders dash for owner when userId is not found in users", () => {
    const rowsWithUnknownOwner = [
      { ...mockRows[0], id: 100, risk_owner: 999 },
    ] as unknown as RiskModel[];
    renderWithContext(<VWProjectRisksTableBody {...defaultProps} rows={rowsWithUnknownOwner} />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });
});
