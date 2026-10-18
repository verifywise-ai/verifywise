jest.mock("../../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb({})),
  },
}));
jest.mock("../../../utils/biasAudit.utils", () => ({
  createCorpusQuery: jest.fn(),
  getCorpusQuery: jest.fn(),
  updateCorpusStatusQuery: jest.fn(),
  touchCorpusHeartbeatQuery: jest.fn(),
  markStaleCorporaFailedQuery: jest.fn(),
  appendCorpusRecordQuery: jest.fn(),
  listCorpusLogQuery: jest.fn(),
  countValidCorpusRecordsQuery: jest.fn(),
  listLatestValidRecordsPageQuery: jest.fn(),
  claimCorpusLeaseQuery: jest.fn(),
  releaseCorpusLeaseQuery: jest.fn(),
  getCorpusLeaseQuery: jest.fn(),
  getProjectQuery: jest.fn(),
}));
jest.mock("./gatewayClient", () => ({ complete: jest.fn() }));
jest.mock("./settings", () => ({
  ...jest.requireActual("./settings"),
  getGatewaySettings: jest.fn(),
}));
jest.mock("./assignCandidateIds", () => ({
  ...jest.requireActual("./assignCandidateIds"),
  verifyIdOrder: jest.fn(jest.requireActual<any>("./assignCandidateIds").verifyIdOrder),
}));

import { createHash } from "node:crypto";
import * as utils from "../../../utils/biasAudit.utils";
import { JOB_DESCRIPTIONS } from "../../../structures/NYC-Local-Law-144/job-descriptions";
import { complete } from "./gatewayClient";
import * as settings from "./settings";
import { GatewayNotConfiguredError } from "./settings";
import { assignCandidateIds, IdOrderError, verifyIdOrder } from "./assignCandidateIds";
import { buildAllocation } from "./allocation";
import { NAME_METHOD } from "./names";
import { canonicalManifest } from "./manifest";
import { corpusCsvHeaderLine, corpusCsvRow } from "./corpusCsv";
import {
  CorpusBusyError,
  CorpusModelChangedError,
  createCorpus,
  HEARTBEAT_INTERVAL_MS,
  jobDescriptionSha256,
  LEASE_SECONDS,
  LeaseLostError,
  MAX_ATTEMPTS,
  runCorpusGeneration,
} from "./generateCorpus";

const mockUtils = utils as unknown as Record<string, jest.Mock>;
const mockComplete = complete as jest.Mock;
const mockSettings = settings as unknown as { getGatewaySettings: jest.Mock };

const SETTINGS = { baseUrl: "https://gateway.example", apiKey: "k", model: "pinned-model-1" };
const JD = JOB_DESCRIPTIONS["commercial-ae"];
const RESUME = "Sam Lee\nExperience\nAccount Executive, 2019-2024\nSkills\nNegotiation";
const H = "h".repeat(64);
// A valid reply carries the candidate's full name, read back from the prompt.
const nameIn = (prompt: string) => /The candidate's name is (.+)\.$/m.exec(prompt)![1];
const reply =
  (modelObserved = "m1") =>
  async (_settings: unknown, prompt: string) => ({
    text: `${nameIn(prompt)}\nExperience\nAccount Executive, 2019-2024\nSkills\nNegotiation`,
    modelObserved,
    promptHash: H,
    finishReason: "stop",
  });
const ok = (modelObserved = "m1", text = RESUME) => ({
  text,
  modelObserved,
  promptHash: H,
  finishReason: "stop",
});

// A seed that clears the ID-order gate on its first draw, as a stored seedUsed does.
const SEED = assignCandidateIds({
  rows: buildAllocation({
    count: 700,
    tiers: JD.tiers.map((t) => t.key),
    smallSampleExclusion: 0.02,
  }).rows,
  seed: 4242,
}).seedUsed;

const corpusRow = (overrides: Record<string, unknown> = {}) => ({
  id: 3,
  organization_id: 1,
  project_id: 7,
  profile_id: 5,
  profile_version: 2,
  job_description_key: "commercial-ae",
  job_description_sha256: jobDescriptionSha256(JD),
  artifact_kind: "resume",
  knockout: "no",
  requested_count: 700,
  planned_count: 700,
  record_count: null,
  seed: SEED,
  model_pinned: "pinned-model-1",
  status: "running",
  models_observed_json: null,
  ...overrides,
});

