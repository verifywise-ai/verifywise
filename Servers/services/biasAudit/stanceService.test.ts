import { createHash } from "node:crypto";

const utils = {
  getRunQuery: jest.fn(),
  getProfileByIdQuery: jest.fn(),
  getCurrentProfileQuery: jest.fn(),
  getAttestedProfileQuery: jest.fn(),
  getProfileAnswersQuery: jest.fn(),
  getUserNamesQuery: jest.fn(),
  getProjectQuery: jest.fn(),
  getStanceDownloadQuery: jest.fn(),
  userCanAccessProjectQuery: jest.fn(),
  getCorpusQuery: jest.fn(),
};
jest.mock("../../utils/biasAudit.utils", () => utils);
const persistStance = jest.fn();
jest.mock("./stance/render", () => ({
  persistStance: (...a: unknown[]) => persistStance(...a),
  evidenceFromRun: jest.requireActual("./stance/render").evidenceFromRun,
}));

import * as answerGatesModule from "./answerGates";
import { generateProfileStance, generateStance, getStanceDownload } from "./stanceService";

const answer = (k: string, v: string | null, notes: string | null = null, by = 9) => ({
  question_key: k,
  answer_value: v,
  answer_notes: notes,
  is_dont_know: v === null,
  is_not_applicable: false,
  answered_by_user_id: by,
  answered_at: new Date("2026-10-01T12:00:00Z"),
});

const RUN_PROFILE_ANSWERS = [
  answer("role.party", "vendor", "We supply the screener."),
  answer("scope.weighting", "biggest", "It ranks every applicant."),
  answer("independence.auditor", "self", "Our team runs it."),
  answer("data.held", "none", "We hold none."),
  answer("data.basis", "test_attribute"),
  answer("cutoff.applied_by", "platform"),
];

const RUN = {
  id: 11,
  project_id: 7,
  profile_id: 5,
  profile_version: 1,
  question_set_version: 1,
  preset_id: "nyc_ll144",
  metric: "selection_rate",
  threshold: "0.8000",
  threshold_source: "convention",
  small_sample_exclusion: "0.0200",
  data_basis_json: null,
  expiry_date: "2027-10-01",
  expiry_trigger: null,
  readiness_score: 70,
  result_json: null,
  gate_findings_json: [{ code: "x", severity: "note", message: "A note.", detail: {} }],
  order_findings_json: [],
  dataset_sha256: "a".repeat(64),
  dataset_retained: false,
  row_count: 200,
  job_description_key: null,
};

const args = { runId: 11, organizationId: 42, userId: 9, role: "Admin" };

beforeEach(() => {
  Object.values(utils).forEach((f) => f.mockReset());
  persistStance.mockReset();
  utils.getRunQuery.mockResolvedValue(RUN);
  utils.getProfileByIdQuery.mockResolvedValue({
    id: 5,
    version: 1,
    status: "superseded",
    attested_by_user_id: 9,
    attested_at: new Date("2026-10-02T09:00:00Z"),
  });
  utils.getProfileAnswersQuery.mockResolvedValue(RUN_PROFILE_ANSWERS);
  utils.getUserNamesQuery.mockResolvedValue([{ id: 9, name: "Ada", surname: "Admin" }]);
  utils.getProjectQuery.mockResolvedValue({ id: 7, project_title: "Screener" });
  persistStance.mockResolvedValue({ stanceId: 3, version: 1, sha256: "b".repeat(64) });
});

