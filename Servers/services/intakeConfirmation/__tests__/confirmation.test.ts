jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../emailService", () => ({ sendEmail: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../../utils/intakeForm.utils", () => ({
  ...(jest.requireActual("../../../utils/intakeForm.utils") as object),
  getFormReviewDaysQuery: jest.fn(),
}));

import {
  ConfirmationDeps,
  reviewerIdsFor,
  reviewTimeAtSubmit,
  sendSubmitterConfirmationOnce,
  sweepSubmitterConfirmations,
  trySendSubmitterConfirmation,
} from "../confirmation";
import { getFormReviewDaysQuery } from "../../../utils/intakeForm.utils";
import { IntakeSubmissionStatus } from "../../../domain.layer/enums/intake-submission-status.enum";
import type { IFormRouting } from "../../../domain.layer/interfaces/i.intakeForm";
import type {
  ISubmissionConfirmationRow,
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

const lane = (l: "senior" | "standard"): ISubmissionRouting =>
  ({ lane: l, reason: l === "senior" ? "close_call" : "below_threshold" }) as ISubmissionRouting;

const row = (overrides: Partial<ISubmissionConfirmationRow> = {}): ISubmissionConfirmationRow => ({
  id: 11,
  formId: 5,
  status: IntakeSubmissionStatus.PENDING,
  submitterName: "Jane Doe",
  submitterEmail: "jane@example.com",
  routing: null,
  reviewDays: 3,
  reviewDueDate: "2026-11-05",
  confirmationSentAt: null,
  formExists: true,
  formName: "AI intake",
  formSlug: "ai-intake",
  formPublicId: "abcd1234abcd1234",
  formRouting: ROUTING,
  formRecipients: [9],
  ...overrides,
});

/**
 * In-memory rows and an atomic claim keyed by submission id, so the
 * idempotency tests exercise the same "first caller wins" contract as the SQL.
 */
function harness(rowsIn: ISubmissionConfirmationRow[], overrides: Partial<ConfirmationDeps> = {}) {
  const rows = new Map(rowsIn.map((r) => [r.id, { ...r }]));
  const deps: Partial<ConfirmationDeps> = {
    getSubmission: jest.fn(async (id: number) => {
      const r = rows.get(id);
      return r ? { ...r } : null;
    }),
    getReviewers: jest.fn(async (_org: number, ids?: number[]) =>
      (ids ?? []).map((id) => ({ id, email: `${id}@x.io`, ...USERS[id] })),
    ),
    getTenantSlug: jest.fn(async () => "acme"),
    claim: jest.fn(async (id: number) => {
      const r = rows.get(id);
      if (!r || r.confirmationSentAt || r.status !== IntakeSubmissionStatus.PENDING) return false;
      r.confirmationSentAt = NOW;
      return true;
    }),
    release: jest.fn(async (id: number) => {
      const r = rows.get(id);
      if (r) r.confirmationSentAt = null;
    }),
    send: jest.fn(async () => true),
    listAwaiting: jest.fn(async () =>
      [...rows.values()]
        .filter((r) => !r.confirmationSentAt)
        .map((r) => ({ id: r.id, organizationId: ORG })),
    ),
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

/** A send that fails once, then succeeds. */
const flakySend = () => {
  const send = jest.fn(async () => true);
  send.mockResolvedValueOnce(false);
  return send;
};

describe("reviewerIdsFor", () => {
  it("names the assigned lane's reviewers", () => {
    expect(reviewerIdsFor(ROUTING, [9], lane("senior"), false)).toEqual([1, 2]);
    expect(reviewerIdsFor(ROUTING, [9], lane("standard"), false)).toEqual([3]);
  });

  it("waits for the lane while routing is on", () => {
    expect(reviewerIdsFor(ROUTING, [9], null, false)).toBe("wait");
  });

  it("falls back to no names once routing failed or timed out", () => {
    expect(reviewerIdsFor(ROUTING, [9], null, true)).toEqual([]);
  });

  it("does not wait when neither lane has a reviewer", () => {
    const empty = { ...ROUTING, seniorReviewerIds: [], standardReviewerIds: [] };
    expect(reviewerIdsFor(empty, [9], null, false)).toEqual([]);
  });

  it("names the form's recipients when routing is off", () => {
    expect(reviewerIdsFor(null, [9], null, false)).toEqual([9]);
    expect(reviewerIdsFor({ ...ROUTING, enabled: false }, null, null, false)).toEqual([]);
  });
});

describe("sendSubmitterConfirmationOnce", () => {
  it("waits, sending nothing, while routing has not picked a lane", async () => {
    const h = harness([row()]);
    expect(await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps)).toBe(
      false,
    );
    expect(h.send).not.toHaveBeenCalled();
    expect(h.deps.claim).not.toHaveBeenCalled();
  });

  it("names the lane's reviewers and the review time stored at submit", async () => {
    const h = harness([row({ routing: lane("senior") })]);
    expect(await sendSubmitterConfirmationOnce(ORG, 11, "de", { fallback: false }, h.deps)).toBe(
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
      "de",
      // English, like the rest of the email body, whatever the language.
      "Ann Lee and Ben Ross will review your submission within 3 business days, by Thursday, November 5, 2026.",
    );
    expect(h.deps.createToken).toHaveBeenCalledWith({
      submissionId: 11,
      formId: 5,
      email: "jane@example.com",
      timestamp: NOW.getTime(),
    });
  });

  it("uses the days stored at submit, never the form's current setting", async () => {
    const h = harness([
      row({ routing: lane("standard"), reviewDays: 10, reviewDueDate: "2026-11-16" }),
    ]);
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps);
    expect(h.sentences()[0]).toBe(
      "Cem Tan will review your submission within 10 business days, by Monday, November 16, 2026.",
    );
  });

  it("leaves out the time and date when the due date has passed", async () => {
    const h = harness([row({ reviewDueDate: "2026-10-30" })]);
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: true }, h.deps);
    expect(h.sentences()).toEqual(["The governance team will review your submission."]);
  });

  it("leaves out the time and date when none was stored", async () => {
    const h = harness([row({ routing: lane("standard"), reviewDays: null, reviewDueDate: null })]);
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps);
    expect(h.sentences()).toEqual(["Cem Tan will review your submission."]);
  });

  it("lists three reviewers then counts the others", async () => {
    const big = { ...ROUTING, standardReviewerIds: [1, 2, 3, 4, 5] };
    const h = harness([row({ routing: lane("standard"), formRouting: big })]);
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps);
    expect(h.sentences()[0]).toMatch(/^Ann Lee, Ben Ross, Cem Tan and 2 others will review/);
  });

  it("names the governance team on the fallback path", async () => {
    const h = harness([row()]);
    expect(await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: true }, h.deps)).toBe(
      true,
    );
    expect(h.sentences()).toEqual([
      "The governance team will review your submission within 3 business days, by Thursday, November 5, 2026.",
    ]);
  });

  it("names the governance team when the lane has no reviewers", async () => {
    const noStandard = { ...ROUTING, standardReviewerIds: [] };
    const h = harness([row({ routing: lane("standard"), formRouting: noStandard })]);
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps);
    expect(h.sentences()[0]).toMatch(/^The governance team will review/);
  });

  it("names the governance team when the reviewer lookup fails", async () => {
    const h = harness([row({ routing: lane("senior") })], {
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
    const h = harness([row({ formRouting: null })]);
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps);
    expect(h.sentences()[0]).toMatch(/^Gus Hall will review/);
  });

  it("sends exactly once when the routing path and the cap both fire", async () => {
    const h = harness([row({ routing: lane("senior") })]);
    const results = await Promise.all([
      sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps),
      sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: true }, h.deps),
    ]);
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: true }, h.deps);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("releases the claim when the send fails, so a later path retries", async () => {
    const send = flakySend();
    const h = harness([row({ routing: lane("senior") })], { send });

    expect(await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: true }, h.deps)).toBe(
      false,
    );
    expect(h.deps.release).toHaveBeenCalledWith(11, ORG);
    expect(h.rows.get(11)?.confirmationSentAt).toBeNull();

    expect(await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: true }, h.deps)).toBe(
      true,
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(h.rows.get(11)?.confirmationSentAt).toEqual(NOW);
  });

  it("marks a submission whose form was deleted as handled, sending nothing", async () => {
    const h = harness([row({ formExists: false, formName: null, formRouting: null })]);
    expect(await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: true }, h.deps)).toBe(
      false,
    );
    expect(h.send).not.toHaveBeenCalled();
    expect(h.rows.get(11)?.confirmationSentAt).toEqual(NOW);
    // So the sweep no longer lists it.
    expect(await sweepSubmitterConfirmations(h.deps)).toBe(0);
    expect(h.deps.getSubmission).toHaveBeenCalledTimes(1);
  });

  it("leaves the claim for the next path when building the email fails", async () => {
    const h = harness([row({ routing: lane("senior") })], {
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
    const h = harness([row({ routing: lane("senior") }), row({ id: 12 })]);
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps);
    await sendSubmitterConfirmationOnce(ORG, 12, "en", { fallback: true }, h.deps);
    expect(h.send.mock.calls.map((c) => c[3])).toEqual([11, 12]);
  });

  it("skips decided, already confirmed and email-less submissions", async () => {
    const h = harness([
      row({ id: 21, status: IntakeSubmissionStatus.APPROVED }),
      row({ id: 22, confirmationSentAt: NOW }),
      row({ id: 23, submitterEmail: null }),
    ]);
    for (const id of [21, 22, 23, 99]) {
      expect(await sendSubmitterConfirmationOnce(ORG, id, "en", { fallback: true }, h.deps)).toBe(
        false,
      );
    }
    expect(h.send).not.toHaveBeenCalled();
    expect(h.deps.claim).not.toHaveBeenCalled();
  });

  it("uses the legacy tenant link for a form without a public id", async () => {
    const h = harness([row({ formPublicId: null, formRouting: null })]);
    await sendSubmitterConfirmationOnce(ORG, 11, "en", { fallback: false }, h.deps);
    const call = h.send.mock.calls[0];
    expect(call[5]).toBeUndefined();
    expect(call[6]).toBe("acme");
    expect(call[7]).toBe("ai-intake");
  });
});