interface StoredRecord {
  candidate_id: string;
  attempt: number;
  validation_status: "valid" | "invalid";
  model_name: string;
  prompt_hash: string;
  text: string;
}

const id = (i: number) => `C${String(i).padStart(4, "0")}`;
const logFor = (n: number, model = "m1"): StoredRecord[] =>
  [...Array(n)].map((_, i) => ({
    candidate_id: id(i + 1),
    attempt: 1,
    validation_status: "valid",
    model_name: model,
    prompt_hash: H,
    text: RESUME,
  }));
const pageOf = (n: number) =>
  [...Array(n)].map((_, i) => ({ candidate_id: id(i + 1), text: RESUME }));

// A fake of the append-only table: append pushes, the reads see every row.
let store: StoredRecord[] = [];
const seedLog = (rows: StoredRecord[]) => {
  store = [...rows];
};
function latestValid(): Array<{ candidate_id: string; text: string }> {
  const latest = new Map<string, StoredRecord>();
  for (const r of store) {
    const seen = latest.get(r.candidate_id);
    if (!seen || r.attempt > seen.attempt) latest.set(r.candidate_id, r);
  }
  return [...latest.values()]
    .filter((r) => r.validation_status === "valid")
    .sort((a, b) => (a.candidate_id < b.candidate_id ? -1 : 1))
    .map((r) => ({ candidate_id: r.candidate_id, text: r.text }));
}

const args = {
  projectId: 7,
  profileId: 5,
  profileVersion: 2,
  organizationId: 1,
  userId: 9,
  jobDescriptionKey: "commercial-ae" as const,
  artifactKind: "resume" as const,
  knockout: "no" as const,
  criteriaSupplied: null,
  criteriaComparison: { outcome: "not_supplied" },
  count: 700,
};

beforeEach(() => {
  jest.clearAllMocks();
  store = [];
  mockSettings.getGatewaySettings.mockReturnValue(SETTINGS);
  mockUtils.createCorpusQuery.mockResolvedValue({ id: 3 });
  mockUtils.getCorpusQuery.mockResolvedValue(corpusRow());
  mockUtils.touchCorpusHeartbeatQuery.mockResolvedValue(true);
  mockUtils.claimCorpusLeaseQuery.mockResolvedValue(true);
  mockUtils.releaseCorpusLeaseQuery.mockResolvedValue(true);
  mockUtils.updateCorpusStatusQuery.mockResolvedValue(true);
  mockUtils.listCorpusLogQuery.mockImplementation(async () =>
    store.map(({ text: _text, ...meta }) => meta),
  );
  mockUtils.appendCorpusRecordQuery.mockImplementation(async (r: any) => {
    store.push({
      candidate_id: r.candidateId,
      attempt: r.attempt,
      validation_status: r.validationStatus,
      model_name: r.modelName,
      prompt_hash: r.promptHash,
      text: r.text,
    });
    return { id: store.length };
  });
  mockUtils.listLatestValidRecordsPageQuery.mockImplementation(
    async (_c: number, _o: number, after: string, limit: number) =>
      latestValid()
        .filter((r) => r.candidate_id > after)
        .slice(0, limit),
  );
});

