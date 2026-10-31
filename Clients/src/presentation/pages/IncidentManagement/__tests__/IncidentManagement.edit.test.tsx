import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const captured = vi.hoisted(() => ({
  drawerProps: null as any,
  tableLoading: [] as boolean[],
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
  useAuth: () => ({ userRoleName: "Admin", userToken: { name: "Test User" } }),
}));
vi.mock("../../../../application/hooks/useFilterBy", () => ({
  useFilterBy: () => ({ filterData: (data: unknown[]) => data, handleFilterChange: vi.fn() }),
}));
vi.mock("../../../../application/hooks/useTableGrouping", () => ({
  useTableGrouping: () => [],
  useGroupByState: () => ({ groupBy: null, groupSortOrder: "asc", handleGroupChange: vi.fn() }),
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
vi.mock("../../../components/Table/GroupedTableView", () => ({
  GroupedTableView: ({ ungroupedData, renderTable }: any) => (
    <div>{renderTable(ungroupedData || [])}</div>
  ),
}));
vi.mock("../../../components/Table/GroupBy", () => ({ GroupBy: () => null }));
vi.mock("../../../components/Table/FilterBy", () => ({ FilterBy: () => null }));
vi.mock("../../../components/Table/ExportMenu", () => ({ ExportMenu: () => null }));
vi.mock("../../../components/Table/ColumnSelector", () => ({ ColumnSelector: () => null }));
// The table exposes an edit trigger for incident 42.
vi.mock("../IncidentTable", () => ({
  default: ({ onEdit, isLoading }: any) => {
    captured.tableLoading.push(Boolean(isLoading));
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
import {
  getAllEntities,
  getEntityById,
  updateEntityById,
} from "../../../../application/repository/entity.repository";

async function openEditDrawer(incident: Record<string, unknown>) {
  vi.mocked(getEntityById).mockResolvedValue({ data: incident } as any);
  renderWithProviders(<IncidentManagement />, { route: "/incidents" });
  fireEvent.click(await screen.findByText("edit incident"));
  await waitFor(() => expect(captured.drawerProps?.initialData).toBeTruthy());
  return captured.drawerProps;
}

describe("IncidentManagement edit drawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.drawerProps = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes a null approval date through instead of defaulting to today", async () => {
    const props = await openEditDrawer({ ...STORED_INCIDENT, approval_date: null });
    expect(props.initialData.approval_date).toBeNull();
  });

  it("passes the stored approval date as its calendar date and the loaded updated_at", async () => {
    const props = await openEditDrawer({
      ...STORED_INCIDENT,
      approval_date: "2026-10-01T00:00:00.000Z",
    });
    expect(props.initialData.approval_date).toBe("2026-10-01");
    expect(props.initialData.expected_updated_at).toBe("2026-10-10T12:34:56.789Z");
  });

  it("after a 409, refetches the incident, refreshes the list and hands the drawer the latest version", async () => {
    const props = await openEditDrawer(STORED_INCIDENT);
    const listCallsBefore = vi.mocked(getAllEntities).mock.calls.length;
    vi.mocked(updateEntityById).mockRejectedValue(
      Object.assign(new Error("Conflict"), { status: 409 }),
    );
    vi.mocked(getEntityById).mockResolvedValue({
      data: { ...STORED_INCIDENT, status: "Investigating", updated_at: "2026-10-11T08:00:00.000Z" },
    } as any);

    let result: unknown;
    await act(async () => {
      result = await props.onSuccess({ description: "A's notes" });
    });

    expect(result).toBe(false);
    expect(getEntityById).toHaveBeenLastCalledWith({
      routeUrl: "/ai-incident-managements/42",
      suppressGlobalErrorToast: true,
    });
    // selectedIncident moved to the latest version: the drawer gets it as initialData.
    await waitFor(() =>
      expect(captured.drawerProps.initialData).toMatchObject({
        status: "Investigating",
        expected_updated_at: "2026-10-11T08:00:00.000Z",
      }),
    );
    expect(vi.mocked(getAllEntities).mock.calls.length).toBeGreaterThan(listCallsBefore);
    expect(
      await screen.findByText(
        "This incident was changed by someone else since you opened it. The form now shows their changes with your edits kept: save again to apply your edits.",
      ),
    ).toBeInTheDocument();
  });

  it("after a 409, names the user's edits that the other editor also changed", async () => {
    const props = await openEditDrawer(STORED_INCIDENT);
    vi.mocked(updateEntityById).mockRejectedValue(
      Object.assign(new Error("Conflict"), { status: 409 }),
    );
    // The other editor changed severity and status, not the description.
    vi.mocked(getEntityById).mockResolvedValue({
      data: {
        ...STORED_INCIDENT,
        severity: "Minor",
        status: "Investigating",
        updated_at: "2026-10-11T08:00:00.000Z",
      },
    } as any);

    await act(async () => {
      await props.onSuccess({
        severity: "Very serious",
        status: "Open",
        description: "A's notes",
        expected_updated_at: "2026-10-10T12:34:56.789Z",
      });
    });

    expect(
      await screen.findByText(
        /Someone else also changed: Severity, Status\. Saving again will replace their values with yours\./,
      ),
    ).toBeInTheDocument();
  });

  it("refreshes the list after a 409 without putting the table into its loading state", async () => {
    const props = await openEditDrawer(STORED_INCIDENT);
    await waitFor(() =>
      expect(captured.tableLoading[captured.tableLoading.length - 1]).toBe(false),
    );
    captured.tableLoading.length = 0;
    const listCallsBefore = vi.mocked(getAllEntities).mock.calls.length;
    vi.mocked(updateEntityById).mockRejectedValue(
      Object.assign(new Error("Conflict"), { status: 409 }),
    );
    vi.mocked(getEntityById).mockResolvedValue({
      data: { ...STORED_INCIDENT, updated_at: "2026-10-11T08:00:00.000Z" },
    } as any);

    await act(async () => {
      await props.onSuccess({ description: "A's notes" });
    });

    expect(vi.mocked(getAllEntities).mock.calls.length).toBeGreaterThan(listCallsBefore);
    expect(captured.tableLoading).not.toContain(true);
  });

  it("keeps the drawer open and says to reopen when the refresh after a 409 fails", async () => {
    const props = await openEditDrawer(STORED_INCIDENT);
    const firstInitialData = captured.drawerProps.initialData;
    vi.mocked(updateEntityById).mockRejectedValue(
      Object.assign(new Error("Conflict"), { status: 409 }),
    );
    vi.mocked(getEntityById).mockRejectedValue(Object.assign(new Error("Down"), { status: 500 }));

    let result: unknown;
    await act(async () => {
      result = await props.onSuccess({ description: "A's notes" });
    });

    expect(result).toBe(false);
    expect(getEntityById).toHaveBeenLastCalledWith({
      routeUrl: "/ai-incident-managements/42",
      suppressGlobalErrorToast: true,
    });
    expect(
      await screen.findByText(
        "This incident was changed by someone else since you opened it. Could not load the latest version; close and reopen the incident to continue.",
      ),
    ).toBeInTheDocument();
    expect(captured.drawerProps.initialData).toBe(firstInitialData);
  });

  it("keeps the drawer open (resolves false) when a save fails for another reason", async () => {
    const props = await openEditDrawer(STORED_INCIDENT);
    vi.mocked(updateEntityById).mockRejectedValue(
      Object.assign(new Error("Server error"), { status: 500 }),
    );

    let result: unknown;
    await act(async () => {
      result = await props.onSuccess({ ...props.initialData, status: "Investigating" });
    });

    expect(result).toBe(false);
    expect(await screen.findByText("Failed to update incident.")).toBeInTheDocument();
  });

  it("hands the drawer the same initialData object across re-renders (an alert does not reset edits)", async () => {
    const props = await openEditDrawer(STORED_INCIDENT);
    const first = props.initialData;
    vi.mocked(updateEntityById).mockRejectedValue(
      Object.assign(new Error("Server error"), { status: 500 }),
    );

    await act(async () => {
      await props.onSuccess({ ...props.initialData, status: "Investigating" });
    });
    await screen.findByText("Failed to update incident.");

    expect(captured.drawerProps.initialData).toBe(first);
  });

  it("closes the drawer (resolves true) after a successful save", async () => {
    const props = await openEditDrawer(STORED_INCIDENT);
    vi.mocked(updateEntityById).mockResolvedValue({ data: {} } as any);

    let result: unknown;
    await act(async () => {
      result = await props.onSuccess({ ...props.initialData, status: "Investigating" });
    });

    expect(result).toBe(true);
    expect(updateEntityById).toHaveBeenCalledWith({
      routeUrl: "/ai-incident-managements/42",
      // The page shows its own message for failures of this call.
      suppressGlobalErrorToast: true,
      body: expect.objectContaining({
        status: "Investigating",
        expected_updated_at: "2026-10-10T12:34:56.789Z",
      }),
    });
  });
});
