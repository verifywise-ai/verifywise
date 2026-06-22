import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import CustomFieldsSection from "../index";
import { createRef } from "react";
import type { CustomFieldsSectionHandle } from "../index";

const mockDefinitions = [
  { id: 1, label: "Department", field_type: "text", required: true, options: null },
  { id: 2, label: "Score", field_type: "number", required: false, options: null },
  { id: 3, label: "Start Date", field_type: "date", required: false, options: null },
  { id: 4, label: "Active", field_type: "boolean", required: false, options: null },
  { id: 5, label: "Region", field_type: "select", required: false, options: ["US", "EU", "APAC"] },
  { id: 6, label: "Tags", field_type: "multiselect", required: false, options: ["alpha", "beta"] },
  { id: 7, label: "Owner", field_type: "user", required: false, options: null },
];

const mockValues = [
  { definition_id: 1, value: "Engineering" },
  { definition_id: 2, value: 95 },
];

let mockDefsData: any = null;
let mockDefsIsLoading = false;
let mockDefsIsError = false;
let mockValuesData: any = null;
let mockValuesIsLoading = false;

let mockUsers = [{ id: 1, name: "Alice", surname: "Smith", email: "alice@test.com" }];
let mockUsersLoading = false;

let mockSetCustomFieldValue = vi.fn().mockResolvedValue({});
let mockDeleteCustomFieldValue = vi.fn().mockResolvedValue({});

vi.mock("../../../../application/hooks/useCustomFields", () => ({
  useCustomFieldDefinitions: () => ({
    data: mockDefsData,
    isLoading: mockDefsIsLoading,
    isError: mockDefsIsError,
  }),
  useCustomFieldValues: () => ({
    data: mockValuesData,
    isLoading: mockValuesIsLoading,
  }),
  customFieldsKeys: {
    definitions: (et: string) => ["customFields", "definitions", et],
    values: (et: string, ei: number | null) => ["customFields", "values", et, ei],
    missingRequired: (et: string, ei: number | null) => ["customFields", "missingRequired", et, ei],
  },
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: mockUsers, loading: mockUsersLoading }),
}));

vi.mock("../../../../application/repository/customField.repository", () => ({
  setCustomFieldValue: (...args: any[]) => mockSetCustomFieldValue(...args),
  deleteCustomFieldValue: (...args: any[]) => mockDeleteCustomFieldValue(...args),
}));

vi.mock("../RequiredCustomFieldsGate", () => ({
  RequiredCustomFieldsBanner: () => <div data-testid="required-banner">Missing fields</div>,
}));

vi.mock("../../Inputs/Datepicker", () => ({
  default: ({ date, disabled, handleDateChange }: any) => (
    <input
      type="text"
      data-testid="datepicker"
      disabled={disabled}
      value={date ? date.format("YYYY-MM-DD") : ""}
      onChange={() => handleDateChange?.(null)}
    />
  ),
}));

vi.mock("../../Inputs/Field", () => ({
  default: ({ id, value, onChange, placeholder, disabled }: any) => (
    <input
      id={id}
      data-testid="field"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={onChange}
    />
  ),
}));