describe("generateStance", () => {
  it("refuses a run outside the organization with a not-found, writing nothing", async () => {
    utils.getRunQuery.mockResolvedValue(null);
    await expect(generateStance(args)).rejects.toMatchObject({ statusCode: 404 });
    expect(utils.getRunQuery).toHaveBeenCalledWith(11, 42);
    expect(persistStance).not.toHaveBeenCalled();
  });

  it("refuses with 422 when every non-veto answer is don't-know, writing nothing", async () => {
    // Spec Review Focus 3: nothing to describe, so no stance, not a 0% result.
    utils.getProfileAnswersQuery.mockResolvedValue([
      answer("role.party", "vendor"),
      answer("scope.weighting", "biggest"),
      answer("independence.auditor", "self"),
      answer("data.held", "none"),
      answer("data.basis", null),
      answer("cutoff.applied_by", null),
    ]);
    await expect(generateStance(args)).rejects.toMatchObject({ statusCode: 422 });
    expect(persistStance).not.toHaveBeenCalled();
  });

  it("composes from the answers of the run's own profile, not the current one", async () => {
    await generateStance(args);
    expect(utils.getProfileByIdQuery).toHaveBeenCalledWith(5, 42);
    expect(utils.getProfileAnswersQuery).toHaveBeenCalledWith(5, 42);
    expect(utils.getCurrentProfileQuery).not.toHaveBeenCalled();
  });

  it("files the stance under the run's project with the readiness at generation", async () => {
    await generateStance(args);
    const call = persistStance.mock.calls[0][0];
    expect(call).toMatchObject({ runId: 11, projectId: 7, organizationId: 42, userId: 9 });
    expect(call.scoreAtGeneration).toEqual(expect.any(Number));
  });

  it("quotes the customer's notes and names who answered and who attested", async () => {
    await generateStance(args);
    const { model } = persistStance.mock.calls[0][0];
    const text = model.sections.map((s: any) => s.body).join("\n");
    expect(text).toContain('In your words: "It ranks every applicant."');
    expect(text).toContain("Answered by Ada Admin on 2026-10-01.");
    expect(model.attestation).toEqual({ user: "Ada Admin", date: "2026-10-02" });
    expect(utils.getUserNamesQuery).toHaveBeenCalledWith([9], 42);
  });

  it("keeps the attestation date when the attester is no longer in the organization", async () => {
    // The attester left: their name is not found, but the profile was attested.
    utils.getUserNamesQuery.mockResolvedValue([]);
    await generateStance(args);
    const { model } = persistStance.mock.calls[0][0];
    expect(model.attestation).toEqual({ user: null, date: "2026-10-02", reason: "departed" });
  });

  it("tells an attester with a blank name apart from one who left", async () => {
    utils.getUserNamesQuery.mockResolvedValue([{ id: 9, name: " ", surname: "" }]);
    await generateStance(args);
    const { model } = persistStance.mock.calls[0][0];
    expect(model.attestation).toEqual({ user: null, date: "2026-10-02", reason: "unnamed" });
  });

  it("records no attestation when the profile carries no attestation date", async () => {
    utils.getProfileByIdQuery.mockResolvedValue({
      id: 5,
      version: 1,
      status: "superseded",
      attested_by_user_id: 9,
      attested_at: null,
    });
    await generateStance(args);
    expect(persistStance.mock.calls[0][0].model.attestation).toBeNull();
  });

  it("builds the evidence from the stored run, export allowed when every finding is a note", async () => {
    await generateStance(args);
    const { evidence } = persistStance.mock.calls[0][0];
    expect(evidence).toMatchObject({
      datasetSha256: "a".repeat(64),
      rowCount: 200,
      threshold: 0.8,
      thresholdSource: "convention",
      smallSampleExclusion: 0.02,
      mayExportPdf: true,
    });
    expect(evidence.categories.length).toBeGreaterThan(0);
  });

  it("withholds export when the run stored a warning or a stop", async () => {
    for (const severity of ["warn", "stop"]) {
      persistStance.mockClear();
      utils.getRunQuery.mockResolvedValue({
        ...RUN,
        gate_findings_json: [{ code: "x", severity, message: "m", detail: {} }],
      });
      await generateStance(args);
      expect(persistStance.mock.calls[0][0].evidence.mayExportPdf).toBe(false);
    }
  });

  it("withholds export when the run stored no findings record at all", async () => {
    utils.getRunQuery.mockResolvedValue({ ...RUN, gate_findings_json: null });
    await generateStance(args);
    expect(persistStance.mock.calls[0][0].evidence.mayExportPdf).toBe(false);
  });

  it("attributes an answer whose author left the organization without inventing a name", async () => {
    utils.getUserNamesQuery.mockResolvedValue([]);
    await generateStance(args);
    const { model } = persistStance.mock.calls[0][0];
    const text = model.sections.map((s: any) => s.body).join("\n");
    expect(text).not.toContain("Ada Admin");
    expect(text).toContain("The author and date of this answer are not recorded.");
  });

  it("says an answer author found with a blank name is a user with no recorded name", async () => {
    utils.getUserNamesQuery.mockResolvedValue([{ id: 9, name: " ", surname: "" }]);
    await generateStance(args);
    const { model } = persistStance.mock.calls[0][0];
    const text = model.sections.map((s: any) => s.body).join("\n");
    expect(text).toContain("Answered on 2026-10-01 by a user with no recorded name.");
    expect(text).not.toContain("The author and date of this answer are not recorded.");
  });
});

