process.env.JWT_SECRET = process.env.JWT_SECRET || "submit-live-checks-test-secret";

jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../intakeScoring/enqueue", () => ({ enqueueIntakeAssessment: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const { buildSubmitLiveChecks, recordSubmitLiveChecks } =
  require("../submit") as typeof import("../submit");
const { createSignedToken } =
  require("../../../utils/signedToken.utils") as typeof import("../../../utils/signedToken.utils");
/* eslint-enable @typescript-eslint/no-require-imports */

import type { IIntakeForm } from "../../../domain.layer/interfaces/i.intakeForm";
import type { FormSchema } from "../../intakeRiskScoring.service";

const NOW = Date.parse("2026-10-28T12:00:00.000Z");

const schema = {
  version: "1",
  fields: [
    { id: "desc", type: "textarea", label: "Description", order: 0 },
    { id: "vendor", type: "text", label: "Vendor", order: 1 },
  ],
} as unknown as FormSchema;

const form = (overrides: Partial<IIntakeForm> = {}) =>
  ({ id: 7, liveChecksEnabled: true, llmKeyId: 3, schema, ...overrides }) as unknown as IIntakeForm;

const data = {
  desc: "scores video interviews for enthusiasm and confidence of job candidates",
  vendor: "Acme HR",
};

const tokenFor = (questionId: string, value: string, overrides: object = {}) =>
  createSignedToken({
    kind: "intake_prefill",
    formId: 7,
    questionId,
    value,
    fileName: "vendor.pdf",
    location: "Section 2",
    excerpt: "Acme HR is the supplier",
    issuedAt: NOW - 1000,
    ...overrides,
  });

const build = (overrides: Partial<Parameters<typeof buildSubmitLiveChecks>[0]> = {}) =>
  buildSubmitLiveChecks({
    form: form(),
    schema,
    data,
    prefill: undefined,
    aiAvailable: true,
    language: "de-DE",
    now: () => NOW,
    ...overrides,
  });

describe("buildSubmitLiveChecks", () => {
  it("returns null when live checks are off for the form", () => {
    expect(build({ form: form({ liveChecksEnabled: false }) })).toBeNull();
  });

  it("stores the rule hints and a pending AI stage with its start time and language", () => {
    const result = build()!;
    expect(result.version).toBe(1);
    expect(result.rules.map((h) => h.ruleId)).toEqual([
      "art5_emotion_workplace_education",
      "annex3_employment_use",
    ]);
    expect(result.ai).toEqual({
      status: "pending",
      hints: [],
      stageStartedAt: new Date(NOW).toISOString(),
      language: "de",
    });
    expect(result.prefill).toEqual({});
  });

  it("marks the AI stage skipped when the form cannot make AI calls", () => {
    expect(build({ aiAvailable: false })!.ai).toEqual({ status: "skipped", hints: [] });
  });

  it("falls back to English for an unknown language", () => {
    expect(build({ language: "tr" })!.ai.language).toBe("en");
    expect(build({ language: undefined })!.ai.language).toBe("en");
  });

  it("keeps a prefill entry whose token verifies, with confirmed from the body", () => {
    const result = build({
      prefill: { vendor: { token: tokenFor("vendor", "Acme HR"), confirmed: true } },
    })!;
    expect(result.prefill).toEqual({
      vendor: {
        fileName: "vendor.pdf",
        location: "Section 2",
        excerpt: "Acme HR is the supplier",
        confirmed: true,
      },
    });
    const unconfirmed = build({
      prefill: { vendor: { token: tokenFor("vendor", "Acme HR"), confirmed: "yes" } },
    })!;
    expect(unconfirmed.prefill.vendor.confirmed).toBe(false);
  });

  it("drops forged, misdirected and changed prefill entries", () => {
    const result = build({
      prefill: {
        // provenance in the body, no token
        vendor: { fileName: "forged.pdf", excerpt: "made up", confirmed: true },
        // a real token for another question
        desc: { token: tokenFor("vendor", "Acme HR"), confirmed: true },
      },
    })!;
    expect(result.prefill).toEqual({});

    const changed = build({
      prefill: { vendor: { token: tokenFor("vendor", "Acme Corp"), confirmed: true } },
    })!;
    expect(changed.prefill).toEqual({});

    const otherForm = build({
      prefill: { vendor: { token: tokenFor("vendor", "Acme HR", { formId: 8 }), confirmed: true } },
    })!;
    expect(otherForm.prefill).toEqual({});
  });

  it("ignores a prefill map that is not an object", () => {
    expect(build({ prefill: "x" })!.prefill).toEqual({});
    expect(build({ prefill: [1] })!.prefill).toEqual({});
    expect(build({ prefill: null })!.prefill).toEqual({});
  });

  it("never sets a prototype from a __proto__ key", () => {
    const prefill = JSON.parse(
      `{"__proto__": {"token": "${tokenFor("__proto__", "x")}", "confirmed": true}}`,
    );
    const result = build({ prefill })!;
    expect(Object.getPrototypeOf(result.prefill)).toBe(Object.prototype);
    expect(Object.keys(result.prefill)).toEqual([]);
  });
});

