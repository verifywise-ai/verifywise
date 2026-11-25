import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const captured = vi.hoisted(() => ({
  drawerProps: null as any,
  tableProps: null as any,
  tableLoading: [] as boolean[],
  role: "Admin",
}));

vi.mock("../../../components/HelperIcon", () => ({ default: () => null }));
vi.mock("../../../assets/icons/plus-circle-white.svg", () => ({
  ReactComponent: () => <svg data-testid="add-icon" />,
}));

const STORED_INCIDENT = {
  id: 42,
  incident_id: "INC-42",
  ai_project: "Chatbot",
  status: "Closed",
  severity: "Serious",
  occurred_date: "2026-09-20T00:00:00.000Z",
  date_detected: "2026-09-21T00:00:00.000Z",
  reporter: "Ada",
  categories_of_harm: ["Economic Loss"],
  description: "Model produced unsafe output",
  approval_status: "Approved",
  approved_by: "Jane Doe",
  approval_date: null as string | null,
  approval_notes: "Closure signed off",
  updated_at: "2026-10-10T12:34:56.789Z",
};

vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn().mockResolvedValue({ data: [] }),
  archiveIncidentById: vi.fn(),
  getEntityById: vi.fn(),
  updateEntityById: vi.fn(),
}));
vi.mock("../../../../application/repository/incident_management.repository", () => ({
  createIncidentManagement: vi.fn(),
}));
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: captured.role, userToken: { name: "Test User" } }),
}));
vi.mock("../../../../application/hooks/useFilterBy", () => ({
  useFilterBy: () => ({ filterData: (data: unknown[]) => data, handleFilterChange: vi.fn() }),
}));
vi.mock("../../../../application/hooks/useColumnVisibility", () => ({
  useColumnVisibility: () => ({
    visibleColumns: new Set(["incident_id", "status", "actions"]),
    allColumns: [],
    toggleColumn: vi.fn(),
    resetToDefaults: vi.fn(),
  }),
}));
vi.mock("../../../../application/tools/log.engine", () => ({ logEngine: vi.fn() }));
vi.mock("../../../components/Table/FilterBy", () => ({ FilterBy: () => null }));
vi.mock("../../../components/Table/ExportMenu", () => ({ ExportMenu: () => null }));
vi.mock("../../../components/Table/ColumnSelector", () => ({ ColumnSelector: () => null }));
// The table exposes an edit trigger for incident 42 (as a row click does).
vi.mock("../IncidentTable", () => ({
  default: ({ onEdit, isLoading, ...rest }: any) => {
    captured.tableLoading.push(Boolean(isLoading));
    captured.tableProps = rest;
    return (
      <button type="button" onClick={() => onEdit?.("42", "edit")}>
        edit incident
      </button>
    );
  },
}));
// The drawer is replaced by a probe that records its props.
// The real comparison helper and labels are kept; only the component is a probe.
vi.mock("../../../components/Modals/NewIncident", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../components/Modals/NewIncident")>()),
  default: (props: any) => {
    captured.drawerProps = props;
    return null;
  },
}));
vi.mock("../../../components/PageTour", () => ({ default: () => null }));
vi.mock("../IncidentManagementSteps", () => ({ default: [] }));
vi.mock("../../../components/Cards/StatusTileCards", () => ({ StatusTileCards: () => null }));

import IncidentManagement from "../index";
import { getEntityById } from "../../../../application/repository/entity.repository";

async function openEditDrawer(incident: Record<string, unknown>) {
  vi.mocked(getEntityById).mockResolvedValue({ data: incident } as any);
  renderWithProviders(<IncidentManagement />, { route: "/incidents" });
  fireEvent.click(await screen.findByText("edit incident"));
  await waitFor(() => expect(captured.drawerProps?.initialData).toBeTruthy());
  return captured.drawerProps;
}

// Built-in roles answer from the static permission table (no fetch needed):
// incident.edit is Admin and Editor, incident.approve is Admin and Reviewer.
describe("IncidentManagement — who edits and who approves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.drawerProps = null;
    captured.tableProps = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["Admin", "edit", true, true],
    ["Editor", "edit", true, false],
    ["Reviewer", "edit", false, true],
    ["Auditor", "view", false, false],
  ])(
    "%s opens an incident in %s mode (details %s, approval %s)",
    async (role, mode, canEditDetails, canApprove) => {
      captured.role = role;
      const props = await openEditDrawer(STORED_INCIDENT);

      expect(props.mode).toBe(mode);
      expect(props.canEditDetails).toBe(canEditDetails);
      expect(props.canApprove).toBe(canApprove);
      expect(captured.tableProps.canEdit).toBe(canEditDetails);
      expect(captured.tableProps.canApprove).toBe(canApprove);
    },
  );
});
