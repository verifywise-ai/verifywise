import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../../utils/intakeForm.utils", () => ({
  updateSubmissionRoutingQuery: jest.fn<any>().mockResolvedValue(true),
  getSubmissionsByFormIdQuery: jest.fn<any>(),
}));
jest.mock("../../../utils/logger/logHelper", () => ({
  logSuccess: jest.fn<any>().mockResolvedValue(undefined),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { routeSubmission, rerouteFormPending, raiseForOverride } =
  require("../routingService") as typeof import("../routingService");
const intake = require("../../../utils/intakeForm.utils");
const { logSuccess } = require("../../../utils/logger/logHelper");
/* eslint-enable @typescript-eslint/no-require-imports */

const ROUTING = {
  enabled: true,
  seniorReviewerIds: [1],
  standardReviewerIds: [2],
  threshold: 50,
  closeCallMargin: 10,
  secondReviewRate: 10,
};
const form = (routing: any = ROUTING) => ({ id: 3, routing }) as any;
const sub = (over: any = {}) =>
  ({
    id: 9,
    status: "pending",
    routing: null,
    riskAssessment: {
      version: 2,
      status: "complete",
      classificationLevel: "High",
      finalScore: 72,
    },
    ...over,
  }) as any;
const NOW = new Date("2026-10-22T10:00:00.000Z");

beforeEach(() => jest.clearAllMocks());

describe("routeSubmission", () => {
  it("does nothing when routing is off", async () => {
    expect(await routeSubmission(sub(), form({ ...ROUTING, enabled: false }), 5)).toBeNull();
    expect(await routeSubmission(sub(), form(null), 5)).toBeNull();
    expect(intake.updateSubmissionRoutingQuery).not.toHaveBeenCalled();
  });

  it("does nothing for a decided submission", async () => {
    expect(await routeSubmission(sub({ status: "approved" }), form(), 5)).toBeNull();
    expect(intake.updateSubmissionRoutingQuery).not.toHaveBeenCalled();
  });

  it("waits while scoring is pending or the assessment is not v2", async () => {
    const pending = sub({ riskAssessment: { version: 2, status: "pending", finalScore: null } });
    const v1 = sub({ riskAssessment: { tier: "High", overallScore: 80 } });
    expect(await routeSubmission(pending, form(), 5)).toBeNull();
    expect(await routeSubmission(v1, form(), 5)).toBeNull();
    expect(await routeSubmission(sub({ riskAssessment: null }), form(), 5)).toBeNull();
    expect(intake.updateSubmissionRoutingQuery).not.toHaveBeenCalled();
  });

  it("leaves an escalated submission alone", async () => {
    const escalated = sub({
      routing: {
        lane: "senior",
        reason: "escalated",
        escalation: { by: 2, at: "x", reason: "y" },
      },
    });
    expect(await routeSubmission(escalated, form(), 5)).toBeNull();
    expect(intake.updateSubmissionRoutingQuery).not.toHaveBeenCalled();
  });

  it("writes and logs a senior lane for a settled score of 72", async () => {
    const routing = await routeSubmission(sub(), form(), 5, { now: NOW });
    expect(routing).toEqual({
      lane: "senior",
      reason: "at_or_above_threshold",
      score: 72,
      threshold: 50,
      closeCallMargin: 10,
      routedAt: NOW.toISOString(),
    });
    expect(intake.updateSubmissionRoutingQuery).toHaveBeenCalledWith(
      9,
      routing,
      5,
      undefined,
      null,
    );
    expect(logSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "routed submission 9 to senior: at_or_above_threshold",
        organizationId: 5,
      }),
    );
  });

  it("keeps a raised override senior when the new result is standard", async () => {
    const raised = sub({
      routing: { lane: "senior", reason: "override_raised", score: 90 },
      riskAssessment: {
        version: 2,
        status: "complete",
        classificationLevel: "Low",
        finalScore: 20,
      },
    });
    const routing = await routeSubmission(raised, form(), 5, { now: NOW });
    expect(routing).toMatchObject({ lane: "senior", reason: "override_raised", score: 20 });
  });

  it("preserves an existing second review", async () => {
    const secondReview = { status: "open", selectedAt: "2026-10-21T00:00:00.000Z" };
    const routing = await routeSubmission(
      sub({ routing: { lane: "standard", reason: "below_threshold", secondReview } }),
      form(),
      5,
    );
    expect(routing?.secondReview).toEqual(secondReview);
  });
});

describe("rerouteFormPending", () => {
  it("routes each pending submission and counts the changed ones", async () => {
    const unchanged = sub({
      id: 10,
      routing: {
        lane: "senior",
        reason: "at_or_above_threshold",
        score: 72,
        threshold: 50,
        closeCallMargin: 10,
      },
    });
    const notScored = sub({
      id: 11,
      riskAssessment: { version: 2, status: "pending", finalScore: null },
    });
    intake.getSubmissionsByFormIdQuery.mockResolvedValueOnce([sub(), unchanged, notScored]);

    expect(await rerouteFormPending(form(), 5)).toBe(1);
    expect(intake.getSubmissionsByFormIdQuery).toHaveBeenCalledWith(3, 5, "pending", 200, 0);
    expect(intake.updateSubmissionRoutingQuery).toHaveBeenCalledTimes(2);
  });
});

describe("lost race", () => {
  it("routeSubmission returns null and logs nothing when the guarded write lands on no row", async () => {
    intake.updateSubmissionRoutingQuery.mockResolvedValueOnce(false);
    expect(await routeSubmission(sub(), form(), 5)).toBeNull();
    expect(logSuccess).not.toHaveBeenCalled();
  });

  it("passes the routing it read as the expected value", async () => {
    const read = { lane: "standard", reason: "below_threshold", score: 10 };
    await routeSubmission(sub({ routing: read }), form(), 5);
    expect(intake.updateSubmissionRoutingQuery.mock.calls[0][4]).toBe(read);
  });

  it("raiseForOverride returns null and logs nothing when the guarded write lands on no row", async () => {
    intake.updateSubmissionRoutingQuery.mockResolvedValueOnce(false);
    const standard = sub({ routing: { lane: "standard", reason: "below_threshold", score: 10 } });
    expect(await raiseForOverride(standard, form(), "Critical", 5)).toBeNull();
    expect(logSuccess).not.toHaveBeenCalled();
  });
});

describe("raiseForOverride", () => {
  const standard = (over: any = {}) =>
    sub({ routing: { lane: "standard", reason: "below_threshold", score: 10 }, ...over });

  it("raises a standard lane to senior with reason override_raised", async () => {
    const routing = await raiseForOverride(standard(), form(), "Critical", 5, { now: NOW });
    expect(routing).toMatchObject({ lane: "senior", reason: "override_raised", score: 76 });
    expect(logSuccess).toHaveBeenCalledTimes(1);
  });

  it("raises an unrouted submission too", async () => {
    expect(await raiseForOverride(sub(), form(), "High", 5)).toMatchObject({ lane: "senior" });
  });

  it("does not lower, re-write or touch escalated, off, below-threshold or decided ones", async () => {
    const senior = sub({ routing: { lane: "senior", reason: "close_call", score: 52 } });
    expect(await raiseForOverride(senior, form(), "Low", 5)).toBeNull();
    expect(await raiseForOverride(standard(), form(), "Low", 5)).toBeNull();
    expect(
      await raiseForOverride(standard(), form({ ...ROUTING, enabled: false }), "High", 5),
    ).toBeNull();
    expect(await raiseForOverride(standard({ status: "approved" }), form(), "High", 5)).toBeNull();
    expect(intake.updateSubmissionRoutingQuery).not.toHaveBeenCalled();
  });
});
