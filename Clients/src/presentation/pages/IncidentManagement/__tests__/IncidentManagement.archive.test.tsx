import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const captured = vi.hoisted(() => ({
  tableProps: null as any,
  tiles: null as any,
  drawerProps: null as any,
  role: "Admin",
}));

vi.mock("../../../components/HelperIcon", () => ({ default: () => null }));
vi.mock("../../../assets/icons/plus-circle-white.svg", () => ({
  ReactComponent: () => <svg data-testid="add-icon" />,
}));

const INCIDENTS = [
  { id: 1, incident_id: "INC-1", ai_project: "Chatbot", status: "Open", archived: false },
  { id: 2, incident_id: "INC-2", ai_project: "Chatbot", status: "Closed", archived: true },
  { id: 3, incident_id: "INC-3", ai_project: "Scoring", status: "Open", archived: false },
];

vi.mock("../../../../application/repository/entity.repository", () => ({
  getAllEntities: vi.fn(),
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
// A probe for the table: it records its props and lists the incident ids it got.
vi.mock("../IncidentTable", () => ({
  default: (props: any) => {
    captured.tableProps = props;
    return (
      <ul aria-label="incident rows">
        {props.data.map((incident: any) => (
          <li key={incident.id}>{incident.incident_id}</li>
        ))}
      </ul>
    );
  },
}));
vi.mock("../../../components/Modals/NewIncident", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../components/Modals/NewIncident")>()),
  default: (props: any) => {
    captured.drawerProps = props;
    return null;
  },
}));
vi.mock("../../../components/PageTour", () => ({ default: () => null }));
vi.mock("../IncidentManagementSteps", () => ({ default: [] }));
vi.mock("../../../components/Cards/StatusTileCards", () => ({
  StatusTileCards: (props: any) => {
    captured.tiles = props.items;
    return null;
  },
}));

import IncidentManagement from "../index";
import { incidentsForArchiveView } from "../archiveView";
import {
  archiveIncidentById,
  getAllEntities,
  getEntityById,
  updateEntityById,
} from "../../../../application/repository/entity.repository";
import { AIIncidentManagementModel } from "../../../../domain/models/Common/incidentManagement/incidentManagement.model";

const listedIds = () =>
  within(screen.getByRole("list", { name: "incident rows" }))
    .queryAllByRole("listitem")
    .map((item) => item.textContent);

async function renderPage() {
  renderWithProviders(<IncidentManagement />, { route: "/incidents" });
  await waitFor(() => expect(listedIds()).not.toEqual([]));
}

async function chooseView(label: string) {
  fireEvent.mouseDown(screen.getByRole("combobox"));
  fireEvent.click(await screen.findByRole("option", { name: label }));
}

describe("incidentsForArchiveView", () => {
  const incidents = INCIDENTS.map((i) => new AIIncidentManagementModel(i as any));

  it("lists active incidents, archived ones, or both", () => {
    expect(incidentsForArchiveView(incidents, "active").map((i) => i.id)).toEqual([1, 3]);
    expect(incidentsForArchiveView(incidents, "archived").map((i) => i.id)).toEqual([2]);
    expect(incidentsForArchiveView(incidents, "all").map((i) => i.id)).toEqual([1, 2, 3]);
  });
});

describe("IncidentManagement — archived view and restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.tableProps = null;
    captured.role = "Admin";
    vi.mocked(getAllEntities).mockResolvedValue({ data: INCIDENTS } as any);
    vi.mocked(archiveIncidentById).mockResolvedValue({ data: {} } as any);
    vi.mocked(updateEntityById).mockResolvedValue({ data: {} } as any);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists active incidents by default", async () => {
    await renderPage();
    expect(listedIds()).toEqual(["INC-1", "INC-3"]);
    expect(captured.tableProps.archiveView).toBe("active");
  });

  it("lists archived incidents in the Archived only view, and all in Active + archived", async () => {
    await renderPage();

    await chooseView("Archived only");
    await waitFor(() => expect(listedIds()).toEqual(["INC-2"]));
    expect(captured.tableProps.archiveView).toBe("archived");

    await chooseView("Active + archived");
    await waitFor(() => expect(listedIds()).toEqual(["INC-1", "INC-2", "INC-3"]));
  });

  it("restores an incident with the ordinary update, archived: false", async () => {
    await renderPage();

    await captured.tableProps.onRestore("2");

    expect(updateEntityById).toHaveBeenCalledWith({
      routeUrl: "/ai-incident-managements/2",
      body: { archived: false },
    });
    expect(archiveIncidentById).not.toHaveBeenCalled();
    expect(await screen.findByText("Incident restored.")).toBeInTheDocument();
  });

  it("archives an incident with archived: true", async () => {
    await renderPage();

    await captured.tableProps.onArchive("1", "archive");

    expect(archiveIncidentById).toHaveBeenCalledWith({
      routeUrl: "/ai-incident-managements/1",
      body: {},
    });
    expect(await screen.findByText("Incident archived successfully.")).toBeInTheDocument();
  });

  it("says so when a restore fails", async () => {
    vi.mocked(updateEntityById).mockRejectedValue(new Error("boom"));
    await renderPage();

    await captured.tableProps.onRestore("2");

    expect(
      await screen.findByText("Could not restore the incident. Please try again."),
    ).toBeInTheDocument();
  });

  it("counts the status tiles from the chosen view", async () => {
    await renderPage();
    const count = (key: string) => captured.tiles.find((t: any) => t.key === key).count;
    expect([count("Open"), count("Closed")]).toEqual([2, 0]);

    await chooseView("Archived only");
    await waitFor(() => expect(count("Closed")).toBe(1));
    expect(count("Open")).toBe(0);
  });

  it("opens an archived incident read-only from an ?incidentId= link", async () => {
    vi.mocked(getEntityById).mockResolvedValue({ data: INCIDENTS[1] } as any);

    renderWithProviders(<IncidentManagement />, { route: "/incidents?incidentId=2" });

    await waitFor(() => expect(captured.drawerProps?.isOpen).toBe(true));
    expect(captured.drawerProps.mode).toBe("view");
  });

  it("opens an active incident editable from an ?incidentId= link", async () => {
    vi.mocked(getEntityById).mockResolvedValue({ data: INCIDENTS[0] } as any);

    renderWithProviders(<IncidentManagement />, { route: "/incidents?incidentId=1" });

    await waitFor(() => expect(captured.drawerProps?.isOpen).toBe(true));
    expect(captured.drawerProps.mode).toBe("edit");
  });
});
