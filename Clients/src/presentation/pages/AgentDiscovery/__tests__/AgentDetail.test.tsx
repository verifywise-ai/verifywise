import { act, fireEvent, screen } from "@testing-library/react";
import { Route, Routes, useNavigate } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AgentDetail from "../AgentDetail";

const mockGetAllEntities = vi.fn();
const mockGetEntityById = vi.fn();
const mockApiGet = vi.fn();

vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: (...args: any[]) => mockGetAllEntities(...args),
  getEntityById: (...args: any[]) => mockGetEntityById(...args),
}));

vi.mock("../../../../infrastructure/api/networkServices", () => ({
  apiServices: { get: (...args: any[]) => mockApiGet(...args) },
}));

vi.mock("../../../../application/tools/log.engine", () => ({
  logEngine: vi.fn(),
}));

// Users come from the shared, cached users hook rather than a page fetch.
let mockUsers: { id: number; name: string; surname: string; email: string }[] = [];
// Edit is Admin only; tests default to an admin.
const adminState = vi.hoisted(() => ({ isAdmin: true }));
vi.mock("../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => adminState.isAdmin,
}));
// refreshUsers is stable across renders, like the real hook's.
const mockRefreshUsers = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: mockUsers,
    loading: false,
    error: null,
    refreshUsers: mockRefreshUsers,
  }),
}));

// Mock the UserGuideSidebarContext used by PageHeaderExtended > HelperIcon
vi.mock("../../../components/UserGuide/UserGuideSidebarContext", () => ({
  useUserGuideSidebarContext: () => ({
    isOpen: false,
    open: vi.fn(),
    close: vi.fn(),
    toggle: vi.fn(),
    currentPath: undefined,
    contentWidth: 400,
    setContentWidth: vi.fn(),
    totalSidebarWidth: 40,
    requiredPaddingRight: 0,
    openTab: vi.fn(),
    requestedTab: undefined,
    clearRequestedTab: vi.fn(),
  }),
  TAB_BAR_WIDTH: 40,
  DEFAULT_CONTENT_WIDTH: 400,
  MIN_GAP: 0,
}));

