import { createHash } from "node:crypto";

const utils = {
  getAttestedProfileQuery: jest.fn(),
  getProfileAnswersQuery: jest.fn(),
  getProjectQuery: jest.fn(),
  markStaleCorporaFailedQuery: jest.fn(),
  getCorpusQuery: jest.fn(),
  listCorporaQuery: jest.fn(),
  countValidCorpusRecordsQuery: jest.fn(),
  listLatestValidRecordsPageQuery: jest.fn(),
  resumeCorpusQuery: jest.fn(),
  updateCorpusStatusQuery: jest.fn(),
};
jest.mock("../../utils/biasAudit.utils", () => utils);
const access = { assertProjectAccess: jest.fn() };
jest.mock("./projectAccess", () => access);
const gen = { createCorpus: jest.fn() };
jest.mock("./generation/generateCorpus", () => ({
  createCorpus: gen.createCorpus,
  STALE_AFTER_SECONDS: 600,
  // The real loop, reading the mocked utils, so the download is tested as served.
  corpusCsvChunks: jest.requireActual("./generation/generateCorpus").corpusCsvChunks,
}));
const job = { enqueueCorpusGeneration: jest.fn() };
jest.mock("./generation/generationJob", () => job);
const settings = { isGatewayConfigured: jest.fn(), getGatewaySettings: jest.fn() };
jest.mock("./generation/settings", () => settings);

import {
  ConflictException,
  NotFoundException,
} from "../../domain.layer/exceptions/custom.exception";
import { JOB_DESCRIPTIONS } from "../../structures/NYC-Local-Law-144/job-descriptions";
import { compareCriteria } from "./criteriaComparison";
import {
  getCorpusView,
  getJobDescriptionsView,
  LIST_SWEEP_INTERVAL_MS,
  listCorpora,
  resumeCorpus,
  startCorpusGeneration,
  streamCorpusDownload,
} from "./corpusService";

const ans = (k: string, v: string | null) => ({
  question_key: k,
  answer_value: v,
  is_dont_know: v === null,
});

const IN_SCOPE = [
  ans("role.party", "vendor"),
  ans("scope.weighting", "biggest"),
  ans("independence.auditor", "self"),
  ans("data.held", "none"),
  ans("data.basis", "test_attribute"),
  ans("cutoff.applied_by", "platform"),
];

const VIEWER = { userId: 9, role: "Editor" };
const input = (over: Record<string, unknown> = {}) => ({
  projectId: 7,
  frameworkId: 12,
  organizationId: 42,
  userId: 9,
  role: "Editor",
  jobDescriptionKey: "commercial-ae" as const,
  criteriaSupplied: null as string | null,
  count: 5000,
  ...over,
});

const corpusRow = (over: Record<string, unknown> = {}) => ({
  id: 3,
  organization_id: 42,
  project_id: 7,
  profile_id: 5,
  profile_version: 2,
  job_description_key: "commercial-ae",
  job_description_sha256: "a".repeat(64),
  artifact_kind: "resume",
  knockout: "no",
  requested_count: 5000,
  planned_count: 4970,
  record_count: null,
  seed: 1234,
  model_pinned: "provider/model",
  name_method: "names",
  criteria_supplied: null,
  criteria_comparison_json: { verdict: "not_supplied" },
  models_observed_json: null,
  cell_sizes_json: null,
  id_order_check_json: null,
  release_findings_json: null,
  manifest_json: [{ candidateId: "C0001", sex: "Female", raceEthnicity: "Asian" }],
  manifest_sha256: null,
  corpus_sha256: null,
  status: "running",
  failure_code: null,
  heartbeat_at: new Date(),
  generated_by: 9,
  generated_at: new Date(),
  completed_at: null,
  owner_token: "tok",
  lease_expires_at: null,
  lease_live: false,
  ...over,
});

const callOrder = (f: jest.Mock) => f.mock.invocationCallOrder[0];

