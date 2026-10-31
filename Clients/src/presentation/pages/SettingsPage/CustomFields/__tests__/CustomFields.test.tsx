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

let mockQueryState: {
  data: ICustomFieldDefinition[] | undefined;
  isLoading: boolean;
  isError: boolean;
};
let mockUsage: { total: number; by_option: Record<string, number> } | undefined;
let mockUsageLoading = false;

vi.mock("../../../../../application/hooks/useCustomFields", () => ({
  useCustomFieldDefinitions: () => mockQueryState,
  useCreateCustomFieldDefinition: () => ({ mutate: mockCreateMutate, isPending: false }),
  useUpdateCustomFieldDefinition: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useDeleteCustomFieldDefinition: () => ({ mutate: mockDeleteMutate, isPending: false }),
  useCustomFieldUsage: () => ({ data: mockUsage, isLoading: mockUsageLoading }),
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
    mockUsage = undefined;
    mockUsageLoading = false;
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

    expect(screen.getByText(/Field key must start with a lowercase letter/)).toBeInTheDocument();
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

  describe("plain select options in use", () => {
    const selectDef = buildDefinition({
      id: 6,
      entity_type: "project",
      label: "Region",
      field_key: "region",
      field_type: "select",
      options: ["Low", "Medium", "High"],
    });

    it("moves answers to the new text when a used option is renamed", async () => {
      mockQueryState = { data: [selectDef], isLoading: false, isError: false };
      mockUpdateMutate.mockImplementationOnce((_vars: any, opts: any) =>
        opts.onError({
          status: 409,
          message: "Some removed options are in use. Choose where to move their answers.",
          response: {
            message: "Conflict",
            data: {
              code: "options_in_use",
              in_use: [{ id: "Medium", label: "Medium", count: 3 }],
              entity_type: "project",
            },
          },
        }),
      );
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByTitle("Edit field"));
      fireEvent.change(screen.getByDisplayValue(/Low\s+Medium\s+High/), {
        target: { value: "Low\nModerate\nHigh" },
      });
      await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

      expect(
        await screen.findByText(
          "Medium is used by 3 use cases. Choose what happens to these answers:",
        ),
      ).toBeInTheDocument();
      openCustomSelect("move-0");
      await userEvent.click(screen.getByRole("option", { name: "Moderate" }));
      await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

      expect(mockUpdateMutate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: 6,
          body: expect.objectContaining({
            options: ["Low", "Moderate", "High"],
            option_moves: { Medium: "Moderate" },
          }),
        }),
        expect.anything(),
      );
    });
  });

  describe("removing answers instead of moving them", () => {
    it("sends option_removals when Remove from records is chosen", async () => {
      const selectDef = buildDefinition({
        id: 7,
        entity_type: "vendor",
        label: "Tags",
        field_key: "tags",
        field_type: "multiselect",
        options: ["Cloud", "Legacy"],
      });
      mockQueryState = { data: [selectDef], isLoading: false, isError: false };
      mockUpdateMutate.mockImplementationOnce((_vars: any, opts: any) =>
        opts.onError({
          status: 409,
          message: "Some removed options are in use.",
          response: {
            message: "Conflict",
            data: {
              code: "options_in_use",
              in_use: [{ id: "Legacy", label: "Legacy", count: 40 }],
              entity_type: "vendor",
            },
          },
        }),
      );
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByTitle("Edit field"));
      fireEvent.change(screen.getByDisplayValue(/Cloud\s+Legacy/), { target: { value: "Cloud" } });
      await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

      await screen.findByText(
        "Legacy is used by 40 vendors. Choose what happens to these answers:",
      );
      openCustomSelect("move-0");
      await userEvent.click(screen.getByRole("option", { name: "Remove from records" }));
      expect(
        screen.getByText(/These answers will be deleted and can't be restored\./),
      ).toBeInTheDocument();
      const dialog = screen.getByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

      expect(mockUpdateMutate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: 7,
          body: expect.objectContaining({
            options: ["Cloud"],
            option_moves: {},
            option_removals: ["Legacy"],
          }),
        }),
        expect.anything(),
      );
    });
  });

  describe("scored select", () => {
    const scoredDef = buildDefinition({
      id: 5,
      entity_type: "project",
      label: "Feasibility",
      field_key: "feasibility",
      field_type: "scored_select",
      options: [
        { id: "opt_h", label: "High", score: 3 },
        { id: "opt_m", label: "Medium", score: 2 },
        { id: "opt_l", label: "Low", score: 1 },
      ],
    });

    it("shows scored options as label (score) chips", () => {
      mockQueryState = { data: [scoredDef], isLoading: false, isError: false };
      renderWithProviders(<CustomFieldsTab />);
      expect(screen.getByText("High (3)")).toBeInTheDocument();
      expect(screen.getByText("Low (1)")).toBeInTheDocument();
    });

    it("creates a scored select with rows of label and score", async () => {
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByRole("button", { name: /add field/i }));
      await userEvent.type(document.getElementById("cf-label")!, "Feasibility");
      await userEvent.type(document.getElementById("cf-field-key")!, "feasibility");
      openCustomSelect("cf-field-type");
      await userEvent.click(screen.getByRole("option", { name: "Scored select" }));

      const labels = () => screen.getAllByPlaceholderText("Option label");
      const scores = () => screen.getAllByPlaceholderText("Score");
      await userEvent.type(labels()[0], "High");
      await userEvent.type(scores()[0], "3");
      await userEvent.click(screen.getByRole("button", { name: /add option/i }));
      await userEvent.type(labels()[1], "Low");
      await userEvent.type(scores()[1], "0.333");
      await userEvent.tab();
      expect(scores()[1]).toHaveValue(0.33);

      await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
      expect(mockCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          field_type: "scored_select",
          options: [
            { label: "High", score: 3 },
            { label: "Low", score: 0.33 },
          ],
        }),
        expect.anything(),
      );
    });

    it("blocks saving an option without a score", async () => {
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByRole("button", { name: /add field/i }));
      await userEvent.type(document.getElementById("cf-label")!, "Feasibility");
      await userEvent.type(document.getElementById("cf-field-key")!, "feasibility");
      openCustomSelect("cf-field-type");
      await userEvent.click(screen.getByRole("option", { name: "Scored select" }));
      await userEvent.type(screen.getAllByPlaceholderText("Option label")[0], "High");
      await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
      expect(screen.getByText("Every option needs a label and a score.")).toBeInTheDocument();
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it("reorders options with the up and down buttons and keeps ids on save", async () => {
      mockQueryState = { data: [scoredDef], isLoading: false, isError: false };
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByTitle("Edit field"));
      await userEvent.click(screen.getAllByRole("button", { name: "Move option down" })[0]);
      await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
      expect(mockUpdateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 5,
          body: expect.objectContaining({
            options: [
              { id: "opt_m", label: "Medium", score: 2 },
              { id: "opt_h", label: "High", score: 3 },
              { id: "opt_l", label: "Low", score: 1 },
            ],
          }),
        }),
        expect.anything(),
      );
    });

    it("shows how many records use each option", async () => {
      mockQueryState = { data: [scoredDef], isLoading: false, isError: false };
      mockUsage = { total: 80, by_option: { opt_m: 80 } };
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByTitle("Edit field"));
      expect(screen.getByText("Used by 80")).toBeInTheDocument();
    });

    it("asks where to move answers when a used option is removed, then resends with option_moves", async () => {
      mockQueryState = { data: [scoredDef], isLoading: false, isError: false };
      mockUpdateMutate.mockImplementationOnce((_vars: any, opts: any) =>
        opts.onError({
          status: 409,
          message: "Some removed options are in use. Choose where to move their answers.",
          response: {
            message: "Conflict",
            data: {
              code: "options_in_use",
              in_use: [{ id: "opt_m", label: "Medium", count: 80 }],
              entity_type: "project",
            },
          },
        }),
      );
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByTitle("Edit field"));
      await userEvent.click(screen.getAllByRole("button", { name: "Remove option" })[1]);
      await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

      expect(
        await screen.findByText(
          "Medium is used by 80 use cases. Choose what happens to these answers:",
        ),
      ).toBeInTheDocument();
      openCustomSelect("move-0");
      await userEvent.click(screen.getByRole("option", { name: "Low (1)" }));
      await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

      expect(mockUpdateMutate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: 5,
          body: expect.objectContaining({ option_moves: { opt_m: "opt_l" } }),
        }),
        expect.anything(),
      );
    });

    it("asks again when another removed option gained answers before the resend, keeping earlier moves", async () => {
      mockQueryState = { data: [scoredDef], isLoading: false, isError: false };
      const conflict = (id: string, label: string, count: number) => ({
        status: 409,
        message: "Some removed options are in use.",
        response: {
          message: "Conflict",
          data: {
            code: "options_in_use",
            in_use: [{ id, label, count }],
            entity_type: "project",
          },
        },
      });
      mockUpdateMutate
        .mockImplementationOnce((_vars: any, opts: any) =>
          opts.onError(conflict("opt_m", "Medium", 80)),
        )
        .mockImplementationOnce((_vars: any, opts: any) =>
          opts.onError(conflict("opt_h", "High", 2)),
        );
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByTitle("Edit field"));
      // Remove High and Medium; only Low remains.
      await userEvent.click(screen.getAllByRole("button", { name: "Remove option" })[0]);
      await userEvent.click(screen.getAllByRole("button", { name: "Remove option" })[0]);
      await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

      await screen.findByText(
        "Medium is used by 80 use cases. Choose what happens to these answers:",
      );
      openCustomSelect("move-0");
      await userEvent.click(screen.getByRole("option", { name: "Low (1)" }));
      await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

      expect(
        await screen.findByText(
          "High is used by 2 use cases. Choose what happens to these answers:",
        ),
      ).toBeInTheDocument();
      openCustomSelect("move-0");
      await userEvent.click(screen.getByRole("option", { name: "Low (1)" }));
      await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

      expect(mockUpdateMutate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: 5,
          body: expect.objectContaining({
            option_moves: { opt_m: "opt_l", opt_h: "opt_l" },
          }),
        }),
        expect.anything(),
      );
    });

    it("explains when no saved option is left to move answers to", async () => {
      mockQueryState = { data: [scoredDef], isLoading: false, isError: false };
      mockUpdateMutate.mockImplementationOnce((_vars: any, opts: any) =>
        opts.onError({
          status: 409,
          message: "Some removed options are in use.",
          response: {
            message: "Conflict",
            data: {
              code: "options_in_use",
              in_use: [{ id: "opt_h", label: "High", count: 3 }],
              entity_type: "project",
            },
          },
        }),
      );
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByTitle("Edit field"));
      // Replace every saved option with a new one.
      await userEvent.click(screen.getByRole("button", { name: /add option/i }));
      await userEvent.type(screen.getAllByPlaceholderText("Option label")[3], "Very high");
      await userEvent.type(screen.getAllByPlaceholderText("Score")[3], "4");
      for (let i = 0; i < 3; i++) {
        await userEvent.click(screen.getAllByRole("button", { name: "Remove option" })[0]);
      }
      await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

      expect(
        await screen.findByText(
          "New options can't receive answers until they are saved. Remove these answers now, or save the new options first and move the answers later.",
        ),
      ).toBeInTheDocument();
    });

    it("keeps Delete disabled until the record count has loaded", async () => {
      mockQueryState = { data: [scoredDef], isLoading: false, isError: false };
      mockUsageLoading = true;
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByTitle("Delete field"));
      expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /processing/i })).toBeDisabled();
    });

    it("shows how many records lose their value when a field is deleted", async () => {
      mockQueryState = { data: [scoredDef], isLoading: false, isError: false };
      mockUsage = { total: 12, by_option: {} };
      renderWithProviders(<CustomFieldsTab />);
      await userEvent.click(screen.getByTitle("Delete field"));
      expect(screen.getByText("This field has a value on 12 use cases.")).toBeInTheDocument();
    });
  });
});
