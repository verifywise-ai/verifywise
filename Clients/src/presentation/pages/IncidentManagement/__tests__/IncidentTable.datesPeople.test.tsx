import { describe, it, expect, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import IncidentTable from "../IncidentTable";
import { AIIncidentManagementModel } from "../../../../domain/models/Common/incidentManagement/incidentManagement.model";

const originalTz = process.env.TZ;

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

const VISIBLE = new Set(["incident_id", "occurred_date", "approved_by"]);

describe("IncidentTable dates and people", () => {
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it.each(["UTC", "America/Los_Angeles", "Pacific/Kiritimati"])(
    "shows the occurred day as stored, not the day before (%s)",
    (tz) => {
      process.env.TZ = tz;
      renderWithProviders(
        <IncidentTable data={[incident({})]} paginated={false} visibleColumns={VISIBLE} />,
      );
      // Default date format DD-MM-YYYY.
      expect(screen.getByText("20-09-2026")).toBeInTheDocument();
      expect(screen.queryByText("19-09-2026")).not.toBeInTheDocument();
    },
  );

  it("still shows the day of a date-time from an older server", () => {
    process.env.TZ = "America/Los_Angeles";
    renderWithProviders(
      <IncidentTable
        data={[incident({ occurred_date: "2026-09-20T00:00:00.000Z" })]}
        paginated={false}
        visibleColumns={VISIBLE}
      />,
    );
    expect(screen.getByText("20-09-2026")).toBeInTheDocument();
  });

  it("shows the approver's full name, falling back to the stored text", () => {
    renderWithProviders(
      <IncidentTable
        data={[
          incident({
            id: 1,
            incident_id: "INC-1",
            approved_by: "Alex",
            approved_by_name: "Alex Kim",
          }),
          incident({
            id: 2,
            incident_id: "INC-2",
            approved_by: "Jane Doe",
            approved_by_name: null,
          }),
        ]}
        paginated={false}
        visibleColumns={VISIBLE}
      />,
    );
    expect(screen.getByText("Alex Kim")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.queryByText("Alex")).not.toBeInTheDocument();
  });
});