beforeEach(() => {
  [...Object.values(utils), access.assertProjectAccess, gen.createCorpus]
    .concat(job.enqueueCorpusGeneration, settings.isGatewayConfigured, settings.getGatewaySettings)
    .forEach((f) => f.mockReset());
  access.assertProjectAccess.mockResolvedValue(undefined);
  utils.getProjectQuery.mockResolvedValue({ id: 7 });
  utils.getAttestedProfileQuery.mockResolvedValue({ id: 5, version: 2, status: "attested" });
  utils.getProfileAnswersQuery.mockResolvedValue([
    ...IN_SCOPE,
    ans("pipeline.input_form", "resume"),
  ]);
  utils.markStaleCorporaFailedQuery.mockResolvedValue([]);
  utils.updateCorpusStatusQuery.mockResolvedValue(true);
  gen.createCorpus.mockResolvedValue({ corpusId: 3 });
  job.enqueueCorpusGeneration.mockResolvedValue(undefined);
  settings.isGatewayConfigured.mockReturnValue(true);
});

describe("startCorpusGeneration", () => {
  it("refuses an out-of-scope attested profile with 409, creating nothing", async () => {
    utils.getProfileAnswersQuery.mockResolvedValue([
      ...IN_SCOPE.map((a) =>
        a.question_key === "scope.weighting" ? ans("scope.weighting", "one_of_several") : a,
      ),
      ans("pipeline.input_form", "resume"),
    ]);
    const err = await startCorpusGeneration(input()).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toMatch(/out of scope/);
    expect(gen.createCorpus).not.toHaveBeenCalled();
  });

  it("refuses with 409 naming pipeline.input_form when the attested answers block generation", async () => {
    utils.getProfileAnswersQuery.mockResolvedValue([
      ...IN_SCOPE,
      ans("pipeline.input_form", "audio"),
    ]);
    const err = await startCorpusGeneration(input()).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toMatch(/pipeline\.input_form/);
    expect(gen.createCorpus).not.toHaveBeenCalled();
    expect(job.enqueueCorpusGeneration).not.toHaveBeenCalled();
  });

  it("refuses with 404 when there is no attested profile, creating nothing", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue(null);
    await expect(startCorpusGeneration(input())).rejects.toBeInstanceOf(NotFoundException);
    expect(gen.createCorpus).not.toHaveBeenCalled();
  });

  it("checks project access before reading the profile", async () => {
    access.assertProjectAccess.mockRejectedValue(new NotFoundException("Project 7 was not found"));
    await expect(startCorpusGeneration(input())).rejects.toBeInstanceOf(NotFoundException);
    expect(utils.getAttestedProfileQuery).not.toHaveBeenCalled();
    expect(gen.createCorpus).not.toHaveBeenCalled();
  });

  it.each([
    ["yes", "yes"],
    ["no", "no"],
    [null, "dont_know"],
    [undefined, "dont_know"],
  ])("records knockout.exists %p as %p and the form from pipeline.input_form", async (v, want) => {
    const rows = [...IN_SCOPE, ans("pipeline.input_form", "transcript")];
    if (v !== undefined) rows.push(ans("knockout.exists", v));
    utils.getProfileAnswersQuery.mockResolvedValue(rows);
    await startCorpusGeneration(input());
    expect(gen.createCorpus).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 7,
        profileId: 5,
        profileVersion: 2,
        organizationId: 42,
        userId: 9,
        artifactKind: "transcript",
        knockout: want,
        count: 5000,
        jobDescriptionKey: "commercial-ae",
      }),
    );
  });

  it("stores the criteria comparison, not_supplied when no criteria were given", async () => {
    await startCorpusGeneration(input());
    const args = gen.createCorpus.mock.calls[0][0];
    expect(args.criteriaSupplied).toBeNull();
    expect(args.criteriaComparison).toEqual(compareCriteria("commercial-ae", null));
    expect(args.criteriaComparison.verdict).toBe("not_supplied");

    gen.createCorpus.mockClear();
    const text = "Closing new business\nQuota attainment";
    await startCorpusGeneration(input({ criteriaSupplied: text }));
    const again = gen.createCorpus.mock.calls[0][0];
    expect(again.criteriaSupplied).toBe(text);
    expect(again.criteriaComparison).toEqual(compareCriteria("commercial-ae", text));
  });

  it("sweeps the organization's stale corpora before creating, then enqueues the new one", async () => {
    const out = await startCorpusGeneration(input());
    expect(out).toEqual({ corpusId: 3 });
    expect(utils.markStaleCorporaFailedQuery).toHaveBeenCalledWith(42, 600);
    expect(callOrder(utils.markStaleCorporaFailedQuery)).toBeLessThan(callOrder(gen.createCorpus));
    expect(job.enqueueCorpusGeneration).toHaveBeenCalledWith(3, 42);
  });

  it("fails the corpus it just created when the job cannot be queued", async () => {
    job.enqueueCorpusGeneration.mockRejectedValue(new Error("redis down"));
    await expect(startCorpusGeneration(input())).rejects.toThrow("redis down");
    expect(utils.updateCorpusStatusQuery).toHaveBeenCalledWith(
      { corpusId: 3, status: "failed", failureCode: "enqueue_failed" },
      42,
    );
  });
});

