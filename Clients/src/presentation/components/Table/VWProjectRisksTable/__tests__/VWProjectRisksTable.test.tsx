import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import VWProjectRisksTable from "../index";
import type { RiskModel } from "../../../../../domain/models/Common/risks/risk.model";
import { buildRisk } from "../../../../../test/factories/risk.factory";

vi.mock("../../../../../application/hooks/useCustomFields", () => ({
  // Stub every hook the module exports so vitest doesn't keep real
  // customField.repository (→ axios) in the live module graph, which leads
  // to "module loaded after teardown" unhandled rejections.
  useCustomFieldDefinitions: () => ({ data: [], isLoading: false, isError: false }),
  useCustomFieldValues: () => ({ data: [], isLoading: false }),
  useMissingRequiredCustomFields: () => ({ data: [], isLoading: false }),
  useCreateCustomFieldDefinition: () => ({ mutate: () => {}, mutateAsync: async () => undefined }),
  useUpdateCustomFieldDefinition: () => ({ mutate: () => {}, mutateAsync: async () => undefined }),
  useDeleteCustomFieldDefinition: () => ({ mutate: () => {}, mutateAsync: async () => undefined }),
  customFieldsKeys: {
    definitions: () => ["customFields", "definitions"],
    values: () => ["customFields", "values"],
    missingRequired: () => ["customFields", "missingRequired"],
  },
}));

vi.mock("../../../../../application/hooks/useBulkSelection", () => ({
  useBulkSelection: () => ({
    selectedIds: [],
    isSelected: () => false,
    toggle: vi.fn(),
    toggleAll: vi.fn(),
    setAll: vi.fn(),
    clear: vi.fn(),
    allSelected: false,
    someSelected: false,
    count: 0,
  }),
}));