describe("trySendSubmitterConfirmation", () => {
  it("never throws", async () => {
    const h = harness([row()], {
      getSubmission: jest.fn(async () => {
        throw new Error("db down");
      }),
    });
    await expect(
      trySendSubmitterConfirmation(ORG, 11, "en", { fallback: true }, h.deps),
    ).resolves.toBeUndefined();
  });
});

describe("sweepSubmitterConfirmations", () => {
  it("asks for submissions past 3 minutes and within 7 days", async () => {
    const h = harness([]);
    await sweepSubmitterConfirmations(h.deps);
    expect(h.deps.listAwaiting).toHaveBeenCalledWith(3, 7);
  });

  it("sends each awaiting confirmation with the fallback, once", async () => {
    const h = harness([
      row({ id: 31 }),
      row({ id: 32, routing: lane("standard") }),
      row({ id: 33, confirmationSentAt: NOW }),
    ]);
    expect(await sweepSubmitterConfirmations(h.deps)).toBe(2);
    expect(h.sentences()).toEqual([
      expect.stringMatching(/^The governance team will review/),
      expect.stringMatching(/^Cem Tan will review/),
    ]);
    expect(await sweepSubmitterConfirmations(h.deps)).toBe(0);
  });

  it("retries a confirmation whose send failed on the next run", async () => {
    const h = harness([row({ id: 41 })], { send: flakySend() });
    expect(await sweepSubmitterConfirmations(h.deps)).toBe(0);
    expect(await sweepSubmitterConfirmations(h.deps)).toBe(1);
  });
});

describe("reviewTimeAtSubmit", () => {
  const mockDays = getFormReviewDaysQuery as jest.MockedFunction<typeof getFormReviewDaysQuery>;

  it("takes the form's setting and counts business days from now", async () => {
    mockDays.mockResolvedValueOnce(2);
    // Friday + 2 business days = Tuesday
    expect(await reviewTimeAtSubmit(5, ORG, new Date("2026-11-06T16:00:00Z"))).toEqual({
      reviewDays: 2,
      reviewDueDate: "2026-11-10",
    });
  });

  it("falls back to the default when the setting cannot be read", async () => {
    mockDays.mockRejectedValueOnce(new Error("db down"));
    expect(await reviewTimeAtSubmit(5, ORG, NOW)).toEqual({
      reviewDays: 3,
      reviewDueDate: "2026-11-05",
    });
  });
});
