import { selectRetryStages, STALE_PENDING_MS } from "../retry";
import type {
  IRiskAssessmentV2,
  ISuggestedRisksBlock,
  StageStatus,
} from "../../../domain.layer/interfaces/i.intakeSubmission";
import type {
  ILiveChecks,
  LiveChecksAiStatus,
} from "../../../domain.layer/interfaces/i.intakeLiveChecks";

const NOW = new Date("2026-10-21T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const assessment = (status: StageStatus, startedMsAgo = 0) =>
  ({ version: 2, status, stageStartedAt: ago(startedMsAgo) }) as IRiskAssessmentV2;
const block = (status: StageStatus, startedMsAgo = 0) =>
  ({
    status,
    items: [],
    droppedCount: 0,
    stageStartedAt: ago(startedMsAgo),
    generatedAt: null,
  }) as ISuggestedRisksBlock;

describe("selectRetryStages", () => {
  it("never re-runs finished stages", () => {
    expect(selectRetryStages(assessment("complete"), block("complete"), NOW)).toEqual([]);
    expect(
      selectRetryStages(assessment("ai_not_configured"), block("ai_not_configured"), NOW),
    ).toEqual([]);
  });

  it("re-runs failed stages", () => {
    expect(selectRetryStages(assessment("ai_failed"), block("complete"), NOW)).toEqual(["scoring"]);
    expect(selectRetryStages(assessment("complete"), block("ai_failed"), NOW)).toEqual([
      "suggestions",
    ]);
  });

  it("re-runs a stage pending for over 10 minutes, not a fresh one", () => {
    expect(selectRetryStages(assessment("pending", 15 * 60_000), block("complete"), NOW)).toEqual([
      "scoring",
    ]);
    expect(selectRetryStages(assessment("pending", 2 * 60_000), block("complete"), NOW)).toEqual(
      [],
    );
    expect(
      selectRetryStages(assessment("pending", STALE_PENDING_MS), block("complete"), NOW),
    ).toEqual([]);
  });

  it("runs stages that were never stored, including a legacy v1 assessment", () => {
    expect(selectRetryStages(null, null, NOW)).toEqual(["scoring", "suggestions"]);
    expect(
      selectRetryStages({ overallScore: 40, tier: "Medium" } as any, block("complete"), NOW),
    ).toEqual(["scoring"]);
  });

  it("treats an unreadable start time as lost", () => {
    const broken = { ...assessment("pending"), stageStartedAt: "not a date" };
    expect(selectRetryStages(broken, block("complete"), NOW)).toEqual(["scoring"]);
  });
});

describe("selectRetryStages: live checks", () => {
  const liveChecks = (status: LiveChecksAiStatus, startedMsAgo = 0): ILiveChecks => ({
    version: 1,
    rules: [],
    ai: { status, hints: [], stageStartedAt: ago(startedMsAgo), language: "en" },
    prefill: {},
  });
  const done = [assessment("complete"), block("complete"), NOW] as const;

  it("re-runs failed AI checks", () => {
    expect(selectRetryStages(...done, liveChecks("failed"))).toEqual(["liveChecks"]);
    expect(
      selectRetryStages(assessment("ai_failed"), block("complete"), NOW, liveChecks("failed")),
    ).toEqual(["scoring", "liveChecks"]);
  });

  it("re-runs AI checks pending past the stale limit, not fresh ones", () => {
    expect(selectRetryStages(...done, liveChecks("pending", 15 * 60_000))).toEqual(["liveChecks"]);
    expect(selectRetryStages(...done, liveChecks("pending", 60_000))).toEqual([]);
  });

  it("never re-runs done or skipped AI checks, or none stored", () => {
    expect(selectRetryStages(...done, liveChecks("done"))).toEqual([]);
    expect(selectRetryStages(...done, liveChecks("skipped"))).toEqual([]);
    expect(selectRetryStages(...done, null)).toEqual([]);
    expect(selectRetryStages(...done)).toEqual([]);
  });
});
