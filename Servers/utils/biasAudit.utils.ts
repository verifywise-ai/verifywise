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

/** Latest draft-or-attested profile: the one a user is editing. */
export async function getCurrentProfileQuery(
  projectId: number,
  frameworkId: number,
  organizationId: number,
): Promise<AedtProfile | null> {
  const rows = (await sequelize.query(
    `SELECT * FROM aedt_profiles
      WHERE project_id = :project_id AND framework_id = :framework_id
        AND status <> 'superseded' AND organization_id = :organization_id
      ORDER BY version DESC
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

export async function getProfileAnswersQuery(
  profileId: number,
  organizationId: number,
): Promise<AedtProfileAnswer[]> {
  return (await sequelize.query(
    `SELECT * FROM aedt_profile_answers
      WHERE profile_id = :profile_id AND organization_id = :organization_id
      ORDER BY question_key`,
    {
      replacements: { profile_id: profileId, organization_id: organizationId },
      type: QueryTypes.SELECT,
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
}

export async function upsertAnswerQuery(
  args: UpsertAnswerArgs,
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  // Selecting from the profile row keeps the answer in the profile's org.
  const result = await sequelize.query(
    `INSERT INTO aedt_profile_answers
       (organization_id, profile_id, question_key, question_set_version,
        answer_value, answer_notes, is_dont_know, is_not_applicable,
        answered_by_user_id, answered_at)
     SELECT p.organization_id, p.id, :question_key, :question_set_version,
            :answer_value, :answer_notes, :is_dont_know, :is_not_applicable,
            :answered_by_user_id, NOW()
       FROM aedt_profiles p
      WHERE p.id = :profile_id AND p.organization_id = :organization_id
     ON CONFLICT (profile_id, question_key) DO UPDATE SET
       question_set_version = EXCLUDED.question_set_version,
       answer_value = EXCLUDED.answer_value,
       answer_notes = EXCLUDED.answer_notes,
       is_dont_know = EXCLUDED.is_dont_know,
       is_not_applicable = EXCLUDED.is_not_applicable,
       answered_by_user_id = EXCLUDED.answered_by_user_id,
       answered_at = NOW()
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
        organization_id: organizationId,
      },
      transaction,
    },
  );
  if (!firstRow(result)) refuseCrossOrg("Profile", args.profileId);
}

export async function attestProfileQuery(
  profileId: number,
  userId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<AedtProfile> {
  try {
    await sequelize.query(
      `UPDATE aedt_profiles SET status = 'superseded', superseded_at = NOW()
         WHERE project_id = (SELECT project_id FROM aedt_profiles
                              WHERE id = :id AND organization_id = :organization_id)
           AND framework_id = (SELECT framework_id FROM aedt_profiles
                                WHERE id = :id AND organization_id = :organization_id)
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
    if (!row) {
      throw new NotFoundException(
        `Draft profile ${profileId} was not found in this organization`,
        "AedtProfile",
      );
    }
    return row;
  } catch (error: unknown) {
    // The partial unique index is the real guard; translate it rather than
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
  profileVersion: number;
  presetId: string;
  questionSetVersion: number;
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
     SELECT pr.organization_id, pr.id, ap.id, :profile_version, :preset_id,
            :question_set_version, :job_description_key, :metric, :threshold,
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
     RETURNING *`,
    {
      replacements: {
        project_id: args.projectId,
        profile_id: args.profileId,
        profile_version: args.profileVersion,
        preset_id: args.presetId,
        question_set_version: args.questionSetVersion,
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
  profileVersion: number;
  questionSetVersion: number;
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
            :profile_version, :question_set_version, :generated_by
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
        profile_version: args.profileVersion,
        question_set_version: args.questionSetVersion,
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
