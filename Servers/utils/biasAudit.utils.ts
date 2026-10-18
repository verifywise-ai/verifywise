import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import logger from "./logger/fileLogger";
import { AedtProfile } from "../domain.layer/models/biasAudit/aedtProfile.model";
import { AedtProfileAnswer } from "../domain.layer/models/biasAudit/aedtProfileAnswer.model";
import { BiasAuditRun } from "../domain.layer/models/biasAudit/biasAuditRun.model";
import { BiasAuditStance } from "../domain.layer/models/biasAudit/biasAuditStance.model";
import { ConflictException, NotFoundException } from "../domain.layer/exceptions/custom.exception";

/*
 * Tenancy. The four bias-audit tables carry organization_id but have no
 * composite foreign keys, so a row in org A could name a project, profile or
 * run in org B. Every statement here filters on organization_id, and every
 * insert that takes a referenced id is written as INSERT ... SELECT from the
 * referenced row filtered on the same organization, so a cross-org reference
 * inserts nothing and is refused rather than written.
 */

const JSONB_NULL = null;

function json(value: unknown): string | null {
  return value === undefined || value === null ? JSONB_NULL : JSON.stringify(value);
}

function firstRow<T>(result: unknown): T | undefined {
  const rows = Array.isArray(result) ? (result[0] as unknown) : undefined;
  return Array.isArray(rows) ? (rows[0] as T | undefined) : undefined;
}

function refuseCrossOrg(what: string, id: number): never {
  throw new NotFoundException(`${what} ${id} was not found in this organization`, what);
}

/**
 * The project-id expressions PROJECT_MEMBER_SQL accepts, one per caller:
 * `target.id` in userCanAccessProjectQuery (the outer `projects target`
 * row) and `s.project_id` in getStanceDownloadQuery (the stance row). The
 * expression is interpolated into SQL and must be qualified with the
 * caller's alias: a bare column such as `id` binds to `p.id` inside the
 * subquery, which makes the check true for every project. A new caller adds
 * its exact expression here, and to this comment, rather than passing a
 * string.
 */
const PROJECT_MEMBER_EXPRS = ["target.id", "s.project_id"] as const;
export type ProjectMemberExpr = (typeof PROJECT_MEMBER_EXPRS)[number];

/**
 * The project-member rule, written once. True when the viewer owns the
 * project or is in projects_members for it, both within the organization.
 * The Admin allowance is the caller's, from the role. Same rule as
 * canUserAccessFile (utils/fileUpload.utils.ts). `:organization_id` and
 * `:viewer_user_id` are replacements the caller supplies. Exported for its
 * test; the run-time check backs the type for callers that cast.
 */
export const PROJECT_MEMBER_SQL = (projectExpr: ProjectMemberExpr): string => {
  if (!(PROJECT_MEMBER_EXPRS as readonly string[]).includes(projectExpr)) {
    throw new Error(`Unsupported project-member expression: ${String(projectExpr)}`);
  }
  return `EXISTS (
               SELECT 1
                 FROM projects p
                 LEFT JOIN projects_members pm
                        ON pm.project_id = p.id AND pm.organization_id = :organization_id
                WHERE p.id = ${projectExpr}
                  AND p.organization_id = :organization_id
                  AND (p.owner = :viewer_user_id OR pm.user_id = :viewer_user_id)
            )`;
};

