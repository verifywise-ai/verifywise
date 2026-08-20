import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title, actionButton }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {actionButton}
      {children}
    </div>
  ),
}));

import { apiServices } from "../../../../infrastructure/api/networkServices";
import MCPGuardrailsPage from "./index";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiServices.post as unknown as ReturnType<typeof vi.fn>;
const mockPatch = apiServices.patch as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiServices.delete as unknown as ReturnType<typeof vi.fn>;

function makeRule(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: "Block PII",
    rule_type: "pii",
    action: "block",
    scope: "tool_input",
    applies_to_tools: ["search"],
    config: null,
    is_active: true,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

/**
 * The house `Select` component's visible combobox has no accessible name —
 * select by DOM order instead.
 */
function selectComboboxOption(index: number, optionName: string) {
  const combos = screen.getAllByRole("combobox");
  fireEvent.mouseDown(combos[index]);
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

describe("MCPGuardrailsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: [] } });
    mockPost.mockResolvedValue({ data: {} });
    mockPatch.mockResolvedValue({ data: {} });
    mockDelete.mockResolvedValue({ data: {} });
  });

  it("shows a loading skeleton initially", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<MCPGuardrailsPage />);
    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("shows an error state with a working retry button", async () => {
    mockGet.mockRejectedValueOnce(new Error("boom"));
    renderWithProviders(<MCPGuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load guardrails. Please try again.")).toBeInTheDocument();
    });

    mockGet.mockResolvedValueOnce({ data: { data: [makeRule()] } });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("Block PII")).toBeInTheDocument();
    });
  });

  it("shows an empty state with tips when there are no rules", async () => {
    renderWithProviders(<MCPGuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No guardrail rules configured yet/)).toBeInTheDocument();
    });
    expect(screen.getByText("Scan tool inputs before execution")).toBeInTheDocument();
  });

  it("renders rule rows with type, action, scope, and tool badges", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          makeRule(),
          makeRule({
            id: 2,
            name: "Require approval on delete",
            rule_type: "require_approval",
            applies_to_tools: [],
          }),
        ],
      },
    });
    renderWithProviders(<MCPGuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText("Block PII")).toBeInTheDocument();
    });

    expect(screen.getByText("2 rules configured, 2 active")).toBeInTheDocument();
    expect(screen.getByText("PII")).toBeInTheDocument();
    expect(screen.getByText("Block")).toBeInTheDocument();
    expect(screen.getByText("search")).toBeInTheDocument();
    expect(screen.getByText("Require approval")).toBeInTheDocument();
    expect(screen.getByText("All tools")).toBeInTheDocument();
  });

  it("validates that a name is required before creating a guardrail", async () => {
    renderWithProviders(<MCPGuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No guardrail rules configured yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add guardrail" }));
    expect(screen.getByRole("heading", { name: "Add guardrail" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create guardrail" }));

    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("creates a guardrail with default rule type and action", async () => {
    renderWithProviders(<MCPGuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No guardrail rules configured yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add guardrail" }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "New rule" } });
    fireEvent.click(screen.getByRole("button", { name: "Create guardrail" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/mcp/guardrails",
        expect.objectContaining({
          name: "New rule",
          rule_type: "pii",
          action: "block",
          scope: "tool_input",
          applies_to_tools: [],
          config: null,
          is_active: true,
        }),
      );
    });
  });

  it("hides the action select and forces the approval sentinel when rule type is require_approval", async () => {
    renderWithProviders(<MCPGuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No guardrail rules configured yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add guardrail" }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Approval rule" } });

    selectComboboxOption(0, "Require approval");

    expect(
      screen.getByText(/Matching tool calls will be paused and routed to a human approver/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create guardrail" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        "/ai-gateway/mcp/guardrails",
        expect.objectContaining({
          rule_type: "require_approval",
          action: "require_approval",
        }),
      );
    });
  });

  it("shows a validation error for invalid JSON config", async () => {
    renderWithProviders(<MCPGuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No guardrail rules configured yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add guardrail" }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Bad config" } });
    fireEvent.change(screen.getByLabelText(/^Config \(JSON\)/), {
      target: { value: "{not valid json" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create guardrail" }));

    expect(screen.getByText("Config must be valid JSON")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("toggles a rule's active state", async () => {
    mockGet.mockResolvedValue({ data: { data: [makeRule()] } });
    renderWithProviders(<MCPGuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText("Block PII")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/ai-gateway/mcp/guardrails/1", { is_active: false });
    });
  });

  it("opens the edit modal pre-filled and submits an update via patch", async () => {
    mockGet.mockResolvedValue({ data: { data: [makeRule()] } });
    renderWithProviders(<MCPGuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText("Block PII")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit guardrail" }));

    expect(screen.getByRole("heading", { name: "Edit guardrail" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveValue("Block PII");

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith(
        "/ai-gateway/mcp/guardrails/1",
        expect.objectContaining({ name: "Block PII" }),
      );
    });
  });

  it("shows the API error message when create submission fails", async () => {
    mockPost.mockRejectedValue({ response: { data: { detail: "Duplicate rule name" } } });
    renderWithProviders(<MCPGuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText(/No guardrail rules configured yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add guardrail" }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Dup" } });
    fireEvent.click(screen.getByRole("button", { name: "Create guardrail" }));

    await waitFor(() => {
      expect(screen.getByText("Duplicate rule name")).toBeInTheDocument();
    });
  });

  it("deletes a rule after confirming in the delete modal", async () => {
    mockGet.mockResolvedValue({ data: { data: [makeRule()] } });
    renderWithProviders(<MCPGuardrailsPage />);

    await waitFor(() => {
      expect(screen.getByText("Block PII")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete guardrail" }));

    expect(screen.getByRole("heading", { name: "Remove guardrail rule" })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to remove "Block PII"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove rule" }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("/ai-gateway/mcp/guardrails/1");
    });
  });
});