describe("listCorpora", () => {
  it("checks the project, sweeps, and lists the project's corpora in the organization", async () => {
    utils.listCorporaQuery.mockResolvedValue([{ id: 3 }]);
    const out = await listCorpora({ projectId: 7, frameworkId: 12, organizationId: 42, ...VIEWER });
    expect(access.assertProjectAccess).toHaveBeenCalledWith(7, 42, VIEWER);
    expect(utils.markStaleCorporaFailedQuery).toHaveBeenCalledWith(42, 600);
    expect(utils.listCorporaQuery).toHaveBeenCalledWith(7, 42);
    expect(out).toEqual({ corpora: [{ id: 3 }] });
  });

  it("sweeps an organization at most once a minute on the polled list", async () => {
    utils.listCorporaQuery.mockResolvedValue([]);
    const now = jest.spyOn(Date, "now");
    try {
      now.mockReturnValue(10_000_000);
      await listCorpora({ projectId: 7, frameworkId: 12, organizationId: 77, ...VIEWER });
      now.mockReturnValue(10_000_000 + LIST_SWEEP_INTERVAL_MS - 1);
      await listCorpora({ projectId: 7, frameworkId: 12, organizationId: 77, ...VIEWER });
      expect(utils.markStaleCorporaFailedQuery).toHaveBeenCalledTimes(1);
      now.mockReturnValue(10_000_000 + LIST_SWEEP_INTERVAL_MS);
      await listCorpora({ projectId: 7, frameworkId: 12, organizationId: 77, ...VIEWER });
      expect(utils.markStaleCorporaFailedQuery).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });
});

describe("getCorpusView", () => {
  it("answers a corpus in a project the viewer cannot see exactly like a missing one", async () => {
    utils.getCorpusQuery.mockResolvedValueOnce(null);
    const missing = await getCorpusView(3, 42, VIEWER).catch((e) => e);

    utils.getCorpusQuery.mockResolvedValueOnce(corpusRow());
    access.assertProjectAccess.mockImplementation(
      async (_p: number, _o: number, _v: unknown, notFound: () => Error) => {
        throw notFound();
      },
    );
    const hidden = await getCorpusView(3, 42, VIEWER).catch((e) => e);

    expect(missing).toBeInstanceOf(NotFoundException);
    expect(hidden).toBeInstanceOf(NotFoundException);
    expect(hidden.message).toBe(missing.message);
    expect(utils.countValidCorpusRecordsQuery).not.toHaveBeenCalled();
  });

  it("sweeps first and never includes the manifest, the lease token or record text", async () => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow());
    utils.countValidCorpusRecordsQuery.mockResolvedValue(120);
    const view = await getCorpusView(3, 42, VIEWER);
    expect(callOrder(utils.markStaleCorporaFailedQuery)).toBeLessThan(
      callOrder(utils.getCorpusQuery),
    );
    expect(view).toMatchObject({ id: 3, status: "running", valid_record_count: 120 });
    expect(view).not.toHaveProperty("manifest_json");
    expect(view).not.toHaveProperty("owner_token");
    expect(JSON.stringify(view)).not.toContain("C0001");
    expect(JSON.stringify(view)).not.toContain("tok");
  });
});

