import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
// The tab now uses the design-system Field/Select, which read border and text
// colours off the app theme — a bare render() blows up on the MUI default one.
import { renderWithProviders as render } from "../../../../test/renderWithProviders";

const updateMutate = vi.fn();
const deleteMutate = vi.fn();

const ROW = {
  id: 7,
  name: "Weekly compliance digest",
  scope: "organization",
  next_run_at: null,
  is_active: true,
  format: "pdf",
  schedule_config: { frequency: "weekly", hour: 9, minute: 0, timezone: "UTC" },
};

vi.mock("../../../../application/hooks/useReporting", () => ({
  useScheduledReports: () => ({ data: [ROW] }),
  useRunNow: () => ({ mutate: vi.fn(), isPending: false }),
  useSetActive: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateScheduledReport: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteScheduledReport: () => ({ mutate: deleteMutate, isPending: false }),
}));

import ScheduledReportsTab from "../ScheduledReportsTab";

// Row actions live behind the shared row-actions menu (components/IconButton):
// open the row's gear menu, then pick the item. The menu item is a menuitem and
// the dialog's confirm is a button, so "Delete" and "Delete report" stay apart.
const clickRowAction = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Scheduled report actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name }));
};

const clickRowDelete = () => clickRowAction("Delete");

describe("ScheduledReportsTab", () => {
  beforeEach(() => {
    updateMutate.mockClear();
    deleteMutate.mockClear();
  });

  it("asks for confirmation before deleting and names the schedule", () => {
    render(<ScheduledReportsTab />);
    clickRowDelete();

    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.getByText("Delete scheduled report")).toBeInTheDocument();
    // The name also appears in the table row, so match the dialog's sentence.
    expect(
      screen.getByText(/"Weekly compliance digest" will stop running/),
    ).toBeInTheDocument();
  });

  it("deletes only after the confirmation is accepted", () => {
    render(<ScheduledReportsTab />);
    clickRowDelete();
    fireEvent.click(screen.getByRole("button", { name: "Delete report" }));

    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate.mock.calls[0][0]).toBe(7);
  });

  it("does not delete when the confirmation is cancelled", () => {
    render(<ScheduledReportsTab />);
    clickRowDelete();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByText("Delete scheduled report")).not.toBeInTheDocument();
  });

  it("submits edited fields through useUpdateScheduledReport with the row id", () => {
    render(<ScheduledReportsTab />);
    clickRowAction("Edit");

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Monthly compliance digest" },
    });
    fireEvent.change(screen.getByLabelText("Hour"), { target: { value: "17" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toEqual({
      id: 7,
      body: {
        name: "Monthly compliance digest",
        format: "pdf",
        // Seeded from the row's schedule_config, so an untouched field is
        // resubmitted as-is rather than silently reset to a default.
        scheduleConfig: { frequency: "weekly", hour: 17, minute: 0, timezone: "UTC" },
      },
    });
  });

  it("seeds the edit form from the row instead of blank defaults", () => {
    render(<ScheduledReportsTab />);
    clickRowAction("Edit");

    expect(screen.getByLabelText("Name")).toHaveValue("Weekly compliance digest");
    expect(screen.getByLabelText("Timezone")).toHaveValue("UTC");
  });
});
