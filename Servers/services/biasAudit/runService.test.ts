const utils = {
  createRunQuery: jest.fn(),
  getAttestedProfileQuery: jest.fn(),
  getProfileAnswersQuery: jest.fn(),
  getProjectQuery: jest.fn(),
  getRunQuery: jest.fn(),
  listRunsQuery: jest.fn(),
  listTrendRunsQuery: jest.fn(),
  listStancesForRunQuery: jest.fn(),
  confirmRunDerivedBasisQuery: jest.fn(),
  userCanAccessProjectQuery: jest.fn(),
  getCorpusQuery: jest.fn(),
};
jest.mock("../../utils/biasAudit.utils", () => utils);
jest.mock("../../database/db", () => ({
  sequelize: { transaction: (f: (t: object) => unknown) => f({}) },
}));

import { createHash } from "node:crypto";
import {
  confirmDerivedBasis,
  createRun,
  getRunView,
  getTrendSeries,
  listRuns,
  LL144_CONFIG,
  mayExportStoredRun,
} from "./runService";
import { LL144_RACE, LL144_SEX } from "./generation/allocation";
import { JOB_DESCRIPTIONS } from "../../structures/NYC-Local-Law-144/job-descriptions";
import { jobDescriptionSha256 } from "./generation/generateCorpus";
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../../domain.layer/exceptions/custom.exception";

const ans = (k: string, v: string | null, extra: Record<string, unknown> = {}) => ({
  question_key: k,
  answer_value: v,
  is_dont_know: v === null,
  is_not_applicable: false,
  ...extra,
});

const ANSWERS = [
  ans("role.party", "vendor"),
  ans("scope.weighting", "biggest"),
  ans("independence.auditor", "self"),
  ans("data.held", "none"),
  ans("data.basis", "test_attribute"),
  ans("cutoff.applied_by", "platform"),
];

const CSV = (n = 200) => {
  const rows = ["gender,race,outcome"];
  for (let i = 0; i < n; i++) {
    rows.push(`${i % 2 ? "Male" : "Female"},${i % 3 ? "White" : "Asian"},${i % 5 < 2 ? 1 : 0}`);
  }
  return rows.join("\n") + "\n";
};

const base = { projectId: 7, frameworkId: 15, organizationId: 42, userId: 9, role: "Admin" };
const ADMIN = { userId: 9, role: "Admin" };
const MAPPING = { sex: "gender", race_ethnicity: "race", selected: "outcome" };

// Tests write the file as text; the service receives the raw upload bytes.
const run = (over: Record<string, unknown> = {}) => {
  const { csv = CSV(), ...rest } = over;
  return createRun({
    ...base,
    data: Buffer.from(csv as string),
    mapping: MAPPING,
    jobDescriptionKey: null,
    ...rest,
  });
};
const stored = () => utils.createRunQuery.mock.calls[0][0];

beforeEach(() => {
  Object.values(utils).forEach((f) => f.mockReset());
  utils.getAttestedProfileQuery.mockResolvedValue({ id: 5, version: 2, status: "attested" });
  utils.getProfileAnswersQuery.mockResolvedValue(ANSWERS);
  utils.createRunQuery.mockResolvedValue({ id: 11 });
});

