import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import type { ICustomFieldDefinition } from "../../../../../domain/interfaces/i.customField";

/** MUI's custom Select associates the visible label with a pointer-events:none
 * hidden input; the actual clickable element is the sibling role=combobox div. */
function openCustomSelect(hiddenInputId: string) {
  const hiddenInput = document.getElementById(hiddenInputId)!;
  const combobox = hiddenInput
    .closest(".MuiInputBase-root")!
    .querySelector('[role="combobox"]') as HTMLElement;
  fireEvent.mouseDown(combobox);
}

let mockUserRoleName = "Admin";
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockUserRoleName }),
}));

const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

let mockQueryState: { data: ICustomFieldDefinition[] | undefined; isLoading: boolean; isError: boolean };

vi.mock("../../../../../application/hooks/useCustomFields", () => ({
  useCustomFieldDefinitions: () => mockQueryState,
  useCreateCustomFieldDefinition: () => ({ mutate: mockCreateMutate, isPending: false }),
  useUpdateCustomFieldDefinition: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useDeleteCustomFieldDefinition: () => ({ mutate: mockDeleteMutate, isPending: false }),
}));

import CustomFieldsTab from "../index";

const buildDefinition = (
  overrides: Partial<ICustomFieldDefinition> = {},
): ICustomFieldDefinition => ({
  id: 1,
  organization_id: 1,
  entity_type: "vendor",
  field_key: "department_owner",
  label: "Department owner",
  field_type: "text",
  options: null,
  required: false,
  created_by: 1,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  ...overrides,
});

describe("CustomFieldsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRoleName = "Admin";
    mockQueryState = { data: [buildDefinition()], isLoading: false, isError: false };
  });

  it("shows a restricted message for non-admins", () => {
    mockUserRoleName = "Editor";
    renderWithProviders(<CustomFieldsTab />);
    expect(screen.getByText("Only Admins can manage custom fields.")).toBeInTheDocument();
  });

  it("renders the field table for admins", () => {
    renderWithProviders(<CustomFieldsTab />);
    expect(screen.getByText("Custom fields")).toBeInTheDocument();
    expect(screen.getByText("Department owner")).toBeInTheDocument();
    expect(screen.getByText("department_owner")).toBeInTheDocument();
  });

  it("shows a loading spinner", () => {
    mockQueryState = { data: undefined, isLoading: true, isError: false };
    renderWithProviders(<CustomFieldsTab />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows an error message", () => {
    mockQueryState = { data: undefined, isLoading: false, isError: true };
    renderWithProviders(<CustomFieldsTab />);
    expect(screen.getByText("Failed to load custom fields.")).toBeInTheDocument();
  });

  it("shows an empty state when there are no definitions", () => {
    mockQueryState = { data: [], isLoading: false, isError: false };
    renderWithProviders(<CustomFieldsTab />);
    expect(screen.getByText(/No custom fields for vendor yet\./)).toBeInTheDocument();
  });

  it("renders option chips for select-type fields", () => {
    mockQueryState = {
      data: [
        buildDefinition({
          field_type: "select",
          options: ["Alpha", "Beta"],
        }),
      ],
      isLoading: false,
      isError: false,
    };
    renderWithProviders(<CustomFieldsTab />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("opens the create modal and validates the label field", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomFieldsTab />);
    await user.click(screen.getByText("Add field"));
    expect(screen.getByText("Add custom field")).toBeInTheDocument();

    await user.click(screen.getByText("Create"));
    expect(screen.getByText("Label is required.")).toBeInTheDocument();
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it("validates the field key format on create", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomFieldsTab />);
    await user.click(screen.getByText("Add field"));

    await user.type(screen.getByPlaceholderText("e.g., Department owner"), "My label");
    await user.type(screen.getByPlaceholderText("e.g., department_owner"), "Bad Key!");
    await user.click(screen.getByText("Create"));

    expect(
      screen.getByText(/Field key must start with a lowercase letter/),
    ).toBeInTheDocument();
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it("submits a valid new field definition", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomFieldsTab />);
    await user.click(screen.getByText("Add field"));

    await user.type(screen.getByPlaceholderText("e.g., Department owner"), "My label");
    await user.type(screen.getByPlaceholderText("e.g., department_owner"), "my_field");
    await user.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(mockCreateMutate).toHaveBeenCalled();
    });
    const [input] = mockCreateMutate.mock.calls[0];
    expect(input.label).toBe("My label");
    expect(input.field_key).toBe("my_field");
    expect(input.entity_type).toBe("vendor");
  });

  it("requires at least one option for select field types", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomFieldsTab />);
    await user.click(screen.getByText("Add field"));

    await user.type(screen.getByPlaceholderText("e.g., Department owner"), "My label");
    await user.type(screen.getByPlaceholderText("e.g., department_owner"), "my_field");

    openCustomSelect("cf-field-type");
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByText("Single select"));

    await user.click(screen.getByText("Create"));
    expect(screen.getByText(/Add at least one option/)).toBeInTheDocument();
  });

  it("opens the edit modal with existing values and disables the field key", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomFieldsTab />);

    const editButtons = screen.getAllByTitle("Edit field");
    await user.click(editButtons[0]);

    expect(screen.getByText("Edit custom field")).toBeInTheDocument();
    expect(screen.getByDisplayValue("department_owner")).toBeDisabled();

    await user.click(screen.getByText("Save"));
    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          body: expect.objectContaining({ label: "Department owner" }),
        }),
        expect.anything(),
      );
    });
  });

  it("opens the delete confirmation and deletes on proceed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomFieldsTab />);

    const deleteButtons = screen.getAllByTitle("Delete field");
    await user.click(deleteButtons[0]);

    expect(screen.getByText("Delete custom field")).toBeInTheDocument();
    await user.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(mockDeleteMutate).toHaveBeenCalledWith(1, expect.anything());
    });
  });

  it("changes entity type via the select", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CustomFieldsTab />);

    openCustomSelect("custom-field-entity");
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByText("Policy"));

    // The mocked useCustomFieldDefinitions always returns the same static data
    // regardless of entity type, so assert the state change through its effect
    // on a subsequent create submission instead of the (unmocked) empty state.
    await user.click(screen.getByText("Add field"));
    await user.type(screen.getByPlaceholderText("e.g., Department owner"), "Policy field");
    await user.type(screen.getByPlaceholderText("e.g., department_owner"), "policy_field");
    await user.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(mockCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({ entity_type: "policy" }),
        expect.anything(),
      );
    });
  });
});
