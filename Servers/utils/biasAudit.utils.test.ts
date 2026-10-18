const mockQuery = jest.fn();
jest.mock("../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
jest.mock("./logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

import {
  attestProfileQuery,
  createProfileVersionQuery,
  createRunQuery,
  createStanceQuery,
  createProfileStanceQuery,
  assertProfileAttestedQuery,
  checkProfileAttestedQuery,
  getNextProfileStanceVersionQuery,
  listProfileStancesQuery,
  getAttestedProfileQuery,
  getCurrentProfileQuery,
  getNextStanceVersionQuery,
  getProfileAnswersQuery,
  upsertAnswerQuery,
  CreateRunArgs,
  getProjectQuery,
  getProfileByIdQuery,
  getRunQuery,
  listRunsQuery,
  listTrendRunsQuery,
  listStancesForRunQuery,
  getStanceDownloadQuery,
  getUserNamesQuery,
  confirmRunDerivedBasisQuery,
  PROJECT_MEMBER_SQL,
  createCorpusQuery,
  getCorpusQuery,
  updateCorpusStatusQuery,
  touchCorpusHeartbeatQuery,
  markStaleCorporaFailedQuery,
  appendCorpusRecordQuery,
  listCorpusLogQuery,
  countValidCorpusRecordsQuery,
  listLatestValidRecordsPageQuery,
  claimCorpusLeaseQuery,
  releaseCorpusLeaseQuery,
  resumeCorpusQuery,
  listCorporaQuery,
  InsertCorpusArgs,
} from "./biasAudit.utils";
import { ConflictException, NotFoundException } from "../domain.layer/exceptions/custom.exception";

const tx = undefined as any;

beforeEach(() => mockQuery.mockReset());

const RUN_ARGS: CreateRunArgs = {
  projectId: 7,
  profileId: 5,
  presetId: "nyc_ll144",
  metric: "selection_rate",
  threshold: 0.8,
  thresholdSource: "convention",
  smallSampleExclusion: 0.02,
  dataBasisJson: { basis: "test_attribute" },
  expiryDate: "2027-10-14",
  expiryTrigger: "x",
  readinessScore: 80,
  resultJson: null,
  gateFindingsJson: [],
  datasetSha256: "a".repeat(64),
  datasetRetained: false,
  rowCount: 200,
  createdBy: 9,
};

describe("tenant isolation", () => {
  it("filters the attested-profile lookup on organization_id", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await getAttestedProfileQuery(7, 15, 42);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("organization_id = :organization_id");
    expect(opts.replacements).toMatchObject({
      project_id: 7,
      framework_id: 15,
      organization_id: 42,
    });
  });

  it("filters the current-profile lookup on organization_id and skips superseded", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 6, status: "draft" }]);
    const row = await getCurrentProfileQuery(7, 15, 42);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("organization_id = :organization_id");
    expect(sql).toMatch(/status <> 'superseded'/);
    expect(sql).toMatch(/ORDER BY version DESC/);
    expect(opts.replacements.organization_id).toBe(42);
    expect(row).toMatchObject({ id: 6 });
    expect(sql).not.toMatch(/FOR UPDATE/);
  });

  it("locks the current profile row inside the caller's transaction when asked", async () => {
    const lockTx = { id: "lock" } as any;
    mockQuery.mockResolvedValueOnce([{ id: 6, status: "draft" }]);
    await getCurrentProfileQuery(7, 15, 42, { transaction: lockTx });
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/FOR UPDATE/);
    expect(sql).toContain("organization_id = :organization_id");
    expect(opts.transaction).toBe(lockTx);
  });

  it("filters every answer read on organization_id", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await getProfileAnswersQuery(3, 42);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("organization_id = :organization_id");
    expect(opts.replacements.organization_id).toBe(42);
  });

  it("writes organization_id on insert", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 1 }]]);
    await createProfileVersionQuery(
      { projectId: 7, frameworkId: 15, version: 1, questionSetVersion: 1, createdBy: 9 },
      42,
      tx,
    );
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("organization_id");
    expect(opts.replacements.organization_id).toBe(42);
  });

  it("filters the next-stance-version read on organization_id", async () => {
    mockQuery.mockResolvedValueOnce([{ max: null }]);
    await getNextStanceVersionQuery(11, 42);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("organization_id = :organization_id");
    expect(opts.replacements.organization_id).toBe(42);
  });
});

