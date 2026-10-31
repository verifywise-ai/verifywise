import {
  applyReopenApprovalReset,
  incidentCalendarDate,
  isSameIncidentValue,
  validateCompleteIncidentUpdate,
} from "./incidentManagementValidation.utils";
import {
  AIIncidentManagementApprovalStatus as Approval,
  AIIncidentManagementStatus as Status,
} from "../../domain.layer/enums/ai-incident-management.enum";

const RESET = {
  approval_status: Approval.PENDING,
  approved_by: null,
  approval_date: null,
  approval_notes: null,
};

describe("reopening closed incidents", () => {
  describe("validateCompleteIncidentUpdate", () => {
    it.each([
      Status.OPEN,
      Status.INVESTIGATING,
      Status.MITIGATED,
      Status.SUSPENDED,
      Status.EMERGENCY_ACTION,
    ])("allows Closed → %s", (status) => {
      expect(validateCompleteIncidentUpdate({ status }, { status: Status.CLOSED })).toEqual([]);
    });
  });

  describe("applyReopenApprovalReset", () => {
    const closedApproved = {
      status: Status.CLOSED,
      approval_status: Approval.APPROVED,
      approved_by: "Jane Doe",
      approval_date: "2026-10-01T00:00:00.000Z",
      approval_notes: "Closure signed off",
    };

    it("resets an Approved closure sign-off to Pending and clears approver, date and notes", () => {
      const result = applyReopenApprovalReset(closedApproved, { status: Status.INVESTIGATING });
      expect(result).toEqual({ status: Status.INVESTIGATING, ...RESET });
    });

    it("treats approval fields sent back unchanged (as the edit form does) as not touched", () => {
      const update = {
        status: Status.OPEN,
        approval_status: Approval.APPROVED,
        approved_by: "Jane Doe",
        // Same calendar date, as a pg Date (local wall-clock midnight).
        approval_date: new Date(2026, 9, 1),
        approval_notes: "Closure signed off",
      };
      expect(applyReopenApprovalReset(closedApproved, update)).toEqual({
        ...update,
        ...RESET,
      });
    });

    it("treats the drawer's YYYY-MM-DD approval date as unchanged against the stored Date", () => {
      // pg returns the TIMESTAMP WITHOUT TIME ZONE column as a Date at the
      // stored wall-clock time in server-local time; the drawer sends back the
      // date part of the API value.
      const stored = { ...closedApproved, approval_date: new Date(2026, 9, 1) };
      const update = { status: Status.OPEN, approval_date: "2026-10-01" };
      expect(applyReopenApprovalReset(stored, update)).toEqual({ ...update, ...RESET });
    });

    it("treats '' and null as the same empty approval value", () => {
      const stored = { ...closedApproved, approval_notes: null };
      const update = { status: Status.OPEN, approval_notes: "" };
      expect(applyReopenApprovalReset(stored, update)).toEqual({ ...update, ...RESET });
    });

    it.each([
      ["approval_status", { approval_status: Approval.NOT_REQUIRED }],
      ["approved_by", { approved_by: "Sam Lee" }],
      ["approval_date", { approval_date: "2026-10-05T00:00:00.000Z" }],
      ["approval_notes", { approval_notes: "Still approved after review" }],
    ])("keeps the caller's approval fields when %s is changed explicitly", (_field, change) => {
      const update = { status: Status.INVESTIGATING, ...change };
      expect(applyReopenApprovalReset(closedApproved, update)).toBe(update);
    });

    it.each([Approval.PENDING, Approval.REJECTED, Approval.NOT_REQUIRED])(
      "leaves a %s approval alone on reopen",
      (approval_status) => {
        const update = { status: Status.INVESTIGATING };
        expect(applyReopenApprovalReset({ ...closedApproved, approval_status }, update)).toBe(
          update,
        );
      },
    );

    it("does nothing when the incident stays Closed or the status is not in the update", () => {
      const stays = { status: Status.CLOSED, description: "More detail" };
      const noStatus = { description: "More detail" };
      expect(applyReopenApprovalReset(closedApproved, stays)).toBe(stays);
      expect(applyReopenApprovalReset(closedApproved, noStatus)).toBe(noStatus);
    });

    it("does nothing for status changes that are not a reopen", () => {
      const update = { status: Status.CLOSED };
      expect(
        applyReopenApprovalReset({ ...closedApproved, status: Status.MITIGATED }, update),
      ).toBe(update);
    });
  });

  describe("isSameIncidentValue", () => {
    it("compares date columns as calendar dates", () => {
      // pg's Date for a stored "2026-10-01 00:00:00" (server-local).
      const stored = new Date(2026, 9, 1);
      expect(isSameIncidentValue("approval_date", stored, "2026-10-01")).toBe(true);
      expect(isSameIncidentValue("approval_date", stored, "2026-10-01T15:30:00.000Z")).toBe(true);
      expect(isSameIncidentValue("approval_date", stored, "2026-10-02")).toBe(false);
      expect(isSameIncidentValue("approval_date", null, "")).toBe(true);
      expect(isSameIncidentValue("approval_date", null, "2026-10-01")).toBe(false);
    });

    it("compares foreign keys numerically and booleans with empty as false", () => {
      expect(isSameIncidentValue("project_id", 3, "3")).toBe(true);
      expect(isSameIncidentValue("project_id", 3, null)).toBe(false);
      expect(isSameIncidentValue("archived", false, null)).toBe(true);
      expect(isSameIncidentValue("archived", true, null)).toBe(false);
    });

    it("compares harm categories as sets, ignoring order", () => {
      expect(
        isSameIncidentValue("categories_of_harm", ["Other", "Health"], ["Health", "Other"]),
      ).toBe(true);
      expect(
        isSameIncidentValue("categories_of_harm", '["Other","Health"]', ["Health", "Other"]),
      ).toBe(true);
    });

    it("does not collapse objects or mixed types in lists", () => {
      expect(isSameIncidentValue("categories_of_harm", [{ a: 1 }], [{ a: 2 }])).toBe(false);
      expect(isSameIncidentValue("categories_of_harm", [1], ["1"])).toBe(false);
      // Lists in other columns compare in order, by value.
      expect(isSameIncidentValue("affected_persons_groups", [{ a: 1 }], [{ a: 2 }])).toBe(false);
      expect(isSameIncidentValue("affected_persons_groups", ["a", "b"], ["b", "a"])).toBe(false);
      expect(isSameIncidentValue("affected_persons_groups", [{ a: 1 }], [{ a: 1 }])).toBe(true);
    });

    it("compares harm categories as lists, whether stored as JSON text or an array", () => {
      expect(isSameIncidentValue("categories_of_harm", '["Other"]', ["Other"])).toBe(true);
      expect(isSameIncidentValue("categories_of_harm", ["Other"], ["Other", "Health"])).toBe(false);
    });

    it("treats '', null and undefined as the same empty text", () => {
      expect(isSameIncidentValue("approval_notes", null, "")).toBe(true);
      expect(isSameIncidentValue("approval_notes", undefined, null)).toBe(true);
      expect(isSameIncidentValue("approval_notes", "x", "")).toBe(false);
    });
  });

  describe("TIMESTAMP WITHOUT TIME ZONE handling in any server time zone", () => {
    // Jest cannot change the process time zone at runtime, so these build
    // Dates the way pg does (from local components) and assert results that
    // hold whatever the TZ. Run the suite with TZ=UTC / TZ=Asia/Tokyo /
    // TZ=America/Toronto to exercise both sides of UTC.
    it("reads a pg Date by its wall-clock date even where that differs from its UTC date", () => {
      const lateEvening = new Date(2026, 9, 1, 23, 59);
      const earlyMorning = new Date(2026, 9, 1, 0, 1);
      expect(incidentCalendarDate(lateEvening)).toBe("2026-10-01");
      expect(incidentCalendarDate(earlyMorning)).toBe("2026-10-01");
      expect(isSameIncidentValue("approval_date", lateEvening, "2026-10-01")).toBe(true);
      expect(isSameIncidentValue("approval_date", earlyMorning, "2026-10-01")).toBe(true);
    });
  });

  describe("incidentCalendarDate", () => {
    it("takes the date part of YYYY-MM-DD strings and the UTC date of Dates", () => {
      expect(incidentCalendarDate("2026-10-01")).toBe("2026-10-01");
      expect(incidentCalendarDate("2026-10-01T23:30:00-05:00")).toBe("2026-10-01");
      // A Date is read by its local (wall-clock) components, as pg parses
      // TIMESTAMP WITHOUT TIME ZONE as server-local time.
      expect(incidentCalendarDate(new Date(2026, 9, 1, 23, 30))).toBe("2026-10-01");
      expect(incidentCalendarDate(new Date(2026, 9, 1, 0, 0))).toBe("2026-10-01");
      expect(incidentCalendarDate("")).toBeNull();
    });
  });
});
