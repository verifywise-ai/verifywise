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
} from "./biasAudit.utils";
import { ConflictException } from "../domain.layer/exceptions/custom.exception";

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
    expect(sql).toMatch(/s\.generated_by = :viewer_user_id/);
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