describe("cross-organisation references are refused", () => {
  // The schema has no composite FKs. Each insert selects from the referenced
  // row filtered on the caller's organization; the mock returns no row, which
  // is what the database returns when the reference belongs to another org.
  it("profile version for a project in another org", async () => {
    mockQuery.mockResolvedValueOnce([[]]);
    await expect(
      createProfileVersionQuery(
        { projectId: 99, frameworkId: 15, version: 1, questionSetVersion: 1, createdBy: 9 },
        42,
        tx,
      ),
    ).rejects.toThrow(/not found in this organization/i);
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toMatch(
      /FROM projects p\s+WHERE p\.id = :project_id AND p\.organization_id = :organization_id/,
    );
  });

  it("answer for a profile in another org", async () => {
    mockQuery.mockResolvedValueOnce([[]]);
    await expect(
      upsertAnswerQuery(
        {
          profileId: 99,
          questionKey: "role.party",
          questionSetVersion: 1,
          answerValue: "vendor",
          answerNotes: null,
          isDontKnow: false,
          isNotApplicable: false,
          answeredByUserId: 9,
        },
        42,
        tx,
      ),
    ).rejects.toThrow(/not found in this organization/i);
    expect(String(mockQuery.mock.calls[0][0])).toMatch(
      /FROM aedt_profiles p\s+WHERE p\.id = :profile_id AND p\.organization_id = :organization_id/,
    );
  });

  it("run for a profile or project in another org", async () => {
    mockQuery.mockResolvedValueOnce([[]]);
    await expect(createRunQuery(RUN_ARGS, 42, tx)).rejects.toThrow(
      /not found in this organization/i,
    );
    const sql = String(mockQuery.mock.calls[0][0]);
    expect(sql).toMatch(/pr\.organization_id = :organization_id/);
    expect(sql).toMatch(/ap\.organization_id = :organization_id/);
    expect(sql).toMatch(/ap\.project_id = :project_id/);
    expect(sql).toMatch(/ap\.status = 'attested'/);
    expect(sql).toMatch(/ap\.version/);
  });

  it("stance for a run in another org", async () => {
    mockQuery.mockResolvedValueOnce([[]]);
    await expect(
      createStanceQuery(
        {
          runId: 99,
          version: 1,
          pdfSha256: null,
          pdfFileId: null,
          scoreAtGeneration: 80,
          scopeAtGeneration: "full",
          generatedBy: 9,
        },
        42,
        tx,
      ),
    ).rejects.toThrow(/not found in this organization/i);
    expect(String(mockQuery.mock.calls[0][0])).toMatch(
      /FROM bias_audit_runs r\s+WHERE r\.id = :run_id AND r\.organization_id = :organization_id/,
    );
  });

  it("attesting a profile in another org attests nothing", async () => {
    mockQuery.mockResolvedValueOnce([[]]);
    await expect(attestProfileQuery(99, 9, 42, tx)).rejects.toThrow(
      /not found in this organization/i,
    );
    // The lock lookup finds nothing, so neither the supersede nor the promote runs.
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(String(mockQuery.mock.calls[0][0])).toContain("organization_id = :organization_id");
  });
});

describe("runs and stances", () => {
  it("passes the run row through as replacements, JSON serialised", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 11 }]]);
    const row = await createRunQuery(RUN_ARGS, 42, tx);
    const { replacements } = mockQuery.mock.calls[0][1];
    expect(row).toMatchObject({ id: 11 });
    expect(replacements).toMatchObject({
      organization_id: 42,
      profile_id: 5,
      metric: "selection_rate",
      data_basis_json: JSON.stringify({ basis: "test_attribute" }),
      result_json: null,
      dataset_retained: false,
    });
  });

  it("creates a stance from the run's own project", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 9, version: 2 }]]);
    const row = await createStanceQuery(
      {
        runId: 11,
        version: 2,
        pdfSha256: null,
        pdfFileId: null,
        scoreAtGeneration: 80,
        scopeAtGeneration: "full",
        generatedBy: 9,
      },
      42,
      tx,
    );
    expect(row).toMatchObject({ id: 9 });
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/r\.project_id/);
  });
});

describe("append-only profiles", () => {
  it("supersedes the previous attested version when attesting", async () => {
    mockQuery
      .mockResolvedValueOnce([[{ id: 5, status: "draft" }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 5, status: "attested" }]]);
    await attestProfileQuery(5, 9, 42, tx);
    const statements = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(statements).toHaveLength(3);
    expect(statements[0]).toMatch(/FOR UPDATE/);
    expect(statements[1]).toMatch(/SET status = 'superseded'/);
    expect(statements[1]).toMatch(/id <> :id/);
    expect(statements[2]).toMatch(/SET status = 'attested'/);
  });

  it.each(["attested", "superseded"])(
    "refuses to attest a %s profile with a conflict and supersedes nothing",
    async (status) => {
      mockQuery.mockResolvedValueOnce([[{ id: 5, status }]]);
      await expect(attestProfileQuery(5, 9, 42, tx)).rejects.toBeInstanceOf(ConflictException);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    },
  );

  // Review Focus 2
  it("surfaces a unique-violation on concurrent attestation as a typed error", async () => {
    const err: any = new Error("duplicate key value violates unique constraint");
    err.original = { code: "23505", constraint: "aedt_profiles_one_attested_uq" };
    mockQuery.mockResolvedValueOnce([[{ id: 5, status: "draft" }]]).mockRejectedValueOnce(err);
    const rejected = attestProfileQuery(5, 9, 42, tx);
    await expect(rejected).rejects.toBeInstanceOf(ConflictException);
    await expect(rejected).rejects.toMatchObject({
      message: expect.stringMatching(/already attested|concurrent/i),
      statusCode: 409,
    });
  });
});

