import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn<any>() } }));
jest.mock("../../../utils/intakeForm.utils", () => ({
  getEligibleReviewerIdsQuery: jest.fn<any>(),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { sequelize } = require("../../../database/db");
const intake = require("../../../utils/intakeForm.utils");
const { aggregateOversight, getIntakeOversightQuery } =
  require("../oversight") as typeof import("../oversight");
/* eslint-enable @typescript-eslint/no-require-imports */
import type { IOversightRow } from "../oversight";

// Wednesday 2026-10-21, so the current UTC week starts Monday 2026-10-19.
const NOW = new Date("2026-10-21T12:00:00Z");
const HOUR = 3600 * 1000;

let nextId = 1;
const row = (over: Partial<IOversightRow> = {}): IOversightRow => ({
  id: nextId++,
  form_id: 1,
  form_name: "Intake",
  routing_on: true,
  status: "pending",
  created_at: "2026-10-20T08:00:00Z",
  reviewed_at: null,
  reviewed_by: null,
  week_start: "2026-10-19",
  routing: null,
  decision_record: null,
  level: null,
  tier: null,
  override_tier: null,
  suggested_total: 0,
  suggested_accepted: 0,
  ...over,
});
const routing = (
  lane: "senior" | "standard",
  reason: string = "below_threshold",
  extra: any = {},
) =>
  ({
    lane,
    reason,
    score: 40,
    threshold: 50,
    closeCallMargin: 10,
    routedAt: "2026-10-20T08:00:00Z",
    ...extra,
  }) as any;
const record = (over: any = {}) => ({
  level: "Limited risk",
  computedBand: "Medium",
  bandInForce: "Medium",
  bandChanged: false,
  overriddenBy: null,
  lane: "standard",
  ...over,
});
const decided = (hours: number, over: Partial<IOversightRow> = {}) =>
  row({
    status: "approved",
    created_at: "2026-10-20T00:00:00Z",
    reviewed_at: new Date(Date.parse("2026-10-20T00:00:00Z") + hours * HOUR).toISOString(),
    reviewed_by: 7,
    decision_record: record(),
    ...over,
  });
const run = (rows: IOversightRow[], over: any = {}) =>
  aggregateOversight({
    rows,
    reviewerNames: new Map([[7, "Ada Lovelace"]]),
    emptyLaneForms: [],
    weeks: 8,
    now: NOW,
    ...over,
  });

describe("aggregateOversight", () => {
  it("returns zeros, null medians and one zero-filled row per week with no data", () => {
    const out = run([], { weeks: 4 });
    expect(out.totals).toEqual({
      submissions: 0,
      senior: 0,
      standard: 0,
      closeCalls: 0,
      notRouted: 0,
      routingOff: 0,
    });
    expect(out.medianDecisionHours).toEqual({ all: null, senior: null, standard: null });
    expect(out.byWeek).toHaveLength(4);
    expect(out.byWeek.map((w) => w.weekStart)).toEqual([
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
    ]);
    expect(out.byWeek.every((w) => w.senior + w.standard + w.closeCall === 0)).toBe(true);
    expect(out.reviewers).toEqual([]);
    expect(out.needsAttention).toEqual([]);
    expect(out.bandKept).toEqual({ kept: 0, decided: 0, seniorKept: 0, seniorDecided: 0 });
  });

  it("counts lanes, close calls inside senior, not routed and routing off", () => {
    const out = run([
      row({ routing: routing("senior", "at_or_above_threshold") }),
      row({ routing: routing("senior", "close_call") }),
      row({ routing: routing("standard") }),
      row({ routing: routing("standard") }),
      row({ routing: null }),
      row({ routing_on: false, routing: null }),
    ]);
    expect(out.totals).toEqual({
      submissions: 6,
      senior: 2,
      standard: 2,
      closeCalls: 1,
      notRouted: 1,
      routingOff: 1,
    });
    const week = out.byWeek[out.byWeek.length - 1];
    expect(week).toMatchObject({
      senior: 1,
      closeCall: 1,
      standard: 2,
      notRouted: 1,
      routingOff: 1,
    });
  });

  it("takes the median of decision times, per lane", () => {
    const out = run([
      decided(2, { routing: routing("standard"), decision_record: record({ lane: "standard" }) }),
      decided(4, { routing: routing("standard"), decision_record: record({ lane: "standard" }) }),
      decided(10, { routing: routing("standard"), decision_record: record({ lane: "standard" }) }),
      decided(6, { routing: routing("senior"), decision_record: record({ lane: "senior" }) }),
    ]);
    expect(out.medianDecisionHours.standard).toBe(4);
    expect(out.medianDecisionHours.senior).toBe(6);
    expect(out.medianDecisionHours.all).toBe(5);
  });

  it("labels a reviewer who left the organisation by id", () => {
    const out = run([decided(3, { reviewed_by: 99 })]);
    expect(out.reviewers[0]).toMatchObject({ userId: 99, name: "User 99" });
  });

  it("counts a superseded row with a review as a decision, and one without as a submission only", () => {
    const out = run([
      decided(3, { status: "superseded", decision_record: null, tier: "Low" }),
      row({ status: "superseded" }),
    ]);
    expect(out.totals.submissions).toBe(2);
    expect(out.reviewers).toHaveLength(1);
    expect(out.reviewers[0]).toMatchObject({ userId: 7, name: "Ada Lovelace", decisions: 1 });
    expect(out.medianDecisionHours.all).toBe(3);
  });

  it("flags a reviewer at 10 decisions with no band change, not at 9", () => {
    const ten = Array.from({ length: 10 }, () => decided(1));
    expect(run(ten).reviewers[0]).toMatchObject({ decisions: 10, bandChanged: 0, check: true });
    expect(run(ten.slice(0, 9)).reviewers[0].check).toBe(false);
    const withChange = [...ten, decided(1, { decision_record: record({ bandChanged: true }) })];
    expect(run(withChange).reviewers[0]).toMatchObject({ bandChanged: 1, check: false });
  });

  it("leaves unknown-band decisions out of band figures but still counts them as decisions", () => {
    const unknown = () =>
      decided(1, {
        routing: routing("senior"),
        decision_record: record({
          computedBand: null,
          bandInForce: null,
          bandChanged: true,
          lane: "senior",
        }),
      });
    const out = run([
      ...Array.from({ length: 10 }, unknown),
      decided(1, { routing: routing("senior"), decision_record: record({ lane: "senior" }) }),
    ]);
    expect(out.reviewers[0].decisions).toBe(11);
    expect(out.reviewers[0].bandChanged).toBe(0);
    expect(out.reviewers[0].check).toBe(false); // only one decision with a known band
    expect(out.bandKept).toEqual({ kept: 1, decided: 1, seniorKept: 1, seniorDecided: 1 });
  });

  it("falls back to assessment and override tiers when there is no usable record", () => {
    const out = run([
      decided(1, { decision_record: null, tier: "Medium", override_tier: "High" }),
      decided(1, { decision_record: null, tier: "Medium", override_tier: null }),
      decided(1, { decision_record: null, tier: null }),
    ]);
    expect(out.reviewers[0]).toMatchObject({ decisions: 3, bandChanged: 1 });
    expect(out.bandKept).toMatchObject({ kept: 1, decided: 2 });
  });

  it("counts redlines from the decision level for decided rows and the assessment for pending", () => {
    const out = run([
      decided(1, { decision_record: record({ level: "Prohibited" }), level: "Limited risk" }),
      decided(1, { decision_record: record({ level: "High risk" }) }),
      row({ level: "High risk" }),
      row({ level: "Prohibited" }),
      row({
        status: "rejected",
        reviewed_at: "2026-10-20T10:00:00Z",
        level: "Prohibited",
        decision_record: record({ level: "Limited risk" }),
      }),
    ]);
    expect(out.redlines).toEqual({ prohibited: 2, highRisk: 2 });
  });

  it("tallies suggestions over decided rows only", () => {
    const out = run([
      decided(1, { suggested_total: 5, suggested_accepted: 2 }),
      row({ suggested_total: 4, suggested_accepted: 4 }),
    ]);
    expect(out.suggestions).toEqual({ accepted: 2, suggested: 5 });
  });

  it("tallies second reviews", () => {
    const sr = (status: string, extra: any = {}) =>
      row({
        routing: routing("standard", "below_threshold", {
          secondReview: { status, selectedAt: "2026-10-20T00:00:00Z", ...extra },
        }),
      });
    const out = run([sr("open"), sr("agreed"), sr("missed")]);
    expect(out.secondReviews).toEqual({ completed: 2, missed: 1, open: 1 });
  });

  describe("needs attention", () => {
    const openReview = (selectedAt: string) =>
      row({
        routing: routing("standard", "below_threshold", {
          secondReview: { status: "open", selectedAt },
        }),
      });

    it("lists an open second review 4 days old but not one 2 days old", () => {
      const out = run([openReview("2026-10-17T11:00:00Z"), openReview("2026-10-19T12:00:00Z")]);
      expect(out.needsAttention.map((n) => n.kind)).toEqual(["second_review_open"]);
      expect(out.needsAttention[0].at).toBe("2026-10-17T11:00:00.000Z");
    });

    it("lists unresolved misses but not resolved ones", () => {
      const missed = (extra: any = {}) =>
        row({
          routing: routing("standard", "below_threshold", {
            secondReview: {
              status: "missed",
              selectedAt: "2026-10-18T00:00:00Z",
              reviewedAt: "2026-10-19T00:00:00Z",
              ...extra,
            },
          }),
        });
      const out = run([missed(), missed({ resolvedAt: "2026-10-20T00:00:00Z" })]);
      expect(out.needsAttention.map((n) => n.kind)).toEqual(["second_review_missed"]);
    });

    it("lists pending prohibited and pending older than 7 days", () => {
      const out = run([
        row({ level: "Prohibited", created_at: "2026-10-20T00:00:00Z" }),
        row({ created_at: "2026-10-10T00:00:00Z" }),
        row({ created_at: "2026-10-18T00:00:00Z" }),
        row({ level: "Prohibited", created_at: "2026-10-01T00:00:00Z" }),
      ]);
      expect(out.needsAttention.map((n) => n.kind)).toEqual([
        "prohibited_pending",
        "pending_old",
        "prohibited_pending",
      ]);
    });

    it("lists overdue items older than the window without counting them in the figures", () => {
      const out = run([
        row({ in_window: false, created_at: "2025-01-05T00:00:00Z", week_start: "2025-01-05" }),
        row({
          in_window: false,
          status: "approved",
          created_at: "2025-01-06T00:00:00Z",
          routing: routing("senior", "close_call", {
            secondReview: { status: "open", selectedAt: "2025-01-06T00:00:00Z" },
          }),
        }),
      ]);
      expect(out.needsAttention.map((n) => n.kind).sort()).toEqual([
        "pending_old",
        "second_review_open",
      ]);
      expect(out.totals.submissions).toBe(0);
      expect(out.secondReviews).toEqual({ completed: 0, missed: 0, open: 0 });
    });

    it("includes empty-lane forms, sorts newest first and caps at 20", () => {
      const rows = Array.from({ length: 25 }, (_, i) =>
        row({ created_at: new Date(Date.parse("2026-09-01T00:00:00Z") + i * HOUR).toISOString() }),
      );
      const out = run(rows, {
        emptyLaneForms: [{ id: 9, name: "Vendor intake", at: "2026-10-21T00:00:00Z" }],
      });
      expect(out.needsAttention).toHaveLength(20);
      expect(out.needsAttention[0]).toMatchObject({
        kind: "lane_empty",
        submissionId: null,
        formId: 9,
        title: "Vendor intake",
      });
    });

    it("keeps an old empty-lane form in the list when pending items fill the cap", () => {
      const rows = Array.from({ length: 25 }, (_, i) =>
        row({ created_at: new Date(Date.parse("2026-09-01T00:00:00Z") + i * HOUR).toISOString() }),
      );
      const out = run(rows, {
        emptyLaneForms: [{ id: 9, name: "Vendor intake", at: "2026-01-01T00:00:00Z" }],
      });
      expect(out.needsAttention).toHaveLength(20);
      expect(out.needsAttention[0]).toMatchObject({ kind: "lane_empty", formId: 9 });
    });
  });
});

describe("getIntakeOversightQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    nextId = 1;
  });

  it("scopes every query to the organisation and applies the form filter", async () => {
    sequelize.query.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM intake_submissions")) {
        return [decided(2, { suggested_total: "3" as any, suggested_accepted: "1" as any })];
      }
      if (sql.includes("FROM intake_forms")) {
        return [
          {
            id: 3,
            name: "A",
            updated_at: "2026-10-20T00:00:00Z",
            routing: { seniorReviewerIds: [1], standardReviewerIds: [2] },
          },
          {
            id: 4,
            name: "B",
            updated_at: "2026-10-19T00:00:00Z",
            routing: { seniorReviewerIds: [1], standardReviewerIds: [5] },
          },
        ];
      }
      return [{ id: 7, name: "Ada", surname: "Lovelace" }];
    });
    intake.getEligibleReviewerIdsQuery.mockResolvedValue([1, 2]);

    const out = await getIntakeOversightQuery(11, 8, 3, NOW);

    expect(sequelize.query).toHaveBeenCalledTimes(3);
    for (const [sql, options] of sequelize.query.mock.calls) {
      expect(sql).toContain("organization_id = :organizationId");
      expect(options.replacements.organizationId).toBe(11);
    }
    const [, rowsOptions] = sequelize.query.mock.calls[0];
    expect(rowsOptions.replacements.formId).toBe(3);
    expect(rowsOptions.replacements.since).toBe("2026-08-31T00:00:00.000Z");
    expect(intake.getEligibleReviewerIdsQuery).toHaveBeenCalledWith(
      11,
      expect.arrayContaining([1, 2, 5]),
    );
    expect(out.needsAttention).toEqual([
      {
        kind: "lane_empty",
        submissionId: null,
        formId: 4,
        title: "B",
        at: "2026-10-19T00:00:00.000Z",
      },
    ]);
    expect(out.suggestions).toEqual({ accepted: 1, suggested: 3 });
    expect(out.reviewers[0].name).toBe("Ada Lovelace");
  });
});
