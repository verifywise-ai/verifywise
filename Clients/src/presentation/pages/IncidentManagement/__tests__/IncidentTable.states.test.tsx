import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import IncidentTable from "../IncidentTable";
import { AIIncidentManagementModel } from "../../../../domain/models/Common/incidentManagement/incidentManagement.model";
import type { JiraIncidentLink } from "../../../../application/repository/jiraIncidents.repository";

const incident = (overrides: Partial<AIIncidentManagementModel>) =>
  ({
    id: 1,
    incident_id: "INC-1",
    ai_project: "Chatbot",
    type: "Malfunction",
    severity: "Minor",
    status: "Open",
    occurred_date: "2026-09-20",
    date_detected: "2026-09-21",
    reporter: "Ada",
    categories_of_harm: [],
    description: "Model produced unsafe output",
    approval_status: "Pending",
    approved_by: "",
    archived: false,
    ...overrides,
  }) as AIIncidentManagementModel;

const VISIBLE = new Set(["incident_id", "ai_project"]);

const NOT_YET =
  "No incidents reported yet. Track and manage AI-related incidents to maintain compliance.";

describe("IncidentTable Jira chips", () => {
  it("shows a chip when the links arrive after the rows (first load)", () => {
    const rows = [incident({})];
    const { rerender } = renderWithProviders(
      <IncidentTable
        data={rows}
        paginated={false}
        visibleColumns={VISIBLE}
        jiraLinks={new Map()}
      />,
    );
    expect(screen.queryByText("OPS-7")).not.toBeInTheDocument();

    // The links load after the incidents; nothing else about the table changes.
    const links = new Map<number, JiraIncidentLink>([
      [
        1,
        {
          incident_id: 1,
          jira_issue_key: "OPS-7",
          jira_url: "https://example.atlassian.net/browse/OPS-7",
          state: "ok",
          state_reason: null,
        },
      ],
    ]);
    rerender(
      <IncidentTable data={rows} paginated={false} visibleColumns={VISIBLE} jiraLinks={links} />,
    );
    expect(screen.getByText("OPS-7")).toBeInTheDocument();
  });
});

describe("IncidentTable empty states", () => {
  it("says the filters match nothing, and offers to clear them", () => {
    const onClearFilters = vi.fn();
    renderWithProviders(
      <IncidentTable
        data={[]}
        visibleColumns={VISIBLE}
        isFiltered
        onClearFilters={onClearFilters}
      />,
    );
    expect(screen.getByText("No incidents match these filters.")).toBeInTheDocument();
    expect(screen.queryByText(NOT_YET)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("incidents-clear-filters"));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("says no incidents yet only when nothing is filtered", () => {
    renderWithProviders(<IncidentTable data={[]} visibleColumns={VISIBLE} />);
    expect(screen.getByText(NOT_YET)).toBeInTheDocument();
    expect(screen.queryByText("No incidents match these filters.")).not.toBeInTheDocument();
  });

  it("points to the archived view when every incident is archived", () => {
    renderWithProviders(
      <IncidentTable
        data={[]}
        visibleColumns={VISIBLE}
        archiveView="active"
        hasArchivedIncidents
      />,
    );
    expect(
      screen.getByText("No active incidents. Archived incidents are in the Archived only view."),
    ).toBeInTheDocument();
  });

  it("names the use case column", () => {
    renderWithProviders(
      <IncidentTable data={[incident({})]} paginated={false} visibleColumns={VISIBLE} />,
    );
    expect(screen.getByText("USE CASE")).toBeInTheDocument();
  });
});