describe("streamCorpusDownload", () => {
  const HEADER = "candidate_id,artifact_kind,artifact\r\n";

  it.each(["blocked", "running", "failed"])("refuses a %s corpus with 409", async (status) => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow({ status }));
    const write = jest.fn();
    await expect(streamCorpusDownload(3, 42, VIEWER, write)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(write).not.toHaveBeenCalled();
    expect(utils.listLatestValidRecordsPageQuery).not.toHaveBeenCalled();
  });

  it("answers a corpus the viewer cannot see with 404", async () => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow({ status: "complete" }));
    access.assertProjectAccess.mockImplementation(
      async (_p: number, _o: number, _v: unknown, notFound: () => Error) => {
        throw notFound();
      },
    );
    const write = jest.fn();
    await expect(streamCorpusDownload(3, 42, VIEWER, write)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("streams the header then pages of 500, and the bytes hash to the stored corpus_sha256", async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => ({
      candidate_id: `C${String(i).padStart(4, "0")}`,
      text: `Record ${i}`,
    }));
    const page2 = [
      { candidate_id: "C0500", text: 'Quoted "text", with a comma' },
      { candidate_id: "C0501", text: "=SUM(A1)" },
    ];
    utils.listLatestValidRecordsPageQuery.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);

    const expected =
      HEADER +
      page1.map((r) => `${r.candidate_id},resume,${r.text}\r\n`).join("") +
      'C0500,resume,"Quoted ""text"", with a comma"\r\n' +
      "C0501,resume,'=SUM(A1)\r\n";
    const sha = createHash("sha256").update(expected, "utf8").digest("hex");
    utils.getCorpusQuery.mockResolvedValue(
      corpusRow({ status: "complete", record_count: 502, corpus_sha256: sha }),
    );

    const chunks: string[] = [];
    await streamCorpusDownload(3, 42, VIEWER, (c) => {
      chunks.push(c);
    });

    expect(chunks[0]).toBe(HEADER);
    expect(createHash("sha256").update(chunks.join(""), "utf8").digest("hex")).toBe(sha);
    expect(utils.listLatestValidRecordsPageQuery.mock.calls).toEqual([
      [3, 42, "", 500],
      [3, 42, "C0499", 500],
    ]);
  });

  it("throws after the last page when the served bytes do not match the stored hash", async () => {
    utils.listLatestValidRecordsPageQuery.mockResolvedValueOnce([
      { candidate_id: "C0001", text: "x" },
    ]);
    utils.getCorpusQuery.mockResolvedValue(
      corpusRow({ status: "complete", corpus_sha256: "0".repeat(64) }),
    );
    await expect(streamCorpusDownload(3, 42, VIEWER, () => undefined)).rejects.toThrow(
      /do not match/,
    );
  });
});