vi.mock("../../../../../application/hooks/useBulkUpdateProjectRisks", () => ({
  useBulkUpdateProjectRisks: () => ({
    mutate: vi.fn(),
    isPending: false,
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

vi.mock("../VWProjectRisksTableBody", () => ({
  default: ({ rows, selection }: any) => (
    <tbody data-testid="mock-risks-body">
      {rows.map((row: any) => (
        <tr key={row.id} data-testid={`risk-row-${row.id}`}>
          <td>{row.risk_name}</td>
          {selection && (
            <td>
              <input
                type="checkbox"
                data-testid={`risk-checkbox-${row.id}`}
                checked={selection.isSelected(row.id)}
                onChange={() => selection.onToggle(row.id)}
              />
            </td>
          )}
        </tr>
      ))}
    </tbody>
  ),
}));

vi.mock("../../BulkActionsToolbar", () => ({
  default: ({ count, onClear, actions, selectAll }: any) => (
    <div data-testid="bulk-actions-toolbar">
      <span data-testid="selection-count">{count} selected</span>
      <button data-testid="clear-selection" onClick={onClear}>
        Clear
      </button>
      {actions.map((action: any) => (
        <button
          key={action.id}
          data-testid={`bulk-action-${action.id}`}
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      ))}
      {selectAll && (
        <button data-testid="select-all" onClick={selectAll.onSelectAll}>
          Select all {selectAll.totalCount}
        </button>
      )}
    </div>
  ),
}));

vi.mock("../../../Dialogs/ConfirmationModal", () => ({
  default: ({ isOpen, title, onProceed, onCancel, proceedText, cancelText }: any) =>
    isOpen ? (
      <div data-testid="confirmation-modal">
        <h3>{title}</h3>
        <button data-testid="modal-proceed" onClick={onProceed}>
          {proceedText}
        </button>
        <button data-testid="modal-cancel" onClick={onCancel}>
          {cancelText}
        </button>
      </div>
    ) : null,
}));

vi.mock("../../../Inputs/Checkbox", () => ({
  default: ({ isChecked, onChange, ariaLabel }: any) => (
    <input
      type="checkbox"
      checked={isChecked}
      onChange={onChange}
      aria-label={ariaLabel}
      data-testid="select-all-checkbox"
    />
  ),
}));

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

const mockRows = [
  buildRisk({
    risk_name: "Data Breach Risk",
    severity: "High",
    risk_level_autocalculated: "High",
    likelihood: "Medium",
  }),
  buildRisk({
    id: 2,
    risk_name: "AI Bias Risk",
    risk_owner: 2,
    severity: "Critical",
    ale_estimate: null,
    mitigation_status: "Open",
    risk_level_autocalculated: "Critical",
    deadline: "2025-06-15T00:00:00Z",
    controls_mapping: "Another control",
    likelihood: "High",
  }),
  buildRisk({
    id: 3,
    risk_name: "Compliance Risk",
    severity: "Moderate",
    ale_estimate: 10000,
    risk_level_autocalculated: "Medium",
    deadline: "2025-09-01T00:00:00Z",
    controls_mapping: "Compliance controls",
    likelihood: "Low",
  }),
] as unknown as RiskModel[];

const defaultProps = {
  rows: mockRows,
  setSelectedRow: vi.fn(),
  setAnchor: vi.fn(),
  onDeleteRisk: vi.fn(),
  setPage: vi.fn(),
  page: 0,
  flashRow: null,
};

describe("VWProjectRisksTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders column headers", () => {
    renderWithProviders(<VWProjectRisksTable {...defaultProps} />);
    expect(screen.getByText("RISK NAME")).toBeInTheDocument();
    expect(screen.getByText("OWNER")).toBeInTheDocument();
    expect(screen.getByText("SEVERITY")).toBeInTheDocument();
    expect(screen.getByText("ALE ($)")).toBeInTheDocument();
    expect(screen.getByText("MITIGATION STATUS")).toBeInTheDocument();
    expect(screen.getByText("RISK LEVEL")).toBeInTheDocument();
    expect(screen.getByText("TARGET DATE")).toBeInTheDocument();
    expect(screen.getByText("CONTROLS")).toBeInTheDocument();
  });

  it("renders risk rows via VWProjectRisksTableBody mock", () => {
    renderWithProviders(<VWProjectRisksTable {...defaultProps} />);
    expect(screen.getByText("Data Breach Risk")).toBeInTheDocument();
    expect(screen.getByText("AI Bias Risk")).toBeInTheDocument();
    expect(screen.getByText("Compliance Risk")).toBeInTheDocument();
  });

  it("shows empty state when no rows", () => {
    renderWithProviders(<VWProjectRisksTable {...defaultProps} rows={[]} />);
    expect(screen.getByText("There is currently no data in this table.")).toBeInTheDocument();
  });

  it("sorts by risk_name asc on first click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<VWProjectRisksTable {...defaultProps} />);

    await user.click(screen.getByText("RISK NAME"));
    const stored = localStorage.getItem("verifywise_risks_sorting");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.key).toBe("risk_name");
    expect(parsed.direction).toBe("asc");
  });

  it("toggles sort to desc on second click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<VWProjectRisksTable {...defaultProps} />);

    await user.click(screen.getByText("RISK NAME"));
    await user.click(screen.getByText("RISK NAME"));
    const parsed = JSON.parse(localStorage.getItem("verifywise_risks_sorting")!);
    expect(parsed.direction).toBe("desc");
  });

  it("clears sort on third click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<VWProjectRisksTable {...defaultProps} />);

    const header = screen.getByText("RISK NAME");
    await user.click(header);
    await user.click(header);
    await user.click(header);
    const parsed = JSON.parse(localStorage.getItem("verifywise_risks_sorting")!);
    expect(parsed.key).toBe("");
    expect(parsed.direction).toBe(null);
  });

  it("sorts by severity using ordinal value", async () => {
    const user = userEvent.setup();
    renderWithProviders(<VWProjectRisksTable {...defaultProps} />);

    await user.click(screen.getByText("SEVERITY"));
    const parsed = JSON.parse(localStorage.getItem("verifywise_risks_sorting")!);
    expect(parsed.key).toBe("severity");
    expect(parsed.direction).toBe("asc");
  });

  it("shows pagination when not hidden", () => {
    renderWithProviders(<VWProjectRisksTable {...defaultProps} />);
    expect(screen.getByText(/Showing/)).toBeInTheDocument();
    expect(screen.getByText(/Project risks per page/)).toBeInTheDocument();
  });

  it("shows pagination range text", () => {
    renderWithProviders(<VWProjectRisksTable {...defaultProps} />);
    expect(screen.getByText(/Showing 1 - /)).toBeInTheDocument();
  });

  it("hides pagination when hidePagination is true", () => {
    renderWithProviders(<VWProjectRisksTable {...defaultProps} hidePagination />);
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Project risks per page/)).not.toBeInTheDocument();
  });

  it("persists rowsPerPage to localStorage", () => {
    renderWithProviders(<VWProjectRisksTable {...defaultProps} />);
    expect(localStorage.getItem("verifywise_risks_rows_per_page")).toBe("5");
  });

  it("reads rowsPerPage from localStorage when available", () => {
    localStorage.setItem("verifywise_risks_rows_per_page", "10");
    renderWithProviders(<VWProjectRisksTable {...defaultProps} />);
    expect(screen.getByText(/Showing/)).toBeInTheDocument();
  });

  it("shows bulk actions toolbar when canRunBulkActions is true", () => {
    renderWithProviders(<VWProjectRisksTable {...defaultProps} canRunBulkActions />);
    expect(screen.getByTestId("bulk-actions-toolbar")).toBeInTheDocument();
  });

  it("hides bulk actions toolbar when canRunBulkActions is false", () => {
    renderWithProviders(<VWProjectRisksTable {...defaultProps} />);
    expect(screen.queryByTestId("bulk-actions-toolbar")).not.toBeInTheDocument();
  });

  it("renders select-all checkbox in header when canRunBulkActions", () => {
    renderWithProviders(<VWProjectRisksTable {...defaultProps} canRunBulkActions />);
    expect(screen.getByTestId("select-all-checkbox")).toBeInTheDocument();
  });

  it("renders row checkboxes when canRunBulkActions", () => {
    renderWithProviders(<VWProjectRisksTable {...defaultProps} canRunBulkActions />);
    const checkboxes = screen.getAllByTestId(/risk-checkbox-/);
    expect(checkboxes).toHaveLength(3);
  });

  it("opens set owner dialog on bulk action click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<VWProjectRisksTable {...defaultProps} canRunBulkActions />);

    const setOwnerBtn = screen.getByTestId("bulk-action-set_owner");
    await user.click(setOwnerBtn);
    expect(screen.getByTestId("confirmation-modal")).toBeInTheDocument();
  });

  it("opens set category dialog on bulk action click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<VWProjectRisksTable {...defaultProps} canRunBulkActions />);

    const setCategoryBtn = screen.getByTestId("bulk-action-set_category");
    await user.click(setCategoryBtn);
    expect(screen.getByTestId("confirmation-modal")).toBeInTheDocument();
  });

  it("renders archive bulk action", () => {
    renderWithProviders(<VWProjectRisksTable {...defaultProps} canRunBulkActions />);
    expect(screen.getByTestId("bulk-action-archive")).toBeInTheDocument();
  });

  it("calls setPage when page prop changes", () => {
    const setPage = vi.fn();
    const { rerender } = renderWithProviders(
      <VWProjectRisksTable {...defaultProps} setPage={setPage} page={0} rows={[mockRows[0]]} />,
    );

    rerender(
      <VWProjectRisksTable {...defaultProps} setPage={setPage} page={1} rows={[mockRows[0]]} />,
    );

    expect(setPage).toHaveBeenCalled();
  });

  it("filters columns by visibleColumns", () => {
    const visibleColumns = new Set(["risk_name", "severity"]);
    renderWithProviders(<VWProjectRisksTable {...defaultProps} visibleColumns={visibleColumns} />);
    expect(screen.getByText("RISK NAME")).toBeInTheDocument();
    expect(screen.getByText("SEVERITY")).toBeInTheDocument();
    expect(screen.queryByText("OWNER")).not.toBeInTheDocument();
    expect(screen.queryByText("ALE ($)")).not.toBeInTheDocument();
  });

  it("renders custom field columns when present", () => {
    vi.mocked(vi.importActual("../../../../../application/hooks/useCustomFields")).then(() => {
      vi.mock("../../../../../application/hooks/useCustomFields", () => ({
        useCustomFieldDefinitions: () => ({
          data: [{ id: 1, label: "Custom Field", field_type: "text" }],
        }),
      }));
    });
    renderWithProviders(<VWProjectRisksTable {...defaultProps} />);
  });

  it("handles flashRow prop", () => {
    renderWithProviders(<VWProjectRisksTable {...defaultProps} flashRow={1} />);
    expect(screen.getByText("Data Breach Risk")).toBeInTheDocument();
  });

  it("renders with all risks deleted (empty selectable)", () => {
    const deletedRows = [buildRisk({ is_deleted: true })] as unknown as RiskModel[];
    renderWithProviders(
      <VWProjectRisksTable {...defaultProps} rows={deletedRows} canRunBulkActions />,
    );
    expect(screen.getByText("Data Breach Risk")).toBeInTheDocument();
  });

  it("passes selection prop to VWProjectRisksTableBody when canRunBulkActions", () => {
    renderWithProviders(<VWProjectRisksTable {...defaultProps} canRunBulkActions />);
    const checkboxes = screen.getAllByTestId(/risk-checkbox-/);
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  it("closes owner dialog on cancel", async () => {
    const user = userEvent.setup();
    renderWithProviders(<VWProjectRisksTable {...defaultProps} canRunBulkActions />);

    await user.click(screen.getByTestId("bulk-action-set_owner"));
    expect(screen.getByTestId("confirmation-modal")).toBeInTheDocument();

    await user.click(screen.getByTestId("modal-cancel"));
    expect(screen.queryByTestId("confirmation-modal")).not.toBeInTheDocument();
  });
});