describe("recordSubmitLiveChecks", () => {
  const record = (
    overrides: Partial<Parameters<typeof recordSubmitLiveChecks>[0]> = {},
    deps: Partial<NonNullable<Parameters<typeof recordSubmitLiveChecks>[1]>> = {},
  ) => {
    const save = jest.fn(async () => undefined);
    const aiAvailable = jest.fn(async () => true);
    const run = recordSubmitLiveChecks(
      {
        form: form(),
        organizationId: 4,
        submissionId: 99,
        data,
        prefill: undefined,
        language: "fr",
        ...overrides,
      },
      { save, aiAvailable, now: () => NOW, ...deps },
    );
    return { run, save, aiAvailable };
  };

  it("stores the checks and asks for the AI stage when the form has a key", async () => {
    const { run, save, aiAvailable } = record();
    expect(await run).toBe(true);
    expect(aiAvailable).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), 4);
    expect(save).toHaveBeenCalledWith(
      99,
      4,
      expect.objectContaining({
        ai: expect.objectContaining({ status: "pending", language: "fr" }),
      }),
    );
  });

  it("answers at the deadline, then queues the stage itself once the slow write lands", async () => {
    jest.useFakeTimers();
    try {
      let finish: () => void = () => undefined;
      const save = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
      const queueStage = jest.fn(async () => undefined);
      const { run } = record({}, { save, queueStage, deadlineMs: 50 });
      let settled = false;
      void run.then(() => {
        settled = true;
      });
      await jest.advanceTimersByTimeAsync(49);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      // The submit's own job leaves the stage out; the write has not stored it yet.
      expect(await run).toBe(false);
      expect(queueStage).not.toHaveBeenCalled();
      finish();
      await jest.advanceTimersByTimeAsync(0);
      expect(queueStage).toHaveBeenCalledWith(4, 99);
    } finally {
      jest.useRealTimers();
    }
  });

  it("does not queue the stage for a late write that stored it skipped", async () => {
    jest.useFakeTimers();
    try {
      let finish: () => void = () => undefined;
      const save = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
      const queueStage = jest.fn(async () => undefined);
      const { run } = record(
        {},
        { save, queueStage, deadlineMs: 50, aiAvailable: jest.fn(async () => false) },
      );
      await jest.advanceTimersByTimeAsync(50);
      expect(await run).toBe(false);
      finish();
      await jest.advanceTimersByTimeAsync(0);
      expect(queueStage).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("stores a skipped AI stage and does not ask for it without a key", async () => {
    const { run, save } = record({}, { aiAvailable: jest.fn(async () => false) });
    expect(await run).toBe(false);
    expect((save.mock.calls[0] as unknown[])[2]).toMatchObject({ ai: { status: "skipped" } });
  });

  it("stores nothing when live checks are off or the form is missing", async () => {
    const off = record({ form: form({ liveChecksEnabled: false }) });
    expect(await off.run).toBe(false);
    expect(off.save).not.toHaveBeenCalled();
    expect(off.aiAvailable).not.toHaveBeenCalled();
    const missing = record({ form: null });
    expect(await missing.run).toBe(false);
    expect(missing.save).not.toHaveBeenCalled();
  });

  it("stores nothing when the key lookup fails", async () => {
    const { run, save } = record(
      {},
      {
        aiAvailable: jest.fn(async () => {
          throw new Error("db down");
        }),
      },
    );
    expect(await run).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("never throws when the write fails, and does not ask for the AI stage", async () => {
    const { run } = record(
      {},
      {
        save: jest.fn(async () => {
          throw new Error("db down");
        }),
      },
    );
    await expect(run).resolves.toBe(false);
  });
});