describe("answers", () => {
  it("stores a don't-know distinctly from a null answer", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 1 }]]);
    await upsertAnswerQuery(
      {
        profileId: 3,
        questionKey: "data.held",
        questionSetVersion: 1,
        answerValue: null,
        answerNotes: null,
        isDontKnow: true,
        isNotApplicable: false,
        answeredByUserId: 9,
      },
      42,
      tx,
    );
    const [, opts] = mockQuery.mock.calls[0];
    expect(opts.replacements.is_dont_know).toBe(true);
    expect(opts.replacements.answer_value).toBeNull();
  });

  const draftAnswer = {
    profileId: 3,
    questionKey: "role.party",
    questionSetVersion: 1,
    answerValue: "vendor",
    answerNotes: "We supply it.",
    isDontKnow: false,
    isNotApplicable: false,
    answeredByUserId: 9,
  };

  it("writes an answer only into a draft profile", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 1 }]]);
    await upsertAnswerQuery(draftAnswer, 42, tx);
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/p\.status = 'draft'/);
  });

  it("answers 409 when the profile exists but is no longer a draft, and writes nothing", async () => {
    mockQuery.mockResolvedValueOnce([[]]); // the guarded insert matched no draft
    mockQuery.mockResolvedValueOnce([[{ status: "attested" }]]);
    await expect(upsertAnswerQuery(draftAnswer, 42, tx)).rejects.toBeInstanceOf(ConflictException);
    const [sql, opts] = mockQuery.mock.calls[1];
    expect(sql).toMatch(/organization_id = :organization_id/);
    expect(opts.replacements).toMatchObject({ id: 3, organization_id: 42 });
    expect(opts.transaction).toBe(tx);
  });

  it("answers not-found when the profile is not in the organization", async () => {
    mockQuery.mockResolvedValueOnce([[]]);
    mockQuery.mockResolvedValueOnce([[]]);
    await expect(upsertAnswerQuery(draftAnswer, 42, tx)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("upserts on the profile and question key", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 1 }]]);
    await upsertAnswerQuery(
      {
        profileId: 3,
        questionKey: "role.party",
        questionSetVersion: 1,
        answerValue: "vendor",
        answerNotes: "We supply it.",
        isDontKnow: false,
        isNotApplicable: false,
        answeredByUserId: 9,
      },
      42,
      tx,
    );
    expect(String(mockQuery.mock.calls[0][0])).toMatch(/ON CONFLICT \(profile_id, question_key\)/i);
  });
});

describe("stance versioning", () => {
  it("returns 1 when no stance exists", async () => {
    mockQuery.mockResolvedValueOnce([{ max: null }]);
    expect(await getNextStanceVersionQuery(11, 42)).toBe(1);
  });

  it("returns max + 1 so a regenerate never overwrites", async () => {
    mockQuery.mockResolvedValueOnce([{ max: 3 }]);
    expect(await getNextStanceVersionQuery(11, 42)).toBe(4);
  });
});

