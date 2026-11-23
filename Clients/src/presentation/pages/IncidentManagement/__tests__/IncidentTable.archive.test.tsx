import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import IncidentTable from "../IncidentTable";
import { AIIncidentManagementModel } from "../../../../domain/models/Common/incidentManagement/incidentManagement.model";

const incident = (id: number, archived: boolean) =>
  new AIIncidentManagementModel({
    id,
    incident_id: `INC-${id}`,
    ai_project: "Chatbot",
    type: "Malfunction",
    severity: "Minor",
    status: "Open",
    archived,
  } as any);

const openRowMenu = () => fireEvent.click(screen.getByRole("button", { name: /actions/i }));

describe("IncidentTable — archived incidents", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks an archived row and offers View and Restore, not Archive", () => {
    const onRestore = vi.fn();
    renderWithProviders(
      <IncidentTable data={[incident(2, true)]} onRestore={onRestore} canEdit archiveView="all" />,
    );

    expect(screen.getByText("Archived")).toBeInTheDocument();
    openRowMenu();
    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Archive incident" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Restore incident" }));
    expect(onRestore).toHaveBeenCalledWith("2");
  });

  it("does not offer Restore without incident.edit", () => {
    renderWithProviders(
      <IncidentTable
        data={[incident(2, true)]}
        onRestore={vi.fn()}
        canEdit={false}
        archiveView="archived"
      />,
    );

    openRowMenu();
    expect(screen.queryByRole("menuitem", { name: "Restore incident" })).not.toBeInTheDocument();
  });

  it("opens an archived incident read-only on row click", () => {
    const onEdit = vi.fn();
    const onView = vi.fn();
    renderWithProviders(
      <IncidentTable data={[incident(2, true)]} onEdit={onEdit} onView={onView} canEdit />,
    );

    fireEvent.click(screen.getByText("INC-2"));
    expect(onView).toHaveBeenCalledWith("2", "view");
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("asks before archiving, and says the incident can be restored", () => {
    const onArchive = vi.fn();
    renderWithProviders(
      <IncidentTable data={[incident(1, false)]} onArchive={onArchive} canEdit />,
    );

    openRowMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive incident" }));

    expect(screen.getByText("Archive this incident?")).toBeInTheDocument();
    expect(screen.getByText(/You can restore it later/)).toBeInTheDocument();
    expect(screen.queryByText(/cannot be undone/)).not.toBeInTheDocument();
  });

  it("shows its own empty state when there are no archived incidents", () => {
    renderWithProviders(<IncidentTable data={[]} archiveView="archived" />);
    expect(screen.getByText("No archived incidents.")).toBeInTheDocument();
  });

  it("shows the usual empty state when filters hide the archived incidents", () => {
    renderWithProviders(<IncidentTable data={[]} archiveView="archived" hasArchivedIncidents />);
    expect(screen.queryByText("No archived incidents.")).not.toBeInTheDocument();
    expect(screen.getByText(/No incidents reported yet/)).toBeInTheDocument();
  });
});
