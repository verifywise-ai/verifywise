import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import type { FilterColumn, FilterCondition } from "../../../components/Table/FilterBy";

const captured = vi.hoisted(() => ({
  tableProps: null as any,
  tableLoading: [] as boolean[],
  drawerProps: null as any,
  filterProps: null as any,
}));

vi.mock("../../../components/HelperIcon", () => ({ default: () => null }));
vi.mock("../../../assets/icons/plus-circle-white.svg", () => ({
  ReactComponent: () => <svg data-testid="add-icon" />,
}));

// The visible ID and the database id differ on purpose: id 12 is INC-40.
const INCIDENTS = [
  {
    id: 12,
    incident_id: "INC-40",
    ai_project: "Chatbot",
    reporter: "Ada",
    status: "Open",
    occurred_date: "2026-11-24",
    archived: false,
  },
  {
    id: 3,
    incident_id: "INC-12",
    ai_project: "Scoring",
    reporter: "Grace",
    status: "Open",
    occurred_date: "2026-11-17",
    archived: false,
  },
  {
    id: 4,
    incident_id: "INC-5",
    ai_project: "Fraud scoring",
    reporter: "Linus",
    status: "Closed",
    occurred_date: "2026-11-16",
    archived: false,
  },
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
  useAuth: () => ({ userRoleName: "Admin", userToken: { name: "Test User" } }),
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
// A probe for the filter: it records its columns and lets a test emit conditions.
vi.mock("../../../components/Table/TableFilter", () => ({
  TableFilter: (props: any) => {
    captured.filterProps = props;
    return null;
  },
}));
vi.mock("../../../components/Table/ExportMenu", () => ({ ExportMenu: () => null }));
vi.mock("../../../components/Table/ColumnSelector", () => ({ ColumnSelector: () => null }));
// A probe for the table: it records its props and lists the incident ids it got.
vi.mock("../IncidentTable", () => ({
  default: (props: any) => {
    captured.tableProps = props;
    captured.tableLoading.push(Boolean(props.isLoading));
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
vi.mock("../../../components/Cards/StatusTileCards", () => ({ StatusTileCards: () => null }));

import IncidentManagement from "../index";
import IncidentManagementSteps from "../IncidentManagementSteps";
import { incidentMatchesSearch } from "../incidentSearch";
import {
  getAllEntities,
  getEntityById,
  updateEntityById,
} from "../../../../application/repository/entity.repository";
import { createIncidentManagement } from "../../../../application/repository/incident_management.repository";
import { AIIncidentManagementModel } from "../../../../domain/models/Common/incidentManagement/incidentManagement.model";

const listedIds = () =>
  within(screen.getByRole("list", { name: "incident rows" }))
    .queryAllByRole("listitem")
    .map((item) => item.textContent);

async function renderPage() {
  renderWithProviders(<IncidentManagement />, { route: "/incidents" });
  await waitFor(() => expect(listedIds()).toHaveLength(INCIDENTS.length));
}

const search = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText("Search by ID, use case or reporter"), {
    target: { value },
  });

const applyFilter = (conditions: FilterCondition[]) =>
  act(() => {
    captured.filterProps.onFilterChange(conditions, "and");
  });

describe("incidentMatchesSearch", () => {
  const incident = new AIIncidentManagementModel(INCIDENTS[1] as any);

  it("matches the visible ID, ignoring case and surrounding spaces", () => {
    expect(incidentMatchesSearch(incident, "INC-12")).toBe(true);
    expect(incidentMatchesSearch(incident, "  inc-12 ")).toBe(true);
    expect(incidentMatchesSearch(incident, "INC-40")).toBe(false);
  });

  it("matches the use case and the reporter", () => {
    expect(incidentMatchesSearch(incident, "scor")).toBe(true);
    expect(incidentMatchesSearch(incident, "grace")).toBe(true);
  });
});

describe("IncidentManagement list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.tableProps = null;
    captured.tableLoading = [];
    captured.filterProps = null;
    vi.mocked(getAllEntities).mockResolvedValue({ data: INCIDENTS } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("searches by the visible incident ID, not the hidden database id", async () => {
    await renderPage();

    search("inc-12");
    expect(listedIds()).toEqual(["INC-12"]);

    // "12" is the database id of INC-40, which the user never sees.
    search("12");
    expect(listedIds()).toEqual(["INC-12"]);
  });

  it("the page tour describes what the search really matches", () => {
    const step = IncidentManagementSteps.find(
      (s) => s.target === '[data-joyride-id="incident-search"]',
    );
    expect(step?.content.body).toBe(
      "Find an incident by its ID (for example INC-12), its use case or its reporter.",
    );
  });

  it("marks the list as filtered when nothing matches, and Clear filters brings every incident back", async () => {
    await renderPage();
    expect(captured.tableProps.isFiltered).toBe(false);

    search("no such incident");
    expect(listedIds()).toEqual([]);
    expect(captured.tableProps.isFiltered).toBe(true);

    act(() => captured.tableProps.onClearFilters());
    expect(listedIds()).toHaveLength(INCIDENTS.length);
    expect(captured.tableProps.isFiltered).toBe(false);
    expect(screen.getByPlaceholderText("Search by ID, use case or reporter")).toHaveValue("");
  });

  it("a filter alone also counts as filtering, and Clear filters drops it", async () => {
    await renderPage();
    applyFilter([{ id: "f1", columnId: "incident_id", operator: "is", value: "INC-999" }]);
    expect(listedIds()).toEqual([]);
    expect(captured.tableProps.isFiltered).toBe(true);

    act(() => captured.tableProps.onClearFilters());
    expect(listedIds()).toHaveLength(INCIDENTS.length);
    expect(captured.filterProps.defaultConditions).toEqual([]);
  });

  it("offers the occurred date as a recent date column, named with the use case field", async () => {
    await renderPage();
    const columns: FilterColumn[] = captured.filterProps.columns;
    expect(columns.find((c) => c.id === "occurred_date")?.dateRange).toBe("recent");
    expect(columns.find((c) => c.id === "ai_project")?.label).toBe("Use case");
  });

  it("'in the last 7 days' keeps incidents from today back to 7 days ago, in the user's own days", async () => {
    // Late evening local time: in UTC it may already be the next day.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 24, 23, 30));
    await renderPage();

    applyFilter([{ id: "f1", columnId: "occurred_date", operator: "in_last_7_days", value: "" }]);
    expect(listedIds()).toEqual(["INC-40", "INC-12"]);

    applyFilter([{ id: "f1", columnId: "occurred_date", operator: "is_today", value: "" }]);
    expect(listedIds()).toEqual(["INC-40"]);
  });

  it("refreshes the list in place after a successful edit (no loading skeleton)", async () => {
    await renderPage();
    vi.mocked(getEntityById).mockResolvedValue({ data: INCIDENTS[0] } as any);
    vi.mocked(updateEntityById).mockResolvedValue({ data: {} } as any);
    await act(async () => {
      await captured.tableProps.onEdit("12", "edit");
    });
    await waitFor(() => expect(captured.drawerProps.initialData).toBeTruthy());

    captured.tableLoading = [];
    const listCallsBefore = vi.mocked(getAllEntities).mock.calls.length;
    await act(async () => {
      await captured.drawerProps.onSuccess({ status: "Closed" });
    });

    expect(vi.mocked(getAllEntities).mock.calls.length).toBeGreaterThan(listCallsBefore);
    expect(captured.tableLoading).not.toContain(true);
  });

  it("refreshes the list in place after creating an incident (no loading skeleton)", async () => {
    await renderPage();
    vi.mocked(createIncidentManagement).mockResolvedValue({ data: {} } as any);

    captured.tableLoading = [];
    const listCallsBefore = vi.mocked(getAllEntities).mock.calls.length;
    await act(async () => {
      await captured.drawerProps.onSuccess({ ai_project: "Chatbot" });
    });

    expect(vi.mocked(getAllEntities).mock.calls.length).toBeGreaterThan(listCallsBefore);
    expect(captured.tableLoading).not.toContain(true);
  });

  it("keeps an error toast until it is closed, and closes a success toast on its own", async () => {
    await renderPage();
    // After the first load: waitFor needs real timers.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.mocked(createIncidentManagement).mockRejectedValue(new Error("Server error"));

    await act(async () => {
      await captured.drawerProps.onSuccess({ ai_project: "Chatbot" });
    });
    expect(screen.getByText("Failed to add incident.")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("Failed to add incident.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close notification" }));
    expect(screen.queryByText("Failed to add incident.")).not.toBeInTheDocument();

    vi.mocked(createIncidentManagement).mockResolvedValue({ data: {} } as any);
    await act(async () => {
      await captured.drawerProps.onSuccess({ ai_project: "Chatbot" });
    });
    expect(screen.getByText("New incident added successfully!")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.queryByText("New incident added successfully!")).not.toBeInTheDocument();
  });
});