describe("profile stances (scope determinations)", () => {
  const ARGS = {
    profileId: 5,
    projectId: 7,
    version: 1,
    pdfSha256: "c".repeat(64),
    pdfFileId: 501,
    scopeAtGeneration: "out_of_scope",
    generatedBy: 9,
  };

  it("inserts only from the attested profile row of this organization", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 3, version: 1, profile_id: 5 }]]);
    const row = await createProfileStanceQuery(ARGS, 42, tx);
    expect(row).toMatchObject({ id: 3, profile_id: 5 });
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/FROM aedt_profiles ap/);
    expect(String(sql)).toMatch(/ap\.id = :profile_id/);
    expect(String(sql)).toMatch(/ap\.organization_id = :organization_id/);
    expect(String(sql)).toMatch(/ap\.status = 'attested'/);
    // The project must be the organization's too.
    expect(String(sql)).toMatch(/pr\.organization_id = :organization_id/);
    // The PDF is filed under the caller's project, so the profile must be its.
    expect(String(sql)).toMatch(/ap\.project_id = :project_id/);
    expect(opts.replacements).toMatchObject({ profile_id: 5, organization_id: 42, project_id: 7 });
  });

  it("takes the project and both versions from the profile row, never from the caller", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 3 }]]);
    await createProfileStanceQuery(
      { ...ARGS, profileVersion: 7, questionSetVersion: 7 } as any,
      42,
      tx,
    );
    const [sql, opts] = mockQuery.mock.calls[0];
    // The caller's project only filters; the inserted value is the profile's.
    expect(String(sql)).toMatch(/SELECT ap\.organization_id, ap\.project_id/);
    expect(String(sql)).toMatch(/ap\.version/);
    expect(String(sql)).toMatch(/ap\.question_set_version/);
    expect(opts.replacements).not.toHaveProperty("profile_version");
    expect(opts.replacements).not.toHaveProperty("question_set_version");
  });

  it("carries no readiness score and no run", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 3 }]]);
    await createProfileStanceQuery(ARGS, 42, tx);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/run_id/);
    expect(String(sql)).not.toMatch(/:run_id/);
    expect(String(sql)).not.toMatch(/:score_at_generation/);
    expect(opts.transaction).toBe(tx);
  });

  it("refuses a missing, draft, other-project or other organization's profile as not found", async () => {
    for (const probe of [[], [{ status: "draft" }]]) {
      mockQuery.mockResolvedValueOnce([[]]).mockResolvedValueOnce(probe);
      await expect(createProfileStanceQuery(ARGS, 42, tx)).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringMatching(/not found in this organization/i),
      });
    }
  });

  it("answers 409 when the profile was superseded between load and insert", async () => {
    // The insert matched nothing; the profile is still this organization's
    // and this project's, but a re-attestation superseded it.
    mockQuery.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ status: "superseded" }]);
    await expect(createProfileStanceQuery(ARGS, 42, tx)).rejects.toMatchObject({
      name: "ConflictException",
      statusCode: 409,
      message: expect.stringMatching(/re-attested while the document was being generated/),
    });
    const [sql, opts] = mockQuery.mock.calls[1];
    expect(String(sql)).toMatch(/ap\.id = :profile_id/);
    expect(String(sql)).toMatch(/ap\.organization_id = :organization_id/);
    expect(String(sql)).toMatch(/ap\.project_id = :project_id/);
    expect(String(sql)).toMatch(/pr\.organization_id = :organization_id/);
    expect(opts).toMatchObject({
      replacements: { profile_id: 5, organization_id: 42, project_id: 7 },
      transaction: tx,
    });
  });

  describe.each([
    [
      "checkProfileAttestedQuery",
      (p: number, pr: number, o: number) => checkProfileAttestedQuery(p, pr, o),
    ],
    [
      "assertProfileAttestedQuery",
      (p: number, pr: number, o: number) =>
        assertProfileAttestedQuery(p, pr, o, { id: "persist-tx" } as any),
    ],
  ] as const)("%s", (_name, check) => {
    it("accepts the attested profile of this organization and project", async () => {
      mockQuery.mockResolvedValueOnce([{ status: "attested" }]);
      await expect(check(5, 7, 42)).resolves.toBeUndefined();
      const [sql, opts] = mockQuery.mock.calls[0];
      expect(String(sql)).toMatch(/ap\.id = :profile_id/);
      expect(String(sql)).toMatch(/ap\.organization_id = :organization_id/);
      expect(String(sql)).toMatch(/ap\.project_id = :project_id/);
      expect(String(sql)).toMatch(/pr\.organization_id = :organization_id/);
      expect(opts.replacements).toEqual({ profile_id: 5, project_id: 7, organization_id: 42 });
    });

    it("answers 409 for a superseded profile and 404 for anything else", async () => {
      mockQuery.mockResolvedValueOnce([{ status: "superseded" }]);
      await expect(check(5, 7, 42)).rejects.toMatchObject({
        statusCode: 409,
        message:
          "The profile was re-attested while the document was being generated. Reload and retry.",
      });
      for (const rows of [[], [{ status: "draft" }]]) {
        mockQuery.mockResolvedValueOnce(rows);
        await expect(check(5, 7, 42)).rejects.toMatchObject({ statusCode: 404 });
      }
    });
  });

  it("checkProfileAttestedQuery is a plain read: no lock and no transaction", async () => {
    mockQuery.mockResolvedValueOnce([{ status: "attested" }]);
    await checkProfileAttestedQuery(5, 7, 42);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).not.toMatch(/FOR\s+(SHARE|UPDATE|NO KEY|KEY)/i);
    expect(opts.transaction).toBeUndefined();
  });

  it("assertProfileAttestedQuery reads the row FOR SHARE inside the given transaction", async () => {
    const lockTx = { id: "persist-tx" } as any;
    mockQuery.mockResolvedValueOnce([{ status: "attested" }]);
    await assertProfileAttestedQuery(5, 7, 42, lockTx);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/FOR SHARE OF ap/);
    expect(opts.transaction).toBe(lockTx);
  });

  it("reads the next version inside the persist transaction", async () => {
    const lockTx = { id: "persist-tx" } as any;
    mockQuery.mockResolvedValueOnce([{ max: 2 }]);
    expect(await getNextProfileStanceVersionQuery(5, 42, lockTx)).toBe(3);
    expect(mockQuery.mock.calls[0][1].transaction).toBe(lockTx);
  });

  it("numbers versions across every profile of the project and framework, in the organization", async () => {
    mockQuery.mockResolvedValueOnce([{ max: null }]);
    expect(await getNextProfileStanceVersionQuery(5, 42)).toBe(1);
    mockQuery.mockResolvedValueOnce([{ max: 2 }]);
    expect(await getNextProfileStanceVersionQuery(5, 42)).toBe(3);
    const [sql, opts] = mockQuery.mock.calls[0];
    // The re-attested profile is a new row: numbering follows the project
    // and framework of the cited profile, not that one row.
    expect(String(sql)).toMatch(/cur\.id = :profile_id/);
    expect(String(sql)).toMatch(/ap\.project_id = cur\.project_id/);
    expect(String(sql)).toMatch(/ap\.framework_id = cur\.framework_id/);
    expect(String(sql)).toContain("cur.organization_id = :organization_id");
    expect(String(sql)).toContain("ap.organization_id = :organization_id");
    expect(String(sql)).toContain("s.organization_id = :organization_id");
    expect(opts.replacements).toEqual({ profile_id: 5, organization_id: 42 });
  });

  it("lists a project's profile stances for the framework, newest first, in the organization", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await listProfileStancesQuery(7, 12, 42);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(String(sql)).toMatch(/JOIN aedt_profiles ap ON ap\.id = s\.profile_id/);
    expect(String(sql)).toMatch(/ap\.organization_id = :organization_id/);
    expect(String(sql)).toMatch(/s\.organization_id = :organization_id/);
    expect(String(sql)).toMatch(/ap\.framework_id = :framework_id/);
    expect(String(sql)).toMatch(/ORDER BY s\.generated_at DESC/);
    expect(opts.replacements).toEqual({ project_id: 7, framework_id: 12, organization_id: 42 });
  });
});

