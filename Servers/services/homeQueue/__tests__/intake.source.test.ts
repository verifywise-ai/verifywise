jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
}));

import { sequelize } from "../../../database/db";
import { intakeSource, isIntakeReviewFor } from "../sources/intake.source";
import type { HomeQueueContext } from "../../../domain.layer/interfaces/i.homeQueue";
import type { IFormRouting } from "../../../domain.layer/interfaces/i.intakeForm";
import type { ISubmissionRouting } from "../../../domain.layer/interfaces/i.intakeSubmission";

const query = sequelize.query as unknown as jest.Mock;

const ME = 5;
const OTHER = 9;

const routingOn: IFormRouting = {
  enabled: true,
  seniorReviewerIds: [ME],
  standardReviewerIds: [OTHER],
  threshold: 50,
  closeCallMargin: 10,
  secondReviewRate: 10,
};
const routingOff: IFormRouting = { ...routingOn, enabled: false };

const lane = (l: "senior" | "standard", extra: Partial<ISubmissionRouting> = {}) =>
  ({
    lane: l,
    reason: "below_threshold",
    score: 20,
    threshold: 50,
    closeCallMargin: 10,
    routedAt: "2026-11-10T00:00:00.000Z",
    ...extra,
  }) as ISubmissionRouting;

const pending = (routing: ISubmissionRouting | null = null) => ({
  status: "pending",
  reviewedBy: null,
  routing,
});

const approvedWithSecond = (
  secondReview: ISubmissionRouting["secondReview"],
  reviewedBy: number = OTHER,
) => ({
  status: "approved",
  reviewedBy,
  routing: lane("standard", { secondReview }),
});

