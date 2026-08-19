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
  PageHeaderExtended: ({ children, title }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

import { apiServices } from "../../../../infrastructure/api/networkServices";
import MCPApprovalsPage from "./index";

const mockGet = apiServices.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiServices.post as unknown as ReturnType<typeof vi.fn>;

function makeApproval(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    agent_key_id: 5,
    agent_key_name: "Prod agent",
    tool_name: "delete_record",
    arguments: { id: 42 },
    status: "pending",
    decided_by: null,
    decided_by_name: null,
    decided_at: null,
    decision_reason: null,
    expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
    created_at: "2025-06-01T12:00:00Z",
    ...overrides,
  };
}

function mockLoad(pending: any[] = [], history: any[] = []) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes("/approvals/history")) {
      return Promise.resolve({ data: { data: history } });
    }
    if (url.includes("/approvals")) {
      return Promise.resolve({ data: { data: pending } });
    }
    return Promise.resolve({ data: {} });
  });
}

describe("MCPApprovalsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton initially", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<MCPApprovalsPage />);
    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("shows an error state with a working retry button", async () => {
    mockGet.mockRejectedValue(new Error("boom"));
    renderWithProviders(<MCPApprovalsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load pending approvals. Please try again."),
      ).toBeInTheDocument();
    });

    mockLoad([makeApproval()]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("delete_record")).toBeInTheDocument();
    });
  });

  it("shows a pending-empty state with tips when there are no pending approvals", async () => {
    mockLoad([]);
    renderWithProviders(<MCPApprovalsPage />);

    await waitFor(() => {
      expect(screen.getByText("No pending approvals")).toBeInTheDocument();
    });
    expect(screen.getByText("How to trigger approvals")).toBeInTheDocument();
  });

  it("renders pending approval cards with agent, arguments, and time remaining", async () => {
    mockLoad([makeApproval()]);
    renderWithProviders(<MCPApprovalsPage />);

    await waitFor(() => {
      expect(screen.getByText("delete_record")).toBeInTheDocument();
    });

    expect(screen.getByText("Prod agent")).toBeInTheDocument();
    expect(screen.getByText(/29m remaining|30m remaining/)).toBeInTheDocument();
    expect(screen.getByText('{"id":42}')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deny" })).toBeInTheDocument();
  });

  it("shows an Expired label when expires_at is in the past", async () => {
    mockLoad([makeApproval({ expires_at: "2000-01-01T00:00:00Z" })]);
    renderWithProviders(<MCPApprovalsPage />);

    await waitFor(() => {
      expect(screen.getByText("Expired")).toBeInTheDocument();
    });
  });

  it("approves a pending request via the decision modal", async () => {
    mockLoad([makeApproval()]);
    mockPost.mockResolvedValue({ data: {} });
    renderWithProviders(<MCPApprovalsPage />);

    await waitFor(() => {
      expect(screen.getByText("delete_record")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(screen.getByRole("heading", { name: "Approve tool call" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reason (optional)"), {
      target: { value: "Looks safe" },
    });

    const submitButtons = screen.getAllByRole("button", { name: "Approve" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/ai-gateway/mcp/approvals/1/approve", {
        reason: "Looks safe",
      });
    });
  });

  it("denies a pending request via the decision modal", async () => {
    mockLoad([makeApproval()]);
    mockPost.mockResolvedValue({ data: {} });
    renderWithProviders(<MCPApprovalsPage />);

    await waitFor(() => {
      expect(screen.getByText("delete_record")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(screen.getByRole("heading", { name: "Deny tool call" })).toBeInTheDocument();

    const submitButtons = screen.getAllByRole("button", { name: "Deny" });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/ai-gateway/mcp/approvals/1/deny", {
        reason: undefined,
      });
    });
  });

  it("switches to the History tab and renders the decision table", async () => {
    mockLoad(
      [],
      [
        makeApproval({
          id: 2,
          status: "approved",
          decided_by: 9,
          decided_by_name: "Jane Doe",
          decided_at: "2025-06-02T12:00:00Z",
          decision_reason: "Trusted agent",
        }),
      ],
    );
    renderWithProviders(<MCPApprovalsPage />);

    await waitFor(() => {
      expect(screen.getByText("No pending approvals")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /History/ }));

    await waitFor(() => {
      expect(screen.getByText("Decision history")).toBeInTheDocument();
    });
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("Trusted agent")).toBeInTheDocument();
  });

  it("shows a history-empty state when there is no decision history", async () => {
    mockLoad([], []);
    renderWithProviders(<MCPApprovalsPage />);

    await waitFor(() => {
      expect(screen.getByText("No pending approvals")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /History/ }));

    await waitFor(() => {
      expect(screen.getByText("No approval history yet")).toBeInTheDocument();
    });
  });
});
