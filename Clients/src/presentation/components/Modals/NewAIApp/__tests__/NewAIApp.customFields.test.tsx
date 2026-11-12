import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import NewAIApp from "../index";

const mockDefinitions = [
  { id: 11, label: "Business unit", field_type: "text", required: false, options: null },
];
let mockMissing: { definition_id: number; label: string }[] = [];

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockSetCustomFieldValue = vi.fn().mockResolvedValue({});

vi.mock("../../../../../application/hooks/useAiApps", () => ({
  useCreateAiApp: () => ({ mutateAsync: mockCreate }),
  useUpdateAiApp: () => ({ mutateAsync: mockUpdate }),
}));
vi.mock("../../../../../application/hooks/useVendors", () => ({
  useVendors: () => ({ data: [] }),
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [], loading: false }),
}));
vi.mock("../../../../../application/hooks/useCustomFields", () => ({
  useCustomFieldDefinitions: (entityType: string) => ({
    data: entityType === "ai_app" ? mockDefinitions : [],
    isLoading: false,
    isError: false,
  }),
  useCustomFieldValues: () => ({ data: [], isLoading: false }),
  useMissingRequiredCustomFields: () => ({ data: mockMissing, isLoading: false }),
  customFieldsKeys: {
    definitions: (et: string) => ["customFields", "definitions", et],
    values: (et: string, ei: number | null) => ["customFields", "values", et, ei],
    missingRequired: (et: string, ei: number | null) => ["customFields", "missingRequired", et, ei],
  },
}));
vi.mock("../../../../../application/repository/customField.repository", () => ({
  setCustomFieldValue: (...args: unknown[]) => mockSetCustomFieldValue(...args),
  deleteCustomFieldValue: vi.fn().mockResolvedValue({}),
}));

describe("NewAIApp custom fields (#5262)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMissing = [];
    mockCreate.mockResolvedValue({ id: 77, name: "Copilot" });
    mockUpdate.mockResolvedValue({ id: 5, name: "Copilot" });
  });

  it("renders the custom fields section for AI app definitions", () => {
    renderWithProviders(<NewAIApp isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText("Business unit")).toBeInTheDocument();
  });

  it("saves staged values against the new app id after create", async () => {
    const onSuccess = vi.fn();
    renderWithProviders(<NewAIApp isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
    await userEvent.type(screen.getByPlaceholderText("e.g. ChatGPT Enterprise"), "Copilot");
    const input = screen.getByPlaceholderText("Enter business unit");
    await userEvent.type(input, "Finance");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(mockSetCustomFieldValue).toHaveBeenCalledWith({
        definition_id: 11,
        entity_id: 77,
        value: "Finance",
      }),
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it("blocks save while a required field is missing on an existing app", async () => {
    mockMissing = [{ definition_id: 11, label: "Business unit" }];
    renderWithProviders(
      <NewAIApp
        isOpen
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        app={
          {
            id: 5,
            organization_id: 1,
            name: "Copilot",
            status: "draft",
            discovered_source: "manual",
          } as never
        }
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("closes create mode with a warning when the flush fails after create", async () => {
    mockSetCustomFieldValue.mockRejectedValueOnce(new Error("boom"));
    const onSuccess = vi.fn();
    renderWithProviders(<NewAIApp isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
    await userEvent.type(screen.getByPlaceholderText("e.g. ChatGPT Enterprise"), "Copilot");
    await userEvent.type(screen.getByPlaceholderText("Enter business unit"), "Finance");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0][0].warning).toMatch(/custom field values were not saved/);
  });

  it("flushes against the existing app id when editing", async () => {
    const onSuccess = vi.fn();
    renderWithProviders(
      <NewAIApp
        isOpen
        onClose={vi.fn()}
        onSuccess={onSuccess}
        app={
          {
            id: 5,
            organization_id: 1,
            name: "Copilot",
            status: "draft",
            discovered_source: "manual",
          } as never
        }
      />,
    );
    await userEvent.type(screen.getByPlaceholderText("Enter business unit"), "Finance");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockSetCustomFieldValue).toHaveBeenCalledWith({
        definition_id: 11,
        entity_id: 5,
        value: "Finance",
      }),
    );
    expect(onSuccess).toHaveBeenCalledWith();
  });
});