describe("route reads and the basis confirmation", () => {
  const reads: Array<[string, () => Promise<unknown>, Record<string, unknown>]> = [
    ["project", () => getProjectQuery(7, 42), { project_id: 7 }],
    ["profile by id", () => getProfileByIdQuery(5, 42), { profile_id: 5 }],
    ["run", () => getRunQuery(11, 42), { run_id: 11 }],
    ["runs list", () => listRunsQuery(7, 12, 42), { project_id: 7, framework_id: 12 }],
    ["trend rows", () => listTrendRunsQuery(7, 12, 42), { project_id: 7, framework_id: 12 }],
    ["stances of a run", () => listStancesForRunQuery(11, 42), { run_id: 11 }],
    [
      "stance download",
      () => getStanceDownloadQuery(3, 42, 9),
      { stance_id: 3, viewer_user_id: 9 },
    ],
    ["user names", () => getUserNamesQuery([9, 10], 42), { user_ids: [9, 10] }],
  ];

  it.each(reads)("scopes the %s read to the organization", async (_name, call, ids) => {
    mockQuery.mockResolvedValueOnce([]);
    await call();
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/organization_id = :organization_id/);
    expect(opts.replacements).toMatchObject({ ...ids, organization_id: 42 });
  });

  it("returns null for a project, profile, run or stance outside the organization", async () => {
    for (const call of [
      () => getProjectQuery(7, 42),
      () => getProfileByIdQuery(5, 42),
      () => getRunQuery(11, 42),
      () => getStanceDownloadQuery(3, 42, 9),
    ]) {
      mockQuery.mockResolvedValueOnce([]);
      await expect(call()).resolves.toBeNull();
    }
  });

  it("asks for no user names when there are no ids", async () => {
    await expect(getUserNamesQuery([], 42)).resolves.toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("filters runs on the framework through the profile, in the same organization", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await listRunsQuery(7, 12, 42);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ap\.organization_id = :organization_id/);
    expect(sql).toMatch(/ap\.framework_id = :framework_id/);
  });

  it("decides project access for the viewer within the organization", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await getStanceDownloadQuery(3, 42, 9);
    const [sql, opts] = mockQuery.mock.calls[0];
    // Generating a stance grants no access of its own once the viewer leaves the project.
    expect(sql).not.toMatch(/generated_by/);
    expect(sql).toMatch(/p\.owner = :viewer_user_id OR pm\.user_id = :viewer_user_id/);
    expect(sql).toMatch(/p\.organization_id = :organization_id/);
    expect(sql).toMatch(/pm\.organization_id = :organization_id/);
    expect(opts.replacements.viewer_user_id).toBe(9);
  });

  it("joins the stance PDF only from the same organization's files", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await getStanceDownloadQuery(3, 42, 9);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(
      /LEFT JOIN files f ON f\.id = s\.pdf_file_id\s+AND f\.organization_id = :organization_id/,
    );
  });

  it("confirms the basis in the run's own organization and records who confirmed it", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 11, data_basis_json: { confirmed: true } }], 1]);
    const row = await confirmRunDerivedBasisQuery(11, 9, 42);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/organization_id = :organization_id/);
    expect(sql).toMatch(/data_basis_json IS NOT NULL/);
    expect(opts.replacements).toMatchObject({ run_id: 11, user_id: 9, organization_id: 42 });
    expect(row).toMatchObject({ id: 11 });
  });

  it("confirms nothing for a run with no derived basis or outside the organization", async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);
    await expect(confirmRunDerivedBasisQuery(11, 9, 42)).resolves.toBeNull();
  });
});