describe("resumeCorpus", () => {
  it.each(["model_changed", "job_description_changed", "plan_changed", "unknown_artifact_kind"])(
    "refuses a corpus that failed for good (%s) with 409",
    async (failure_code) => {
      utils.getCorpusQuery.mockResolvedValue(corpusRow({ status: "failed", failure_code }));
      await expect(resumeCorpus(3, 42, VIEWER)).rejects.toBeInstanceOf(ConflictException);
      expect(utils.resumeCorpusQuery).not.toHaveBeenCalled();
    },
  );

  it("re-checks the attested profile, refusing one that now withholds generation", async () => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow({ status: "failed" }));
    utils.getProfileAnswersQuery.mockResolvedValue([
      ...IN_SCOPE,
      ans("pipeline.input_form", "audio"),
    ]);
    await expect(resumeCorpus(3, 42, VIEWER)).rejects.toBeInstanceOf(ConflictException);
    expect(utils.getAttestedProfileQuery).toHaveBeenCalledWith(7, 12, 42);
    expect(utils.resumeCorpusQuery).not.toHaveBeenCalled();
  });

  it("refuses when the gateway is no longer configured", async () => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow({ status: "failed" }));
    settings.getGatewaySettings.mockImplementation(() => {
      throw new Error("not configured");
    });
    await expect(resumeCorpus(3, 42, VIEWER)).rejects.toThrow("not configured");
    expect(utils.resumeCorpusQuery).not.toHaveBeenCalled();
  });

  it("fails the corpus when its job cannot be queued, rather than leave it running", async () => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow({ status: "failed" }));
    utils.resumeCorpusQuery.mockResolvedValue(true);
    job.enqueueCorpusGeneration.mockRejectedValue(new Error("redis down"));
    await expect(resumeCorpus(3, 42, VIEWER)).rejects.toThrow("redis down");
    expect(utils.updateCorpusStatusQuery).toHaveBeenCalledWith(
      { corpusId: 3, status: "failed", failureCode: "enqueue_failed" },
      42,
    );
  });

  it.each(["complete", "blocked"])("refuses a %s corpus with 409", async (status) => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow({ status }));
    await expect(resumeCorpus(3, 42, VIEWER)).rejects.toBeInstanceOf(ConflictException);
    expect(utils.resumeCorpusQuery).not.toHaveBeenCalled();
    expect(job.enqueueCorpusGeneration).not.toHaveBeenCalled();
  });

  it("refuses a running corpus with a live lease as already running", async () => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow({ status: "running", lease_live: true }));
    const err = await resumeCorpus(3, 42, VIEWER).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toMatch(/already running/);
    expect(utils.resumeCorpusQuery).not.toHaveBeenCalled();
  });

  it("sets a failed corpus running and re-enqueues it, after the stale sweep", async () => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow({ status: "failed" }));
    utils.resumeCorpusQuery.mockResolvedValue(true);
    const out = await resumeCorpus(3, 42, VIEWER);
    expect(out).toEqual({ corpusId: 3, status: "running" });
    expect(callOrder(utils.markStaleCorporaFailedQuery)).toBeLessThan(
      callOrder(utils.getCorpusQuery),
    );
    expect(utils.resumeCorpusQuery).toHaveBeenCalledWith(3, 42, 600);
    expect(job.enqueueCorpusGeneration).toHaveBeenCalledWith(3, 42);
  });

  it("resumes a running corpus with no live lease when the query finds it stale", async () => {
    utils.getCorpusQuery.mockResolvedValue(
      corpusRow({ status: "running", lease_live: false, heartbeat_at: new Date(0) }),
    );
    utils.resumeCorpusQuery.mockResolvedValue(true);
    await resumeCorpus(3, 42, VIEWER);
    expect(job.enqueueCorpusGeneration).toHaveBeenCalledWith(3, 42);
  });

  it("answers already running when the guarded update moves nothing", async () => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow({ status: "running", lease_live: false }));
    utils.resumeCorpusQuery.mockResolvedValue(false);
    const err = await resumeCorpus(3, 42, VIEWER).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toMatch(/already running/);
    expect(job.enqueueCorpusGeneration).not.toHaveBeenCalled();
  });

  it("maps a unique violation (another corpus running in the project) to already running", async () => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow({ status: "failed" }));
    utils.resumeCorpusQuery.mockRejectedValue(
      Object.assign(new Error("dup"), { original: { code: "23505" } }),
    );
    const err = await resumeCorpus(3, 42, VIEWER).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.message).toMatch(/already running/);
  });

  it("answers a corpus the viewer cannot see with 404, changing nothing", async () => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow({ status: "failed" }));
    access.assertProjectAccess.mockImplementation(
      async (_p: number, _o: number, _v: unknown, notFound: () => Error) => {
        throw notFound();
      },
    );
    await expect(resumeCorpus(3, 42, VIEWER)).rejects.toBeInstanceOf(NotFoundException);
    expect(utils.resumeCorpusQuery).not.toHaveBeenCalled();
  });
});

describe("getJobDescriptionsView", () => {
  const prior = process.env.BIAS_AUDIT_LLM_API_KEY;
  afterEach(() => {
    if (prior === undefined) delete process.env.BIAS_AUDIT_LLM_API_KEY;
    else process.env.BIAS_AUDIT_LLM_API_KEY = prior;
  });

  it("returns both roles without tier narratives, plus whether generation is available", () => {
    process.env.BIAS_AUDIT_LLM_API_KEY = "sk-view-secret"; // gitleaks:allow
    settings.isGatewayConfigured.mockReturnValue(false);
    const view = getJobDescriptionsView();
    expect(view.generationAvailable).toBe(false);
    expect(view.jobDescriptions.map((j) => j.key).sort()).toEqual(
      Object.keys(JOB_DESCRIPTIONS).sort(),
    );
    for (const j of view.jobDescriptions) {
      const jd = JOB_DESCRIPTIONS[j.key];
      expect(Object.keys(j).sort()).toEqual(["body", "expectedCriteria", "key", "roleTitle"]);
      expect(j.roleTitle).toBe(jd.roleTitle);
      expect(j.body).toBe(jd.body);
      for (const c of j.expectedCriteria) {
        expect(Object.keys(c).sort()).toEqual(["description", "key", "label"]);
      }
    }
    const text = JSON.stringify(view);
    for (const jd of Object.values(JOB_DESCRIPTIONS)) {
      for (const t of jd.tiers) expect(text).not.toContain(t.narrative);
    }
    expect(text).not.toContain("sk-view-secret");
    expect(view.count).toEqual({ default: 5000, min: 700, max: 10000 });
  });
});
