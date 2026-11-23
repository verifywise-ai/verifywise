import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
// The tab now uses the design-system Field/Select, which read border and text
// colours off the app theme — a bare render() blows up on the MUI default one.
import { renderWithProviders as render } from "../../../../test/renderWithProviders";

const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const showAlert = vi.fn();

// The schedule as GET /v1/scheduled-reports/:id returns it. A general
// template's version declares no fields; tests swap in a kind's.
const GENERAL_DETAIL = { data: { id: 7, report_parameters: {}, parameters_config: {} } };
let detail: Record<string, unknown> = GENERAL_DETAIL;

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
  useScheduledReport: () => ({ isFetching: false, isError: false, ...detail }),
  useRunNow: () => ({ mutate: vi.fn(), isPending: false }),
  useSetActive: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateScheduledReport: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteScheduledReport: () => ({ mutate: deleteMutate, isPending: false }),
}));

vi.mock("../../../../infrastructure/api/customAxios", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showAlert: (...args: unknown[]) => showAlert(...args),
}));

import ScheduledReportsTab from "../ScheduledReportsTab";

// The E-23 version's declared fields (Servers e23Parameters.ts), trimmed to
// the ones the dialog needs: a period (never shown for a schedule), a required
// text field and the final version box.
const E23_FIELDS = [
  { key: "periodStart", label: "Period start", type: "date", required: true },
  { key: "periodEnd", label: "Period end", type: "date", required: true },
  { key: "institutionName", label: "Institution name", type: "text", required: true },
  { key: "isFinal", label: "Final version", type: "boolean", required: false },
];
const kindDetail = (stored: Record<string, unknown>) => ({
  data: {
    id: 7,
    report_parameters: stored,
    parameters_config: { kind: "osfi_e23", fields: E23_FIELDS },
  },
});

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
    showAlert.mockClear();
    detail = GENERAL_DETAIL;
  });

  it("asks for confirmation before deleting and names the schedule", () => {
    render(<ScheduledReportsTab />);
    clickRowDelete();

    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.getByText("Delete scheduled report")).toBeInTheDocument();
    // The name also appears in the table row, so match the dialog's sentence.
    expect(screen.getByText(/"Weekly compliance digest" will stop running/)).toBeInTheDocument();
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

  it("offers quarterly with a run-in month and saves anchorMonth", () => {
    render(<ScheduledReportsTab />);
    clickRowAction("Edit");
    expect(screen.queryByLabelText("Run in month")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "quarterly" } });
    const expectedDefault = ((new Date().getMonth() + 1) % 12) + 1;
    expect(screen.getByLabelText("Run in month")).toHaveValue(String(expectedDefault));
    fireEvent.change(screen.getByLabelText("Run in month"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMutate.mock.calls[0][0].body.scheduleConfig).toEqual({
      frequency: "quarterly",
      anchorMonth: 2,
      hour: 9,
      minute: 0,
      timezone: "UTC",
    });
  });

  describe("report details", () => {
    it("shows no details and sends no reportParameters for a general template", () => {
      render(<ScheduledReportsTab />);
      clickRowAction("Edit");

      expect(screen.queryByLabelText("Final version")).not.toBeInTheDocument();
      expect(
        screen.getByText("Update the name, output format and delivery schedule."),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(updateMutate).toHaveBeenCalledTimes(1);
      expect(updateMutate.mock.calls[0][0].body).not.toHaveProperty("reportParameters");
    });

    it("prefills the stored answers and saves the final version box", () => {
      detail = kindDetail({ institutionName: "Acme Bank", isFinal: false });
      render(<ScheduledReportsTab />);
      clickRowAction("Edit");

      // A schedule's period is derived per run, so it is not offered.
      expect(screen.queryByLabelText("Period start")).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Institution name/)).toHaveValue("Acme Bank");
      expect(screen.getByLabelText("Final version")).not.toBeChecked();

      fireEvent.click(screen.getByLabelText("Final version"));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(updateMutate).toHaveBeenCalledTimes(1);
      expect(updateMutate.mock.calls[0][0]).toEqual({
        id: 7,
        body: {
          name: "Weekly compliance digest",
          format: "pdf",
          scheduleConfig: { frequency: "weekly", hour: 9, minute: 0, timezone: "UTC" },
          reportParameters: { institutionName: "Acme Bank", isFinal: true },
        },
      });
    });

    it("blocks Save and shows the error while a required answer is blank", () => {
      detail = kindDetail({ institutionName: "Acme Bank", isFinal: false });
      render(<ScheduledReportsTab />);
      clickRowAction("Edit");

      fireEvent.change(screen.getByLabelText(/Institution name/), { target: { value: " " } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(updateMutate).not.toHaveBeenCalled();
      expect(screen.getByText("Institution name is required")).toBeInTheDocument();
    });

    it("keeps Save disabled until the schedule has loaded", () => {
      detail = { data: undefined, isFetching: true };
      render(<ScheduledReportsTab />);
      clickRowAction("Edit");

      const save = screen.getByRole("button", { name: "Save" });
      expect(save).toBeDisabled();
      fireEvent.click(save);
      expect(updateMutate).not.toHaveBeenCalled();
    });

    it("says when the details fail to load and still saves the other fields", () => {
      detail = { data: undefined, isError: true };
      render(<ScheduledReportsTab />);
      clickRowAction("Edit");

      expect(showAlert).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "error", isToast: true }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(updateMutate).toHaveBeenCalledTimes(1);
      expect(updateMutate.mock.calls[0][0].body).not.toHaveProperty("reportParameters");
    });
  });
});