describe("the project-member expression", () => {
  // A bare column such as `id` binds to p.id inside the EXISTS subquery and
  // makes the member check true for every project. Only the two qualified
  // expressions the callers use are accepted, by the type and at run time.
  it("accepts the qualified expressions the callers use", () => {
    expect(PROJECT_MEMBER_SQL("target.id")).toMatch(/WHERE p\.id = target\.id/);
    expect(PROJECT_MEMBER_SQL("s.project_id")).toMatch(/WHERE p\.id = s\.project_id/);
  });

  it("refuses a bare column, at compile time and at run time", () => {
    // @ts-expect-error a bare column is not a ProjectMemberExpr
    expect(() => PROJECT_MEMBER_SQL("id")).toThrow(/project-member expression/);
    expect(() => PROJECT_MEMBER_SQL("project_id" as never)).toThrow(/project-member expression/);
  });
});

describe("listTrendRunsQuery", () => {
  it("reads only the result's tables and metric and the gate findings, oldest first", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await listTrendRunsQuery(7, 12, 42);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/r\.result_json->'tables' AS tables/);
    expect(sql).toMatch(/r\.result_json->>'metric' AS result_metric/);
    expect(sql).toMatch(/r\.gate_findings_json/);
    // The whole stored result is never selected.
    expect(sql).not.toMatch(/r\.result_json\s*(,|\n\s*FROM)/);
    expect(sql).toMatch(/ORDER BY r\.created_at ASC, r\.id ASC/);
  });
});

