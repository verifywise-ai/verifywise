import { screen, waitFor, fireEvent } from "@testing-library/react";
import { Routes, Route } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { IShadowAiTool } from "../../../../domain/interfaces/i.shadowAi";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockGetTools = vi.fn();
const mockGetToolById = vi.fn();
const mockUpdateToolStatus = vi.fn();

vi.mock("../../../../application/repository/shadowAi.repository", () => ({
  getTools: (...args: any[]) => mockGetTools(...args),
  getToolById: (...args: any[]) => mockGetToolById(...args),
  updateToolStatus: (...args: any[]) => mockUpdateToolStatus(...args),
}));

const mockPromoteMutateAsync = vi.fn();
let mockPromoteIsPending = false;
vi.mock("../../../../application/hooks/useAiApps", () => ({
  usePromoteFromShadowAi: () => ({
    mutateAsync: mockPromoteMutateAsync,
    isPending: mockPromoteIsPending,
  }),
}));

// GovernanceWizardModal is a sibling in-scope file (has its own dedicated
// test suite) — it depends on useUsers, so stub that shared hook here to
// keep it from making a real network call when the modal is opened.
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [], loading: false, error: null, refreshUsers: vi.fn() }),
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

import AIToolsPage from "../AIToolsPage";

function renderList(route = "/shadow-ai/tools") {
  return renderWithProviders(
    <Routes>
      <Route path="/shadow-ai/tools" element={<AIToolsPage />} />
      <Route path="/shadow-ai/tools/:toolId" element={<AIToolsPage />} />
    </Routes>,
    { route },
  );
}

const baseTool: IShadowAiTool = {
  id: 1,
  name: "ChatGPT",
  vendor: "OpenAI",
  domains: ["chat.openai.com"],
  status: "detected",
  risk_score: 82,
  total_users: 20,
  total_events: 500,
  last_seen_at: "2026-02-01T00:00:00Z",
};

const secondTool: IShadowAiTool = {
  id: 2,
  name: "Claude",
  vendor: "Anthropic",
  domains: ["claude.ai"],
  status: "approved",
  risk_score: 40,
  total_users: 5,
  total_events: 100,
  last_seen_at: "2026-01-15T00:00:00Z",
};