/** Whether the user owns, or is a member of, this project in this organization. */
export async function userCanAccessProjectQuery(
  projectId: number,
  userId: number,
  organizationId: number,
): Promise<boolean> {
  const rows = (await sequelize.query(
    `SELECT ${PROJECT_MEMBER_SQL("target.id")} AS allowed
       FROM projects target
      WHERE target.id = :project_id AND target.organization_id = :organization_id`,
    {
      replacements: {
        project_id: projectId,
        viewer_user_id: userId,
        organization_id: organizationId,
      },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ allowed: boolean }>;
  return rows[0]?.allowed === true;
}

// ---------------------------------------------------------------- profiles

export async function getAttestedProfileQuery(
  projectId: number,
  frameworkId: number,
  organizationId: number,
): Promise<AedtProfile | null> {
  const rows = (await sequelize.query(
    `SELECT * FROM aedt_profiles
      WHERE project_id = :project_id AND framework_id = :framework_id
        AND status = 'attested' AND organization_id = :organization_id
      LIMIT 1`,
    {
      replacements: {
        project_id: projectId,
        framework_id: frameworkId,
        organization_id: organizationId,
      },
      type: QueryTypes.SELECT,
    },
  )) as AedtProfile[];
  return rows[0] ?? null;
}

/**
 * Latest draft-or-attested profile: the one a user is editing. With `lock`,
 * the row is read FOR UPDATE inside that transaction, so a save holds it
 * against a concurrent attestation (attestProfileQuery locks the same row)
 * or a concurrent save, and reads after the lock see what they committed.
 */
export async function getCurrentProfileQuery(
  projectId: number,
  frameworkId: number,
  organizationId: number,
  lock?: { transaction: Transaction },
): Promise<AedtProfile | null> {
  const rows = (await sequelize.query(
    `SELECT * FROM aedt_profiles
      WHERE project_id = :project_id AND framework_id = :framework_id
        AND status <> 'superseded' AND organization_id = :organization_id
      ORDER BY version DESC
      LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    {
      replacements: {
        project_id: projectId,
        framework_id: frameworkId,
        organization_id: organizationId,
      },
      type: QueryTypes.SELECT,
      transaction: lock?.transaction,
    },
  )) as AedtProfile[];
  return rows[0] ?? null;
}

export async function getProfileAnswersQuery(
  profileId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<AedtProfileAnswer[]> {
  return (await sequelize.query(
    `SELECT * FROM aedt_profile_answers
      WHERE profile_id = :profile_id AND organization_id = :organization_id
      ORDER BY question_key`,
    {
      replacements: { profile_id: profileId, organization_id: organizationId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as AedtProfileAnswer[];
}

export interface CreateProfileVersionArgs {
  projectId: number;
  frameworkId: number;
  version: number;
  questionSetVersion: number;
  createdBy: number;
}

export async function createProfileVersionQuery(
  args: CreateProfileVersionArgs,
  organizationId: number,
  transaction: Transaction,
): Promise<AedtProfile> {
  const result = await sequelize.query(
    `INSERT INTO aedt_profiles
       (organization_id, project_id, framework_id, version, status,
        question_set_version, created_by)
     SELECT p.organization_id, p.id, :framework_id, :version, 'draft',
            :question_set_version, :created_by
       FROM projects p
      WHERE p.id = :project_id AND p.organization_id = :organization_id
     RETURNING *`,
    {
      replacements: {
        project_id: args.projectId,
        framework_id: args.frameworkId,
        version: args.version,
        question_set_version: args.questionSetVersion,
        created_by: args.createdBy,
        organization_id: organizationId,
      },
      transaction,
    },
  );
  const row = firstRow<AedtProfile>(result);
  if (!row) refuseCrossOrg("Project", args.projectId);
  return row;
}

export interface UpsertAnswerArgs {
  profileId: number;
  questionKey: string;
  questionSetVersion: number;
  answerValue: string | null;
  answerNotes: string | null;
  isDontKnow: boolean;
  isNotApplicable: boolean;
  answeredByUserId: number;
  /** Carried-forward answers keep their original timestamp; omitted means now. */
  answeredAt?: Date | null;
}

export async function upsertAnswerQuery(
  args: UpsertAnswerArgs,
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  // Selecting from the profile row keeps the answer in the profile's org,
  // and only a draft is written to: an attested profile is what runs and
  // stances cite, so it never changes once attested.
  const result = await sequelize.query(
    `INSERT INTO aedt_profile_answers
       (organization_id, profile_id, question_key, question_set_version,
        answer_value, answer_notes, is_dont_know, is_not_applicable,
        answered_by_user_id, answered_at)
     SELECT p.organization_id, p.id, :question_key, :question_set_version,
            :answer_value, :answer_notes, :is_dont_know, :is_not_applicable,
            :answered_by_user_id, COALESCE(:answered_at, NOW())
       FROM aedt_profiles p
      WHERE p.id = :profile_id AND p.organization_id = :organization_id
        AND p.status = 'draft'
     ON CONFLICT (profile_id, question_key) DO UPDATE SET
       question_set_version = EXCLUDED.question_set_version,
       answer_value = EXCLUDED.answer_value,
       answer_notes = EXCLUDED.answer_notes,
       is_dont_know = EXCLUDED.is_dont_know,
       is_not_applicable = EXCLUDED.is_not_applicable,
       answered_by_user_id = EXCLUDED.answered_by_user_id,
       answered_at = COALESCE(:answered_at, NOW())
     RETURNING id`,
    {
      replacements: {
        profile_id: args.profileId,
        question_key: args.questionKey,
        question_set_version: args.questionSetVersion,
        answer_value: args.answerValue,
        answer_notes: args.answerNotes,
        is_dont_know: args.isDontKnow,
        is_not_applicable: args.isNotApplicable,
        answered_by_user_id: args.answeredByUserId,
        answered_at: args.answeredAt ?? null,
        organization_id: organizationId,
      },
      transaction,
    },
  );
  if (firstRow(result)) return;

  // Nothing was written: either the profile is not in this organization, or
  // it stopped being a draft (attested meanwhile). The second is a conflict
  // the caller can retry from a reload, not a missing profile.
  const existing = firstRow<{ status: string }>(
    await sequelize.query(
      `SELECT status FROM aedt_profiles
        WHERE id = :id AND organization_id = :organization_id`,
      { replacements: { id: args.profileId, organization_id: organizationId }, transaction },
    ),
  );
  if (!existing) refuseCrossOrg("Profile", args.profileId);
  throw new ConflictException(
    `Profile ${args.profileId} is ${existing.status}, not a draft, so its answers cannot be changed. Reload and retry.`,
    "AedtProfile",
    "status",
  );
}

export async function attestProfileQuery(
  profileId: number,
  userId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<AedtProfile> {
  try {
    // Lock the target first so a concurrent attestation of the same draft
    // waits, then sees a non-draft status and gets a clean conflict.
    const target = firstRow<{ id: number; status: string }>(
      await sequelize.query(
        `SELECT id, status FROM aedt_profiles
          WHERE id = :id AND organization_id = :organization_id
          FOR UPDATE`,
        {
          replacements: { id: profileId, organization_id: organizationId },
          transaction,
        },
      ),
    );
    if (!target) refuseCrossOrg("Profile", profileId);
    if (target.status !== "draft") {
      throw new ConflictException(
        `Profile ${profileId} is ${target.status}, not a draft, so it cannot be attested. Reload and retry.`,
        "AedtProfile",
        "status",
      );
    }
    await sequelize.query(
      `UPDATE aedt_profiles SET status = 'superseded', superseded_at = NOW()
         WHERE project_id = (SELECT project_id FROM aedt_profiles
                              WHERE id = :id AND organization_id = :organization_id)
           AND framework_id = (SELECT framework_id FROM aedt_profiles
                                WHERE id = :id AND organization_id = :organization_id)
           AND id <> :id
           AND status = 'attested' AND organization_id = :organization_id`,
      { replacements: { id: profileId, organization_id: organizationId }, transaction },
    );
    const result = await sequelize.query(
      `UPDATE aedt_profiles
          SET status = 'attested', attested_by_user_id = :user_id,
              attested_at = NOW(), updated_at = NOW()
        WHERE id = :id AND status = 'draft' AND organization_id = :organization_id
        RETURNING *`,
      {
        replacements: { id: profileId, user_id: userId, organization_id: organizationId },
        transaction,
      },
    );
    const row = firstRow<AedtProfile>(result);
    if (!row) refuseCrossOrg("Profile", profileId);
    return row;
  } catch (error: unknown) {
    // The partial unique index is the backstop; translate it rather than
    // letting a 23505 reach the client as a 500.
    if ((error as { original?: { code?: string } })?.original?.code === "23505") {
      logger.warn(`Concurrent attestation conflict on profile ${profileId}`);
      throw new ConflictException(
        "Another version of this profile was already attested concurrently. Reload and retry.",
        "AedtProfile",
        "status",
      );
    }
    throw error;
  }
}

// -------------------------------------------------------------------- runs

export interface CreateRunArgs {
  projectId: number;
  profileId: number;
  presetId: string;
  jobDescriptionKey?: string | null;
  metric: string;
  threshold: number | null;
  thresholdSource: string | null;
  smallSampleExclusion: number | null;
  dataBasisJson?: unknown;
  expiryDate: string | null;
  expiryTrigger: string | null;
  readinessScore: number | null;
  readinessBlockedReason?: string | null;
  resultJson: unknown;
  resultSchemaVersion?: number;
  gateFindingsJson: unknown;
  orderFindingsJson?: unknown;
  datasetSha256: string | null;
  datasetRetained: boolean;
  rowCount: number | null;
  corpusId?: number | null;
  createdBy: number;
}

export async function createRunQuery(
  args: CreateRunArgs,
  organizationId: number,
  transaction: Transaction,
): Promise<BiasAuditRun> {
  // The profile must belong to this organization and to the named project,
  // and that project to this organization.
  const result = await sequelize.query(
    `INSERT INTO bias_audit_runs
       (organization_id, project_id, profile_id, profile_version, preset_id,
        question_set_version, job_description_key, metric, threshold,
        threshold_source, small_sample_exclusion, data_basis_json,
        expiry_date, expiry_trigger, readiness_score, readiness_blocked_reason,
        result_json, result_schema_version, gate_findings_json,
        order_findings_json, dataset_sha256, dataset_retained, row_count,
        corpus_id, created_by)
     SELECT pr.organization_id, pr.id, ap.id, ap.version, :preset_id,
            ap.question_set_version, :job_description_key, :metric, :threshold,
            :threshold_source, :small_sample_exclusion,
            CAST(:data_basis_json AS JSONB),
            :expiry_date, :expiry_trigger, :readiness_score,
            :readiness_blocked_reason,
            CAST(:result_json AS JSONB), :result_schema_version,
            CAST(:gate_findings_json AS JSONB),
            CAST(:order_findings_json AS JSONB), :dataset_sha256,
            :dataset_retained, :row_count, :corpus_id, :created_by
       FROM aedt_profiles ap
       JOIN projects pr ON pr.id = ap.project_id
                       AND pr.organization_id = :organization_id
      WHERE ap.id = :profile_id AND ap.project_id = :project_id
        AND ap.organization_id = :organization_id
        AND ap.status = 'attested'
     RETURNING *`,
    {
      replacements: {
        project_id: args.projectId,
        profile_id: args.profileId,
        preset_id: args.presetId,
        job_description_key: args.jobDescriptionKey ?? null,
        metric: args.metric,
        threshold: args.threshold,
        threshold_source: args.thresholdSource,
        small_sample_exclusion: args.smallSampleExclusion,
        data_basis_json: json(args.dataBasisJson),
        expiry_date: args.expiryDate,
        expiry_trigger: args.expiryTrigger,
        readiness_score: args.readinessScore,
        readiness_blocked_reason: args.readinessBlockedReason ?? null,
        result_json: json(args.resultJson),
        result_schema_version: args.resultSchemaVersion ?? 1,
        gate_findings_json: json(args.gateFindingsJson),
        order_findings_json: json(args.orderFindingsJson),
        dataset_sha256: args.datasetSha256,
        dataset_retained: args.datasetRetained,
        row_count: args.rowCount,
        corpus_id: args.corpusId ?? null,
        created_by: args.createdBy,
        organization_id: organizationId,
      },
      transaction,
    },
  );
  const row = firstRow<BiasAuditRun>(result);
  if (!row) refuseCrossOrg("Profile", args.profileId);
  return row;
}

// ----------------------------------------------------------------- stances

export interface CreateStanceArgs {
  runId: number;
  version: number;
  pdfSha256: string | null;
  pdfFileId: number | null;
  scoreAtGeneration: number | null;
  scopeAtGeneration: string;
  generatedBy: number;
}

export async function createStanceQuery(
  args: CreateStanceArgs,
  organizationId: number,
  transaction: Transaction,
): Promise<BiasAuditStance> {
  // project_id is taken from the run so the two cannot disagree; the run
  // must belong to this organization.
  const result = await sequelize.query(
    `INSERT INTO bias_audit_stances
       (organization_id, project_id, run_id, version, pdf_sha256, pdf_file_id,
        score_at_generation, scope_at_generation, profile_version,
        question_set_version, generated_by)
     SELECT r.organization_id, r.project_id, r.id, :version, :pdf_sha256,
            :pdf_file_id, :score_at_generation, :scope_at_generation,
            r.profile_version, r.question_set_version, :generated_by
       FROM bias_audit_runs r
      WHERE r.id = :run_id AND r.organization_id = :organization_id
     RETURNING *`,
    {
      replacements: {
        run_id: args.runId,
        version: args.version,
        pdf_sha256: args.pdfSha256,
        pdf_file_id: args.pdfFileId,
        score_at_generation: args.scoreAtGeneration,
        scope_at_generation: args.scopeAtGeneration,
        generated_by: args.generatedBy,
        organization_id: organizationId,
      },
      transaction,
    },
  );
  const row = firstRow<BiasAuditStance>(result);
  if (!row) refuseCrossOrg("Run", args.runId);
  return row;
}

export interface CreateProfileStanceArgs {
  profileId: number;
  /** The project the PDF is filed under. A filter only: the row takes the profile's. */
  projectId: number;
  version: number;
  pdfSha256: string | null;
  pdfFileId: number | null;
  scopeAtGeneration: string;
  generatedBy: number;
}

/**
 * The shared verdict of the two attested-profile checks below, from the
 * status their query read (undefined when no row matched): attested passes,
 * superseded answers 409 (re-attested while the document was being
 * generated, so the caller can reload and retry), anything else, missing, a
 * draft, another project's or another organization's, answers 404.
 */
function refuseUnlessAttested(status: string | undefined, profileId: number): void {
  if (status === "attested") return;
  if (status === "superseded") {
    throw new ConflictException(
      "The profile was re-attested while the document was being generated. Reload and retry.",
      "AedtProfile",
      "status",
    );
  }
  refuseCrossOrg("Profile", profileId);
}

/**
 * The cited profile, written once for the three statements that read it
 * (checkProfileAttestedQuery, assertProfileAttestedQuery and
 * createProfileStanceQuery): the profile row by id, of the caller's project,
 * joined to that project within the organization. It ends in an open WHERE,
 * so each statement appends `AND ap.organization_id = :organization_id`
 * itself, where the module-rules test sees the organization filter, and then
 * anything of its own (a status filter, a lock). `:profile_id`,
 * `:project_id` and `:organization_id` are replacements the caller supplies.
 */
const CITED_PROFILE_SQL = `aedt_profiles ap
       JOIN projects pr ON pr.id = ap.project_id
                       AND pr.organization_id = :organization_id
      WHERE ap.id = :profile_id AND ap.project_id = :project_id`;

/**
 * The cheap check run before a scope determination's PDF is rendered, so a
 * profile that is missing, another project's or no longer attested launches
 * no browser. A plain read with no lock: it runs outside any transaction,
 * where a lock would end with the statement anyway. The authority is the
 * locked check inside the persist transaction (assertProfileAttestedQuery).
 */
export async function checkProfileAttestedQuery(
  profileId: number,
  projectId: number,
  organizationId: number,
): Promise<void> {
  const rows = (await sequelize.query(
    `SELECT ap.status
       FROM ${CITED_PROFILE_SQL}
        AND ap.organization_id = :organization_id`,
    {
      replacements: {
        profile_id: profileId,
        project_id: projectId,
        organization_id: organizationId,
      },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ status: string }>;
  refuseUnlessAttested(rows[0]?.status, profileId);
}

/**
 * Refuses unless the profile is the attested one of this organization and
 * project (see refuseUnlessAttested), and holds it while the transaction
 * runs.
 *
 * The row is read FOR SHARE inside the persist transaction, and the lock is
 * held to commit. A re-attestation supersedes this row with an UPDATE, whose
 * row lock conflicts with FOR SHARE, so it waits until the stance is
 * committed; one that committed first is seen here as superseded (READ
 * COMMITTED reads the latest row version after the wait). That keeps the
 * version read and the insert that follow on one attested profile.
 */
export async function assertProfileAttestedQuery(
  profileId: number,
  projectId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  const rows = (await sequelize.query(
    `SELECT ap.status
       FROM ${CITED_PROFILE_SQL}
        AND ap.organization_id = :organization_id
        FOR SHARE OF ap`,
    {
      replacements: {
        profile_id: profileId,
        project_id: projectId,
        organization_id: organizationId,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ status: string }>;
  refuseUnlessAttested(rows[0]?.status, profileId);
}

/**
 * A stance generated from an attested profile: the out-of-scope "Scope
 * determination", which has no run. The project and both versions are taken
 * from the profile row, as createStanceQuery takes them from the run, and
 * only an attested profile of this organization, of the caller's project (and
 * of a project in the organization) is accepted. No readiness score is
 * stored, because none was computed.
 *
 * The caller locks the profile first (assertProfileAttestedQuery in the same
 * transaction), so the WHERE below is a second guard. An insert that still
 * matches no row is told apart by the same check: superseded is 409,
 * anything else 404.
 */
export async function createProfileStanceQuery(
  args: CreateProfileStanceArgs,
  organizationId: number,
  transaction: Transaction,
): Promise<BiasAuditStance> {
  const result = await sequelize.query(
    `INSERT INTO bias_audit_stances
       (organization_id, project_id, run_id, profile_id, version, pdf_sha256,
        pdf_file_id, score_at_generation, scope_at_generation, profile_version,
        question_set_version, generated_by)
     SELECT ap.organization_id, ap.project_id, NULL, ap.id, :version, :pdf_sha256,
            :pdf_file_id, NULL, :scope_at_generation, ap.version,
            ap.question_set_version, :generated_by
       FROM ${CITED_PROFILE_SQL}
        AND ap.organization_id = :organization_id AND ap.status = 'attested'
     RETURNING *`,
    {
      replacements: {
        profile_id: args.profileId,
        project_id: args.projectId,
        version: args.version,
        pdf_sha256: args.pdfSha256,
        pdf_file_id: args.pdfFileId,
        scope_at_generation: args.scopeAtGeneration,
        generated_by: args.generatedBy,
        organization_id: organizationId,
      },
      transaction,
    },
  );
  const row = firstRow<BiasAuditStance>(result);
  if (row) return row;
  await assertProfileAttestedQuery(args.profileId, args.projectId, organizationId, transaction);
  refuseCrossOrg("Profile", args.profileId);
}

/**
 * Next scope-determination version for the project and framework of the
 * cited profile. A re-attestation creates a new aedt_profiles row, so the
 * numbering spans every profile row of that project and framework (v1 on
 * profile A, then v2 on profile B), not the one row.
 *
 * Read it inside the persist transaction, after the cited profile is locked
 * FOR SHARE (assertProfileAttestedQuery). The lock means no re-attestation
 * can commit between this read and the insert, so every generate that reads
 * a number cites the one attested profile; two that read the same number
 * collide on the partial unique index (profile_id, version), a 23505 the
 * caller maps to a conflict. Without the lock a re-attestation committing
 * mid-generate could let two profiles of the project file the same version.
 */
export async function getNextProfileStanceVersionQuery(
  profileId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<number> {
  const rows = (await sequelize.query(
    `SELECT MAX(s.version) AS max
       FROM aedt_profiles cur
       JOIN aedt_profiles ap ON ap.project_id = cur.project_id
                            AND ap.framework_id = cur.framework_id
                            AND ap.organization_id = :organization_id
       JOIN bias_audit_stances s ON s.profile_id = ap.id
                                AND s.organization_id = :organization_id
      WHERE cur.id = :profile_id AND cur.organization_id = :organization_id`,
    {
      replacements: { profile_id: profileId, organization_id: organizationId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as Array<{ max: number | null }>;
  return (rows[0]?.max ?? 0) + 1;
}

/** A scope determination as the profile view lists it: plain columns, no model. */
export interface ProfileStanceRow {
  id: number;
  project_id: number;
  profile_id: number;
  version: number;
  pdf_sha256: string | null;
  pdf_file_id: number | null;
  score_at_generation: number | null;
  scope_at_generation: string;
  profile_version: number;
  question_set_version: number;
  generated_by: number | null;
  generated_at: Date;
}

/**
 * Scope determinations of a project for one framework, newest first. These
 * stances have no run, so they never appear in a run's stance list; the
 * profile view lists them instead.
 */
export async function listProfileStancesQuery(
  projectId: number,
  frameworkId: number,
  organizationId: number,
): Promise<ProfileStanceRow[]> {
  return (await sequelize.query(
    `SELECT s.id, s.project_id, s.profile_id, s.version, s.pdf_sha256,
            s.pdf_file_id, s.score_at_generation, s.scope_at_generation,
            s.profile_version, s.question_set_version, s.generated_by,
            s.generated_at
       FROM bias_audit_stances s
       JOIN aedt_profiles ap ON ap.id = s.profile_id
                            AND ap.organization_id = :organization_id
      WHERE s.project_id = :project_id AND ap.framework_id = :framework_id
        AND s.organization_id = :organization_id
      ORDER BY s.generated_at DESC, s.id DESC`,
    {
      replacements: {
        project_id: projectId,
        framework_id: frameworkId,
        organization_id: organizationId,
      },
      type: QueryTypes.SELECT,
    },
  )) as ProfileStanceRow[];
}

/** The project a run belongs to, within the organization. Refuses a run outside it. */
export async function getRunProjectIdQuery(runId: number, organizationId: number): Promise<number> {
  const rows = (await sequelize.query(
    `SELECT project_id FROM bias_audit_runs
      WHERE id = :run_id AND organization_id = :organization_id`,
    {
      replacements: { run_id: runId, organization_id: organizationId },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ project_id: number }>;
  if (rows.length === 0) refuseCrossOrg("Run", runId);
  return rows[0].project_id;
}

/**
 * Next stance version for a run. A regenerate always gets a new version and
 * never overwrites. Not a uniqueness guarantee once a run is deleted
 * (run_id is SET NULL), so callers must not rely on it for versioning
 * across deleted runs.
 */
export async function getNextStanceVersionQuery(
  runId: number,
  organizationId: number,
): Promise<number> {
  const rows = (await sequelize.query(
    `SELECT MAX(version) AS max FROM bias_audit_stances
      WHERE run_id = :run_id AND organization_id = :organization_id`,
    {
      replacements: { run_id: runId, organization_id: organizationId },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ max: number | null }>;
  return (rows[0]?.max ?? 0) + 1;
}

// ------------------------------------------------------------ route reads

/** A project in this organization, or null. */
export async function getProjectQuery(
  projectId: number,
  organizationId: number,
): Promise<{ id: number; project_title: string } | null> {
  const rows = (await sequelize.query(
    `SELECT id, project_title FROM projects
      WHERE id = :project_id AND organization_id = :organization_id`,
    {
      replacements: { project_id: projectId, organization_id: organizationId },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ id: number; project_title: string }>;
  return rows[0] ?? null;
}

/** A profile version by id, in this organization, or null. */
export async function getProfileByIdQuery(
  profileId: number,
  organizationId: number,
): Promise<AedtProfile | null> {
  const rows = (await sequelize.query(
    `SELECT * FROM aedt_profiles
      WHERE id = :profile_id AND organization_id = :organization_id`,
    {
      replacements: { profile_id: profileId, organization_id: organizationId },
      type: QueryTypes.SELECT,
    },
  )) as AedtProfile[];
  return rows[0] ?? null;
}

/** A run by id, in this organization, or null. */
export async function getRunQuery(
  runId: number,
  organizationId: number,
): Promise<BiasAuditRun | null> {
  const rows = (await sequelize.query(
    `SELECT * FROM bias_audit_runs
      WHERE id = :run_id AND organization_id = :organization_id`,
    {
      replacements: { run_id: runId, organization_id: organizationId },
      type: QueryTypes.SELECT,
    },
  )) as BiasAuditRun[];
  return rows[0] ?? null;
}

/** Summary of a run for a list: no result or findings payloads. */
export interface RunSummaryRow {
  id: number;
  profile_id: number;
  profile_version: number;
  question_set_version: number;
  job_description_key: string | null;
  metric: string;
  readiness_score: number | null;
  readiness_blocked_reason: string | null;
  expiry_date: string | null;
  row_count: number | null;
  dataset_sha256: string | null;
  has_result: boolean;
  created_by: number | null;
  created_at: Date;
}

/** Runs of a project for one framework, newest first. */
export async function listRunsQuery(
  projectId: number,
  frameworkId: number,
  organizationId: number,
): Promise<RunSummaryRow[]> {
  return (await sequelize.query(
    `SELECT r.id, r.profile_id, r.profile_version, r.question_set_version,
            r.job_description_key, r.metric, r.readiness_score,
            r.readiness_blocked_reason, r.expiry_date, r.row_count,
            r.dataset_sha256, (r.result_json IS NOT NULL) AS has_result,
            r.created_by, r.created_at
       FROM bias_audit_runs r
       JOIN aedt_profiles ap ON ap.id = r.profile_id
                            AND ap.organization_id = :organization_id
      WHERE r.project_id = :project_id AND ap.framework_id = :framework_id
        AND r.organization_id = :organization_id
      ORDER BY r.created_at DESC, r.id DESC`,
    {
      replacements: {
        project_id: projectId,
        framework_id: frameworkId,
        organization_id: organizationId,
      },
      type: QueryTypes.SELECT,
    },
  )) as RunSummaryRow[];
}

/**
 * The fields a trend series reads from a run: of the stored result, only its
 * tables and metric; of the gate findings, the whole list (export is decided
 * on it). Nothing else of the result is read.
 */
export interface TrendRunRow {
  id: number;
  created_at: Date | string;
  profile_version: number;
  question_set_version: number;
  job_description_key: string | null;
  metric: string;
  /** `result_json->'tables'`; null when no result was stored. */
  tables: unknown;
  /** `result_json->>'metric'`; null when no result was stored. */
  result_metric: string | null;
  gate_findings_json: unknown;
}

/**
 * Runs of a project for one framework, oldest first, for the trend view.
 * buildTrendSeries relies on this order (created_at, then id).
 */
export async function listTrendRunsQuery(
  projectId: number,
  frameworkId: number,
  organizationId: number,
): Promise<TrendRunRow[]> {
  return (await sequelize.query(
    `SELECT r.id, r.created_at, r.profile_version, r.question_set_version,
            r.job_description_key, r.metric,
            r.result_json->'tables' AS tables,
            r.result_json->>'metric' AS result_metric,
            r.gate_findings_json
       FROM bias_audit_runs r
       JOIN aedt_profiles ap ON ap.id = r.profile_id
                            AND ap.organization_id = :organization_id
      WHERE r.project_id = :project_id AND ap.framework_id = :framework_id
        AND r.organization_id = :organization_id
      ORDER BY r.created_at ASC, r.id ASC`,
    {
      replacements: {
        project_id: projectId,
        framework_id: frameworkId,
        organization_id: organizationId,
      },
      type: QueryTypes.SELECT,
    },
  )) as TrendRunRow[];
}

/** Stance versions generated from a run, newest first. */
export async function listStancesForRunQuery(
  runId: number,
  organizationId: number,
): Promise<BiasAuditStance[]> {
  return (await sequelize.query(
    `SELECT id, project_id, run_id, version, pdf_sha256, pdf_file_id,
            score_at_generation, scope_at_generation, profile_version,
            question_set_version, generated_by, generated_at
       FROM bias_audit_stances
      WHERE run_id = :run_id AND organization_id = :organization_id
      ORDER BY version DESC`,
    {
      replacements: { run_id: runId, organization_id: organizationId },
      type: QueryTypes.SELECT,
    },
  )) as BiasAuditStance[];
}

export interface StanceDownloadRow {
  id: number;
  run_id: number | null;
  version: number;
  pdf_sha256: string | null;
  pdf_file_id: number | null;
  /** Null when the files row the stance points at no longer exists. */
  file_id: number | null;
  filename: string | null;
  content: Buffer | null;
  /**
   * Whether the viewer owns or is a member of the stance's project, or
   * generated the stance. The same rule canUserAccessFile applies to project
   * files; the Admin bypass is applied by the caller from the role.
   */
  viewer_has_project_access: boolean;
}

/**
 * A stance and its PDF. pdf_file_id has no foreign key, so the file is
 * joined rather than assumed: a missing files row comes back as nulls.
 */
export async function getStanceDownloadQuery(
  stanceId: number,
  organizationId: number,
  viewerUserId: number,
): Promise<StanceDownloadRow | null> {
  const rows = (await sequelize.query(
    `SELECT s.id, s.run_id, s.version, s.pdf_sha256, s.pdf_file_id,
            f.id AS file_id, f.filename, f.content,
            (s.generated_by = :viewer_user_id OR ${PROJECT_MEMBER_SQL("s.project_id")}) AS viewer_has_project_access
       FROM bias_audit_stances s
       LEFT JOIN files f ON f.id = s.pdf_file_id
                        AND f.organization_id = :organization_id
      WHERE s.id = :stance_id AND s.organization_id = :organization_id`,
    {
      replacements: {
        stance_id: stanceId,
        organization_id: organizationId,
        viewer_user_id: viewerUserId,
      },
      type: QueryTypes.SELECT,
    },
  )) as StanceDownloadRow[];
  return rows[0] ?? null;
}

/** Names of users in this organization, for attributing answers in a stance. */
export async function getUserNamesQuery(
  userIds: number[],
  organizationId: number,
): Promise<Array<{ id: number; name: string; surname: string }>> {
  if (userIds.length === 0) return [];
  return (await sequelize.query(
    `SELECT id, name, surname FROM users
      WHERE id IN (:user_ids) AND organization_id = :organization_id`,
    {
      replacements: { user_ids: userIds, organization_id: organizationId },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ id: number; name: string; surname: string }>;
}

/**
 * Record that the customer confirmed the derived per-category basis. The
 * derived split is VerifyWise's reading of the answers; confirming it makes
 * it the customer's statement, so who confirmed and when are kept beside it.
 * Stances already generated are untouched; the next one reads the
 * confirmation. Returns null for a run with no derived basis, or outside the
 * organization.
 */
export async function confirmRunDerivedBasisQuery(
  runId: number,
  userId: number,
  organizationId: number,
): Promise<BiasAuditRun | null> {
  const result = await sequelize.query(
    `UPDATE bias_audit_runs
        SET data_basis_json = CASE
              -- A second confirmation keeps the first confirmer and date.
              WHEN data_basis_json->>'confirmed' = 'true' THEN data_basis_json
              ELSE data_basis_json
                || jsonb_build_object('confirmed', true,
                                      'confirmedBy', CAST(:user_id AS INTEGER),
                                      'confirmedAt', NOW())
            END
      WHERE id = :run_id AND organization_id = :organization_id
        AND data_basis_json IS NOT NULL
        AND jsonb_typeof(data_basis_json) = 'object'
      RETURNING *`,
    {
      replacements: { run_id: runId, user_id: userId, organization_id: organizationId },
    },
  );
  return firstRow<BiasAuditRun>(result) ?? null;
}