describe("createRun", () => {
  it("runs against the attested profile and does not pass versions the query derives", async () => {
    const out = await run();
    expect(stored()).toMatchObject({ profileId: 5, projectId: 7, createdBy: 9 });
    expect(stored()).not.toHaveProperty("profileVersion");
    expect(stored()).not.toHaveProperty("questionSetVersion");
    expect(utils.createRunQuery.mock.calls[0][1]).toBe(42);
    expect(out.runId).toBe(11);
    expect(out.outcome.result).not.toBeNull();
    expect(out.readiness.scope).toBe("in_scope");
  });

  it("stores the job description key it is given, and null when none is", async () => {
    await run({ jobDescriptionKey: "senior-engineer" });
    expect(stored().jobDescriptionKey).toBe("senior-engineer");
    utils.createRunQuery.mockClear();
    await run();
    expect(stored().jobDescriptionKey).toBeNull();
  });

  it("filters the attested-profile and answers reads by organization", async () => {
    await run();
    expect(utils.getAttestedProfileQuery).toHaveBeenCalledWith(7, 15, 42);
    expect(utils.getProfileAnswersQuery.mock.calls[0][0]).toBe(5);
    expect(utils.getProfileAnswersQuery.mock.calls[0][1]).toBe(42);
  });

  it("records the metric forced by the cutoff answer", async () => {
    await run();
    expect(stored().metric).toBe("selection_rate");
    expect(stored().presetId).toBe("nyc_ll144");
  });

  it("refuses a run when the cutoff answer forces no metric", async () => {
    utils.getProfileAnswersQuery.mockResolvedValue(
      ANSWERS.map((a) =>
        a.question_key === "cutoff.applied_by" ? ans("cutoff.applied_by", null) : a,
      ),
    );
    await expect(run()).rejects.toThrow(/metric/i);
    expect(utils.createRunQuery).not.toHaveBeenCalled();
  });

  it("records the threshold with its provenance", async () => {
    await run();
    expect(stored().threshold).toBe(0.8);
    expect(stored().thresholdSource).toBe("convention");
    expect(stored().smallSampleExclusion).toBe(0.02);
  });

  it("records the dataset hash and does not retain the dataset", async () => {
    await run();
    expect(stored().datasetSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stored().datasetRetained).toBe(false);
    expect(stored().rowCount).toBe(200);
    expect(JSON.stringify(stored())).not.toContain("Female,Asian");
  });

  it("derives the expiry trigger from the per-category basis and stores the basis", async () => {
    await run();
    expect(stored().expiryTrigger).toMatch(/begins? to be captured/i);
    expect(stored().expiryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stored().dataBasisJson.confirmed).toBe(false);
    expect(stored().dataBasisJson.perCategory).toHaveLength(3);
  });

  it("hashes the raw upload bytes, so a BOM-prefixed file hashes as the customer's copy does", async () => {
    const data = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(CSV())]);
    const out = await run({ data });
    expect(stored().datasetSha256).toBe(createHash("sha256").update(data).digest("hex"));
    // The BOM is not part of the first header, so the file still reads.
    expect(out.outcome.result).not.toBeNull();
  });

  it("hashes bytes that are not valid UTF-8 as uploaded, not as decoded", async () => {
    const latin1 = Buffer.from(
      CSV().replace("gender,race,outcome", "gender,race,outcome,note"),
      "latin1",
    );
    const data = Buffer.concat([
      latin1,
      Buffer.from([0x4d, 0x61, 0x6c, 0x65, 0x2c, 0x57, 0x2c, 0x31, 0x2c, 0xe9, 0x0a]),
    ]);
    await run({ data });
    const raw = createHash("sha256").update(data).digest("hex");
    const decoded = createHash("sha256").update(data.toString("utf8")).digest("hex");
    expect(raw).not.toBe(decoded);
    expect(stored().datasetSha256).toBe(raw);
  });

  it("refuses when no attested profile exists", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue(null);
    await expect(run({ mapping: {} })).rejects.toThrow(/attested profile/i);
  });

  it("stores gate findings even when no result was computed", async () => {
    const allSelected = ["gender,outcome", ...Array(50).fill("Male,1")].join("\n");
    await run({ csv: allSelected, mapping: { sex: "gender", selected: "outcome" } });
    expect(stored().resultJson).toBeNull();
    expect(JSON.stringify(stored().gateFindingsJson)).toContain("all_or_none_selected");
  });

  // Review Focus 4
  it("stores a stop naming the mapping when a mapped column is absent", async () => {
    const out = await run({ mapping: { ...MAPPING, race_ethnicity: "ethnicity" } });
    expect(stored().resultJson).toBeNull();
    const finding = stored().gateFindingsJson.find(
      (f: { code: string }) => f.code === "mapping_column_absent",
    );
    expect(finding.severity).toBe("stop");
    expect(finding.message).toContain("race_ethnicity");
    expect(finding.message).toContain("ethnicity");
    expect(out.outcome.gates.mayComputeRatios).toBe(false);
    expect(out.outcome.gates.mayExportPdf).toBe(false);
  });

  it("stores a stop when outcome values cannot be read", async () => {
    const csv = ["gender,race,outcome", ...Array(60).fill("Male,White,perhaps")].join("\n");
    await run({ csv });
    expect(stored().resultJson).toBeNull();
    expect(JSON.stringify(stored().gateFindingsJson)).toContain("outcome_values_unreadable");
  });

  it("stores a stop and no result when rows do not line up with the header", async () => {
    const csv = [
      "gender,race,outcome",
      ...Array(59).fill("Male,White,1"),
      "Female,0", // one cell short: "0" would be read as the race
    ].join("\n");
    const out = await run({ csv });
    expect(stored().resultJson).toBeNull();
    expect(out.outcome.gates.mayComputeRatios).toBe(false);
    const finding = (stored().gateFindingsJson as any[]).find((f) => f.code === "rows_wrong_width");
    expect(finding).toMatchObject({ severity: "stop", detail: { count: 1 } });
    expect(finding.message).toMatch(/1 row/);
  });

  it("stores a stop and no result when outcome cells are blank", async () => {
    const csv = ["gender,race,outcome", ...Array(59).fill("Male,White,1"), "Female,Asian,"].join(
      "\n",
    );
    await run({ csv });
    expect(stored().resultJson).toBeNull();
    const finding = (stored().gateFindingsJson as any[]).find(
      (f) => f.code === "outcome_values_blank",
    );
    expect(finding).toMatchObject({ severity: "stop", detail: { count: 1 } });
  });

  it("stores a stop and no result when the answers withhold ratios", async () => {
    utils.getProfileAnswersQuery.mockResolvedValue(
      ANSWERS.filter((a) => a.question_key !== "independence.auditor"),
    );
    await run();
    expect(stored().resultJson).toBeNull();
    expect(JSON.stringify(stored().gateFindingsJson)).toContain("answers_withhold_ratios");
  });

  it("refuses a mapping key that is not a configured category or outcome", async () => {
    await expect(run({ mapping: { ...MAPPING, __proto__x: "gender" } })).rejects.toThrow(
      /not a column the module reads|unknown mapping/i,
    );
  });

  it("stores the readiness score and its blocked reason", async () => {
    await run();
    expect(stored()).toHaveProperty("readinessScore");
    expect(stored()).toHaveProperty("readinessBlockedReason");
  });

  it("counts blank-demographic rows in the result's unknown count", async () => {
    const rows = ["gender,race,outcome"];
    for (let i = 0; i < 200; i++) {
      rows.push(`${i % 2 ? "Male" : "Female"},${i % 3 ? "White" : "Asian"},${i % 5 < 2 ? 1 : 0}`);
    }
    rows.push(",White,1", "Male,,0");
    const out = await run({ csv: rows.join("\n") + "\n" });
    expect(out.outcome.result?.unknownCount).toBe(2);
  });

  it("stores a stop naming the mapping when the outcome key is not mapped at all", async () => {
    await run({ mapping: { sex: "gender", race_ethnicity: "race" } });
    expect(stored().resultJson).toBeNull();
    const f = stored().gateFindingsJson.find(
      (x: { code: string }) => x.code === "mapping_outcome_key_absent",
    );
    expect(f.severity).toBe("stop");
    expect(f.message).toContain('"selected"');
    expect(f.message).toMatch(/mapping/i);
  });

  it("does not tell an out-of-scope profile to answer a question it is never shown", async () => {
    utils.getProfileAnswersQuery.mockResolvedValue(
      ANSWERS.map((a) =>
        a.question_key === "scope.weighting" ? ans("scope.weighting", "one_of_several") : a,
      ),
    );
    const err = await run().catch((e: Error) => e);
    expect(err.message).toMatch(/outside the rule's scope/i);
    expect(err.message).not.toMatch(/answer cutoff/i);
  });

  // Both refusals come from the attested profile's state, not from the
  // upload, so they are 409s, apart from the 400s of a bad file or mapping.
  it("refuses an out-of-scope attested profile with a 409", async () => {
    utils.getProfileAnswersQuery.mockResolvedValue(
      ANSWERS.map((a) =>
        a.question_key === "scope.weighting" ? ans("scope.weighting", "one_of_several") : a,
      ),
    );
    await expect(run()).rejects.toMatchObject({ statusCode: 409 });
    expect(utils.createRunQuery).not.toHaveBeenCalled();
  });

  it("refuses an attested profile whose cutoff answer is open with a 409", async () => {
    utils.getProfileAnswersQuery.mockResolvedValue(
      ANSWERS.map((a) =>
        a.question_key === "cutoff.applied_by" ? ans("cutoff.applied_by", null) : a,
      ),
    );
    const err = await run().catch((e: { statusCode?: number; message: string }) => e);
    expect(err).toMatchObject({ statusCode: 409 });
    expect(err.message).toMatch(/does not establish which metric applies/);
    expect(utils.createRunQuery).not.toHaveBeenCalled();
  });

  it("still refuses an unknown mapping key with a 400", async () => {
    await expect(
      run({ mapping: { sex: "gender", race_ethnicity: "race", selected: "sel", bogus: "x" } }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("createRun, scoring rate", () => {
  const PERSON = ANSWERS.map((a) =>
    a.question_key === "cutoff.applied_by" ? ans("cutoff.applied_by", "person") : a,
  );
  const SCORE_MAPPING = { sex: "gender", race_ethnicity: "race", score: "s" };
  const scoreCsv = (bad = false) => {
    const rows = ["gender,race,s"];
    for (let i = 0; i < 300; i++) {
      rows.push(
        `${i % 2 ? "Male" : "Female"},${i % 3 ? "White" : "Asian"},${bad && i === 0 ? "n/a" : ((i * 7) % 100) / 10}`,
      );
    }
    return rows.join("\n") + "\n";
  };

  it("runs end to end on a score column and stores a result", async () => {
    utils.getProfileAnswersQuery.mockResolvedValue([
      ...PERSON,
      ans("threshold.operational", "stated"),
    ]);
    const out = await run({ csv: scoreCsv(), mapping: SCORE_MAPPING });
    expect(stored().metric).toBe("scoring_rate");
    expect(out.outcome.gates.mayComputeRatios).toBe(true);
    expect(stored().resultJson).not.toBeNull();
    expect(stored().resultJson.metric).toBe("scoring_rate");
    expect(stored().resultJson.totalApplicants).toBe(300);
  });

  it("accepts the score key and refuses the selected key for a scoring run", async () => {
    utils.getProfileAnswersQuery.mockResolvedValue([
      ...PERSON,
      ans("threshold.operational", "stated"),
    ]);
    await expect(
      run({ csv: scoreCsv(), mapping: { ...SCORE_MAPPING, selected: "s" } }),
    ).rejects.toThrow(/not a column the module reads/i);
  });

  it("stores a stop when the operational cutoff is unanswered", async () => {
    utils.getProfileAnswersQuery.mockResolvedValue(PERSON);
    await run({ csv: scoreCsv(), mapping: SCORE_MAPPING });
    expect(stored().resultJson).toBeNull();
    expect(JSON.stringify(stored().gateFindingsJson)).toContain("answers_withhold_scoring_rate");
  });

  it("is not stopped by blank or unreadable cells in an unmapped selection column", async () => {
    utils.getProfileAnswersQuery.mockResolvedValue([
      ...PERSON,
      ans("threshold.operational", "stated"),
    ]);
    const rows = ["gender,race,s,outcome"];
    for (let i = 0; i < 300; i++) {
      rows.push(
        `${i % 2 ? "Male" : "Female"},${i % 3 ? "White" : "Asian"},${((i * 7) % 100) / 10},${i % 2 ? "" : "maybe"}`,
      );
    }
    await run({ csv: rows.join("\n") + "\n", mapping: SCORE_MAPPING });
    const codes = (stored().gateFindingsJson as Array<{ code: string }>).map((f) => f.code);
    expect(codes).not.toContain("outcome_values_blank");
    expect(codes).not.toContain("outcome_values_unreadable");
    expect(stored().resultJson).not.toBeNull();
  });

  it("stores a stop when score values are unreadable", async () => {
    utils.getProfileAnswersQuery.mockResolvedValue([
      ...PERSON,
      ans("threshold.operational", "stated"),
    ]);
    await run({ csv: scoreCsv(true), mapping: SCORE_MAPPING });
    expect(stored().resultJson).toBeNull();
    expect(JSON.stringify(stored().gateFindingsJson)).toContain("score_values_unreadable");
  });
});

describe("run reads", () => {
  const scope = { projectId: 7, frameworkId: 12, organizationId: 42, userId: 9, role: "Admin" };

  it("lists a project's runs in the organization, refusing a project outside it", async () => {
    utils.getProjectQuery.mockResolvedValue(null);
    await expect(listRuns(scope)).rejects.toMatchObject({ statusCode: 404 });
    expect(utils.listRunsQuery).not.toHaveBeenCalled();

    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    utils.listRunsQuery.mockResolvedValue([{ id: 11 }]);
    await expect(listRuns(scope)).resolves.toEqual({ runs: [{ id: 11 }] });
    expect(utils.listRunsQuery).toHaveBeenCalledWith(7, 12, 42);
  });

  it("returns the built trend series, never the raw run rows", async () => {
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    const row = (id: number, profileVersion: number, ratio: number) => ({
      id,
      created_at: new Date(`2026-0${id}-10T00:00:00Z`),
      profile_version: profileVersion,
      question_set_version: 1,
      job_description_key: null,
      metric: "selection_rate",
      result_metric: "selection_rate",
      gate_findings_json: id === 2 ? [{ severity: "warn", message: "Few rows in a group." }] : [],
      tables: [
        {
          categoryKey: "sex",
          rows: [
            { categoryName: "Male", impactRatio: 1, flagged: false, applicantCount: 40 },
            { categoryName: "Female", impactRatio: ratio, flagged: false, applicantCount: 35 },
          ],
        },
      ],
    });
    utils.listTrendRunsQuery.mockResolvedValue([row(1, 1, 0.9), row(2, 2, 0.85)]);

    const out = await getTrendSeries(scope);

    expect(utils.listTrendRunsQuery).toHaveBeenCalledWith(7, 12, 42);
    expect(out).toEqual({
      segments: [
        {
          profileVersion: 1,
          questionSetVersion: 1,
          jobDescriptionKey: null,
          metric: "selection_rate",
          corpusId: null,
          corpusJobDescriptionSha256: null,
          points: [
            {
              runId: 1,
              date: "2026-01-10T00:00:00.000Z",
              category: "sex",
              lowestRatio: 0.9,
              flagged: false,
              caveat: false,
            },
          ],
        },
        {
          profileVersion: 2,
          questionSetVersion: 1,
          jobDescriptionKey: null,
          metric: "selection_rate",
          corpusId: null,
          corpusJobDescriptionSha256: null,
          points: [
            {
              runId: 2,
              date: "2026-02-10T00:00:00.000Z",
              category: "sex",
              lowestRatio: 0.85,
              flagged: false,
              caveat: true,
            },
          ],
        },
      ],
      breaks: [{ afterRunId: 1, reasons: ["the AEDT profile was changed"] }],
    });
    // Nothing of the stored result (group names, counts) survives.
    const text = JSON.stringify(out);
    expect(text).not.toContain("tables");
    expect(text).not.toContain("Female");
    expect(text).not.toContain("applicantCount");
    expect(text).not.toContain("Few rows");
  });

  it("returns a run with its stances and whether it may be exported", async () => {
    utils.getRunQuery.mockResolvedValue({ id: 11, gate_findings_json: [] });
    utils.listStancesForRunQuery.mockResolvedValue([{ id: 3, version: 1 }]);
    const out = await getRunView(11, 42, ADMIN);
    expect(out).toMatchObject({ run: { id: 11 }, stances: [{ id: 3 }], mayExportPdf: true });
    expect(utils.getRunQuery).toHaveBeenCalledWith(11, 42);
    expect(utils.listStancesForRunQuery).toHaveBeenCalledWith(11, 42);
  });

  it("refuses a run outside the organization with a not-found", async () => {
    utils.getRunQuery.mockResolvedValue(null);
    await expect(getRunView(11, 42, ADMIN)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("mayExportStoredRun", () => {
  it("allows export only when every stored finding is a note", () => {
    expect(mayExportStoredRun([])).toBe(true);
    expect(mayExportStoredRun([{ severity: "note" }])).toBe(true);
    expect(mayExportStoredRun([{ severity: "note" }, { severity: "warn" }])).toBe(false);
    expect(mayExportStoredRun([{ severity: "stop" }])).toBe(false);
  });

  it("fails closed on a missing or malformed findings record", () => {
    expect(mayExportStoredRun(null)).toBe(false);
    expect(mayExportStoredRun({})).toBe(false);
    expect(mayExportStoredRun([null])).toBe(false);
  });
});

describe("confirmDerivedBasis", () => {
  it("records the confirmation in the organization", async () => {
    utils.getRunQuery.mockResolvedValue({ id: 11, data_basis_json: { confirmed: false } });
    utils.confirmRunDerivedBasisQuery.mockResolvedValue({
      id: 11,
      data_basis_json: { confirmed: true },
    });
    const out = await confirmDerivedBasis(11, 42, ADMIN);
    expect(utils.confirmRunDerivedBasisQuery).toHaveBeenCalledWith(11, 9, 42);
    expect(out.derivedBasis).toEqual({ confirmed: true });
  });

  it("refuses a run outside the organization with a not-found", async () => {
    utils.getRunQuery.mockResolvedValue(null);
    await expect(confirmDerivedBasis(11, 42, ADMIN)).rejects.toMatchObject({ statusCode: 404 });
    expect(utils.confirmRunDerivedBasisQuery).not.toHaveBeenCalled();
  });

  it("refuses with a conflict when the run has no derived basis to confirm", async () => {
    utils.getRunQuery.mockResolvedValue({ id: 11, data_basis_json: null });
    utils.confirmRunDerivedBasisQuery.mockResolvedValue(null);
    await expect(confirmDerivedBasis(11, 42, ADMIN)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("project-member access", () => {
  const editor = { userId: 9, role: "Editor" };
  const scope = { projectId: 7, frameworkId: 12, organizationId: 42 };
  const outsiderRoles = ["Editor", "Reviewer", "Auditor", "SuperAdmin"];

  beforeEach(() => {
    utils.getRunQuery.mockResolvedValue({ id: 11, project_id: 7, gate_findings_json: [] });
    utils.getAttestedProfileQuery.mockResolvedValue({ id: 5, version: 1 });
  });

  it.each(outsiderRoles)(
    "answers 404 to a %s who is not on the project for create, list and trend, writing nothing",
    async (role) => {
      utils.userCanAccessProjectQuery.mockResolvedValue(false);
      const who = { ...scope, userId: 9, role };
      await expect(run({ role })).rejects.toMatchObject({ statusCode: 404 });
      await expect(listRuns(who)).rejects.toMatchObject({ statusCode: 404 });
      await expect(getTrendSeries(who)).rejects.toMatchObject({ statusCode: 404 });
      expect(utils.createRunQuery).not.toHaveBeenCalled();
      expect(utils.getAttestedProfileQuery).not.toHaveBeenCalled();
      expect(utils.listRunsQuery).not.toHaveBeenCalled();
      expect(utils.listTrendRunsQuery).not.toHaveBeenCalled();
    },
  );

  it.each(outsiderRoles)(
    "answers 404 to a %s who is not on the run's project for view and confirm",
    async (role) => {
      utils.userCanAccessProjectQuery.mockResolvedValue(false);
      // The same answer as a run that does not exist, so the project is not named.
      await expect(getRunView(11, 42, { userId: 9, role })).rejects.toMatchObject({
        statusCode: 404,
        message: "Run 11 was not found",
      });
      await expect(confirmDerivedBasis(11, 42, { userId: 9, role })).rejects.toMatchObject({
        statusCode: 404,
        message: "Run 11 was not found",
      });
      expect(utils.userCanAccessProjectQuery).toHaveBeenCalledWith(7, 9, 42);
      expect(utils.listStancesForRunQuery).not.toHaveBeenCalled();
      expect(utils.confirmRunDerivedBasisQuery).not.toHaveBeenCalled();
    },
  );

  it("lets the project's owner or a member read, list and confirm", async () => {
    utils.userCanAccessProjectQuery.mockResolvedValue(true);
    utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
    utils.listRunsQuery.mockResolvedValue([{ id: 11 }]);
    utils.listStancesForRunQuery.mockResolvedValue([]);
    utils.confirmRunDerivedBasisQuery.mockResolvedValue({ id: 11, data_basis_json: {} });
    await expect(listRuns({ ...scope, ...editor })).resolves.toEqual({ runs: [{ id: 11 }] });
    await expect(getRunView(11, 42, editor)).resolves.toMatchObject({ run: { id: 11 } });
    await expect(confirmDerivedBasis(11, 42, editor)).resolves.toMatchObject({ runId: 11 });
    expect(utils.confirmRunDerivedBasisQuery).toHaveBeenCalledWith(11, 9, 42);
  });

  it("still answers 404 for a run in another organization, before any membership check", async () => {
    utils.getRunQuery.mockResolvedValue(null);
    await expect(getRunView(11, 42, editor)).rejects.toMatchObject({ statusCode: 404 });
    expect(utils.userCanAccessProjectQuery).not.toHaveBeenCalled();
  });
});

describe("createRun from a generated corpus", () => {
  const JD = JOB_DESCRIPTIONS["commercial-ae"];
  const TIERS = JD.tiers.map((t) => t.key);
  // Every sex and race/ethnicity cell, every tier, so the engine sees all groups.
  const MANIFEST = LL144_SEX.flatMap((sex) =>
    LL144_RACE.flatMap((raceEthnicity) =>
      TIERS.flatMap((tierKey) => [0, 1].map((k) => ({ sex, raceEthnicity, tierKey, k }))),
    ),
  ).map((m, i) => ({
    candidateId: `C${String(i + 1).padStart(5, "0")}`,
    sex: m.sex,
    raceEthnicity: m.raceEthnicity,
    tierKey: m.tierKey,
    modelName: "m1",
    promptHash: "h",
  }));
  const corpusRow = (over: Record<string, unknown> = {}) => ({
    id: 3,
    project_id: 7,
    organization_id: 42,
    status: "complete",
    job_description_key: "commercial-ae",
    job_description_sha256: jobDescriptionSha256(JD),
    manifest_json: MANIFEST,
    ...over,
  });
  // Selection rises with the tier, so the tiers separate.
  const scored = (ids = MANIFEST.map((m) => m.candidateId), pick?: (tier: string) => boolean) => {
    const rows = ["id,outcome"];
    for (const id of ids) {
      const m = MANIFEST.find((x) => x.candidateId === id);
      const tierIndex = m ? TIERS.indexOf(m.tierKey) : 0;
      const selected = pick && m ? pick(m.tierKey) : tierIndex >= 2;
      rows.push(`${id},${selected ? 1 : 0}`);
    }
    return rows.join("\n") + "\n";
  };
  const corpusRun = (over: Record<string, unknown> = {}) =>
    run({
      corpusId: 3,
      mapping: { candidate_id: "id", selected: "outcome" },
      csv: scored(),
      ...over,
    });

  beforeEach(() => utils.getCorpusQuery.mockResolvedValue(corpusRow()));

  it("uses the allocation's categories as the run configuration's groups", () => {
    expect(LL144_CONFIG.categories.sex.groups).toEqual([...LL144_SEX]);
    expect(LL144_CONFIG.categories.race_ethnicity.groups).toEqual([...LL144_RACE]);
  });

  it("joins the scored file to the manifest, stores the corpus and the fixed role title", async () => {
    const out = await corpusRun();
    expect(utils.getCorpusQuery).toHaveBeenCalledWith(3, 42);
    expect(stored().corpusId).toBe(3);
    expect(stored().jobDescriptionKey).toBe(JD.roleTitle);
    expect(stored().rowCount).toBe(MANIFEST.length);
    expect(out.outcome.result).not.toBeNull();
    const sexTable = out.outcome.result!.tables.find((t) => t.categoryKey === "sex")!;
    expect(sexTable.rows.map((r) => r.categoryName).sort()).toEqual([...LL144_SEX].sort());
  });

  it("refuses a category key in a corpus run's mapping", async () => {
    await expect(
      corpusRun({ mapping: { candidate_id: "id", selected: "outcome", sex: "id" } }),
    ).rejects.toThrow(/corpus supplies sex and race\/ethnicity/);
    expect(utils.createRunQuery).not.toHaveBeenCalled();
  });

  it("asks for the candidate ID column", async () => {
    await expect(corpusRun({ mapping: { selected: "outcome" } })).rejects.toBeInstanceOf(
      ValidationException,
    );
  });

  it("refuses a typed title for a different job, and accepts a null or collated-equal one", async () => {
    await expect(corpusRun({ jobDescriptionKey: "Warehouse picker" })).rejects.toBeInstanceOf(
      ValidationException,
    );
    await corpusRun({ jobDescriptionKey: JD.roleTitle.toUpperCase() });
    expect(stored().jobDescriptionKey).toBe(JD.roleTitle);
    utils.createRunQuery.mockClear();
    await corpusRun({ jobDescriptionKey: null });
    expect(stored().jobDescriptionKey).toBe(JD.roleTitle);
  });

  it("reports another project's or organization's corpus as not found", async () => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow({ project_id: 8 }));
    await expect(corpusRun()).rejects.toBeInstanceOf(NotFoundException);
    utils.getCorpusQuery.mockResolvedValue(null);
    await expect(corpusRun()).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(["running", "blocked", "failed"])("refuses a %s corpus", async (status) => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow({ status }));
    await expect(corpusRun()).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    [
      "unknown",
      () => scored([...MANIFEST.map((m) => m.candidateId), "C99999"]),
      /not in this corpus/,
    ],
    [
      "duplicate",
      () => scored([...MANIFEST.map((m) => m.candidateId), MANIFEST[0].candidateId]),
      /more than once/,
    ],
    ["missing", () => scored(MANIFEST.slice(2).map((m) => m.candidateId)), /no row in the file/],
    ["blank", () => scored(["", ...MANIFEST.map((m) => m.candidateId)]), /blank candidate_id/],
  ])("refuses a file with a %s id and stores no run", async (_n, csv, message) => {
    await expect(corpusRun({ csv: csv() })).rejects.toThrow(message);
    expect(utils.createRunQuery).not.toHaveBeenCalled();
  });

  it("refuses a corpus built from fixed text that has since changed", async () => {
    utils.getCorpusQuery.mockResolvedValue(corpusRow({ job_description_sha256: "0".repeat(64) }));
    await expect(corpusRun()).rejects.toBeInstanceOf(ConflictException);
    expect(utils.createRunQuery).not.toHaveBeenCalled();
  });

  it("stores a blocked run for a file the data checks stop, rather than refusing the join", async () => {
    const rows = scored().trim().split("\n");
    rows[1] = `${rows[1]},extra`;
    await corpusRun({ csv: rows.join("\n") + "\n" });
    const codes = stored().gateFindingsJson.map((f: { code: string }) => f.code);
    expect(codes).toContain("rows_wrong_width");
    expect(stored().corpusId).toBe(3);
  });

  it("refuses a scoring-rate corpus run with unscored records", async () => {
    utils.getProfileAnswersQuery.mockResolvedValue([
      ...ANSWERS.map((a) =>
        a.question_key === "cutoff.applied_by" ? ans("cutoff.applied_by", "person") : a,
      ),
      ans("threshold.operational", "stated"),
    ]);
    const rows = ["id,s", ...MANIFEST.map((m, i) => `${m.candidateId},${i === 0 ? "" : i % 10}`)];
    await expect(
      corpusRun({ csv: rows.join("\n") + "\n", mapping: { candidate_id: "id", score: "s" } }),
    ).rejects.toThrow(/1 record\(s\) of the corpus have no score/);
    expect(utils.createRunQuery).not.toHaveBeenCalled();
  });

  it("stores a note when adjacent tiers do not separate", async () => {
    await corpusRun({ csv: scored(undefined, () => true) });
    const codes = stored().gateFindingsJson.map((f: { code: string }) => f.code);
    expect(codes).toContain("tier_does_not_separate");
    const note = stored().gateFindingsJson.find(
      (f: { code: string }) => f.code === "tier_does_not_separate",
    );
    expect(note.severity).toBe("note");
    // Named by the job description's tier labels, not internal keys.
    expect(note.message).toContain(`"${JD.tiers[1].label}"`);
    expect(note.message).not.toContain(JD.tiers[1].key);
  });

  it("leaves an uploaded run without a corpus", async () => {
    await run();
    expect(utils.getCorpusQuery).not.toHaveBeenCalled();
    expect(stored().corpusId).toBeNull();
  });
});