const agent = {
  id: 5,
  display_name: "Invoice bot",
  primitive_type: "assistant",
  source_system: "manual",
  external_id: "manual_1",
  owner_id: "1",
  owner_ids: [1],
  permissions: [],
  permission_categories: [],
  last_activity: null,
  metadata: {},
  review_status: "unreviewed",
  reviewed_by: null,
  reviewed_at: null,
  linked_model_inventory_id: 9,
  is_stale: false,
  is_manual: true,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

/** Lets a test move to another agent's page without remounting the router. */
const GoTo: React.FC<{ to: string }> = ({ to }) => {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>go to {to}</button>;
};

const renderAt = (id: string) =>
  renderWithProviders(
    <>
      <GoTo to="/agent-discovery/6" />
      <Routes>
        <Route path="/agent-discovery/:id" element={<AgentDetail />} />
      </Routes>
    </>,
    { route: `/agent-discovery/${id}` },
  );

/** Serve the agent (and optionally the linked model) by route. */
const serve = (
  agentData: Record<string, unknown> | Error,
  model: Record<string, unknown> | Error = new Error("model down"),
) =>
  mockGetEntityById.mockImplementation(({ routeUrl }: { routeUrl: string }) => {
    const value = routeUrl.startsWith("/modelInventory/") ? model : agentData;
    return value instanceof Error ? Promise.reject(value) : Promise.resolve({ data: value });
  });

// Other header widgets (approvals) also call apiServices.get; only audit-log
// requests are routed to the per-test handler.
let auditHandler: () => Promise<unknown> = () => Promise.resolve({ data: { data: [] } });
const auditCalls = () =>
  mockApiGet.mock.calls.filter((c: any[]) => String(c[0]).startsWith("/agent-primitives"));

beforeEach(() => {
  vi.clearAllMocks();
  adminState.isAdmin = true;
  mockUsers = [];
  auditHandler = () => Promise.resolve({ data: { data: [] } });
  mockApiGet.mockImplementation((url: string) =>
    url.startsWith("/agent-primitives") ? auditHandler() : Promise.resolve({ data: { data: [] } }),
  );
});

describe("AgentDetail", () => {
  it.each(["abc", "0", "-1", "1.5"])(
    "shows not found without any request for the invalid id %s",
    async (id) => {
      renderAt(id);
      expect(await screen.findByText("Agent not found")).toBeInTheDocument();
      expect(mockGetEntityById).not.toHaveBeenCalled();
      expect(auditCalls()).toHaveLength(0);
    },
  );

  it("shows not found when the agent request fails", async () => {
    serve(new Error("404"));
    renderAt("5");
    expect(await screen.findByText("Agent not found")).toBeInTheDocument();
  });

  it("still renders the agent when audit logs and the model fail to load", async () => {
    serve(agent);
    auditHandler = () => Promise.reject(new Error("audit down"));
    renderAt("5");

    expect((await screen.findAllByText("Invoice bot")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Agent not found")).not.toBeInTheDocument();
    expect(screen.getByText("Model #9")).toBeInTheDocument();
    expect(screen.getByText("No activity recorded yet.")).toBeInTheDocument();
  });

  it("fetches only the linked model and labels it provider · model", async () => {
    mockUsers = [{ id: 1, name: "Ada", surname: "L", email: "ada@example.com" }];
    serve(agent, { id: 9, provider: "OpenAI", model: "gpt-4o" });
    renderAt("5");

    expect(await screen.findByText("OpenAI · gpt-4o")).toBeInTheDocument();
    expect(mockGetEntityById).toHaveBeenCalledWith(
      expect.objectContaining({ routeUrl: "/agent-primitives/5" }),
    );
    expect(mockGetEntityById).toHaveBeenCalledWith({ routeUrl: "/modelInventory/9" });
    expect(mockGetAllEntities).not.toHaveBeenCalledWith({ routeUrl: "/modelInventory" });
    expect(screen.getAllByText("Ada L").length).toBeGreaterThan(0);
  });

  it("names every owner from the shared users list, without its own users request", async () => {
    mockUsers = [{ id: 1, name: "Ada", surname: "L", email: "ada@example.com" }];
    // User 7 is no longer in the organization: shown with the shared fallback.
    serve({ ...agent, owner_ids: [1, 7] }, { id: 9, provider: "OpenAI", model: "gpt-4o" });
    renderAt("5");

    expect(await screen.findByText("Accountable owners")).toBeInTheDocument();
    expect(screen.getAllByText("Ada L").length).toBeGreaterThan(0);
    expect(screen.getByText("User #7")).toBeInTheDocument();
    expect(mockGetAllEntities).not.toHaveBeenCalledWith({ routeUrl: "/users" });
  });

  it("shows a synced agent's source-reported owner as is, with its initial", async () => {
    serve({
      ...agent,
      is_manual: false,
      source_system: "azure-ai-foundry",
      owner_id: "alice@contoso.com",
      owner_ids: [],
    });
    renderAt("5");

    expect(await screen.findByText("alice@contoso.com")).toBeInTheDocument();
    expect(screen.queryByText(/User #/)).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("describes a review in the activity with the status label, not the stored value", async () => {
    serve(agent);
    auditHandler = () =>
      Promise.resolve({
        data: {
          data: [
            {
              id: 1,
              agent_primitive_id: 5,
              action: "review_status_changed",
              field_changed: "review_status",
              old_value: "unreviewed",
              new_value: "confirmed",
              performed_by: null,
              created_at: "2026-10-02T00:00:00Z",
            },
          ],
        },
      });
    renderAt("5");

    expect(await screen.findByText("Review status changed to Confirmed")).toBeInTheDocument();
    expect(screen.queryByText("Review status changed to confirmed")).not.toBeInTheDocument();
  });

  it("offers Review and Edit for a manual agent, and opens each", async () => {
    serve(agent);
    renderAt("5");

    fireEvent.click(await screen.findByTestId("agent-detail-review"));
    expect(await screen.findByText("Agent details")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("agent-detail-edit"));
    expect(await screen.findByText("Edit agent")).toBeInTheDocument();
  });

  it("offers only Review on a manual agent to a user who may not change agents", async () => {
    adminState.isAdmin = false;
    serve(agent);
    renderAt("5");

    expect(await screen.findByTestId("agent-detail-review")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-detail-edit")).not.toBeInTheDocument();
  });

  it("offers only Review for a synced agent", async () => {
    serve({ ...agent, is_manual: false, source_system: "azure-ai-foundry" });
    renderAt("5");

    expect(await screen.findByTestId("agent-detail-review")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-detail-edit")).not.toBeInTheDocument();
  });

  it("ignores a slower response for the agent the user navigated away from", async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    mockGetEntityById.mockImplementation(({ routeUrl }: { routeUrl: string }) => {
      if (routeUrl === "/agent-primitives/5") {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      if (routeUrl === "/agent-primitives/6") {
        return Promise.resolve({ data: { ...agent, id: 6, display_name: "Second bot" } });
      }
      return Promise.reject(new Error("model down"));
    });
    renderAt("5");

    fireEvent.click(screen.getByText("go to /agent-discovery/6"));
    expect((await screen.findAllByText("Second bot")).length).toBeGreaterThan(0);

    await act(async () => {
      resolveFirst({ data: agent });
    });
    expect(screen.getAllByText("Second bot").length).toBeGreaterThan(0);
    expect(screen.queryByText("Invoice bot")).not.toBeInTheDocument();
  });
});