describe("createCorpus", () => {
  it("gates ID order on the plan before inserting or spending anything", async () => {
    (verifyIdOrder as jest.Mock).mockImplementationOnce(() => {
      throw new IdOrderError("raceEthnicity: observed 14, expected 4286.7");
    });
    await expect(createCorpus(args)).rejects.toThrow(IdOrderError);
    expect(mockUtils.createCorpusQuery).not.toHaveBeenCalled();
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("refuses before inserting when the gateway is not configured", async () => {
    mockSettings.getGatewaySettings.mockImplementationOnce(() => {
      throw new GatewayNotConfiguredError(["BIAS_AUDIT_LLM_API_KEY"]);
    });
    await expect(createCorpus(args)).rejects.toThrow(GatewayNotConfiguredError);
    expect(mockUtils.createCorpusQuery).not.toHaveBeenCalled();
  });

  it("records the pinned model, seed, JD hash, knockout, name method and comparison", async () => {
    mockUtils.createCorpusQuery.mockResolvedValueOnce({ id: 3 });
    await expect(createCorpus({ ...args, knockout: "dont_know" })).resolves.toEqual({
      corpusId: 3,
    });
    const [row, organizationId] = mockUtils.createCorpusQuery.mock.calls[0];
    expect(organizationId).toBe(1);
    expect(row).toMatchObject({
      modelPinned: "pinned-model-1",
      knockout: "dont_know",
      requestedCount: 700,
      plannedCount: 700,
      jobDescriptionSha256: jobDescriptionSha256(JOB_DESCRIPTIONS["commercial-ae"]),
      nameMethod: NAME_METHOD,
      criteriaComparison: args.criteriaComparison,
    });
    expect(Number.isInteger(row.seed)).toBe(true);
    expect(row.seed).toBeGreaterThanOrEqual(0);
    expect(row.seed).toBeLessThanOrEqual(2 ** 31 - 1);
    expect(Object.keys(row.idOrderCheck).sort()).toEqual(["raceEthnicity", "sex", "tierKey"]);
  });

  it("stores the achieved count beside the request, and the seed that cleared the gate", async () => {
    await createCorpus({ ...args, count: 5000 });
    const [row] = mockUtils.createCorpusQuery.mock.calls[0];
    expect(row).toMatchObject({ requestedCount: 5000, plannedCount: 4970 });
    // The stored seed reproduces the plan on its first draw.
    const plan = buildAllocation({
      count: 4970,
      tiers: JD.tiers.map((t) => t.key),
      smallSampleExclusion: 0.02,
    });
    expect(assignCandidateIds({ rows: plan.rows, seed: row.seed }).seedUsed).toBe(row.seed);
  });

  // Review Focus 5
  it("refuses a second concurrent run for the same project", async () => {
    const err: any = new Error("duplicate key");
    err.original = { code: "23505", constraint: "bias_audit_corpora_one_running_uq" };
    mockUtils.createCorpusQuery.mockRejectedValueOnce(err);
    await expect(createCorpus(args)).rejects.toThrow(/already running/i);
  });

  it("refuses an unknown job description, artifact form or knockout answer", async () => {
    await expect(createCorpus({ ...args, jobDescriptionKey: "x" as any })).rejects.toThrow(
      /job description/i,
    );
    await expect(createCorpus({ ...args, artifactKind: "audio" as any })).rejects.toThrow(/form/i);
    await expect(createCorpus({ ...args, knockout: "maybe" as any })).rejects.toThrow(/knockout/i);
    expect(mockUtils.createCorpusQuery).not.toHaveBeenCalled();
  });
});

describe("runCorpusGeneration", () => {
  afterEach(() => jest.useRealTimers());

  const run = () => runCorpusGeneration({ corpusId: 3, organizationId: 1 });
  const done = () => mockUtils.updateCorpusStatusQuery.mock.calls.at(-1)![0];
  const claimToken = () => mockUtils.claimCorpusLeaseQuery.mock.calls[0][2];

  it("records every model observed, not the pinned one", async () => {
    mockComplete.mockImplementationOnce(reply("m1")).mockImplementation(reply("m2"));
    await expect(run()).resolves.toEqual({
      status: "complete",
      recordCount: 700,
      modelsObserved: { m1: 1, m2: 699 },
    });
  });

  // Review Focus 1
  it("resumes from the log: generates only what is missing and builds the manifest from all of it", async () => {
    seedLog(logFor(300));
    mockComplete.mockImplementation(reply());
    await run();
    expect(mockComplete).toHaveBeenCalledTimes(400);
    expect(done().manifest).toHaveLength(700);
    expect(done().recordCount).toBe(700);
  });

  it("leaves the corpus running after a mid-run failure, with every finished record logged", async () => {
    let calls = 0;
    mockComplete.mockImplementation(async (s: unknown, p: string) => {
      if (++calls > 100) throw new Error("gateway request failed (status 500)");
      return reply()(s, p);
    });
    await expect(run()).rejects.toThrow();
    expect(mockUtils.appendCorpusRecordQuery).toHaveBeenCalledTimes(100);
    expect(mockUtils.updateCorpusStatusQuery).not.toHaveBeenCalled();
    // BullMQ retries the job (Task 8); the next attempt resumes from these 100.
  });

  it("retries an invalid record as a new attempt, never overwriting the first", async () => {
    seedLog(logFor(699));
    mockComplete.mockResolvedValueOnce(ok("m1", "  ")).mockImplementationOnce(reply());
    await run();
    const appended = mockUtils.appendCorpusRecordQuery.mock.calls.map((c) => c[0]);
    expect(
      appended.map((r) => [r.candidateId, r.attempt, r.validationStatus, r.invalidReason]),
    ).toEqual([
      ["C0700", 1, "invalid", "empty"],
      ["C0700", 2, "valid", null],
    ]);
  });

  it("logs a reply without the candidate's name as an invalid attempt", async () => {
    seedLog(logFor(699));
    mockComplete.mockResolvedValueOnce(ok("m1", RESUME)).mockImplementationOnce(reply());
    await run();
    const appended = mockUtils.appendCorpusRecordQuery.mock.calls.map((c) => c[0]);
    expect(appended.map((r) => r.invalidReason)).toEqual(["no_name", null]);
  });

  it("logs an unfinished response as an invalid attempt (ruling: only 'stop' is clean)", async () => {
    seedLog(logFor(699));
    mockComplete
      .mockImplementationOnce(async (s: unknown, p: string) => ({
        ...(await reply()(s, p)),
        finishReason: "length",
      }))
      .mockImplementationOnce(reply());
    await run();
    const appended = mockUtils.appendCorpusRecordQuery.mock.calls.map((c) => c[0]);
    expect(appended.map((r) => [r.attempt, r.validationStatus, r.invalidReason])).toEqual([
      [1, "invalid", "unfinished"],
      [2, "valid", null],
    ]);
  });

  const attempts = (n: number) => [...Array(n)].map((_, i) => i + 1);

  it("allows five attempts per record (ruling)", () => {
    expect(MAX_ATTEMPTS).toBe(5);
  });

  it("gives up on a record after MAX_ATTEMPTS, counting attempts from earlier passes", async () => {
    seedLog([
      ...logFor(699),
      ...attempts(MAX_ATTEMPTS - 1).map((attempt) => ({
        ...logFor(700)[699],
        attempt,
        validation_status: "invalid" as const,
        text: "",
      })),
    ]);
    mockComplete.mockResolvedValue(ok("m1", "  "));
    const out = await run();
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(mockUtils.appendCorpusRecordQuery.mock.calls[0][0].attempt).toBe(MAX_ATTEMPTS);
    expect(out.recordCount).toBe(699);
    expect(done().manifest.map((r: any) => r.candidateId)).not.toContain("C0700");
  });

  it("blocks a corpus whose cells fall under the floor, with the reason (ruling)", async () => {
    // One record out of 700 leaves its cell at 49, under MIN_PER_CELL = 50.
    seedLog([
      ...logFor(699),
      ...attempts(MAX_ATTEMPTS).map((attempt) => ({
        ...logFor(700)[699],
        attempt,
        validation_status: "invalid" as const,
        text: "",
      })),
    ]);
    await expect(run()).resolves.toMatchObject({ status: "blocked", recordCount: 699 });
    expect(done()).toMatchObject({ status: "blocked", failureCode: "cells_below_floor" });
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("never completes a corpus with no valid records", async () => {
    seedLog(
      logFor(700).flatMap((r) =>
        attempts(MAX_ATTEMPTS).map((attempt) => ({
          ...r,
          attempt,
          validation_status: "invalid" as const,
        })),
      ),
    );
    await expect(run()).resolves.toMatchObject({ status: "blocked", recordCount: 0 });
    expect(done()).toMatchObject({ status: "blocked", recordCount: 0 });
  });

  it("returns a blocked corpus as is on a retry", async () => {
    mockUtils.getCorpusQuery.mockResolvedValueOnce(
      corpusRow({ status: "blocked", record_count: 699, models_observed_json: { m1: 699 } }),
    );
    await expect(run()).resolves.toEqual({
      status: "blocked",
      recordCount: 699,
      modelsObserved: { m1: 699 },
    });
    expect(mockUtils.claimCorpusLeaseQuery).not.toHaveBeenCalled();
  });

  describe("the lease", () => {
    it("claims the corpus before generating, and names its token on every write", async () => {
      seedLog(logFor(690));
      mockComplete.mockImplementation(reply());
      await run();
      const token = claimToken();
      expect(token).toMatch(/^[0-9a-f-]{36}$/);
      expect(mockUtils.claimCorpusLeaseQuery).toHaveBeenCalledWith(3, 1, token, LEASE_SECONDS);
      expect(mockUtils.claimCorpusLeaseQuery.mock.invocationCallOrder[0]).toBeLessThan(
        mockComplete.mock.invocationCallOrder[0],
      );
      for (const [r] of mockUtils.appendCorpusRecordQuery.mock.calls)
        expect(r.ownerToken).toBe(token);
      expect(done().ownerToken).toBe(token);
    });

    it("releases its lease when the run fails, so a retry can claim at once", async () => {
      mockComplete.mockRejectedValue(new Error("gateway request failed (status 500)"));
      await expect(run()).rejects.toThrow(/status 500/);
      expect(mockUtils.releaseCorpusLeaseQuery).toHaveBeenCalledWith(3, 1, claimToken());
    });

    it("keeps the original error when the release itself fails", async () => {
      mockComplete.mockRejectedValue(new Error("gateway request failed (status 500)"));
      mockUtils.releaseCorpusLeaseQuery.mockRejectedValueOnce(new Error("db down"));
      await expect(run()).rejects.toThrow(/status 500/);
    });

    it("does not release after completing (the completion write already did)", async () => {
      seedLog(logFor(700));
      await run();
      expect(mockUtils.releaseCorpusLeaseQuery).not.toHaveBeenCalled();
    });

    const lease = (o: Record<string, unknown>) => ({
      status: "running",
      lease_expires_at: null,
      lease_live: false,
      record_count: null,
      models_observed_json: null,
      ...o,
    });

    it("refuses with CorpusBusyError, carrying the lease expiry, while another runner holds it", async () => {
      const until = new Date("2030-01-01T00:00:00Z");
      mockUtils.claimCorpusLeaseQuery.mockResolvedValueOnce(false);
      mockUtils.getCorpusLeaseQuery.mockResolvedValueOnce(
        lease({ lease_expires_at: until, lease_live: true }),
      );
      const err = await run().catch((e) => e);
      expect(err).toBeInstanceOf(CorpusBusyError);
      expect(err).not.toBeInstanceOf(LeaseLostError);
      expect(err.leaseExpiresAt).toEqual(until);
      // Liveness came from the database, and a live lease is not claimed twice.
      expect(mockUtils.claimCorpusLeaseQuery).toHaveBeenCalledTimes(1);
      expect(mockComplete).not.toHaveBeenCalled();
      expect(mockUtils.appendCorpusRecordQuery).not.toHaveBeenCalled();
      expect(mockUtils.releaseCorpusLeaseQuery).not.toHaveBeenCalled();
    });

    it("claims once more when the database shows the other lease expired, and runs", async () => {
      seedLog(logFor(700));
      mockUtils.claimCorpusLeaseQuery.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      mockUtils.getCorpusLeaseQuery.mockResolvedValueOnce(lease({ lease_live: false }));
      await expect(run()).resolves.toMatchObject({ status: "complete" });
      expect(mockUtils.claimCorpusLeaseQuery).toHaveBeenCalledTimes(2);
    });

    it("is busy, not a contradictory conflict, when the retried claim also fails", async () => {
      const until = new Date("2030-01-01T00:00:00Z");
      mockUtils.claimCorpusLeaseQuery.mockResolvedValue(false);
      mockUtils.getCorpusLeaseQuery
        .mockResolvedValueOnce(lease({ lease_live: false }))
        .mockResolvedValueOnce(lease({ lease_expires_at: until, lease_live: true }));
      const err = await run().catch((e) => e);
      expect(err).toBeInstanceOf(CorpusBusyError);
      expect(err.leaseExpiresAt).toEqual(until);
      expect(mockUtils.claimCorpusLeaseQuery).toHaveBeenCalledTimes(2);
    });

    it("returns the stored result when the corpus completed between the read and the claim", async () => {
      mockUtils.claimCorpusLeaseQuery.mockResolvedValueOnce(false);
      mockUtils.getCorpusLeaseQuery.mockResolvedValueOnce(
        lease({ status: "complete", record_count: 700, models_observed_json: { m1: 700 } }),
      );
      await expect(run()).resolves.toEqual({
        status: "complete",
        recordCount: 700,
        modelsObserved: { m1: 700 },
      });
    });

    it("gives the not-running conflict when the corpus failed between the read and the claim", async () => {
      mockUtils.claimCorpusLeaseQuery.mockResolvedValueOnce(false);
      mockUtils.getCorpusLeaseQuery.mockResolvedValueOnce(lease({ status: "failed" }));
      await expect(run()).rejects.toThrow(/not running \(failed\)/);
    });

    it("stops when an append finds the lease gone", async () => {
      mockComplete.mockImplementation(reply());
      mockUtils.appendCorpusRecordQuery.mockResolvedValueOnce(null);
      await expect(run()).rejects.toThrow(LeaseLostError);
      expect(mockComplete).toHaveBeenCalledTimes(1);
    });

    it("maps a second runner's duplicate attempt to LeaseLostError, not a raw constraint error", async () => {
      mockComplete.mockImplementation(reply());
      const dup: any = new Error("duplicate key value");
      dup.name = "SequelizeUniqueConstraintError";
      dup.original = { code: "23505", constraint: "bias_audit_corpus_records_attempt_uq" };
      mockUtils.appendCorpusRecordQuery.mockRejectedValueOnce(dup);
      await expect(run()).rejects.toThrow(LeaseLostError);
    });

    it("stops when the completion write finds the lease gone", async () => {
      seedLog(logFor(700));
      mockUtils.updateCorpusStatusQuery.mockResolvedValueOnce(false);
      await expect(run()).rejects.toThrow(LeaseLostError);
    });
  });

  describe("the heartbeat", () => {
    it(`renews the lease every ${HEARTBEAT_INTERVAL_MS / 1000}s by the clock, not by record count`, async () => {
      jest.useFakeTimers();
      // Each gateway call takes 10 seconds.
      mockComplete.mockImplementation(async (s: unknown, p: string) => {
        jest.advanceTimersByTime(10_000);
        return reply()(s, p);
      });
      await run();
      const beats = mockUtils.touchCorpusHeartbeatQuery.mock.calls;
      // 700 calls x 10 s = 7,000 s: one beat per 30 s, plus the one before completion.
      expect(beats.length).toBeGreaterThanOrEqual(Math.floor(7000 / 30));
      expect(beats.length).toBeLessThanOrEqual(Math.floor(7000 / 30) + 1);
      for (const b of beats) expect(b).toEqual([3, 1, claimToken(), LEASE_SECONDS]);
      expect(jest.getTimerCount()).toBe(0);
    });

    it("stops spending once a beat finds the lease gone, and clears its timer", async () => {
      jest.useFakeTimers();
      mockUtils.touchCorpusHeartbeatQuery.mockResolvedValue(false);
      mockComplete.mockImplementation(async (s: unknown, p: string) => {
        jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS + 1000);
        return reply()(s, p);
      });
      await expect(run()).rejects.toThrow(LeaseLostError);
      expect(mockComplete.mock.calls.length).toBeLessThanOrEqual(2);
      expect(mockUtils.updateCorpusStatusQuery).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });

    it("rides out a transient heartbeat error and renews on the next beat (ruling)", async () => {
      jest.useFakeTimers();
      mockUtils.touchCorpusHeartbeatQuery
        .mockRejectedValueOnce(new Error("connection reset"))
        .mockResolvedValue(true);
      mockComplete.mockImplementation(async (s: unknown, p: string) => {
        jest.advanceTimersByTime(10_000);
        return reply()(s, p);
      });
      await expect(run()).resolves.toMatchObject({ status: "complete" });
    });

    it("stops once heartbeat errors outlast the lease", async () => {
      jest.useFakeTimers();
      mockUtils.touchCorpusHeartbeatQuery.mockRejectedValue(new Error("connection reset"));
      mockComplete.mockImplementation(async (s: unknown, p: string) => {
        jest.advanceTimersByTime(10_000);
        return reply()(s, p);
      });
      await expect(run()).rejects.toThrow(LeaseLostError);
      // The lease runs 120 s from the claim; at 10 s a call that is about 12 calls.
      expect(mockComplete.mock.calls.length).toBeLessThanOrEqual(LEASE_SECONDS / 10 + 1);
      expect(mockUtils.updateCorpusStatusQuery).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });

    it("beats once more before the final re-read and hash", async () => {
      seedLog(logFor(700));
      await run();
      const [beat] = mockUtils.touchCorpusHeartbeatQuery.mock.invocationCallOrder;
      const [, finalRead] = mockUtils.listCorpusLogQuery.mock.invocationCallOrder;
      const [firstPage] = mockUtils.listLatestValidRecordsPageQuery.mock.invocationCallOrder;
      expect(beat).toBeLessThan(finalRead);
      expect(beat).toBeLessThan(firstPage);
    });
  });

  it("refuses to resume under a model other than the pinned one, and fails the corpus", async () => {
    mockUtils.getCorpusQuery.mockResolvedValue(corpusRow({ model_pinned: "another-model" }));
    await expect(run()).rejects.toThrow(CorpusModelChangedError);
    // Failed under this runner's lease (which clears it), so the one-running
    // index frees the project; checked only after the claim.
    expect(mockUtils.updateCorpusStatusQuery).toHaveBeenCalledWith(
      { corpusId: 3, status: "failed", failureCode: "model_changed", ownerToken: claimToken() },
      1,
    );
    expect(mockUtils.claimCorpusLeaseQuery.mock.invocationCallOrder[0]).toBeLessThan(
      mockUtils.updateCorpusStatusQuery.mock.invocationCallOrder[0],
    );
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("stores separate manifest and corpus hashes on the completion write", async () => {
    seedLog(logFor(700));
    mockUtils.listLatestValidRecordsPageQuery
      .mockResolvedValueOnce(pageOf(500))
      .mockResolvedValueOnce(pageOf(700).slice(500));
    await run();
    expect(done().status).toBe("complete");
    expect(done().manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(done().corpusSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(done().manifestSha256).not.toBe(done().corpusSha256);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("hashes the canonical manifest, so the stored JSONB copy reproduces it", async () => {
    seedLog(logFor(700));
    await run();
    const stored = done().manifest.map((r: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(r).reverse()),
    );
    expect(done().manifestSha256).toBe(
      createHash("sha256").update(canonicalManifest(stored), "utf8").digest("hex"),
    );
  });

  it("hashes exactly the bytes the download serves, paging 500 rows after the last ID", async () => {
    seedLog(logFor(700));
    await run();
    const pages = mockUtils.listLatestValidRecordsPageQuery.mock.calls;
    expect(pages.map((c) => [c[2], c[3]])).toEqual([
      ["", 500],
      ["C0500", 500],
    ]);
    const bytes =
      corpusCsvHeaderLine() +
      pageOf(700)
        .map((r) =>
          corpusCsvRow({ candidateId: r.candidate_id, artifactKind: "resume", text: r.text }),
        )
        .join("");
    expect(done().corpusSha256).toBe(createHash("sha256").update(bytes, "utf8").digest("hex"));
  });

  it("refuses to complete when the downloadable rows differ from the manifest", async () => {
    seedLog(logFor(700));
    mockUtils.listLatestValidRecordsPageQuery
      .mockResolvedValueOnce(pageOf(699))
      .mockResolvedValueOnce([]);
    await expect(run()).rejects.toThrow(/manifest/i);
    expect(mockUtils.updateCorpusStatusQuery).not.toHaveBeenCalled();
  });

  it("refuses a log that names candidates outside the plan", async () => {
    seedLog([...logFor(700), { ...logFor(1)[0], candidate_id: "C9999" }]);
    await expect(run()).rejects.toThrow(/C9999/);
    expect(mockUtils.updateCorpusStatusQuery).not.toHaveBeenCalled();
  });

  it("refuses to resume when the job description text has changed since the corpus began", async () => {
    mockUtils.getCorpusQuery.mockResolvedValue(
      corpusRow({ job_description_sha256: "0".repeat(64) }),
    );
    await expect(run()).rejects.toThrow(/job description/i);
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockUtils.updateCorpusStatusQuery).toHaveBeenCalledWith(
      {
        corpusId: 3,
        status: "failed",
        failureCode: "job_description_changed",
        ownerToken: claimToken(),
      },
      1,
    );
  });

  it.each([
    ["unknown_job_description", { job_description_key: "retired-jd" }],
    ["unknown_artifact_kind", { artifact_kind: "audio" }],
    ["plan_failed", { planned_count: 650 }],
  ])("fails the corpus as %s under its token when it cannot be resumed", async (failureCode, o) => {
    mockUtils.getCorpusQuery.mockResolvedValue(corpusRow(o));
    await expect(run()).rejects.toThrow();
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockUtils.updateCorpusStatusQuery).toHaveBeenCalledWith(
      { corpusId: 3, status: "failed", failureCode, ownerToken: claimToken() },
      1,
    );
  });

  it("fails the corpus as plan_failed when the stored plan no longer clears the ID gate", async () => {
    (verifyIdOrder as jest.Mock).mockImplementationOnce(() => {
      throw new IdOrderError("sex: observed 2, expected 351");
    });
    await expect(run()).rejects.toThrow(IdOrderError);
    expect(mockUtils.updateCorpusStatusQuery).toHaveBeenCalledWith(
      { corpusId: 3, status: "failed", failureCode: "plan_failed", ownerToken: claimToken() },
      1,
    );
  });

  it("fails the corpus as plan_changed when its seed no longer reproduces the plan", async () => {
    // A seed whose first draw fails the ID-order gate: assignCandidateIds redraws,
    // so the plan it returns is not the one the stored seed names.
    const rows = buildAllocation({
      count: 700,
      tiers: JD.tiers.map((t) => t.key),
      smallSampleExclusion: 0.02,
    }).rows;
    let tail = 0;
    while (assignCandidateIds({ rows, seed: tail }).seedUsed === tail) tail++;
    mockUtils.getCorpusQuery.mockResolvedValue(corpusRow({ seed: tail }));
    await expect(run()).rejects.toThrow(/no longer reproduces the plan/);
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockUtils.updateCorpusStatusQuery).toHaveBeenCalledWith(
      { corpusId: 3, status: "failed", failureCode: "plan_changed", ownerToken: claimToken() },
      1,
    );
  });

  it("refuses a corpus that is missing or no longer running, and returns a complete one as is", async () => {
    mockUtils.getCorpusQuery.mockResolvedValueOnce(null);
    await expect(run()).rejects.toThrow(/not found/i);
    mockUtils.getCorpusQuery.mockResolvedValueOnce(corpusRow({ status: "failed" }));
    await expect(run()).rejects.toThrow(/not running/i);
    mockUtils.getCorpusQuery.mockResolvedValueOnce(
      corpusRow({ status: "complete", record_count: 700, models_observed_json: { m1: 700 } }),
    );
    await expect(run()).resolves.toEqual({
      status: "complete",
      recordCount: 700,
      modelsObserved: { m1: 700 },
    });
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("never sends the assigned group to the gateway", async () => {
    seedLog(logFor(560));
    mockComplete.mockImplementation(reply());
    await run();
    expect(mockComplete).toHaveBeenCalledTimes(140);
    for (const [s, prompt, opts] of mockComplete.mock.calls) {
      expect(s).toBe(SETTINGS);
      expect(opts).toMatchObject({ retries: 3 });
      expect(prompt).not.toMatch(
        /\b(male|female|hispanic|latino|white|black|asian|native|race|ethnicity)\b/i,
      );
    }
  });
});
