import { createHash } from "node:crypto";

const utils = {
  getRunQuery: jest.fn(),
  getProfileByIdQuery: jest.fn(),
  getCurrentProfileQuery: jest.fn(),
  getProfileAnswersQuery: jest.fn(),
  getUserNamesQuery: jest.fn(),
  getProjectQuery: jest.fn(),
  getStanceDownloadQuery: jest.fn(),
};
jest.mock("../../utils/biasAudit.utils", () => utils);
const persistStance = jest.fn();
jest.mock("./stance/render", () => ({
  persistStance: (...a: unknown[]) => persistStance(...a),
  evidenceFromRun: jest.requireActual("./stance/render").evidenceFromRun,
}));

import { generateStance, getStanceDownload } from "./stanceService";

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

const args = { runId: 11, organizationId: 42, userId: 9 };

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
