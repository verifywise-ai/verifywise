/**
 * Generates a stance from a stored run, or a scope determination from an
 * attested out-of-scope profile, and serves a stored stance PDF.
 *
 * I/O layer: reads the run, its profile and answers, and user and project
 * names through utils, then hands the composed model to render.persistStance.
 *
 * A stance is composed from the answers of the profile version the run cites
 * (`run.profile_id`), never from the current profile. A run describes the
 * profile it ran against; mixing a later answer into its figures would print
 * a sentence the customer never gave beside numbers computed under another.
 *
 * A scope determination has no run: a profile outside the rule has no figures
 * to compute, so runService refuses it. Its document is composed from the
 * attested profile alone (spec open question 1).
 */
import { createHash } from "node:crypto";
import {
  BusinessLogicException,
  ConflictException,
  CustomException,
  NotFoundException,
} from "../../domain.layer/exceptions/custom.exception";
import {
  getAttestedProfileQuery,
  getCorpusQuery,
  getProfileAnswersQuery,
  getProfileByIdQuery,
  getProjectQuery,
  getRunQuery,
  getStanceDownloadQuery,
  getUserNamesQuery,
  type CorpusRow,
} from "../../utils/biasAudit.utils";
import { assertProjectAccess, runNotFound } from "./projectAccess";
import { answerMapFromRows, assertProject } from "./serviceHelpers";
import { runAnswerGates } from "./answerGates";
import { computeReadiness } from "./readinessScore";
import { composeStance, type CorpusStanceFacts, type StanceAttribution } from "./stance/compose";
import { JOB_DESCRIPTIONS } from "../../structures/NYC-Local-Law-144/job-descriptions";
import type { JobDescription } from "../../structures/NYC-Local-Law-144/job-descriptions/types";
import { evidenceFromRun, persistStance } from "./stance/render";
import { LL144_CONFIG, mayExportStoredRun } from "./runService";
import type { DerivedBasis } from "./deriveBasis";
import type { AnswerWithNotes } from "./applicability";
import type { AedtProfile } from "../../domain.layer/models/biasAudit/aedtProfile.model";
import type { AedtProfileAnswer } from "../../domain.layer/models/biasAudit/aedtProfileAnswer.model";
import type { BiasAuditResult, GateFinding, OrderFinding } from "./index";

export interface GenerateStanceInput {
  runId: number;
  organizationId: number;
  userId: number;
  /** The caller's role, for the project-member rule (projectAccess.ts). */
  role: string;
}

export interface GenerateStanceResult {
  stanceId: number;
  version: number;
  sha256: string;
}