describe("isIntakeReviewFor", () => {
  it("pending, routing off: any holder of intakeForm.edit reviews it", () => {
    expect(isIntakeReviewFor(ME, pending(lane("standard")), routingOff, false)).toBe("review");
    expect(isIntakeReviewFor(ME, pending(), null, false)).toBe("review");
  });

  it("pending, routing on, my lane: review", () => {
    expect(isIntakeReviewFor(ME, pending(lane("senior")), routingOn, false)).toBe("review");
    // Senior reviewers can decide the standard lane too (laneReviewerIdsFor).
    expect(isIntakeReviewFor(ME, pending(lane("standard")), routingOn, false)).toBe("review");
    expect(isIntakeReviewFor(OTHER, pending(lane("standard")), routingOn, false)).toBe("review");
  });

  it("pending, routing on, another lane: not mine, even for an Admin who could override", () => {
    expect(isIntakeReviewFor(OTHER, pending(lane("senior")), routingOn, true)).toBeNull();
    expect(isIntakeReviewFor(42, pending(lane("standard")), routingOn, true)).toBeNull();
  });

  it("pending, routing on, no lane stored yet: any holder reviews it", () => {
    expect(isIntakeReviewFor(42, pending(null), routingOn, false)).toBe("review");
  });

  it("pending, routing on, a lane with no reviewers named: Admins can decide it, so they see it", () => {
    const noSeniors = { ...routingOn, seniorReviewerIds: [] };
    expect(isIntakeReviewFor(42, pending(lane("senior")), noSeniors, true)).toBe("review");
  });

  it("pending, routing on, a lane with no reviewers named: a non-admin editor can't decide it", () => {
    const noSeniors = { ...routingOn, seniorReviewerIds: [] };
    expect(isIntakeReviewFor(42, pending(lane("senior")), noSeniors, false)).toBeNull();
  });

  it("pending, routing on, a named lane: unchanged for Admins, who only see lanes naming them", () => {
    expect(isIntakeReviewFor(42, pending(lane("senior")), routingOn, true)).toBeNull();
    expect(isIntakeReviewFor(ME, pending(lane("senior")), routingOn, true)).toBe("review");
  });

  it("tolerates a form routing object stored without reviewer lists", () => {
    const partial = { enabled: true } as unknown as IFormRouting;
    expect(isIntakeReviewFor(ME, pending(lane("senior")), partial, false)).toBeNull();
    expect(isIntakeReviewFor(ME, pending(lane("senior")), partial, true)).toBe("review");
    expect(isIntakeReviewFor(ME, pending(null), partial, false)).toBe("review");
  });

  it("approved with a second review open, I am a senior reviewer: second-review", () => {
    const sub = approvedWithSecond({ status: "open", selectedAt: "2026-11-11T09:00:00.000Z" });
    expect(isIntakeReviewFor(ME, sub, routingOn, false)).toBe("second-review");
  });

  it("second review stays with senior reviewers after routing is turned off", () => {
    const sub = approvedWithSecond({ status: "open", selectedAt: "2026-11-11T09:00:00.000Z" });
    expect(isIntakeReviewFor(ME, sub, routingOff, false)).toBe("second-review");
  });

  it("second review with no senior reviewer named goes to Admins, not to the first approver", () => {
    const noSeniors: IFormRouting = { ...routingOn, seniorReviewerIds: [] };
    const sub = approvedWithSecond({ status: "open", selectedAt: "2026-11-11T09:00:00.000Z" });
    expect(isIntakeReviewFor(42, sub, noSeniors, true)).toBe("second-review");
    expect(isIntakeReviewFor(42, sub, null, true)).toBe("second-review");
    expect(isIntakeReviewFor(42, sub, noSeniors, false)).toBeNull();
    const own = approvedWithSecond({ status: "open", selectedAt: "2026-11-11T09:00:00.000Z" }, 42);
    expect(isIntakeReviewFor(42, own, noSeniors, true)).toBeNull();
  });

  it("second review is never shown to the first approver", () => {
    const sub = approvedWithSecond({ status: "open", selectedAt: "2026-11-11T09:00:00.000Z" }, ME);
    expect(isIntakeReviewFor(ME, sub, routingOn, false)).toBeNull();
  });

  it("second review is not shown to someone who is not a senior reviewer", () => {
    const sub = approvedWithSecond({ status: "open", selectedAt: "2026-11-11T09:00:00.000Z" }, ME);
    expect(isIntakeReviewFor(OTHER, sub, routingOn, false)).toBeNull();
  });

  it("a missed second review still needs resolving: second-review until resolved", () => {
    const missed = approvedWithSecond({ status: "missed", selectedAt: "2026-11-11T09:00:00.000Z" });
    expect(isIntakeReviewFor(ME, missed, routingOn, false)).toBe("second-review");

    const resolved = approvedWithSecond({
      status: "missed",
      selectedAt: "2026-11-11T09:00:00.000Z",
      resolvedAt: "2026-11-12T09:00:00.000Z",
    });
    expect(isIntakeReviewFor(ME, resolved, routingOn, false)).toBeNull();
  });

  it("an agreed second review, or an approval without one, needs nobody", () => {
    const agreed = approvedWithSecond({ status: "agreed", selectedAt: "2026-11-11T09:00:00.000Z" });
    expect(isIntakeReviewFor(ME, agreed, routingOn, false)).toBeNull();
    expect(
      isIntakeReviewFor(
        ME,
        { status: "approved", reviewedBy: OTHER, routing: null },
        routingOn,
        false,
      ),
    ).toBeNull();
  });

  it("rejected or superseded: null", () => {
    expect(
      isIntakeReviewFor(
        ME,
        { status: "rejected", reviewedBy: OTHER, routing: null },
        routingOff,
        false,
      ),
    ).toBeNull();
    expect(
      isIntakeReviewFor(
        ME,
        { status: "superseded", reviewedBy: null, routing: null },
        routingOff,
        false,
      ),
    ).toBeNull();
  });
});

