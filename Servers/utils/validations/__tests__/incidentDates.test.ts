import { describe, expect, it } from "@jest/globals";
import {
  formatIncidentDay,
  incidentCalendarDate,
  incidentToday,
  isSameIncidentValue,
  toIncidentDateValue,
  toIncidentUserId,
  validateCompleteIncidentCreation,
  validateIncidentUpdateBusinessRules,
  withoutServerSetApprovalFields,
} from "../incidentManagementValidation.utils";
import {
  mapIncidentRow,
  storedIncidentRow,
} from "../../../services/__tests__/helpers/incidentFixtures";

// Run under TZ=UTC, America/Los_Angeles and Pacific/Kiritimati: none of these
// results may depend on the process time zone.
describe(`incident dates (process TZ ${process.env.TZ ?? "default"})`, () => {
  it("writes and reads incident dates as YYYY-MM-DD", () => {
    expect(toIncidentDateValue("2026-01-15")).toBe("2026-01-15");
    // An ISO date-time keeps the caller's day, whatever its offset.
    expect(toIncidentDateValue("2026-01-15T23:30:00-08:00")).toBe("2026-01-15");
    expect(toIncidentDateValue("2026-01-15T00:00:00.000Z")).toBe("2026-01-15");
    // A Date built by server code is its UTC day.
    expect(toIncidentDateValue(new Date("2026-01-15T23:30:00.000Z"))).toBe("2026-01-15");
    expect(toIncidentDateValue(new Date("2026-01-16T00:30:00.000Z"))).toBe("2026-01-16");
    expect(toIncidentDateValue("")).toBeNull();
    expect(toIncidentDateValue(null)).toBeNull();
    expect(toIncidentDateValue(undefined)).toBeNull();
    expect(incidentCalendarDate(new Date("2026-03-01T00:00:00.000Z"))).toBe("2026-03-01");
  });

  it("compares a stored DATE string with a date or date-time sent back as the same day", () => {
    expect(isSameIncidentValue("occurred_date", "2026-09-20", "2026-09-20")).toBe(true);
    expect(isSameIncidentValue("occurred_date", "2026-09-20", "2026-09-20T00:00:00.000Z")).toBe(
      true,
    );
    expect(isSameIncidentValue("occurred_date", "2026-09-20", "2026-09-21")).toBe(false);
    expect(isSameIncidentValue("approval_date", null, "")).toBe(true);
  });

  it("formats a day for people as that day in any server time zone", () => {
    expect(formatIncidentDay("2026-01-15", "en-US", { dateStyle: "long" })).toBe(
      "January 15, 2026",
    );
    expect(formatIncidentDay(new Date("2026-01-15T00:00:00.000Z"), "en-US")).toBe("1/15/2026");
    expect(formatIncidentDay(null, "en-US")).toBe("");
  });

  it("records today's UTC date as the approval date", () => {
    expect(incidentToday(new Date("2026-11-24T02:30:00.000Z"))).toBe("2026-11-24");
    expect(incidentToday(new Date("2026-11-23T23:59:59.000Z"))).toBe("2026-11-23");
  });

  it("serialises a stored row's dates as YYYY-MM-DD with the people's ids and names", () => {
    const json = mapIncidentRow({
      ...storedIncidentRow(),
      reporter_id: 7,
      reporter_name: "Alex Kim",
    }).toSafeJSON();
    expect(json.occurred_date).toBe("2026-09-20");
    expect(json.date_detected).toBe("2026-09-21");
    expect(json.approval_date).toBe("2026-10-01");
    expect(json.reporter_id).toBe(7);
    expect(json.reporter_name).toBe("Alex Kim");
    expect(json.approved_by_id).toBe(5);
    expect(json.approved_by_name).toBe("Jane Doe");
  });
});

describe("reporter validation", () => {
  const base = {
    ai_project: "Chatbot",
    type: "Malfunction",
    severity: "Minor",
    occurred_date: "2026-06-23",
    date_detected: "2026-06-23",
    description: "Model produced unsafe output",
  };
  const fields = (errors: { field: string; code?: string }[]) =>
    errors.map((e) => `${e.field}:${e.code}`);

  it("accepts a reporter_id or a reporter text on create, and requires one of them", () => {
    expect(validateCompleteIncidentCreation({ ...base, reporter_id: 7 })).toEqual([]);
    expect(validateCompleteIncidentCreation({ ...base, reporter: "Ada" })).toEqual([]);
    expect(fields(validateCompleteIncidentCreation(base))).toEqual(["reporter:REQUIRED_FIELD"]);
    expect(
      fields(validateCompleteIncidentCreation({ ...base, reporter_id: "", reporter: "" })),
    ).toEqual(["reporter:REQUIRED_FIELD"]);
  });

  it("refuses a reporter_id that is not a positive integer", () => {
    for (const bad of [0, -1, 1.5, "abc", "7x", true]) {
      expect(fields(validateCompleteIncidentCreation({ ...base, reporter_id: bad }))).toContain(
        "reporter_id:INVALID_TYPE",
      );
    }
    expect(toIncidentUserId(" 12 ")).toBe(12);
    expect(toIncidentUserId(12)).toBe(12);
    expect(toIncidentUserId("0")).toBeNull();
  });

  it("lets an update blank the reporter text only when it sets a reporter_id", () => {
    const stored = { reporter: "Ada", reporter_id: null };
    expect(fields(validateIncidentUpdateBusinessRules({ reporter: "" }, stored))).toEqual([
      "reporter:REQUIRED_FIELD",
    ]);
    expect(validateIncidentUpdateBusinessRules({ reporter: "", reporter_id: 7 }, stored)).toEqual(
      [],
    );
  });

  it("drops approved_by_id with the other server-set approval fields", () => {
    expect(
      withoutServerSetApprovalFields({
        approval_status: "Approved",
        approved_by: "x",
        approved_by_id: 8,
        approval_date: "2020-01-01",
      }),
    ).toEqual({ approval_status: "Approved" });
  });
});