function isoDate(d: Date | string | null | undefined): string | null {
  if (d === null || d === undefined) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** Labels of the categories the LL 144 configuration tests. */
function testedCategories(): string[] {
  const labels = Object.values(LL144_CONFIG.categories).map((c) => c.label);
  return LL144_CONFIG.intersectional?.required ? [...labels, "Intersectional categories"] : labels;
}

/**
 * Spec Review Focus 3: a profile whose every applicable answer is "I don't
 * know" describes nothing, so no stance is produced at all rather than one
 * that reads as a 0% result.
 */
function assertMayProduceStance(answers: AnswerWithNotes) {
  const answerGates = runAnswerGates(answers);
  if (!answerGates.mayProduceStance) {
    throw new BusinessLogicException(
      `A stance cannot be generated: ${answerGates.blocked.stance.join("; ")}.`,
      "stance_answer_gate",
    );
  }
  return answerGates;
}

/**
 * Who did something and when, as a stance prints it. No date: nothing to
 * attribute (null). Otherwise the name, or with a null user a reason:
 * "departed" when the user is not found in the organization (or none was
 * recorded), "unnamed" when found with a blank name.
 */
function attribute(
  userId: number | null | undefined,
  at: Date | string | null | undefined,
  names: Map<number, string>,
): StanceAttribution | null {
  const date = isoDate(at);
  if (!date) return null;
  const user = userId != null ? names.get(userId) : undefined;
  if (user) return { user, date };
  return { user: null, date, reason: user === undefined ? "departed" : "unnamed" };
}

/**
 * Who answered each question and who attested the profile, by name, for run
 * stances and scope determinations alike. Both use attribute: an answer or
 * attestation by a user no longer in the organization, or found with a blank
 * name, keeps its date with a null user and the reason, and compose and the
 * template word each truthfully. The attestation date is the record: a
 * profile with one was attested, even when the attester has since left.
 */
async function attributionFor(
  rows: AedtProfileAnswer[],
  profile: Pick<AedtProfile, "attested_by_user_id" | "attested_at">,
  organizationId: number,
): Promise<{
  answerAuthors: Record<string, StanceAttribution>;
  attestation: StanceAttribution | null;
}> {
  const userIds = [
    ...new Set(
      [...rows.map((r) => r.answered_by_user_id), profile.attested_by_user_id].filter(
        (id): id is number => typeof id === "number",
      ),
    ),
  ];
  const names = new Map(
    (await getUserNamesQuery(userIds, organizationId)).map((u) => [
      u.id,
      `${u.name} ${u.surname}`.trim(),
    ]),
  );

  const answerAuthors: Record<string, StanceAttribution> = {};
  for (const r of rows) {
    const author = attribute(r.answered_by_user_id, r.answered_at, names);
    if (author) answerAuthors[r.question_key] = author;
  }
  const attestation = attribute(profile.attested_by_user_id, profile.attested_at, names);
  return { answerAuthors, attestation };
}

const CRITERIA_VERDICTS = ["close", "divergent", "not_supplied"] as const;
type CriteriaVerdict = (typeof CRITERIA_VERDICTS)[number];

/**
 * What the stance states about the corpus a run was scored from, built from
 * the corpus row. Unmatched criteria are named by their labels.
 */
export function corpusStanceFacts(corpus: CorpusRow): CorpusStanceFacts {
  const jd = Object.prototype.hasOwnProperty.call(JOB_DESCRIPTIONS, corpus.job_description_key)
    ? (JOB_DESCRIPTIONS as Record<string, JobDescription>)[corpus.job_description_key]
    : undefined;
  const comparison = (corpus.criteria_comparison_json ?? {}) as {
    verdict?: unknown;
    unmatchedExpected?: unknown;
  };
  const verdict: CriteriaVerdict = (CRITERIA_VERDICTS as readonly unknown[]).includes(
    comparison.verdict,
  )
    ? (comparison.verdict as CriteriaVerdict)
    : "not_supplied";
  const unmatched = Array.isArray(comparison.unmatchedExpected)
    ? comparison.unmatchedExpected.filter((k): k is string => typeof k === "string")
    : [];
  const labelOf = (key: string) => jd?.expectedCriteria.find((c) => c.key === key)?.label ?? key;
  const knockout =
    corpus.knockout === "yes" || corpus.knockout === "no" ? corpus.knockout : "dont_know";
  return {
    corpusId: corpus.id,
    roleTitle: jd?.roleTitle ?? corpus.job_description_key,
    recordCount: corpus.record_count ?? 0,
    modelPinned: corpus.model_pinned,
    modelsObserved: corpus.models_observed_json ?? {},
    cellSizes: corpus.cell_sizes_json ?? {},
    criteria: { verdict, unmatchedExpected: unmatched.map(labelOf) },
    knockout,
    nameMethod: corpus.name_method,
  };
}

export async function generateStance(input: GenerateStanceInput): Promise<GenerateStanceResult> {
  const { runId, organizationId, userId, role } = input;

  const run = await getRunQuery(runId, organizationId);
  if (!run) throw runNotFound(runId)();
  await assertProjectAccess(run.project_id, organizationId, { userId, role }, runNotFound(runId));

  const profile = await getProfileByIdQuery(run.profile_id, organizationId);
  if (!profile) {
    throw new NotFoundException(
      `The profile version run ${runId} was recorded against was not found`,
      "AedtProfile",
      run.profile_id,
    );
  }
  const rows = await getProfileAnswersQuery(profile.id!, organizationId);
  const answers = answerMapFromRows(rows, "with_notes");

  const answerGates = assertMayProduceStance(answers);
  const { answerAuthors, attestation } = await attributionFor(rows, profile, organizationId);

  const project = await getProjectQuery(run.project_id, organizationId);
  if (!project) {
    throw new NotFoundException(`Project ${run.project_id} was not found`, "Project");
  }

  // A run scored from a generated corpus names it; the corpus may have been
  // deleted since (the foreign key sets corpus_id null), which reads as none.
  const corpusRow = run.corpus_id ? await getCorpusQuery(run.corpus_id, organizationId) : null;
  const corpus = corpusRow ? corpusStanceFacts(corpusRow) : null;

  const readiness = computeReadiness(answers);
  const model = composeStance({
    projectName: project.project_title,
    readiness,
    gates: answerGates,
    answers,
    answerAuthors,
    result: (run.result_json ?? null) as BiasAuditResult | null,
    gateFindings: (Array.isArray(run.gate_findings_json)
      ? run.gate_findings_json
      : []) as GateFinding[],
    order: (Array.isArray(run.order_findings_json)
      ? run.order_findings_json
      : []) as OrderFinding[],
    expiry: { date: isoDate(run.expiry_date), trigger: run.expiry_trigger ?? "" },
    derivedBasis: (run.data_basis_json ?? null) as DerivedBasis | null,
    attestation,
    jobDescriptionKey: run.job_description_key ?? null,
    corpus,
  });

  const evidence = evidenceFromRun(
    run,
    testedCategories(),
    mayExportStoredRun(run.gate_findings_json),
    corpus,
  );

  return persistStance({
    runId: run.id!,
    projectId: run.project_id,
    organizationId,
    userId,
    model,
    evidence,
    scoreAtGeneration: readiness.score,
  });
}

export interface GenerateProfileStanceInput {
  projectId: number;
  frameworkId: number;
  organizationId: number;
  userId: number;
  /** The caller's role, for the project-member rule (projectAccess.ts). */
  role: string;
}

/**
 * The "Scope determination" document for a project whose attested profile
 * places the tool out of scope (spec 704-716, open question 1). It quotes the
 * customer's determination with the attesting user and date and carries no
 * ratios and no readiness score, because neither was computed. A profile in
 * scope, or one whose scope is not established, gets its stance from a run.
 */
export async function generateProfileStance(
  input: GenerateProfileStanceInput,
): Promise<GenerateStanceResult> {
  const { projectId, frameworkId, organizationId, userId, role } = input;
  const project = await assertProject(projectId, organizationId, { userId, role });

  const profile = await getAttestedProfileQuery(projectId, frameworkId, organizationId);
  if (!profile) {
    throw new NotFoundException(
      "No attested profile exists for this project. Attest the profile before generating a scope determination.",
      "AedtProfile",
    );
  }
  const rows = await getProfileAnswersQuery(profile.id!, organizationId);
  const answers = answerMapFromRows(rows, "with_notes");

  const readiness = computeReadiness(answers);
  if (readiness.scope !== "out_of_scope") {
    throw new BusinessLogicException(
      readiness.scope === "in_scope"
        ? "The attested profile places this tool in scope. A stance for an in-scope profile comes from a run: record a run and generate the stance from it."
        : "The attested profile does not establish scope. A stance for an undetermined profile comes from a run once scope is established.",
      "stance_profile_scope",
    );
  }
  const answerGates = assertMayProduceStance(answers);
  const { answerAuthors, attestation } = await attributionFor(rows, profile, organizationId);

  // No run: no result, no data findings, no derived basis. compose prints the
  // out-of-scope expiry wording ("revisit it if the use changes") and takes
  // no date from here, so none is invented.
  const model = composeStance({
    projectName: project.project_title,
    readiness,
    gates: answerGates,
    answers,
    answerAuthors,
    result: null,
    gateFindings: [],
    order: [],
    expiry: { date: null, trigger: "" },
    derivedBasis: null,
    attestation,
    jobDescriptionKey: null,
    corpus: null,
  });

  return persistStance({
    profileId: profile.id!,
    projectId,
    organizationId,
    userId,
    model,
    evidence: null,
    scoreAtGeneration: null,
  });
}

export interface StanceDownload {
  filename: string;
  content: Buffer;
  sha256: string;
}

/**
 * A stored stance PDF. The file is an ordinary files row with no foreign key
 * from the stance, so its absence is reported as gone (410) rather than
 * assumed impossible, and its bytes are checked against the hash recorded at
 * generation before they are served.
 */
export interface StanceViewer {
  userId: number;
  role: string;
}

export async function getStanceDownload(
  stanceId: number,
  organizationId: number,
  viewer: StanceViewer,
): Promise<StanceDownload> {
  const row = await getStanceDownloadQuery(stanceId, organizationId, viewer.userId);
  // The rule of every other bias audit path (projectAccess.ts): the
  // organization's Admins and the project's owner and members. Whoever
  // generated the stance has no access of their own once they leave the
  // project. SuperAdmin is cross-tenant administration, not an in-org
  // Admin, so it gets no bypass here. A viewer without access gets the same
  // not-found as a stance in another organization, so its existence is not
  // disclosed.
  if (!row || (viewer.role !== "Admin" && !row.viewer_has_project_access)) {
    throw new NotFoundException(`Stance ${stanceId} was not found`, "AedtStance", stanceId);
  }

  if (row.file_id === null || row.content === null) {
    throw new CustomException(
      `The PDF for stance ${stanceId} is no longer stored. Generate the stance again to obtain a new version.`,
      { code: "GONE", statusCode: 410 },
    );
  }
  const content = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content);
  const sha256 = createHash("sha256").update(content).digest("hex");
  // Fails closed: with no hash recorded at generation the bytes cannot be
  // checked, so they are refused rather than served as if they had been.
  if (!row.pdf_sha256) {
    throw new ConflictException(
      `The stored PDF for stance ${stanceId} cannot be verified: no hash was recorded when it was generated.`,
      "AedtStance",
      "pdf_sha256",
    );
  }
  if (row.pdf_sha256 !== sha256) {
    throw new ConflictException(
      `The stored PDF for stance ${stanceId} no longer matches the hash recorded when it was generated.`,
      "AedtStance",
      "pdf_sha256",
    );
  }
  return {
    filename: row.filename ?? `bias-audit-stance-${stanceId}-v${row.version}.pdf`,
    content,
    sha256,
  };
}
