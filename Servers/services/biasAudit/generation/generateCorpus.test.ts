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
import { corpusCsvHeaderLine, corpusCsvRow } from "./corpusCsv";
import { createCorpus, jobDescriptionSha256, runCorpusGeneration } from "./generateCorpus";

const mockUtils = utils as unknown as Record<string, jest.Mock>;
const mockComplete = complete as jest.Mock;
const mockSettings = settings as unknown as { getGatewaySettings: jest.Mock };

const SETTINGS = { baseUrl: "https://gateway.example", apiKey: "k", model: "pinned-model-1" };
const JD = JOB_DESCRIPTIONS["commercial-ae"];
const RESUME = "Sam Lee\nExperience\nAccount Executive, 2019-2024\nSkills\nNegotiation";
const H = "h".repeat(64);
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
  it("records every model observed, not the pinned one", async () => {
    mockComplete.mockResolvedValueOnce(ok("m1")).mockResolvedValue(ok("m2"));
    const out = await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
    expect(out).toEqual({
      status: "complete",
      recordCount: 700,
      modelsObserved: { m1: 1, m2: 699 },
    });
  });

  // Review Focus 1
  it("resumes from the log: generates only what is missing and builds the manifest from all of it", async () => {
    seedLog(logFor(300));
    mockComplete.mockResolvedValue(ok());
    await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
    expect(mockComplete).toHaveBeenCalledTimes(400);
    const done = mockUtils.updateCorpusStatusQuery.mock.calls.at(-1)![0];
    expect(done.manifest).toHaveLength(700);
    expect(done.recordCount).toBe(700);
  });

  it("leaves the corpus running after a mid-run failure, with every finished record logged", async () => {
    let calls = 0;
    mockComplete.mockImplementation(async () => {
      if (++calls > 100) throw new Error("gateway request failed (status 500)");
      return ok();
    });
    await expect(runCorpusGeneration({ corpusId: 3, organizationId: 1 })).rejects.toThrow();
    expect(mockUtils.appendCorpusRecordQuery).toHaveBeenCalledTimes(100);
    expect(mockUtils.updateCorpusStatusQuery).not.toHaveBeenCalled();
    // BullMQ retries the job (Task 8); the next attempt resumes from these 100.
  });

  it("retries an invalid record as a new attempt, never overwriting the first", async () => {
    seedLog(logFor(699));
    mockComplete.mockResolvedValueOnce(ok("m1", "  ")).mockResolvedValueOnce(ok());
    await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
    const appended = mockUtils.appendCorpusRecordQuery.mock.calls.map((c) => c[0]);
    expect(
      appended.map((r) => [r.candidateId, r.attempt, r.validationStatus, r.invalidReason]),
    ).toEqual([
      ["C0700", 1, "invalid", "empty"],
      ["C0700", 2, "valid", null],
    ]);
  });

  it("logs an unfinished response as an invalid attempt (ruling: only 'stop' is clean)", async () => {
    seedLog(logFor(699));
    mockComplete
      .mockResolvedValueOnce({ ...ok(), finishReason: "length" })
      .mockResolvedValueOnce(ok());
    await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
    const appended = mockUtils.appendCorpusRecordQuery.mock.calls.map((c) => c[0]);
    expect(appended.map((r) => [r.attempt, r.validationStatus, r.invalidReason])).toEqual([
      [1, "invalid", "unfinished"],
      [2, "valid", null],
    ]);
  });

  it("gives up on a record after 3 attempts, counting attempts from earlier passes", async () => {
    seedLog([
      ...logFor(699),
      { ...logFor(700)[699], attempt: 1, validation_status: "invalid", text: "" },
      { ...logFor(700)[699], attempt: 2, validation_status: "invalid", text: "" },
    ]);
    mockComplete.mockResolvedValue(ok("m1", "  "));
    const out = await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(mockUtils.appendCorpusRecordQuery.mock.calls[0][0].attempt).toBe(3);
    expect(out.recordCount).toBe(699);
    const done = mockUtils.updateCorpusStatusQuery.mock.calls.at(-1)![0];
    expect(done.manifest.map((r: any) => r.candidateId)).not.toContain("C0700");
  });

  it("touches the heartbeat at least every 25 records", async () => {
    mockComplete.mockResolvedValue(ok());
    await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
    expect(mockUtils.touchCorpusHeartbeatQuery.mock.calls.length).toBeGreaterThanOrEqual(700 / 25);
    expect(mockUtils.touchCorpusHeartbeatQuery).toHaveBeenCalledWith(3, 1);
  });

  it("stops spending once the corpus is no longer running", async () => {
    mockComplete.mockResolvedValue(ok());
    mockUtils.touchCorpusHeartbeatQuery.mockResolvedValueOnce(true).mockResolvedValue(false);
    await expect(runCorpusGeneration({ corpusId: 3, organizationId: 1 })).rejects.toThrow(
      /no longer running/i,
    );
    expect(mockComplete.mock.calls.length).toBeLessThanOrEqual(25);
    expect(mockUtils.updateCorpusStatusQuery).not.toHaveBeenCalled();
  });

  it("stores separate manifest and corpus hashes on the completion write", async () => {
    seedLog(logFor(700));
    mockUtils.listLatestValidRecordsPageQuery
      .mockResolvedValueOnce(pageOf(500))
      .mockResolvedValueOnce(pageOf(700).slice(500));
    await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
    const done = mockUtils.updateCorpusStatusQuery.mock.calls.at(-1)![0];
    expect(done.status).toBe("complete");
    expect(done.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(done.corpusSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(done.manifestSha256).not.toBe(done.corpusSha256);
    expect(done.manifestSha256).toBe(
      createHash("sha256").update(JSON.stringify(done.manifest)).digest("hex"),
    );
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("hashes exactly the bytes the download serves, paging 500 rows after the last ID", async () => {
    seedLog(logFor(700));
    await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
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
    const done = mockUtils.updateCorpusStatusQuery.mock.calls.at(-1)![0];
    expect(done.corpusSha256).toBe(createHash("sha256").update(bytes, "utf8").digest("hex"));
  });

  it("refuses to complete when the downloadable rows differ from the manifest", async () => {
    seedLog(logFor(700));
    mockUtils.listLatestValidRecordsPageQuery
      .mockResolvedValueOnce(pageOf(699))
      .mockResolvedValueOnce([]);
    await expect(runCorpusGeneration({ corpusId: 3, organizationId: 1 })).rejects.toThrow(
      /manifest/i,
    );
    expect(mockUtils.updateCorpusStatusQuery).not.toHaveBeenCalled();
  });

  it("refuses a log that names candidates outside the plan", async () => {
    seedLog([...logFor(700), { ...logFor(1)[0], candidate_id: "C9999" }]);
    await expect(runCorpusGeneration({ corpusId: 3, organizationId: 1 })).rejects.toThrow(/C9999/);
    expect(mockUtils.updateCorpusStatusQuery).not.toHaveBeenCalled();
  });

  it("refuses to resume when the job description text has changed since the corpus began", async () => {
    mockUtils.getCorpusQuery.mockResolvedValue(
      corpusRow({ job_description_sha256: "0".repeat(64) }),
    );
    await expect(runCorpusGeneration({ corpusId: 3, organizationId: 1 })).rejects.toThrow(
      /job description/i,
    );
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("refuses a corpus that is missing or no longer running, and returns a complete one as is", async () => {
    mockUtils.getCorpusQuery.mockResolvedValueOnce(null);
    await expect(runCorpusGeneration({ corpusId: 3, organizationId: 1 })).rejects.toThrow(
      /not found/i,
    );
    mockUtils.getCorpusQuery.mockResolvedValueOnce(corpusRow({ status: "failed" }));
    await expect(runCorpusGeneration({ corpusId: 3, organizationId: 1 })).rejects.toThrow(
      /not running/i,
    );
    mockUtils.getCorpusQuery.mockResolvedValueOnce(
      corpusRow({ status: "complete", record_count: 700, models_observed_json: { m1: 700 } }),
    );
    await expect(runCorpusGeneration({ corpusId: 3, organizationId: 1 })).resolves.toEqual({
      status: "complete",
      recordCount: 700,
      modelsObserved: { m1: 700 },
    });
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("refuses to write completion over a corpus that stopped running meanwhile", async () => {
    seedLog(logFor(700));
    mockUtils.updateCorpusStatusQuery.mockResolvedValueOnce(false);
    await expect(runCorpusGeneration({ corpusId: 3, organizationId: 1 })).rejects.toThrow(
      /no longer running/i,
    );
  });

  it("never sends the assigned group to the gateway", async () => {
    seedLog(logFor(560));
    mockComplete.mockResolvedValue(ok());
    await runCorpusGeneration({ corpusId: 3, organizationId: 1 });
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