describe("intakeSource", () => {
  const ctx = (permissions: string[] = ["intakeForm.edit"], isAdmin = false): HomeQueueContext => ({
    organizationId: 7,
    userId: ME,
    isAdmin,
    can: (key) => permissions.includes(key),
    today: "2026-11-14",
  });

  beforeEach(() => query.mockReset());

  it("is the record-part intake source, visible only with intakeForm.edit", () => {
    expect(intakeSource.id).toBe("intake");
    expect(intakeSource.part).toBe("record");
    expect(intakeSource.isVisible(ctx())).toBe(true);
    expect(intakeSource.isVisible(ctx([]))).toBe(false);
    expect(intakeSource.isVisible(ctx(["aiApproval.admin"]))).toBe(false);
  });

  it("reads only this organization's open candidates and maps the ones that are mine", async () => {
    query.mockResolvedValueOnce([
      {
        id: 11,
        status: "pending",
        reviewed_by: null,
        routing: lane("senior"),
        submitter_name: "Dana Legal",
        submitter_email: "dana@example.com",
        created_at: new Date("2026-11-10T08:30:00.000Z"),
        form_name: "AI use case request",
        form_routing: routingOn,
      },
      {
        // Another lane: not mine.
        id: 12,
        status: "pending",
        reviewed_by: null,
        routing: lane("senior"),
        submitter_name: null,
        submitter_email: null,
        created_at: "2026-11-09T00:00:00.000Z",
        form_name: "Vendor intake",
        form_routing: { ...routingOn, seniorReviewerIds: [OTHER] },
      },
      {
        id: 13,
        status: "approved",
        reviewed_by: OTHER,
        routing: lane("standard", {
          secondReview: { status: "open", selectedAt: "2026-11-12T10:00:00.000Z" },
        }),
        submitter_name: null,
        submitter_email: "sam@example.com",
        created_at: "2026-11-01T00:00:00.000Z",
        form_name: "AI use case request",
        form_routing: routingOn,
      },
      {
        // Anonymous, routing off, no lane.
        id: 14,
        status: "pending",
        reviewed_by: null,
        routing: null,
        submitter_name: null,
        submitter_email: null,
        created_at: "2026-11-13T00:00:00.000Z",
        form_name: "Model request",
        form_routing: null,
      },
    ]);

    const items = await intakeSource.load(ctx());

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, options] = query.mock.calls[0];
    expect(options.replacements).toEqual(
      expect.objectContaining({ organizationId: 7, pending: "pending", approved: "approved" }),
    );
    expect(sql).toContain("s.organization_id = :organizationId");
    expect(sql).toContain("f.organization_id = s.organization_id");
    expect(sql).toContain("s.routing->'secondReview'->>'status' = 'open'");
    expect(sql).toContain("s.routing->'secondReview'->>'resolvedAt' IS NULL");

    expect(items).toEqual([
      {
        id: "intake:11",
        source: "intake",
        part: "record",
        entityType: "intake_submission",
        entityId: 11,
        name: "Dana Legal",
        url: "/intake-forms/submissions?submission=11",
        dueDate: null,
        waitingSince: "2026-11-10T08:30:00.000Z",
        overdue: false,
        meta: { kind: "review", formName: "AI use case request", lane: "senior" },
      },
      {
        id: "intake:13",
        source: "intake",
        part: "record",
        entityType: "intake_submission",
        entityId: 13,
        name: "sam@example.com",
        url: "/intake-forms/submissions?submission=13",
        dueDate: null,
        // A second review waits from when it was opened, not from submission.
        waitingSince: "2026-11-12T10:00:00.000Z",
        overdue: false,
        meta: { kind: "second-review", formName: "AI use case request", lane: "standard" },
      },
      {
        id: "intake:14",
        source: "intake",
        part: "record",
        entityType: "intake_submission",
        entityId: 14,
        name: "",
        url: "/intake-forms/submissions?submission=14",
        dueDate: null,
        waitingSince: "2026-11-13T00:00:00.000Z",
        overdue: false,
        meta: { kind: "review", formName: "Model request", lane: null },
      },
    ]);
  });

  it("passes the caller's Admin standing through, so an unnamed lane reaches an Admin only", async () => {
    const row = {
      id: 21,
      status: "pending",
      reviewed_by: null,
      routing: lane("senior"),
      submitter_name: "Ana",
      submitter_email: null,
      created_at: "2026-11-12T00:00:00.000Z",
      form_name: "AI use case request",
      form_routing: { ...routingOn, seniorReviewerIds: [] },
    };
    query.mockResolvedValueOnce([row]);
    expect(await intakeSource.load(ctx(["intakeForm.edit"], false))).toEqual([]);

    query.mockResolvedValueOnce([row]);
    const [item] = await intakeSource.load(ctx(["intakeForm.edit"], true));
    expect(item).toEqual(
      expect.objectContaining({
        id: "intake:21",
        meta: { kind: "review", formName: "AI use case request", lane: "senior" },
      }),
    );
  });

  it("lets a database error propagate so the runner marks the source unavailable", async () => {
    query.mockRejectedValueOnce(new Error("boom"));
    await expect(intakeSource.load(ctx())).rejects.toThrow("boom");
  });
});
