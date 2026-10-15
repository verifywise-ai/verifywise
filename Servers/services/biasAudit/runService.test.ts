const utils = {
  createRunQuery: jest.fn(),
  getAttestedProfileQuery: jest.fn(),
  getProfileAnswersQuery: jest.fn(),
};
jest.mock("../../utils/biasAudit.utils", () => utils);
jest.mock("../../database/db", () => ({
  sequelize: { transaction: (f: (t: object) => unknown) => f({}) },
}));

import { createRun } from "./runService";

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

const base = { projectId: 7, frameworkId: 15, organizationId: 42, userId: 9 };
const MAPPING = { sex: "gender", race_ethnicity: "race", selected: "outcome" };

const run = (over: Record<string, unknown> = {}) =>
  createRun({ ...base, csv: CSV(), mapping: MAPPING, ...over });
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
});
