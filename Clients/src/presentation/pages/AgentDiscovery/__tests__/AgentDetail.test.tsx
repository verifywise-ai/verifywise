import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
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

const renderAt = (id: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/agent-discovery/:id" element={<AgentDetail />} />
    </Routes>,
    { route: `/agent-discovery/${id}` },
  );

// Other header widgets (approvals) also call apiServices.get; only audit-log
// requests are routed to the per-test handler.
let auditHandler: () => Promise<unknown> = () => Promise.resolve({ data: { data: [] } });
const auditCalls = () =>
  mockApiGet.mock.calls.filter((c: any[]) => String(c[0]).startsWith("/agent-primitives"));

beforeEach(() => {
  vi.clearAllMocks();
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
      expect(mockGetAllEntities).not.toHaveBeenCalled();
      expect(auditCalls()).toHaveLength(0);
    },
  );

  it("shows not found when the agent request fails", async () => {
    mockGetAllEntities.mockImplementation(({ routeUrl }: { routeUrl: string }) =>
      routeUrl === "/users" ? Promise.resolve({ data: [] }) : Promise.reject(new Error("404")),
    );
    renderAt("5");
    expect(await screen.findByText("Agent not found")).toBeInTheDocument();
  });

  it("still renders the agent when users, audit logs and the model fail to load", async () => {
    mockGetAllEntities.mockImplementation(({ routeUrl }: { routeUrl: string }) =>
      routeUrl === "/agent-primitives/5"
        ? Promise.resolve({ data: agent })
        : Promise.reject(new Error("users down")),
    );
    auditHandler = () => Promise.reject(new Error("audit down"));
    mockGetEntityById.mockRejectedValue(new Error("model down"));
    renderAt("5");

    expect((await screen.findAllByText("Invoice bot")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Agent not found")).not.toBeInTheDocument();
    expect(screen.getByText("Model #9")).toBeInTheDocument();
    expect(screen.getByText("No activity recorded yet.")).toBeInTheDocument();
  });

  it("fetches only the linked model and labels it provider · model", async () => {
    mockGetAllEntities.mockImplementation(({ routeUrl }: { routeUrl: string }) =>
      Promise.resolve({
        data: routeUrl === "/agent-primitives/5" ? agent : [{ id: 1, name: "Ada", surname: "L" }],
      }),
    );
    mockGetEntityById.mockResolvedValue({ data: { id: 9, provider: "OpenAI", model: "gpt-4o" } });
    renderAt("5");

    expect(await screen.findByText("OpenAI · gpt-4o")).toBeInTheDocument();
    expect(mockGetEntityById).toHaveBeenCalledWith({ routeUrl: "/modelInventory/9" });
    expect(mockGetAllEntities).not.toHaveBeenCalledWith({ routeUrl: "/modelInventory" });
    expect(screen.getAllByText("Ada L").length).toBeGreaterThan(0);
  });
});
