jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../emailService", () => ({ sendEmail: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import {
  backfillSubmitterConfirmations,
  ConfirmationDeps,
  reviewerIdsFor,
  sendSubmitterConfirmationOnce,
  trySendSubmitterConfirmation,
} from "../confirmation";
import { IntakeSubmissionStatus } from "../../../domain.layer/enums/intake-submission-status.enum";
import type { IFormRouting, IIntakeForm } from "../../../domain.layer/interfaces/i.intakeForm";
import type {
  IIntakeSubmission,
  ISubmissionRouting,
} from "../../../domain.layer/interfaces/i.intakeSubmission";

const ORG = 7;
const NOW = new Date("2026-11-02T10:00:00Z"); // Monday

const ROUTING: IFormRouting = {
  enabled: true,
  seniorReviewerIds: [1, 2],
  standardReviewerIds: [3],
  threshold: 50,
  closeCallMargin: 10,
  secondReviewRate: 0,
};

const USERS: Record<number, { name: string; surname: string }> = {
  1: { name: "Ann", surname: "Lee" },
  2: { name: "Ben", surname: "Ross" },
  3: { name: "Cem", surname: "Tan" },
  4: { name: "Dee", surname: "Fox" },
  5: { name: "Eli", surname: "Roe" },
  9: { name: "Gus", surname: "Hall" },
};

const form = (overrides: Partial<IIntakeForm> = {}): IIntakeForm =>
  ({
    id: 5,
    name: "AI intake",
    slug: "ai-intake",
    publicId: "abcd1234abcd1234",
    recipients: [9],
    routing: ROUTING,
    reviewDays: 3,
    ...overrides,
  }) as unknown as IIntakeForm;

const lane = (l: "senior" | "standard"): ISubmissionRouting =>
  ({ lane: l, reason: l === "senior" ? "close_call" : "below_threshold" }) as ISubmissionRouting;

const submission = (overrides: Partial<IIntakeSubmission> = {}): IIntakeSubmission =>
  ({
    id: 11,
    formId: 5,
    status: IntakeSubmissionStatus.PENDING,
    submitterName: "Jane Doe",
    submitterEmail: "jane@example.com",
    routing: null,
    reviewDueDate: "2026-11-05",
    confirmationSentAt: null,
    createdAt: NOW,
    ...overrides,
  }) as unknown as IIntakeSubmission;

/**
 * In-memory submissions and an atomic claim keyed by submission id, so the
 * idempotency tests exercise the same "first caller wins" contract as the SQL.
 */
function harness(
  subs: IIntakeSubmission[],
  f: IIntakeForm = form(),
  overrides: Partial<ConfirmationDeps> = {},
) {
  const rows = new Map(subs.map((s) => [s.id, { ...s }]));
  const deps: Partial<ConfirmationDeps> = {
    getSubmission: jest.fn(async (id: number) => {
      const row = rows.get(id);
      return row ? { ...row } : null;
    }),
    getForm: jest.fn(async () => f),
    getReviewers: jest.fn(async (_org: number, ids?: number[]) =>
      (ids ?? []).map((id) => ({ id, email: `${id}@x.io`, ...USERS[id] })),
    ),
    getTenantSlug: jest.fn(async () => "acme"),
    claim: jest.fn(async (id: number, _org: number, due: string) => {
      const row = rows.get(id);
      if (!row || row.confirmationSentAt) return false;
      row.confirmationSentAt = NOW;
      row.reviewDueDate = row.reviewDueDate ?? due;
      return true;
    }),
    send: jest.fn(async () => undefined),
    listAwaiting: jest.fn(async () => subs.map((s) => ({ id: s.id, organizationId: ORG }))),
    createToken: jest.fn(() => "signed-token"),
    now: () => NOW,
    timeZone: "UTC",
    ...overrides,
  };
  const send = deps.send as jest.Mock;
  /** The review sentence (last argument) of each email sent. */
  const sentences = () => send.mock.calls.map((c) => c[9] as string);
  return { deps, rows, send, sentences };
}

