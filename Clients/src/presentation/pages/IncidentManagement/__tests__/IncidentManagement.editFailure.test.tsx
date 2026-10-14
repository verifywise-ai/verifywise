import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import CustomException from "../../../../infrastructure/exceptions/customeException";

const incident = {
  id: 42,
  incident_id: "INC-42",
  ai_project: "AI Recruitment Screening Platform",
  type: "Performance",
  severity: "Minor",
  status: "Open",
  occurred_date: "2026-09-01",
  date_detected: "2026-09-01",
  reporter: "Jane Doe",
  categories_of_harm: ["Health"],
  description: "The model ranked candidates unfairly.",
  approval_status: "Pending",
};

vi.mock("../../../components/HelperIcon", () => ({ default: () => null }));
vi.mock("../../../assets/icons/plus-circle-white.svg", () => ({
  ReactComponent: () => <svg />,
}));
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
vi.mock("../../../../application/hooks/useFilterBy", () => ({
  useFilterBy: () => ({ filterData: (data: unknown[]) => data, handleFilterChange: vi.fn() }),
}));
vi.mock("../../../../application/hooks/useTableGrouping", () => ({
  useTableGrouping: () => [],
  useGroupByState: () => ({ groupBy: null, groupSortOrder: "asc", handleGroupChange: vi.fn() }),
}));
vi.mock("../../../../application/hooks/useColumnVisibility", () => ({
  useColumnVisibility: () => ({
    visibleColumns: new Set(["incident_id", "actions"]),
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
vi.mock("../../../components/PageTour", () => ({ default: () => null }));
vi.mock("../IncidentManagementSteps", () => ({ default: [] }));
vi.mock("../../../components/Cards/StatusTileCards", () => ({ StatusTileCards: () => null }));

// The table exposes an Edit trigger; the drawer is a probe that records every
// initialData object it receives and can submit it.
vi.mock("../IncidentTable", () => ({
  default: ({ onEdit }: any) => <button onClick={() => onEdit("42", "edit")}>Edit 42</button>,
}));
const seenInitialData: unknown[] = [];
vi.mock("../../../components/Modals/NewIncident", () => ({
  default: (props: any) => {
    if (props.isOpen) seenInitialData.push(props.initialData);
    return props.isOpen ? (
      <button onClick={() => props.onSuccess?.(props.initialData).catch(() => undefined)}>
        Probe save
      </button>
    ) : null;
  },
}));

import IncidentManagement from "../index";
import {
  getAllEntities,
  getEntityById,
  updateEntityById,
} from "../../../../application/repository/entity.repository";

describe("IncidentManagement edit failure", () => {
  beforeEach(() => {
    seenInitialData.length = 0;
    vi.mocked(getAllEntities).mockResolvedValue({ data: [incident] });
    vi.mocked(getEntityById).mockResolvedValue({ data: incident });
    vi.mocked(updateEntityById).mockRejectedValue(
      new CustomException("Incident update validation failed", 400, {
        message: "Bad Request",
        data: {
          status: "error",
          message: "Incident update validation failed",
          errors: [
            {
              field: "description",
              message: "Description cannot exceed 32,767 characters.",
              code: "MAX_LENGTH",
            },
          ],
        },
      }),
    );
  });

  it("shows the server's message and keeps handing the drawer the same initial data", async () => {
    renderWithProviders(<IncidentManagement />);

    fireEvent.click(await screen.findByText("Edit 42"));
    fireEvent.click(await screen.findByText("Probe save"));

    expect(
      await screen.findByText("Description cannot exceed 32,767 characters."),
    ).toBeInTheDocument();
    await waitFor(() => expect(updateEntityById).toHaveBeenCalledTimes(1));

    // Re-renders (including the one that shows the toast) must not hand the
    // drawer a new initialData object, or it would re-seed and drop the
    // user's edits.
    expect(seenInitialData.length).toBeGreaterThan(1);
    expect(new Set(seenInitialData).size).toBe(1);
    // The drawer is still open.
    expect(screen.getByText("Probe save")).toBeInTheDocument();
  });
});