describe("corpora and the record log", () => {
  const CORPUS_ARGS: InsertCorpusArgs = {
    projectId: 7,
    profileId: 5,
    profileVersion: 2,
    jobDescriptionKey: "commercial-ae",
    jobDescriptionSha256: "a".repeat(64),
    artifactKind: "resume",
    knockout: "no",
    requestedCount: 5000,
    plannedCount: 4970,
    seed: 123,
    modelPinned: "pinned-model-1",
    nameMethod: "names",
    criteriaSupplied: null,
    criteriaComparison: { outcome: "not_supplied" },
    idOrderCheck: { sex: { observed: 1, expected: 1, fraction: 1 } },
    generatedBy: 9,
  };
  const RECORD = {
    corpusId: 3,
    candidateId: "C0001",
    attempt: 1,
    text: "x",
    modelName: "m1",
    promptHash: "h".repeat(64),
    validationStatus: "valid" as const,
    invalidReason: null,
    ownerToken: "tok",
  };

  const calls: Array<[string, () => Promise<unknown>, unknown]> = [
    ["create", () => createCorpusQuery(CORPUS_ARGS, 42), [[{ id: 3 }]]],
    ["get", () => getCorpusQuery(3, 42), []],
    [
      "status update",
      () => updateCorpusStatusQuery({ corpusId: 3, status: "failed", failureCode: "x" }, 42),
      [[]],
    ],
    ["heartbeat", () => touchCorpusHeartbeatQuery(3, 42, "tok", 120), [[]]],
    ["stale sweep", () => markStaleCorporaFailedQuery(42, 900), [[]]],
    ["lease claim", () => claimCorpusLeaseQuery(3, 42, "tok", 120), [[]]],
    ["lease release", () => releaseCorpusLeaseQuery(3, 42, "tok"), [[]]],
    ["append", () => appendCorpusRecordQuery(RECORD, 42), [[{ id: 1 }]]],
    ["log", () => listCorpusLogQuery(3, 42), []],
    ["valid count", () => countValidCorpusRecordsQuery(3, 42), [{ count: 0 }]],
    ["page", () => listLatestValidRecordsPageQuery(3, 42, "", 500), []],
    ["resume", () => resumeCorpusQuery(3, 42, 600), [[]]],
    ["list", () => listCorporaQuery(7, 42), []],
  ];

  it.each(calls)("scopes the corpus %s statement to the organization", async (_n, call, result) => {
    mockQuery.mockResolvedValueOnce(result);
    await call();
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/organization_id = :organization_id/);
    expect(opts.replacements.organization_id).toBe(42);
  });

  it("creates a corpus only from an attested profile version of the named project in the organization", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 3 }]]);
    await expect(createCorpusQuery(CORPUS_ARGS, 42)).resolves.toEqual({ id: 3 });
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO bias_audit_corpora/);
    expect(sql).toMatch(/FROM aedt_profiles ap/);
    expect(sql).toMatch(/pr\.organization_id = :organization_id/);
    expect(sql).toMatch(/ap\.status = 'attested'/);
    expect(sql).toMatch(/ap\.version = :profile_version/);
    expect(opts.replacements).toMatchObject({
      project_id: 7,
      profile_id: 5,
      profile_version: 2,
      requested_count: 5000,
      planned_count: 4970,
      seed: 123,
      knockout: "no",
      criteria_comparison_json: JSON.stringify({ outcome: "not_supplied" }),
      id_order_check_json: JSON.stringify(CORPUS_ARGS.idOrderCheck),
      generated_by: 9,
    });
  });

  it("refuses a corpus for a profile outside the organization, project or attested version", async () => {
    mockQuery.mockResolvedValueOnce([[]]);
    await expect(createCorpusQuery(CORPUS_ARGS, 42)).rejects.toThrow(NotFoundException);
  });

  it("returns null for a corpus outside the organization", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(getCorpusQuery(3, 42)).resolves.toBeNull();
  });

  it("moves a corpus out of running only, and says whether it did", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 3 }]]);
    await expect(
      updateCorpusStatusQuery(
        {
          corpusId: 3,
          status: "complete",
          recordCount: 700,
          modelsObserved: { m1: 700 },
          cellSizes: { "Male|Asian": 50 },
          manifest: [{ candidateId: "C0001" }],
          manifestSha256: "b".repeat(64),
          corpusSha256: "c".repeat(64),
          idOrderCheck: { sex: { observed: 1, expected: 1, fraction: 1 } },
        },
        42,
      ),
    ).resolves.toBe(true);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/status = 'running'/);
    expect(sql).toMatch(/id_order_check_json = COALESCE\(CAST\(:id_order_check_json AS JSONB\)/);
    expect(opts.replacements.id_order_check_json).toBe(
      JSON.stringify({ sex: { observed: 1, expected: 1, fraction: 1 } }),
    );
    expect(opts.replacements).toMatchObject({
      status: "complete",
      record_count: 700,
      models_observed_json: JSON.stringify({ m1: 700 }),
      manifest_sha256: "b".repeat(64),
      corpus_sha256: "c".repeat(64),
    });
    // Without a token any caller (the stale sweep, an operator) may move it.
    expect(opts.replacements.owner_token).toBeNull();
    expect(sql).toMatch(/CAST\(:owner_token AS TEXT\) IS NULL OR owner_token = :owner_token/);
    // Completion releases the lease.
    expect(sql).toMatch(/owner_token = NULL/);
    expect(sql).toMatch(/lease_expires_at = NULL/);
    mockQuery.mockResolvedValueOnce([[]]);
    await expect(updateCorpusStatusQuery({ corpusId: 3, status: "failed" }, 42)).resolves.toBe(
      false,
    );
  });

  it("moves a corpus only for the lease holder when a token is given", async () => {
    mockQuery.mockResolvedValueOnce([[]]);
    await expect(
      updateCorpusStatusQuery({ corpusId: 3, status: "complete", ownerToken: "tok" }, 42),
    ).resolves.toBe(false);
    expect(mockQuery.mock.calls[0][1].replacements.owner_token).toBe("tok");
  });

  it("reads a corpus with its lease liveness judged on the database clock", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 3, status: "running", lease_live: false }]);
    await expect(getCorpusQuery(3, 42)).resolves.toMatchObject({ lease_live: false });
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/lease_expires_at > NOW\(\)\) AS lease_live/);
  });

  it("releases the lease for its holder only", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 3 }]]);
    await expect(releaseCorpusLeaseQuery(3, 42, "tok")).resolves.toBe(true);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/owner_token = :owner_token/);
    expect(sql).toMatch(/SET owner_token = NULL, lease_expires_at = NULL/);
    expect(opts.replacements.owner_token).toBe("tok");
  });

  it("claims the lease only when it is unowned or expired, on a running corpus", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 3 }]]);
    await expect(claimCorpusLeaseQuery(3, 42, "tok", 120)).resolves.toBe(true);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/status = 'running'/);
    expect(sql).toMatch(
      /owner_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at < NOW\(\)/,
    );
    expect(opts.replacements).toMatchObject({ owner_token: "tok", lease_seconds: 120 });
    mockQuery.mockResolvedValueOnce([[]]);
    await expect(claimCorpusLeaseQuery(3, 42, "other", 120)).resolves.toBe(false);
    await expect(claimCorpusLeaseQuery(3, 42, "tok", 0)).rejects.toThrow(/seconds/);
  });

  it("refuses to move a corpus back to running", async () => {
    await expect(
      updateCorpusStatusQuery({ corpusId: 3, status: "running" as never }, 42),
    ).rejects.toThrow(/status/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("touches the heartbeat of a running corpus, for the lease holder only", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 3 }]]);
    await expect(touchCorpusHeartbeatQuery(3, 42, "tok", 120)).resolves.toBe(true);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/status = 'running'/);
    expect(sql).toMatch(/owner_token = :owner_token/);
    expect(sql).toMatch(/lease_expires_at = NOW\(\) \+ make_interval/);
    expect(opts.replacements).toMatchObject({ owner_token: "tok", lease_seconds: 120 });
    mockQuery.mockResolvedValueOnce([[]]);
    await expect(touchCorpusHeartbeatQuery(3, 42, "tok", 120)).resolves.toBe(false);
  });

  it("resumes only a failed corpus, or a running one with a stale heartbeat and no live lease", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 3 }]]);
    await expect(resumeCorpusQuery(3, 42, 600)).resolves.toBe(true);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/SET status = 'running', failure_code = NULL, completed_at = NULL/);
    expect(sql).toMatch(/owner_token = NULL, lease_expires_at = NULL/);
    expect(sql).toMatch(/status = 'failed'/);
    expect(sql).toMatch(/heartbeat_at < NOW\(\) - make_interval\(secs => :stale_after_seconds\)/);
    expect(sql).toMatch(/lease_expires_at IS NULL OR lease_expires_at <= NOW\(\)/);
    expect(opts.replacements).toMatchObject({ corpus_id: 3, stale_after_seconds: 600 });
    mockQuery.mockResolvedValueOnce([[]]);
    await expect(resumeCorpusQuery(3, 42, 600)).resolves.toBe(false);
    await expect(resumeCorpusQuery(3, 42, 0)).rejects.toThrow(/seconds/);
  });

  it("lists a project's corpora without the manifest, the lease token or record text", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 3 }]);
    await expect(listCorporaQuery(7, 42)).resolves.toEqual([{ id: 3 }]);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/project_id = :project_id/);
    expect(sql).not.toMatch(/manifest_json|owner_token|SELECT \*|bias_audit_corpus_records/);
    expect(sql).toMatch(/models_observed_json, cell_sizes_json, release_findings_json/);
    expect(opts.replacements.project_id).toBe(7);
  });

  it("fails running corpora whose heartbeat is older than the limit, and returns their ids", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 3 }, { id: 4 }]]);
    await expect(markStaleCorporaFailedQuery(42, 900)).resolves.toEqual([3, 4]);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/status = 'running'/);
    expect(sql).toMatch(/heartbeat_at </);
    expect(sql).toMatch(/owner_token = NULL, lease_expires_at = NULL/);
    expect(opts.replacements.stale_after_seconds).toBe(900);
    await expect(markStaleCorporaFailedQuery(42, 0)).rejects.toThrow(/seconds/);
  });

  it("appends a record only to a running corpus in the organization held by the token, never updating one", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 1 }]]);
    await appendCorpusRecordQuery(RECORD, 42);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO bias_audit_corpus_records/);
    expect(sql).toMatch(/c\.status = 'running'/);
    expect(sql).toMatch(/c\.owner_token = :owner_token/);
    // The fence locks the corpus row, so it waits for a concurrent claim and re-checks.
    expect(sql).toMatch(/c\.owner_token = :owner_token\s+FOR SHARE OF c\s+RETURNING id/);
    expect(sql).not.toMatch(/UPDATE|ON CONFLICT/i);
    expect(opts.replacements).toMatchObject({
      corpus_id: 3,
      candidate_id: "C0001",
      attempt: 1,
      validation_status: "valid",
      invalid_reason: null,
      owner_token: "tok",
    });
    // Not running, another runner's lease, or another organization: nothing inserted.
    mockQuery.mockResolvedValueOnce([[]]);
    await expect(appendCorpusRecordQuery(RECORD, 42)).resolves.toBeNull();
  });

  it("reads the log as metadata only, never the text", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await listCorpusLogQuery(3, 42);
    const [sql] = mockQuery.mock.calls[0];
    const selected = sql.slice(0, sql.search(/\bFROM\b/));
    expect(selected).not.toMatch(/\btext\b|\*/);
    expect(selected).toMatch(/candidate_id/);
    expect(sql).toMatch(/ORDER BY candidate_id, attempt/);
  });

  it("counts candidates whose latest attempt is valid", async () => {
    mockQuery.mockResolvedValueOnce([{ count: 690 }]);
    await expect(countValidCorpusRecordsQuery(3, 42)).resolves.toBe(690);
    expect(mockQuery.mock.calls[0][0]).toMatch(/DISTINCT ON \(candidate_id\)/);
  });

  it("pages the latest valid records by candidate id after a cursor", async () => {
    mockQuery.mockResolvedValueOnce([{ candidate_id: "C0501", text: "x" }]);
    await expect(listLatestValidRecordsPageQuery(3, 42, "C0500", 500)).resolves.toEqual([
      { candidate_id: "C0501", text: "x" },
    ]);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/DISTINCT ON \(candidate_id\)/);
    expect(sql).toMatch(/attempt DESC/);
    expect(sql).toMatch(/validation_status = 'valid'/);
    expect(sql).toMatch(/LIMIT :limit/);
    expect(opts.replacements).toMatchObject({ after_candidate_id: "C0500", limit: 500 });
    await expect(listLatestValidRecordsPageQuery(3, 42, "", 0)).rejects.toThrow(/limit/);
    await expect(listLatestValidRecordsPageQuery(3, 42, "", 5001)).rejects.toThrow(/limit/);
  });
});

describe("trend rows and their corpus", () => {
  it("joins each run's corpus within the organization for its job description hash", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await listTrendRunsQuery(7, 12, 42);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/r\.corpus_id, c\.job_description_sha256 AS corpus_job_description_sha256/);
    expect(sql).toMatch(
      /LEFT JOIN bias_audit_corpora c ON c\.id = r\.corpus_id\s+AND c\.organization_id = :organization_id/,
    );
  });
});