describe("reviewerIdsFor", () => {
  it("names the assigned lane's reviewers", () => {
    expect(reviewerIdsFor(form(), { routing: lane("senior") }, false)).toEqual([1, 2]);
    expect(reviewerIdsFor(form(), { routing: lane("standard") }, false)).toEqual([3]);
  });

  it("waits for the lane while routing is on", () => {
    expect(reviewerIdsFor(form(), { routing: null }, false)).toBe("wait");
  });

  it("falls back to no names once routing failed or timed out", () => {
    expect(reviewerIdsFor(form(), { routing: null }, true)).toEqual([]);
  });

  it("does not wait when neither lane has a reviewer", () => {
    const empty = form({
      routing: { ...ROUTING, seniorReviewerIds: [], standardReviewerIds: [] },
    });
    expect(reviewerIdsFor(empty, { routing: null }, false)).toEqual([]);
  });

  it("names the form's recipients when routing is off", () => {
    expect(reviewerIdsFor(form({ routing: null }), { routing: null }, false)).toEqual([9]);
    const off = form({ routing: { ...ROUTING, enabled: false }, recipients: [] });
    expect(reviewerIdsFor(off, { routing: null }, false)).toEqual([]);
  });
});

describe("sendSubmitterConfirmationOnce", () => {
  it("waits, sending nothing, while routing has not picked a lane", async () => {
    const h = harness([submission()]);
    expect(await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps)).toBe(
      false,
    );
    expect(h.send).not.toHaveBeenCalled();
    expect(h.deps.claim).not.toHaveBeenCalled();
  });

  it("names the lane's reviewers and the stored due date once routed", async () => {
    const h = harness([submission({ routing: lane("senior") })]);
    expect(await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps)).toBe(
      true,
    );
    expect(h.send).toHaveBeenCalledWith(
      "jane@example.com",
      "Jane Doe",
      "AI intake",
      11,
      "signed-token",
      "abcd1234abcd1234",
      undefined,
      "ai-intake",
      "en",
      "Ann Lee and Ben Ross will review your submission within 3 business days, by Thursday, November 5, 2026.",
    );
    expect(h.deps.createToken).toHaveBeenCalledWith({
      submissionId: 11,
      formId: 5,
      email: "jane@example.com",
      timestamp: NOW.getTime(),
    });
  });

  it("lists three reviewers then counts the others", async () => {
    const big = form({ routing: { ...ROUTING, standardReviewerIds: [1, 2, 3, 4, 5] } });
    const h = harness([submission({ routing: lane("standard") })], big);
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps);
    expect(h.sentences()[0]).toMatch(/^Ann Lee, Ben Ross, Cem Tan and 2 others will review/);
  });

  it("names the governance team on the fallback path", async () => {
    const h = harness([submission()]);
    expect(await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: true }, h.deps)).toBe(
      true,
    );
    expect(h.sentences()).toEqual([
      "The governance team will review your submission within 3 business days, by Thursday, November 5, 2026.",
    ]);
  });

  it("names the governance team when the lane has no reviewers", async () => {
    const noStandard = form({ routing: { ...ROUTING, standardReviewerIds: [] } });
    const h = harness([submission({ routing: lane("standard") })], noStandard);
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps);
    expect(h.sentences()[0]).toMatch(/^The governance team will review/);
  });

  it("names the governance team when the reviewer lookup fails", async () => {
    const h = harness([submission({ routing: lane("senior") })], form(), {
      getReviewers: jest.fn(async () => {
        throw new Error("db down");
      }),
    });
    expect(await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps)).toBe(
      true,
    );
    expect(h.sentences()[0]).toMatch(/^The governance team will review/);
  });

  it("sends immediately with the recipients' names when routing is off", async () => {
    const h = harness([submission()], form({ routing: null }));
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps);
    expect(h.sentences()[0]).toMatch(/^Gus Hall will review/);
  });

  it("sends exactly once when the routing path and the cap both fire", async () => {
    const h = harness([submission({ routing: lane("senior") })]);
    const results = await Promise.all([
      sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps),
      sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: true }, h.deps),
    ]);
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: true }, h.deps);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("skips without sending when another caller holds the claim", async () => {
    const h = harness([submission({ routing: lane("senior") })], form(), {
      claim: jest.fn(async () => false),
    });
    expect(await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: true }, h.deps)).toBe(
      false,
    );
    expect(h.send).not.toHaveBeenCalled();
  });

  it("leaves the claim for the next path when building the email fails", async () => {
    const h = harness([submission({ routing: lane("senior") })], form(), {
      createToken: jest.fn(() => {
        throw new Error("no signing secret");
      }),
    });
    await expect(
      sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: true }, h.deps),
    ).rejects.toThrow("no signing secret");
    expect(h.deps.claim).not.toHaveBeenCalled();
    expect(h.rows.get(11)?.confirmationSentAt).toBeNull();
  });

  it("gives a resubmission its own email", async () => {
    const original = submission({ routing: lane("senior") });
    const resubmission = submission({ id: 12, originalSubmissionId: 11 });
    const h = harness([original, resubmission]);
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps);
    await sendSubmitterConfirmationOnce(ORG, 12, "en", { fallback: true }, h.deps);
    expect(h.send.mock.calls.map((c) => c[3])).toEqual([11, 12]);
  });

  it("skips decided, already confirmed and email-less submissions", async () => {
    const h = harness([
      submission({ id: 21, status: IntakeSubmissionStatus.APPROVED }),
      submission({ id: 22, confirmationSentAt: NOW }),
      submission({ id: 23, submitterEmail: null as unknown as string }),
    ]);
    for (const id of [21, 22, 23, 99]) {
      expect(await sendSubmitterConfirmationOnce(ORG, id, "en", { fallback: true }, h.deps)).toBe(
        false,
      );
    }
    expect(h.send).not.toHaveBeenCalled();
    expect(h.deps.claim).not.toHaveBeenCalled();
  });

  it("computes and stores the due date when none was fixed at submit", async () => {
    // Submitted on a Friday, 2 business days: Tuesday.
    const h = harness(
      [submission({ reviewDueDate: null, createdAt: new Date("2026-11-06T16:00:00Z") })],
      form({ reviewDays: 2, routing: null }),
    );
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps);
    expect(h.deps.claim).toHaveBeenCalledWith(11, ORG, "2026-11-10");
    expect(h.sentences()[0]).toContain("within 2 business days, by Tuesday, November 10, 2026.");
  });

  it("uses the legacy tenant link for a form without a public id", async () => {
    const h = harness([submission()], form({ publicId: null, routing: null }));
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps);
    const call = h.send.mock.calls[0];
    expect(call[5]).toBeUndefined();
    expect(call[6]).toBe("acme");
    expect(call[7]).toBe("ai-intake");
  });
});

describe("trySendSubmitterConfirmation", () => {
  it("never throws", async () => {
    const h = harness([submission()], form(), {
      getSubmission: jest.fn(async () => {
        throw new Error("db down");
      }),
    });
    await expect(
      trySendSubmitterConfirmation(ORG, 11, "en", { fallback: true }, h.deps),
    ).resolves.toBeUndefined();
  });
});

describe("backfillSubmitterConfirmations", () => {
  it("sends each awaiting confirmation with the fallback, once", async () => {
    const h = harness([
      submission({ id: 31 }),
      submission({ id: 32, routing: lane("standard") }),
      submission({ id: 33, confirmationSentAt: NOW }),
    ]);
    expect(await backfillSubmitterConfirmations(h.deps)).toBe(2);
    expect(h.sentences()).toEqual([
      expect.stringMatching(/^The governance team will review/),
      expect.stringMatching(/^Cem Tan will review/),
    ]);
    expect(await backfillSubmitterConfirmations(h.deps)).toBe(0);
  });
});