describe("generateStance project-member access", () => {
  it.each(["Editor", "Reviewer", "Auditor", "SuperAdmin"])(
    "answers 404 to a %s who is not on the run's project, writing nothing",
    async (role) => {
      utils.userCanAccessProjectQuery.mockResolvedValue(false);
      await expect(generateStance({ ...args, role })).rejects.toMatchObject({
        statusCode: 404,
        message: `Run ${args.runId} was not found`,
      });
      expect(utils.userCanAccessProjectQuery).toHaveBeenCalledWith(7, 9, 42);
      expect(persistStance).not.toHaveBeenCalled();
    },
  );

  it("lets a project member generate", async () => {
    utils.userCanAccessProjectQuery.mockResolvedValue(true);
    await expect(generateStance({ ...args, role: "Editor" })).resolves.toMatchObject({
      stanceId: 3,
    });
  });

  it("does not ask the database for an organization Admin", async () => {
    await generateStance(args);
    expect(utils.userCanAccessProjectQuery).not.toHaveBeenCalled();
  });
});

describe("generateProfileStance", () => {
  const OOS_ANSWERS = [
    answer("role.party", "employer", "We hire with it."),
    answer("scope.weighting", "one_of_several", "Recruiters read it beside interviews."),
    answer("independence.auditor", "self", "Our HR team."),
    answer("data.held", "none", "We hold none."),
  ];
  const ATTESTED = {
    id: 21,
    project_id: 7,
    framework_id: 12,
    version: 3,
    status: "attested",
    attested_by_user_id: 9,
    attested_at: new Date("2026-10-02T09:00:00Z"),
  };
  const input = { projectId: 7, frameworkId: 12, organizationId: 42, userId: 9, role: "Admin" };

  beforeEach(() => {
    utils.getAttestedProfileQuery.mockResolvedValue(ATTESTED);
    utils.getProfileAnswersQuery.mockResolvedValue(OOS_ANSWERS);
    persistStance.mockResolvedValue({ stanceId: 30, version: 1, sha256: "c".repeat(64) });
  });

  it("persists an out-of-scope scope determination from the attested profile", async () => {
    await expect(generateProfileStance(input)).resolves.toEqual({
      stanceId: 30,
      version: 1,
      sha256: "c".repeat(64),
    });
    expect(utils.getAttestedProfileQuery).toHaveBeenCalledWith(7, 12, 42);
    expect(utils.getProfileAnswersQuery).toHaveBeenCalledWith(21, 42);
    expect(utils.getCurrentProfileQuery).not.toHaveBeenCalled();
    expect(utils.getRunQuery).not.toHaveBeenCalled();
    const call = persistStance.mock.calls[0][0];
    expect(call).toMatchObject({
      profileId: 21,
      projectId: 7,
      organizationId: 42,
      userId: 9,
      evidence: null,
      scoreAtGeneration: null,
    });
    expect(call).not.toHaveProperty("runId");
  });

  it("keeps a scope determination's attestation when the attester has left the organization", async () => {
    utils.getUserNamesQuery.mockResolvedValue([]);
    await generateProfileStance(input);
    const { model } = persistStance.mock.calls[0][0];
    expect(model.attestation).toEqual({ user: null, date: "2026-10-02", reason: "departed" });
  });

  it("labels a scope determination's attester whose name is blank", async () => {
    utils.getUserNamesQuery.mockResolvedValue([{ id: 9, name: "", surname: "" }]);
    await generateProfileStance(input);
    const { model } = persistStance.mock.calls[0][0];
    expect(model.attestation).toEqual({ user: null, date: "2026-10-02", reason: "unnamed" });
  });

  it("composes the out-of-scope document: no result, no figures, the attestation", async () => {
    await generateProfileStance(input);
    const { model } = persistStance.mock.calls[0][0];
    expect(model.scope).toBe("out_of_scope");
    expect(model.heading).toBe("Scope determination");
    expect(model.sections.map((s: any) => s.key)).toEqual([
      "scope",
      "party",
      "open_items",
      "expiry",
    ]);
    expect(model.expiry).toEqual({ date: null, trigger: "" });
    expect(model.derivedBasis).toBeNull();
    expect(model.attestation).toEqual({ user: "Ada Admin", date: "2026-10-02" });
    const text = model.sections.map((s: any) => s.body).join("\n");
    expect(text).toContain('In your words: "Recruiters read it beside interviews."');
    expect(text).toContain("Answered by Ada Admin on 2026-10-01.");
    expect(text).not.toMatch(/ratio|readiness score/i);
  });

  it.each([
    ["in scope", [answer("scope.weighting", "biggest", "It ranks applicants.")]],
    ["undetermined", [answer("scope.weighting", null)]],
  ])("refuses a profile that is %s with 422, pointing at a run", async (_label, override) => {
    const byKey = new Map(OOS_ANSWERS.map((a) => [a.question_key, a]));
    for (const a of override) byKey.set(a.question_key, a);
    utils.getProfileAnswersQuery.mockResolvedValue([...byKey.values()]);
    await expect(generateProfileStance(input)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringMatching(/comes from a run/),
    });
    expect(persistStance).not.toHaveBeenCalled();
  });

  it("answers 404 when the project has no attested profile", async () => {
    utils.getAttestedProfileQuery.mockResolvedValue(null);
    await expect(generateProfileStance(input)).rejects.toMatchObject({ statusCode: 404 });
    expect(persistStance).not.toHaveBeenCalled();
  });

  it("answers 404 for a project outside the organization", async () => {
    utils.getProjectQuery.mockResolvedValue(null);
    await expect(generateProfileStance(input)).rejects.toMatchObject({ statusCode: 404 });
    expect(utils.getAttestedProfileQuery).not.toHaveBeenCalled();
    expect(persistStance).not.toHaveBeenCalled();
  });

  it.each(["Editor", "Reviewer", "Auditor", "SuperAdmin"])(
    "answers 404 to a %s who is not on the project, before reading the profile",
    async (role) => {
      utils.userCanAccessProjectQuery.mockResolvedValue(false);
      await expect(generateProfileStance({ ...input, role })).rejects.toMatchObject({
        statusCode: 404,
        message: "Project 7 was not found",
      });
      expect(utils.userCanAccessProjectQuery).toHaveBeenCalledWith(7, 9, 42);
      expect(utils.getAttestedProfileQuery).not.toHaveBeenCalled();
      expect(persistStance).not.toHaveBeenCalled();
    },
  );

  it("lets a project member generate", async () => {
    utils.userCanAccessProjectQuery.mockResolvedValue(true);
    await expect(generateProfileStance({ ...input, role: "Editor" })).resolves.toMatchObject({
      stanceId: 30,
    });
  });

  it("refuses a profile whose every answer is I don't know, writing nothing", async () => {
    utils.getProfileAnswersQuery.mockResolvedValue(
      OOS_ANSWERS.map((a) => answer(a.question_key, null)),
    );
    await expect(generateProfileStance(input)).rejects.toMatchObject({ statusCode: 422 });
    expect(persistStance).not.toHaveBeenCalled();
  });

  it("applies the answer gate to an out-of-scope profile too", async () => {
    // No real answer set reaches this: an attested out-of-scope profile has
    // every veto answered and no applicable non-veto question. The gate is
    // still applied, so a later question-set change cannot skip it.
    const real = answerGatesModule.runAnswerGates;
    const spy = jest.spyOn(answerGatesModule, "runAnswerGates").mockImplementation((a) => {
      const r = real(a);
      return {
        ...r,
        mayProduceStance: false,
        blocked: { ...r.blocked, stance: ["a gate refused it"] },
      };
    });
    try {
      await expect(generateProfileStance(input)).rejects.toMatchObject({
        statusCode: 422,
        message: expect.stringContaining("a gate refused it"),
      });
      expect(persistStance).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("passes the stored version through, so a regenerate gets the next one", async () => {
    persistStance
      .mockResolvedValueOnce({ stanceId: 30, version: 1, sha256: "c".repeat(64) })
      .mockResolvedValueOnce({ stanceId: 31, version: 2, sha256: "d".repeat(64) });
    expect((await generateProfileStance(input)).version).toBe(1);
    expect((await generateProfileStance(input)).version).toBe(2);
  });

  it("passes a lost version race through as a 409", async () => {
    const { ConflictException } = jest.requireActual(
      "../../domain.layer/exceptions/custom.exception",
    );
    persistStance.mockRejectedValue(new ConflictException("raced", "AedtStance", "version"));
    await expect(generateProfileStance(input)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("getStanceDownload", () => {
  const pdf = Buffer.from("%PDF-1.4 stance");
  const sha = createHash("sha256").update(pdf).digest("hex");
  const member = { userId: 9, role: "Editor" };
  const stored = (access: boolean) => ({
    id: 3,
    version: 1,
    pdf_sha256: sha,
    pdf_file_id: 77,
    file_id: 77,
    filename: "s.pdf",
    content: pdf,
    viewer_has_project_access: access,
  });

  it("refuses a stance outside the organization with a not-found", async () => {
    utils.getStanceDownloadQuery.mockResolvedValue(null);
    await expect(getStanceDownload(3, 42, member)).rejects.toMatchObject({ statusCode: 404 });
    expect(utils.getStanceDownloadQuery).toHaveBeenCalledWith(3, 42, 9);
  });

  it.each(["Editor", "Reviewer", "Auditor"])(
    "refuses a %s outside the stance's project with the same not-found",
    async (role) => {
      utils.getStanceDownloadQuery.mockResolvedValue(stored(false));
      await expect(getStanceDownload(3, 42, { userId: 9, role })).rejects.toMatchObject({
        statusCode: 404,
      });
    },
  );

  it("refuses a gone PDF to a non-member as not-found, not gone", async () => {
    utils.getStanceDownloadQuery.mockResolvedValue({
      ...stored(false),
      file_id: null,
      content: null,
    });
    await expect(getStanceDownload(3, 42, member)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lets an Admin of the organization download without project membership", async () => {
    utils.getStanceDownloadQuery.mockResolvedValue(stored(false));
    const out = await getStanceDownload(3, 42, { userId: 1, role: "Admin" });
    expect(out.sha256).toBe(sha);
  });

  it("gives SuperAdmin no in-org bypass", async () => {
    utils.getStanceDownloadQuery.mockResolvedValue(stored(false));
    await expect(getStanceDownload(3, 42, { userId: 1, role: "SuperAdmin" })).rejects.toMatchObject(
      { statusCode: 404 },
    );
  });

  it("answers 410 when the stance's file row is gone", async () => {
    utils.getStanceDownloadQuery.mockResolvedValue({
      id: 3,
      version: 1,
      pdf_sha256: sha,
      pdf_file_id: 77,
      file_id: null,
      filename: null,
      content: null,
      viewer_has_project_access: true,
    });
    await expect(getStanceDownload(3, 42, member)).rejects.toMatchObject({ statusCode: 410 });
  });

  it("refuses a stored file whose bytes no longer match the recorded hash", async () => {
    utils.getStanceDownloadQuery.mockResolvedValue({
      id: 3,
      version: 1,
      pdf_sha256: "c".repeat(64),
      pdf_file_id: 77,
      file_id: 77,
      filename: "s.pdf",
      content: pdf,
      viewer_has_project_access: true,
    });
    await expect(getStanceDownload(3, 42, member)).rejects.toMatchObject({ statusCode: 409 });
  });

  // Fails closed: a stance with no recorded hash cannot be checked, so its
  // bytes are not served as if they had been.
  it.each([null, ""])(
    "refuses a stored file with no recorded hash (%p) as unverifiable",
    async (recorded) => {
      utils.getStanceDownloadQuery.mockResolvedValue({ ...stored(true), pdf_sha256: recorded });
      const refusal = getStanceDownload(3, 42, member);
      await expect(refusal).rejects.toMatchObject({ statusCode: 409 });
      await expect(refusal).rejects.toThrow(/cannot be verified/);
    },
  );

  it("returns the PDF bytes with their hash", async () => {
    utils.getStanceDownloadQuery.mockResolvedValue({
      id: 3,
      version: 2,
      pdf_sha256: sha,
      pdf_file_id: 77,
      file_id: 77,
      filename: "bias-audit-stance-run-11-v2.pdf",
      content: pdf,
      viewer_has_project_access: true,
    });
    const out = await getStanceDownload(3, 42, member);
    expect(out.content.equals(pdf)).toBe(true);
    expect(out.sha256).toBe(sha);
    expect(out.filename).toBe("bias-audit-stance-run-11-v2.pdf");
  });
});

describe("a stance for a run scored from a corpus", () => {
  const CORPUS = {
    id: 3,
    job_description_key: "commercial-ae",
    record_count: 700,
    model_pinned: "m1",
    models_observed_json: { m1: 700 },
    cell_sizes_json: { "Male|White": 50 },
    criteria_comparison_json: { verdict: "divergent", unmatchedExpected: ["cycle_length"] },
    knockout: "yes",
    name_method: "Documented name tables.",
  };

  it("loads the corpus and passes its facts to the stance and the evidence", async () => {
    utils.getRunQuery.mockResolvedValue({
      ...RUN,
      corpus_id: 3,
      job_description_key: "Account Executive",
    });
    utils.getCorpusQuery.mockResolvedValue(CORPUS);
    await generateStance(args);
    expect(utils.getCorpusQuery).toHaveBeenCalledWith(3, 42);
    const { model, evidence } = persistStance.mock.calls[0][0];
    expect(evidence.corpus).toMatchObject({
      corpusId: 3,
      recordCount: 700,
      modelPinned: "m1",
      knockout: "yes",
      nameMethod: "Documented name tables.",
      criteria: { verdict: "divergent" },
    });
    // Unmatched criteria are named by their labels, not their keys.
    expect(evidence.corpus.criteria.unmatchedExpected).not.toContain("cycle_length");
    expect(evidence.corpus.criteria.unmatchedExpected).toHaveLength(1);
    const tested = model.sections.find((x: { key: string }) => x.key === "what_was_tested");
    expect(tested.body).toContain("the VerifyWise fixed job description for");
  });

  it("passes no corpus for a run without one", async () => {
    await generateStance(args);
    expect(utils.getCorpusQuery).not.toHaveBeenCalled();
    expect(persistStance.mock.calls[0][0].evidence.corpus).toBeNull();
  });
});
