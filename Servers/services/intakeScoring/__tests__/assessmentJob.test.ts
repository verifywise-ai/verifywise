jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../automations/automationProducer", () => ({
  automationQueue: { add: jest.fn() },
  enqueueAutomationAction: jest.fn(),
}));
jest.mock("../../emailService", () => ({ sendEmail: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import {
  AssessmentDeps,
  backfillIntakeAssessments,
  runIntakeAssessment,
  scoreTextFor,
  sendIntakeNotificationOnce,
} from "../assessmentJob";
import { IntakeEntityType } from "../../../domain.layer/enums/intake-entity-type.enum";
import { IntakeSubmissionStatus } from "../../../domain.layer/enums/intake-submission-status.enum";
import type {
  IIntakeSubmission,
  IRiskAssessmentV2,
  ISuggestedRisksBlock,
} from "../../../domain.layer/interfaces/i.intakeSubmission";
import type { IIntakeForm } from "../../../domain.layer/interfaces/i.intakeForm";
import type { ClassificationContext } from "../aiScoring";

const ORG = 7;
const NOW = new Date("2026-10-21T12:00:00.000Z");

const form = (overrides: Partial<IIntakeForm> = {}): IIntakeForm =>
  ({
    id: 5,
    name: "AI intake",
    entityType: IntakeEntityType.USE_CASE,
    schema: {
      fields: [
        { id: "q1", label: "Purpose", type: "text", entityFieldMapping: "project_title" },
        { id: "q2", label: "Contact", type: "email" },
      ],
    },
    recipients: [9],
    llmKeyId: 3,
    euAiActRiskStepEnabled: true,
    ...overrides,
  }) as unknown as IIntakeForm;

const submission = (overrides: Partial<IIntakeSubmission> = {}): IIntakeSubmission =>
  ({
    id: 11,
    formId: 5,
    status: IntakeSubmissionStatus.PENDING,
    entityType: IntakeEntityType.USE_CASE,
    data: { q1: "Screening job applicants", q2: "jane@example.com" },
    submitterName: "Jane",
    submitterEmail: "jane@example.com",
    riskAssessment: null,
    suggestedRisks: null,
    ...overrides,
  }) as unknown as IIntakeSubmission;

const HIGH_RISK: ClassificationContext = {
  level: "High risk",
  reasons: [{ article: "Annex III", text: "employment" }],
};

const SUGGESTION = {
  risk_name: "Biased ranking",
  risk_description: "d",
  risk_category: ["Data privacy risk"],
  ai_lifecycle_phase: "Deployment & integration",
  likelihood: 3,
  severity: 4,
  impact: "i",
  mitigation_plan: "m",
  implementation_strategy: "s",
};

/** Answers scoring calls with `score` and suggestion calls with one risk. */
const fakeLlm = (score: number, opts: { failScoring?: boolean; failSuggestions?: boolean } = {}) =>
  jest.fn(async (args: { system: string }) => {
    if (args.system.includes("risk analyst")) {
      if (opts.failSuggestions) throw new Error("suggestions down");
      return { object: { matched: [], suggested: [SUGGESTION] } } as any;
    }
    if (opts.failScoring) throw new Error("scoring down");
    return { object: { score, reasons: [] } } as any;
  });

/** An in-memory submission store plus spies for everything else. */
function harness(
  sub: IIntakeSubmission,
  overrides: Partial<AssessmentDeps> = {},
  claims: boolean[] = [true, false],
) {
  const state = { submission: sub };
  const assessments: IRiskAssessmentV2[] = [];
  const blocks: ISuggestedRisksBlock[] = [];
  const deps: Partial<AssessmentDeps> = {
    getSubmission: jest.fn(async () => ({ ...state.submission })),
    getForm: jest.fn(async () => form()),
    getClassification: jest.fn(async () => HIGH_RISK),
    getModel: jest.fn(async () => ({ fake: true }) as any),
    saveAssessment: jest.fn(async (_id, a) => {
      assessments.push(a);
      state.submission = { ...state.submission, riskAssessment: a };
    }),
    saveSuggestions: jest.fn(async (_id, b) => {
      blocks.push(b);
      state.submission = { ...state.submission, suggestedRisks: b };
    }),
    claimNotification: jest.fn(async () => claims.shift() ?? false),
    getEligibleIds: jest.fn(async (_org: number, ids?: number[]) => ids ?? []),
    sendNotification: jest.fn(async () => undefined),
    generateImpl: fakeLlm(64),
    now: () => NOW,
    ...overrides,
  };
  return { deps, state, assessments, blocks };
}

const finalAssessment = (h: ReturnType<typeof harness>) => h.assessments[h.assessments.length - 1];
const finalBlock = (h: ReturnType<typeof harness>) => h.blocks[h.blocks.length - 1];
const BOTH = ["scoring", "suggestions"] as const;
const job = (overrides = {}) => ({
  organizationId: ORG,
  submissionId: 11,
  stages: [...BOTH],
  notify: true,
  lang: "en",
  ...overrides,
});

describe("runIntakeAssessment", () => {
  it("scores, suggests and emails once when both stages complete", async () => {
    const h = harness(submission(), { generateImpl: fakeLlm(64) });
    await runIntakeAssessment(job(), h.deps);

    // pending first, then the result
    expect(h.assessments[0].status).toBe("pending");
    expect(h.assessments[0].stageStartedAt).toBe(NOW.toISOString());
    expect(h.blocks[0].status).toBe("pending");

    const a = finalAssessment(h);
    expect(a.status).toBe("complete");
    expect(a.classificationLevel).toBe("High risk");
    expect(a.ruleMinimum).toBe(70);
    expect(a.ai?.median).toBe(64);
    expect(a.finalScore).toBe(70); // max(70, 64)
    expect(a.source).toBe("rule_minimum");
    expect(a.tier).toBe("High");
    expect(a.overallScore).toBe(70);
    expect(a.notRuleChecked).toBe(false);

    const b = finalBlock(h);
    expect(b.status).toBe("complete");
    expect(b.items).toHaveLength(1);
    expect(b.items[0].implementationStrategy).toBe("s");

    expect(h.deps.sendNotification).toHaveBeenCalledTimes(1);
    const args = (h.deps.sendNotification as jest.Mock).mock.calls[0];
    expect(args[0]).toEqual([9]);
    expect(args[7]).toEqual({
      level: "High risk",
      scoreText: "70 (High)",
      suggestionCount: 1,
      capReached: false,
    });
  });

  it("uses the AI median when it is above the rule minimum", async () => {
    const h = harness(submission(), { generateImpl: fakeLlm(82) });
    await runIntakeAssessment(job(), h.deps);
    expect(finalAssessment(h).finalScore).toBe(82);
    expect(finalAssessment(h).source).toBe("ai");
    expect(finalAssessment(h).tier).toBe("Critical");
  });

  it("without an LLM key: rules-only score, no suggestions", async () => {
    const h = harness(submission(), { getForm: jest.fn(async () => form({ llmKeyId: null })) });
    await runIntakeAssessment(job(), h.deps);
    const a = finalAssessment(h);
    expect(a.status).toBe("ai_not_configured");
    expect(a.finalScore).toBe(70);
    expect(a.rulesOnly).toBe(true);
    expect(a.ai).toBeNull();
    expect(finalBlock(h)).toMatchObject({ status: "ai_not_configured", items: [] });
    expect((h.deps.sendNotification as jest.Mock).mock.calls[0][7].scoreText).toBe(
      "at least 70 (rules only)",
    );
    expect(h.deps.getModel).not.toHaveBeenCalled();
  });

  it("without a key and with no rules check: no score yet", async () => {
    const h = harness(submission(), {
      getForm: jest.fn(async () => form({ llmKeyId: null, euAiActRiskStepEnabled: false })),
      getClassification: jest.fn(async () => null),
    });
    await runIntakeAssessment(job(), h.deps);
    const a = finalAssessment(h);
    expect(a.finalScore).toBeNull();
    expect(a.tier).toBeNull();
    expect(a.notRuleChecked).toBe(true);
    expect((h.deps.sendNotification as jest.Mock).mock.calls[0][7]).toMatchObject({
      level: null,
      scoreText: "No score yet",
    });
  });

  it("treats a deleted key as not configured and records why", async () => {
    const h = harness(submission(), { getModel: jest.fn(async () => null) });
    await runIntakeAssessment(job(), h.deps);
    expect(finalAssessment(h)).toMatchObject({
      status: "ai_not_configured",
      error: "The form's LLM key no longer exists",
    });
    expect(finalBlock(h).status).toBe("ai_not_configured");
  });

  it("marks a failed scoring stage and still runs suggestions", async () => {
    const h = harness(submission(), { generateImpl: fakeLlm(64, { failScoring: true }) });
    await runIntakeAssessment(job(), h.deps);
    const a = finalAssessment(h);
    expect(a.status).toBe("ai_failed");
    expect(a.finalScore).toBe(70); // the floor still holds
    expect(a.error).toBeDefined();
    expect(finalBlock(h).status).toBe("complete");
    expect(h.deps.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("marks a failed suggestions stage and keeps the score", async () => {
    const h = harness(submission(), {
      generateImpl: fakeLlm(64, { failSuggestions: true }),
    });
    await runIntakeAssessment(job(), h.deps);
    expect(finalAssessment(h).status).toBe("complete");
    expect(finalBlock(h)).toMatchObject({ status: "ai_failed", items: [] });
    expect(finalBlock(h).error).toBeDefined();
  });

  it("records a setup failure on both stages instead of leaving them pending", async () => {
    const h = harness(submission(), {
      getClassification: jest.fn(async () => {
        throw new Error("db down");
      }),
    });
    await runIntakeAssessment(job(), h.deps);
    expect(finalAssessment(h)).toMatchObject({ status: "ai_failed", error: "db down" });
    expect(finalBlock(h)).toMatchObject({ status: "ai_failed", error: "db down" });
    // both settled, so the email still goes out once
    expect(h.deps.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("a setup failure after the classification loaded keeps the rule minimum", async () => {
    const h = harness(submission(), {
      getModel: jest.fn(async () => {
        throw new Error("key can't be decrypted");
      }),
    });
    await runIntakeAssessment(job({ notify: false }), h.deps);
    expect(finalAssessment(h)).toMatchObject({
      status: "ai_failed",
      classificationLevel: "High risk",
      finalScore: 70,
      rulesOnly: true,
      notRuleChecked: false,
    });
  });

  it("a thrown scoring stage keeps the rule minimum as the score", async () => {
    const h = harness(submission(), {
      getModel: jest.fn(async () => ({ fake: true }) as any),
      generateImpl: jest.fn(async (args: { system: string }) => {
        if (args.system.includes("risk analyst")) {
          return { object: { matched: [], suggested: [] } } as any;
        }
        return { object: { score: 64, reasons: [] } } as any;
      }) as any,
      saveAssessment: jest.fn(async (_id, a) => {
        if (a.status === "complete") throw new Error("write failed");
        h.assessments.push(a);
      }),
    });
    await runIntakeAssessment(job({ notify: false }), h.deps);
    expect(finalAssessment(h)).toMatchObject({
      status: "ai_failed",
      finalScore: 70,
      rulesOnly: true,
      tier: "High",
    });
  });

  it("runs the two stages side by side", async () => {
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const h = harness(submission(), {
      generateImpl: jest.fn(async (args: { system: string }) => {
        const kind = args.system.includes("risk analyst") ? "suggestions" : "scoring";
        if (!started.includes(kind)) started.push(kind);
        await gate;
        return kind === "suggestions"
          ? ({ object: { matched: [], suggested: [] } } as any)
          : ({ object: { score: 64, reasons: [] } } as any);
      }) as any,
    });
    const run = runIntakeAssessment(job({ notify: false }), h.deps);
    await new Promise((resolve) => setImmediate(resolve));
    expect(started.sort()).toEqual(["scoring", "suggestions"]);
    release();
    await run;
  });

  it("routes once from the re-read submission after scoring settles", async () => {
    const routeSubmission = jest.fn(async () => null);
    const h = harness(submission(), { routeSubmission: routeSubmission as any });
    await runIntakeAssessment(job({ notify: false }), h.deps);
    expect(routeSubmission).toHaveBeenCalledTimes(1);
    const [routed, routedForm, org] = routeSubmission.mock.calls[0] as any[];
    expect(routed.riskAssessment).toMatchObject({ version: 2, status: "complete" });
    expect(routedForm.id).toBe(5);
    expect(org).toBe(ORG);
  });

  it("routes after a failed scoring stage as well", async () => {
    const routeSubmission = jest.fn(async () => null);
    const h = harness(submission(), {
      routeSubmission: routeSubmission as any,
      generateImpl: fakeLlm(64, { failScoring: true }),
    });
    await runIntakeAssessment(job({ notify: false }), h.deps);
    expect(routeSubmission).toHaveBeenCalledTimes(1);
    expect((routeSubmission.mock.calls[0] as any[])[0].riskAssessment.status).toBe("ai_failed");
  });

  it("a suggestions-only job does not route", async () => {
    const routeSubmission = jest.fn(async () => null);
    const h = harness(submission(), { routeSubmission: routeSubmission as any });
    await runIntakeAssessment(job({ stages: ["suggestions"], notify: false }), h.deps);
    expect(routeSubmission).not.toHaveBeenCalled();
  });

  it("routes after a setup failure too, since scoring settled as failed", async () => {
    const routeSubmission = jest.fn(async () => null);
    const h = harness(submission(), {
      routeSubmission: routeSubmission as any,
      getClassification: jest.fn(async () => {
        throw new Error("db down");
      }),
    });
    await runIntakeAssessment(job({ notify: false }), h.deps);
    expect(routeSubmission).toHaveBeenCalledTimes(1);
  });

  it("logs a routing error and still finishes the job", async () => {
    const routeSubmission = jest.fn(async () => {
      throw new Error("route down");
    });
    const h = harness(submission(), { routeSubmission: routeSubmission as any });
    await expect(runIntakeAssessment(job({ notify: false }), h.deps)).resolves.toBeUndefined();
    expect(finalBlock(h).status).toBe("complete");
  });

  it("scoring-only runs never touch suggestions", async () => {
    const block: ISuggestedRisksBlock = {
      status: "complete",
      items: [],
      droppedCount: 0,
      stageStartedAt: "x",
      generatedAt: "y",
    };
    const h = harness(submission({ suggestedRisks: block }));
    await runIntakeAssessment(job({ stages: ["scoring"], notify: false }), h.deps);
    expect(h.deps.saveSuggestions).not.toHaveBeenCalled();
    expect(finalAssessment(h).status).toBe("complete");
  });

  it("model submissions are not rule-checked", async () => {
    const h = harness(submission({ entityType: IntakeEntityType.MODEL }), {
      getForm: jest.fn(async () => form({ entityType: IntakeEntityType.MODEL })),
      getClassification: jest.fn(async () => null),
    });
    await runIntakeAssessment(job(), h.deps);
    const a = finalAssessment(h);
    expect(a.notRuleChecked).toBe(true);
    expect(a.classificationLevel).toBeNull();
    expect(a.finalScore).toBe(64);
    expect(finalBlock(h).items[0].modelRiskCategory).toBeDefined();
  });

  it("does nothing for a submission that is no longer pending", async () => {
    const h = harness(submission({ status: IntakeSubmissionStatus.APPROVED }));
    await runIntakeAssessment(job(), h.deps);
    expect(h.deps.saveAssessment).not.toHaveBeenCalled();
    expect(h.deps.saveSuggestions).not.toHaveBeenCalled();
    expect(h.deps.sendNotification).not.toHaveBeenCalled();
  });

  it("does not email when notify is off", async () => {
    const h = harness(submission());
    await runIntakeAssessment(job({ notify: false }), h.deps);
    expect(h.deps.claimNotification).not.toHaveBeenCalled();
    expect(h.deps.sendNotification).not.toHaveBeenCalled();
  });

  it("never sends contact data to the LLM", async () => {
    const generateImpl = fakeLlm(64);
    const h = harness(submission(), { generateImpl });
    await runIntakeAssessment(job(), h.deps);
    for (const call of generateImpl.mock.calls) {
      const { system, prompt } = call[0] as unknown as { system: string; prompt: string };
      expect(`${system}\n${prompt}`).not.toContain("jane@example.com");
    }
  });
});

const settled = () =>
  submission({
    riskAssessment: {
      version: 2,
      status: "complete",
      notRuleChecked: false,
      classificationLevel: "High risk",
      ruleMinimum: 70,
      ai: null,
      finalScore: 70,
      source: "rule_minimum",
      rulesOnly: false,
      overallScore: 70,
      tier: "High",
      stageStartedAt: "x",
      scoredAt: "y",
    },
    suggestedRisks: {
      status: "complete",
      items: [],
      droppedCount: 0,
      stageStartedAt: "x",
      generatedAt: "y",
    },
  });

describe("sendIntakeNotificationOnce", () => {
  it("sends nothing for a submission already decided", async () => {
    const h = harness({ ...settled(), status: IntakeSubmissionStatus.APPROVED } as never);
    await sendIntakeNotificationOnce(ORG, 11, "en", { capReached: true }, h.deps);
    expect(h.deps.claimNotification).not.toHaveBeenCalled();
    expect(h.deps.sendNotification).not.toHaveBeenCalled();
  });

  it("a second call after the claim is taken sends nothing", async () => {
    const h = harness(settled());
    await sendIntakeNotificationOnce(ORG, 11, "en", { capReached: false }, h.deps);
    await sendIntakeNotificationOnce(ORG, 11, "en", { capReached: true }, h.deps);
    expect(h.deps.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("the cap sends a still-running note while a stage is pending", async () => {
    const h = harness(
      submission({
        suggestedRisks: {
          status: "pending",
          items: [],
          droppedCount: 0,
          stageStartedAt: "x",
          generatedAt: null,
        },
      }),
    );
    await sendIntakeNotificationOnce(ORG, 11, "en", { capReached: true }, h.deps);
    expect((h.deps.sendNotification as jest.Mock).mock.calls[0][7].capReached).toBe(true);
  });

  it("the cap reports results when both stages had already settled", async () => {
    const h = harness(settled());
    await sendIntakeNotificationOnce(ORG, 11, "en", { capReached: true }, h.deps);
    expect((h.deps.sendNotification as jest.Mock).mock.calls[0][7].capReached).toBe(false);
  });

  it("with no recipients, skips without claiming unless admin fallback is on", async () => {
    const h = harness(settled(), { getForm: jest.fn(async () => form({ recipients: [] })) });
    await sendIntakeNotificationOnce(ORG, 11, "en", { capReached: false }, h.deps);
    expect(h.deps.claimNotification).not.toHaveBeenCalled();
    expect(h.deps.sendNotification).not.toHaveBeenCalled();

    await sendIntakeNotificationOnce(
      ORG,
      11,
      "en",
      { capReached: false, adminFallback: true },
      h.deps,
    );
    expect((h.deps.sendNotification as jest.Mock).mock.calls[0][0]).toBe(ORG);
  });
});

describe("sendIntakeNotificationOnce: lanes", () => {
  const cfg = {
    enabled: true,
    seniorReviewerIds: [1, 9],
    standardReviewerIds: [2],
    threshold: 50,
    closeCallMargin: 10,
    secondReviewRate: 10,
  };
  const lane = (l: "senior" | "standard", reason: string) =>
    ({
      lane: l,
      reason,
      score: 52,
      threshold: 50,
      closeCallMargin: 10,
      routedAt: "x",
    }) as any;
  const send = async (formOverrides: object, routing: unknown) => {
    const h = harness({ ...settled(), routing } as never, {
      getForm: jest.fn(async () => form({ recipients: [1], ...formOverrides })),
    });
    await sendIntakeNotificationOnce(ORG, 11, "en", { capReached: false }, h.deps);
    return (h.deps.sendNotification as jest.Mock).mock.calls[0];
  };

  it("a senior-lane submission also goes to the senior reviewers, once each", async () => {
    const call = await send({ routing: cfg }, lane("senior", "close_call"));
    expect(call[0]).toEqual([1, 9]);
    expect(call[8]).toBe("Senior review: close call");
  });

  it("a standard-lane submission goes to the standard reviewers", async () => {
    const call = await send({ routing: cfg }, lane("standard", "below_threshold"));
    expect(call[0]).toEqual([1, 2]);
    expect(call[8]).toBe("Standard review");
  });

  it("no lane yet goes to both lanes and says it isn't routed", async () => {
    const call = await send({ routing: cfg }, null);
    expect(call[0]).toEqual([1, 9, 2]);
    expect(call[8]).toBe("Not routed yet: scoring is still running");
  });

  it("routing off or disabled notifies the form recipients only, with no lane line", async () => {
    for (const routing of [null, { ...cfg, enabled: false }]) {
      const call = await send({ routing }, lane("senior", "close_call"));
      expect(call[0]).toEqual([1]);
      expect(call[8]).toBeUndefined();
    }
  });

  it("drops stale or ineligible lane ids but keeps the form recipients", async () => {
    const h = harness({ ...settled(), routing: lane("senior", "close_call") } as never, {
      getForm: jest.fn(async () => form({ recipients: [1, 77], routing: cfg })),
      getEligibleIds: jest.fn(async () => [9]),
    });
    await sendIntakeNotificationOnce(ORG, 11, "en", { capReached: false }, h.deps);
    expect(h.deps.getEligibleIds).toHaveBeenCalledWith(ORG, [1, 9]);
    expect((h.deps.sendNotification as jest.Mock).mock.calls[0][0]).toEqual([1, 77, 9]);
  });

  it("a form with no recipients still emails the lane's reviewers", async () => {
    const call = await send({ recipients: [], routing: cfg }, lane("standard", "below_threshold"));
    expect(call[0]).toEqual([2]);
  });
});

describe("scoreTextFor", () => {
  const base = { finalScore: 64, rulesOnly: false } as IRiskAssessmentV2;
  it("words each case", () => {
    expect(scoreTextFor(null)).toBe("No score yet");
    expect(scoreTextFor({ ...base, finalScore: null })).toBe("No score yet");
    expect(scoreTextFor(base)).toBe("64 (High)");
    expect(scoreTextFor({ ...base, finalScore: 70, rulesOnly: true })).toBe(
      "at least 70 (rules only)",
    );
  });
});

describe("backfillIntakeAssessments", () => {
  it("queues only the stages each row needs, emailing only when it never went", async () => {
    const enqueue = jest.fn(async () => undefined);
    const queued = await backfillIntakeAssessments({
      listNeedingAssessment: jest.fn(async () => [
        {
          id: 1,
          organizationId: 2,
          needsScoring: true,
          needsSuggestions: true,
          needsNotification: true,
          emailUnclaimed: true,
        },
        {
          id: 3,
          organizationId: 4,
          needsScoring: false,
          needsSuggestions: true,
          needsNotification: false,
          emailUnclaimed: false,
        },
        {
          id: 5,
          organizationId: 6,
          needsScoring: true,
          needsSuggestions: false,
          needsNotification: false,
          emailUnclaimed: false,
        },
      ]),
      enqueue,
    });
    expect(queued).toBe(3);
    expect(enqueue).toHaveBeenNthCalledWith(1, {
      organizationId: 2,
      submissionId: 1,
      stages: ["scoring", "suggestions"],
      notify: true,
    });
    expect(enqueue).toHaveBeenNthCalledWith(2, {
      organizationId: 4,
      submissionId: 3,
      stages: ["suggestions"],
      notify: false,
    });
    expect(enqueue).toHaveBeenNthCalledWith(3, {
      organizationId: 6,
      submissionId: 5,
      stages: ["scoring"],
      notify: false,
    });
  });

  it("emails a settled submission whose email never went, without queueing", async () => {
    const enqueue = jest.fn(async () => undefined);
    const h = harness(settled(), {
      listNeedingAssessment: jest.fn(async () => [
        {
          id: 11,
          organizationId: ORG,
          needsScoring: false,
          needsSuggestions: false,
          needsNotification: true,
          emailUnclaimed: true,
        },
      ]),
      enqueue,
    });
    expect(await backfillIntakeAssessments(h.deps)).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
    expect(h.deps.claimNotification).toHaveBeenCalledWith(11, ORG);
    expect(h.deps.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("a lost job under 10 minutes old is re-run with its email", async () => {
    const enqueue = jest.fn(async () => undefined);
    await backfillIntakeAssessments({
      listNeedingAssessment: jest.fn(async () => [
        {
          id: 1,
          organizationId: 2,
          needsScoring: true,
          needsSuggestions: false,
          needsNotification: false,
          emailUnclaimed: true,
        },
      ]),
      enqueue,
    });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ notify: true }));
  });

  it("keeps going when one row fails to queue", async () => {
    const enqueue = jest
      .fn()
      .mockRejectedValueOnce(new Error("redis down"))
      .mockResolvedValueOnce(undefined);
    const queued = await backfillIntakeAssessments({
      listNeedingAssessment: jest.fn(async () => [
        {
          id: 1,
          organizationId: 2,
          needsScoring: true,
          needsSuggestions: false,
          needsNotification: false,
          emailUnclaimed: false,
        },
        {
          id: 3,
          organizationId: 4,
          needsScoring: true,
          needsSuggestions: false,
          needsNotification: false,
          emailUnclaimed: false,
        },
      ]),
      enqueue,
    });
    expect(queued).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });
});