describe("ShadowAI - AIToolsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPromoteIsPending = false;
    mockGetTools.mockResolvedValue({
      tools: [baseTool, secondTool],
      total: 2,
      page: 1,
      limit: 20,
    });
  });

  it("renders without crashing", () => {
    renderList();
    expect(screen.getByTestId("page-header")).toBeInTheDocument();
  });

  it("shows an empty state when there are no tools", async () => {
    mockGetTools.mockResolvedValue({ tools: [], total: 0, page: 1, limit: 20 });
    renderList();

    await waitFor(() => {
      expect(
        screen.getByText(/No AI tools detected yet\. Connect a data source/),
      ).toBeInTheDocument();
    });
  });

  it("renders the tools table once data loads", async () => {
    renderList();

    await waitFor(() => {
      expect(screen.getByText("ChatGPT")).toBeInTheDocument();
    });
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("Detected")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("navigates to the tool detail route when a row is clicked", async () => {
    renderList();

    await waitFor(() => {
      expect(screen.getByText("ChatGPT")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("ChatGPT"));
    expect(mockNavigate).toHaveBeenCalledWith("/shadow-ai/tools/1");
  });

  it("refetches with the selected status filter", async () => {
    renderList();

    await waitFor(() => {
      expect(mockGetTools).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 20, sort_by: "risk_score", order: "desc" }),
      );
    });

    const comboboxes = screen.getAllByRole("combobox");
    fireEvent.mouseDown(comboboxes[0]);
    fireEvent.click(screen.getByRole("option", { name: "Approved" }));

    await waitFor(() => {
      expect(mockGetTools).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "approved", page: 1 }),
      );
    });
  });

  it("sorts the table when a sortable column header is clicked", async () => {
    renderList();

    await waitFor(() => {
      expect(screen.getByText("ChatGPT")).toBeInTheDocument();
    });

    // Ascending by "Users" (total_users) should put Claude (5) before ChatGPT (20).
    fireEvent.click(screen.getByText("Users"));

    const rows = screen.getAllByRole("row").slice(1); // skip header
    expect(rows[0]).toHaveTextContent("Claude");
  });

  it("shows the tool detail view with summary cards", async () => {
    mockGetToolById.mockResolvedValue({
      ...baseTool,
      first_detected_at: "2026-01-01T00:00:00Z",
      departments: [{ department: "Engineering", user_count: 10 }],
      top_users: [{ user_email: "alice@example.com", event_count: 50 }],
    });

    renderList("/shadow-ai/tools/1");

    await waitFor(() => {
      expect(mockGetToolById).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(screen.getAllByText("ChatGPT").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("navigates back to the list from the detail view", async () => {
    mockGetToolById.mockResolvedValue({ ...baseTool, departments: [], top_users: [] });
    renderList("/shadow-ai/tools/1");

    await waitFor(() => {
      expect(screen.getAllByText("ChatGPT").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(mockNavigate).toHaveBeenCalledWith("/shadow-ai/tools");
  });

  it("shows a 'Start governance' button when the tool has no model inventory, and opens the wizard", async () => {
    mockGetToolById.mockResolvedValue({ ...baseTool, departments: [], top_users: [] });
    renderList("/shadow-ai/tools/1");

    await waitFor(() => {
      expect(screen.getByText("Start governance")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Start governance"));
    expect(
      screen.getByText('Create a model inventory entry for "ChatGPT" and begin formal governance.'),
    ).toBeInTheDocument();
  });

  it("shows a 'Governed' chip instead of the governance button when already governed", async () => {
    mockGetToolById.mockResolvedValue({
      ...baseTool,
      model_inventory_id: 55,
      departments: [],
      top_users: [],
    });
    renderList("/shadow-ai/tools/1");

    await waitFor(() => {
      expect(screen.getByText("Governed")).toBeInTheDocument();
    });
    expect(screen.queryByText("Start governance")).not.toBeInTheDocument();
  });

  it("changes tool status from the detail view", async () => {
    mockGetToolById.mockResolvedValue({ ...baseTool, departments: [], top_users: [] });
    mockUpdateToolStatus.mockResolvedValue({ ...baseTool, status: "approved" });
    renderList("/shadow-ai/tools/1");

    await waitFor(() => {
      expect(screen.getAllByText("ChatGPT").length).toBeGreaterThan(0);
    });

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Approved" }));

    await waitFor(() => {
      expect(mockUpdateToolStatus).toHaveBeenCalledWith(1, "approved");
    });
  });

  it("promotes a tool to an AI app and shows a success alert", async () => {
    mockGetToolById.mockResolvedValue({ ...baseTool, departments: [], top_users: [] });
    mockPromoteMutateAsync.mockResolvedValue({ name: "ChatGPT App" });
    renderList("/shadow-ai/tools/1");

    await waitFor(() => {
      expect(screen.getByText("Promote to AI app")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Promote to AI app"));

    await waitFor(() => {
      expect(screen.getByText("Promoted to AI App: ChatGPT App")).toBeInTheDocument();
    });
  });

  it("shows an error alert when promoting to an AI app fails", async () => {
    mockGetToolById.mockResolvedValue({ ...baseTool, departments: [], top_users: [] });
    mockPromoteMutateAsync.mockRejectedValue({
      response: { data: { message: "Already promoted" } },
    });
    renderList("/shadow-ai/tools/1");

    await waitFor(() => {
      expect(screen.getByText("Promote to AI app")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Promote to AI app"));

    await waitFor(() => {
      expect(screen.getByText("Already promoted")).toBeInTheDocument();
    });
  });

  it("logs and recovers when loading tools fails", async () => {
    mockGetTools.mockRejectedValue(new Error("network error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderList();

    await waitFor(() => {
      expect(screen.getByTestId("page-header")).toBeInTheDocument();
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