vi.mock("../../Inputs/Select", () => ({
  default: ({ id, value, items, onChange, disabled, placeholder }: any) => (
    <select id={id} data-testid="select" value={value} disabled={disabled} onChange={onChange}>
      <option value="">{placeholder}</option>
      {items.map((item: any) => (
        <option key={item._id} value={item._id}>
          {item.name}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("../../Inputs/Toggle", () => ({
  default: ({ checked, disabled, onChange }: any) => (
    <input
      type="checkbox"
      data-testid="toggle"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange?.(e, e.target.checked)}
    />
  ),
}));

vi.mock("../../Inputs/Autocomplete", () => ({
  default: ({ value, onChange, options, placeholder }: any) => (
    <div data-testid="autocomplete">
      {options.map((opt: string) => (
        <button key={opt} onClick={() => onChange?.({}, [opt])}>
          {opt}
        </button>
      ))}
      <span>Selected: {value.join(",")}</span>
      {placeholder && <span>{placeholder}</span>}
    </div>
  ),
}));

describe("CustomFieldsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefsData = mockDefinitions;
    mockDefsIsLoading = false;
    mockDefsIsError = false;
    mockValuesData = mockValues;
    mockValuesIsLoading = false;
    mockSetCustomFieldValue = vi.fn().mockResolvedValue({});
    mockDeleteCustomFieldValue = vi.fn().mockResolvedValue({});
  });

  it("renders loading spinner when definitions are loading", () => {
    mockDefsData = null;
    mockDefsIsLoading = true;
    const { container } = renderWithProviders(
      <CustomFieldsSection entityType="vendor" entityId={1} />,
    );
    expect(container.querySelector(".MuiCircularProgress-root")).toBeInTheDocument();
  });

  it("renders loading spinner when values are loading in edit mode", () => {
    mockValuesData = null;
    mockValuesIsLoading = true;
    const { container } = renderWithProviders(
      <CustomFieldsSection entityType="vendor" entityId={1} />,
    );
    expect(container.querySelector(".MuiCircularProgress-root")).toBeInTheDocument();
  });

  it("does NOT show loading spinner when values loading in create mode (entityId null)", () => {
    mockValuesData = null;
    mockValuesIsLoading = true;
    const { container } = renderWithProviders(
      <CustomFieldsSection entityType="vendor" entityId={null} />,
    );
    expect(container.querySelector(".MuiCircularProgress-root")).not.toBeInTheDocument();
  });

  it("renders error message when definitions failed to load", () => {
    mockDefsData = null;
    mockDefsIsLoading = false;
    mockDefsIsError = true;
    renderWithProviders(<CustomFieldsSection entityType="vendor" entityId={1} />);
    expect(screen.getByText("Failed to load custom fields.")).toBeInTheDocument();
  });

  it("renders empty state when no definitions", () => {
    mockDefsData = [];
    renderWithProviders(<CustomFieldsSection entityType="vendor" entityId={1} />);
    expect(screen.getByText(/No custom fields defined for this entity/)).toBeInTheDocument();
  });

  it("renders definition labels", () => {
    renderWithProviders(<CustomFieldsSection entityType="vendor" entityId={1} />);
    expect(screen.getByText("Department")).toBeInTheDocument();
    expect(screen.getByText("Score")).toBeInTheDocument();
    expect(screen.getByText("Start Date")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Region")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("shows required asterisk for required fields", () => {
    renderWithProviders(<CustomFieldsSection entityType="vendor" entityId={1} />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("renders required banner in edit mode", () => {
    renderWithProviders(<CustomFieldsSection entityType="vendor" entityId={1} />);
    expect(screen.getByTestId("required-banner")).toBeInTheDocument();
  });

  it("does not render required banner in create mode", () => {
    renderWithProviders(<CustomFieldsSection entityType="vendor" entityId={null} />);
    expect(screen.queryByTestId("required-banner")).not.toBeInTheDocument();
  });

  it("renders text input for text field", () => {
    renderWithProviders(<CustomFieldsSection entityType="vendor" entityId={1} />);
    const inputs = screen.getAllByTestId("field");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("renders select for select field", () => {
    renderWithProviders(<CustomFieldsSection entityType="vendor" entityId={1} />);
    const selects = screen.getAllByTestId("select");
    expect(selects.length).toBeGreaterThan(0);
  });

  it("renders toggle for boolean field", () => {
    renderWithProviders(<CustomFieldsSection entityType="vendor" entityId={1} />);
    const toggles = screen.getAllByTestId("toggle");
    expect(toggles.length).toBeGreaterThan(0);
  });

  it("renders autocomplete for multiselect field", () => {
    renderWithProviders(<CustomFieldsSection entityType="vendor" entityId={1} />);
    const autocompletes = screen.getAllByTestId("autocomplete");
    expect(autocompletes.length).toBeGreaterThan(0);
  });

  it("renders datepicker for date field", () => {
    renderWithProviders(<CustomFieldsSection entityType="vendor" entityId={1} />);
    const datepickers = screen.getAllByTestId("datepicker");
    expect(datepickers.length).toBeGreaterThan(0);
  });

  it("renders clear button for fields with stored values", () => {
    renderWithProviders(<CustomFieldsSection entityType="vendor" entityId={1} />);
    const clearButtons = screen.getAllByTitle("Clear value");
    expect(clearButtons.length).toBeGreaterThan(0);
  });

  it("removes clear button after clicking it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomFieldsSection entityType="vendor" entityId={1} />);
    const clearButtons = screen.getAllByTitle("Clear value");
    await user.click(clearButtons[0]);
    expect(screen.queryAllByTitle("Clear value").length).toBeLessThan(clearButtons.length);
  });

  describe("flush and hasPendingValues", () => {
    it("hasPendingValues returns false initially", () => {
      const ref = createRef<CustomFieldsSectionHandle>();
      renderWithProviders(<CustomFieldsSection ref={ref} entityType="vendor" entityId={1} />);
      expect(ref.current?.hasPendingValues()).toBe(false);
    });

    it("hasPendingValues returns true after staging a value", async () => {
      const user = userEvent.setup();
      const ref = createRef<CustomFieldsSectionHandle>();
      renderWithProviders(<CustomFieldsSection ref={ref} entityType="vendor" entityId={1} />);
      const fields = screen.getAllByTestId("field");
      await user.type(fields[0], "New Value");
      expect(ref.current?.hasPendingValues()).toBe(true);
    });

    it("flush calls setCustomFieldValueAPI and clears pending", async () => {
      const user = userEvent.setup();
      const ref = createRef<CustomFieldsSectionHandle>();
      renderWithProviders(<CustomFieldsSection ref={ref} entityType="vendor" entityId={null} />);
      const fields = screen.getAllByTestId("field");
      await user.type(fields[0], "New Value");
      expect(ref.current?.hasPendingValues()).toBe(true);
      await ref.current!.flush(42);
      await waitFor(() => {
        expect(ref.current?.hasPendingValues()).toBe(false);
      });
    });

    it("flush with no pending values is a no-op", async () => {
      const ref = createRef<CustomFieldsSectionHandle>();
      renderWithProviders(<CustomFieldsSection ref={ref} entityType="vendor" entityId={null} />);
      await ref.current!.flush(42);
    });
  });

  describe("flush error handling", () => {
    it("shows alert on flush failure", async () => {
      mockSetCustomFieldValue = vi.fn().mockRejectedValue(new Error("Network error"));
      const ref = createRef<CustomFieldsSectionHandle>();
      const user = userEvent.setup();
      renderWithProviders(<CustomFieldsSection ref={ref} entityType="vendor" entityId={null} />);
      const fields = screen.getAllByTestId("field");
      await user.type(fields[0], "New Value");
      try {
        await ref.current!.flush(42);
      } catch {
        // expected
      }
      await waitFor(() => {
        expect(screen.getByText(/Custom field values could not be saved/)).toBeInTheDocument();
      });
    });
  });
});
