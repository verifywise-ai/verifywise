/**
 * Generates a stance from a stored run, and serves a stored stance PDF.
 *
 * I/O layer: reads the run, its profile and answers, and user and project
 * names through utils, then hands the composed model to render.persistStance.
 *
 * A stance is composed from the answers of the profile version the run cites
 * (`run.profile_id`), never from the current profile. A run describes the
 * profile it ran against; mixing a later answer into its figures would print
 * a sentence the customer never gave beside numbers computed under another.
 */
import { createHash } from "node:crypto";
import {
  BusinessLogicException,
  ConflictException,
  CustomException,
  NotFoundException,
} from "../../domain.layer/exceptions/custom.exception";
import {
  getProfileAnswersQuery,
  getProfileByIdQuery,
  getProjectQuery,
  getRunQuery,
  getStanceDownloadQuery,
  getUserNamesQuery,
} from "../../utils/biasAudit.utils";
import { assertProjectAccess, runNotFound } from "./projectAccess";
import { answerMapFromRows } from "./serviceHelpers";
import { runAnswerGates } from "./answerGates";
import { computeReadiness } from "./readinessScore";
import { composeStance } from "./stance/compose";
import { evidenceFromRun, persistStance } from "./stance/render";
import { LL144_CONFIG, mayExportStoredRun } from "./runService";
import type { DerivedBasis } from "./deriveBasis";
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

  // Spec Review Focus 3: a profile whose every applicable answer is
  // "I don't know" describes nothing, so no stance is produced at all
  // rather than one that reads as a 0% result.
  const answerGates = runAnswerGates(answers);
  if (!answerGates.mayProduceStance) {
    throw new BusinessLogicException(
      `A stance cannot be generated: ${answerGates.blocked.stance.join("; ")}.`,
      "stance_answer_gate",
    );
  }

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

  // An author no longer in the organization is left unattributed rather than
  // given a placeholder name; compose then says the author is not recorded.
  const answerAuthors: Record<string, { user: string; date: string }> = {};
  for (const r of rows) {
    const user = r.answered_by_user_id != null ? names.get(r.answered_by_user_id) : undefined;
    const date = isoDate(r.answered_at);
    if (user && date) answerAuthors[r.question_key] = { user, date };
  }
  const attester =
    profile.attested_by_user_id != null ? names.get(profile.attested_by_user_id) : undefined;
  const attestedOn = isoDate(profile.attested_at);
  const attestation = attester && attestedOn ? { user: attester, date: attestedOn } : null;

  const project = await getProjectQuery(run.project_id, organizationId);
  if (!project) {
    throw new NotFoundException(`Project ${run.project_id} was not found`, "Project");
  }

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
  });

  const evidence = evidenceFromRun(
    run,
    testedCategories(),
    mayExportStoredRun(run.gate_findings_json),
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
  // Project files are readable by the organization's Admins and by the
  // project's owner and members (canUserAccessFile); a stance PDF follows the
  // same rule. SuperAdmin is cross-tenant administration, not an in-org
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
