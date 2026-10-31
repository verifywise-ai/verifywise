import crypto from "crypto";
import { sequelize } from "../database/db";
import { Transaction, QueryTypes } from "sequelize";
import {
  IIntakeForm,
  ICreateIntakeFormInput,
  IUpdateIntakeFormInput,
  IPublicIntakeForm,
  IFormRouting,
} from "../domain.layer/interfaces/i.intakeForm";
import {
  IIntakeSubmission,
  ICreateIntakeSubmissionInput,
  IIntakeSubmissionStats,
  IRiskAssessment,
  IRiskAssessmentV2,
  IRiskOverride,
  ISuggestedRisksBlock,
  ISecondReview,
  ISubmissionRouting,
  IDecisionRecord,
} from "../domain.layer/interfaces/i.intakeSubmission";
import type { ILiveChecks } from "../domain.layer/interfaces/i.intakeLiveChecks";
import { getRoleById } from "./roleMap";
import { roleInfoHasPermission } from "./rolePermissions.utils";
import { IntakeFormStatus } from "../domain.layer/enums/intake-form-status.enum";
import { IntakeSubmissionStatus } from "../domain.layer/enums/intake-submission-status.enum";
import type {
  IntakeSuggestedRisk,
  SuggestionState,
} from "../services/intakeScoring/intakeSuggestions";

// ============================================================================
// COLUMN LISTS (DRY)
// ============================================================================

const FORM_SELECT_COLUMNS = `
  id, name, description, slug, entity_type as "entityType",
  schema, submit_button_text as "submitButtonText", status,
  ttl_expires_at as "ttlExpiresAt", public_id as "publicId",
  recipients, risk_tier_system as "riskTierSystem",
  risk_assessment_config as "riskAssessmentConfig",
  llm_key_id as "llmKeyId",
  suggested_questions_enabled as "suggestedQuestionsEnabled",
  eu_ai_act_risk_step_enabled as "euAiActRiskStepEnabled",
  live_checks_enabled as "liveChecksEnabled",
  design_settings as "designSettings",
  routing,
  created_by as "createdBy",
  created_at as "createdAt", updated_at as "updatedAt"
`;

const SUBMISSION_SELECT_COLUMNS = `
  id, form_id as "formId", submitter_email as "submitterEmail",
  submitter_name as "submitterName", data, entity_type as "entityType",
  entity_id as "entityId", status, rejection_reason as "rejectionReason",
  reviewed_by as "reviewedBy", reviewed_at as "reviewedAt",
  original_submission_id as "originalSubmissionId",
  resubmission_count as "resubmissionCount", ip_address as "ipAddress",
  risk_assessment as "riskAssessment", risk_tier as "riskTier",
  risk_override as "riskOverride",
  suggested_risks as "suggestedRisks",
  routing, decision_record as "decisionRecord",
  live_checks AS "liveChecks",
  notification_sent_at as "notificationSentAt",
  created_at as "createdAt", updated_at as "updatedAt"
`;

// ============================================================================
// INTAKE FORM QUERIES
// ============================================================================

/**
 * Get all intake forms for an organization
 */
export const getAllIntakeFormsQuery = async (organizationId: number): Promise<IIntakeForm[]> => {
  const forms = await sequelize.query(
    `SELECT ${FORM_SELECT_COLUMNS}
    FROM intake_forms
    WHERE organization_id = :organizationId
    ORDER BY created_at DESC`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  );
  return forms as IIntakeForm[];
};

/**
 * Get intake form by ID
 */
export const getIntakeFormByIdQuery = async (
  id: number,
  organizationId: number,
): Promise<IIntakeForm | null> => {
  const forms = await sequelize.query(
    `SELECT ${FORM_SELECT_COLUMNS}
    FROM intake_forms
    WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.SELECT,
    },
  );
  return forms.length > 0 ? (forms[0] as IIntakeForm) : null;
};

/**
 * Get intake form by slug (for public access)
 */
export const getIntakeFormBySlugQuery = async (
  slug: string,
  organizationId: number,
): Promise<IIntakeForm | null> => {
  const forms = await sequelize.query(
    `SELECT ${FORM_SELECT_COLUMNS}
    FROM intake_forms
    WHERE organization_id = :organizationId AND slug = :slug`,
    {
      replacements: { organizationId, slug },
      type: QueryTypes.SELECT,
    },
  );
  return forms.length > 0 ? (forms[0] as IIntakeForm) : null;
};

/**
 * Get active public form by slug (for unauthenticated users)
 */
export const getActivePublicFormQuery = async (
  slug: string,
  organizationId: number,
): Promise<IPublicIntakeForm | null> => {
  const forms = await sequelize.query(
    `SELECT
      id, name, description, slug, entity_type as "entityType",
      schema, submit_button_text as "submitButtonText",
      public_id as "publicId",
      eu_ai_act_risk_step_enabled as "euAiActRiskStepEnabled",
      live_checks_enabled AS "liveChecksEnabled",
      design_settings as "designSettings"
    FROM intake_forms
    WHERE organization_id = :organizationId
      AND slug = :slug
      AND status = :status
      AND (ttl_expires_at IS NULL OR ttl_expires_at > NOW())`,
    {
      replacements: { organizationId, slug, status: IntakeFormStatus.ACTIVE },
      type: QueryTypes.SELECT,
    },
  );
  return forms.length > 0 ? (forms[0] as IPublicIntakeForm) : null;
};

/**
 * Get active form by public_id (new URL format)
 */
export const getFormByPublicIdQuery = async (
  publicId: string,
  organizationId: number,
): Promise<IPublicIntakeForm | null> => {
  const forms = await sequelize.query(
    `SELECT
      id, name, description, slug, entity_type as "entityType",
      schema, submit_button_text as "submitButtonText",
      public_id as "publicId",
      eu_ai_act_risk_step_enabled as "euAiActRiskStepEnabled",
      live_checks_enabled AS "liveChecksEnabled",
      design_settings as "designSettings"
    FROM intake_forms
    WHERE organization_id = :organizationId
      AND public_id = :publicId
      AND status = :status
      AND (ttl_expires_at IS NULL OR ttl_expires_at > NOW())`,
    {
      replacements: { organizationId, publicId, status: IntakeFormStatus.ACTIVE },
      type: QueryTypes.SELECT,
    },
  );
  return forms.length > 0 ? (forms[0] as IPublicIntakeForm) : null;
};

/**
 * Create new intake form
 */
export const createIntakeFormQuery = async (
  data: ICreateIntakeFormInput,
  organizationId: number,
  transaction?: Transaction,
): Promise<IIntakeForm> => {
  const slug = data.slug || generateSlug(data.name);
  const uniqueSlug = await ensureUniqueSlug(slug, organizationId, transaction);
  const publicId = crypto.randomBytes(8).toString("hex");

  const result = await sequelize.query(
    `INSERT INTO intake_forms
      (organization_id, name, description, slug, entity_type, schema, submit_button_text, status,
       ttl_expires_at, public_id, recipients, risk_tier_system, risk_assessment_config,
       llm_key_id, suggested_questions_enabled, eu_ai_act_risk_step_enabled, live_checks_enabled, design_settings, routing, created_by, created_at, updated_at)
    VALUES
      (:organizationId, :name, :description, :slug, :entityType, :schema, :submitButtonText, :status,
       :ttlExpiresAt, :publicId, :recipients, :riskTierSystem, :riskAssessmentConfig,
       :llmKeyId, :suggestedQuestionsEnabled, :euAiActRiskStepEnabled, :liveChecksEnabled, :designSettings, :routing, :createdBy, NOW(), NOW())
    RETURNING ${FORM_SELECT_COLUMNS}`,
    {
      replacements: {
        organizationId,
        name: data.name,
        description: data.description,
        slug: uniqueSlug,
        entityType: data.entityType,
        schema: JSON.stringify(data.schema || { version: "1.0", fields: [] }),
        submitButtonText: data.submitButtonText || "Submit",
        status: data.status || IntakeFormStatus.DRAFT,
        ttlExpiresAt: data.ttlExpiresAt || null,
        publicId,
        recipients: JSON.stringify(data.recipients || []),
        riskTierSystem: data.riskTierSystem || "eu_ai_act",
        riskAssessmentConfig: data.riskAssessmentConfig
          ? JSON.stringify(data.riskAssessmentConfig)
          : null,
        llmKeyId: data.llmKeyId || null,
        suggestedQuestionsEnabled: data.suggestedQuestionsEnabled || false,
        euAiActRiskStepEnabled: data.euAiActRiskStepEnabled || false,
        liveChecksEnabled: data.liveChecksEnabled ?? true,
        designSettings: data.designSettings ? JSON.stringify(data.designSettings) : null,
        routing: data.routing ? JSON.stringify(data.routing) : null,
        createdBy: data.createdBy,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  return result[0] as IIntakeForm;
};

/**
 * Update intake form
 */
export const updateIntakeFormQuery = async (
  id: number,
  data: IUpdateIntakeFormInput,
  organizationId: number,
  transaction?: Transaction,
): Promise<IIntakeForm | null> => {
  const updates: string[] = [];
  const replacements: Record<string, unknown> = { organizationId, id };

  if (data.name !== undefined) {
    updates.push("name = :name");
    replacements.name = data.name;
  }
  if (data.description !== undefined) {
    updates.push("description = :description");
    replacements.description = data.description;
  }
  if (data.slug !== undefined) {
    const uniqueSlug = await ensureUniqueSlug(data.slug, organizationId, transaction, id);
    updates.push("slug = :slug");
    replacements.slug = uniqueSlug;
  }
  if (data.entityType !== undefined) {
    updates.push("entity_type = :entityType");
    replacements.entityType = data.entityType;
  }
  if (data.schema !== undefined) {
    updates.push("schema = :schema");
    replacements.schema = JSON.stringify(data.schema);
  }
  if (data.submitButtonText !== undefined) {
    updates.push("submit_button_text = :submitButtonText");
    replacements.submitButtonText = data.submitButtonText;
  }
  if (data.status !== undefined) {
    updates.push("status = :status");
    replacements.status = data.status;
  }
  if (data.ttlExpiresAt !== undefined) {
    updates.push("ttl_expires_at = :ttlExpiresAt");
    replacements.ttlExpiresAt = data.ttlExpiresAt;
  }
  if (data.recipients !== undefined) {
    updates.push("recipients = :recipients");
    replacements.recipients = JSON.stringify(data.recipients);
  }
  if (data.riskTierSystem !== undefined) {
    updates.push("risk_tier_system = :riskTierSystem");
    replacements.riskTierSystem = data.riskTierSystem;
  }
  if (data.riskAssessmentConfig !== undefined) {
    updates.push("risk_assessment_config = :riskAssessmentConfig");
    replacements.riskAssessmentConfig = JSON.stringify(data.riskAssessmentConfig);
  }
  if (data.llmKeyId !== undefined) {
    updates.push("llm_key_id = :llmKeyId");
    replacements.llmKeyId = data.llmKeyId;
  }
  if (data.suggestedQuestionsEnabled !== undefined) {
    updates.push("suggested_questions_enabled = :suggestedQuestionsEnabled");
    replacements.suggestedQuestionsEnabled = data.suggestedQuestionsEnabled;
  }
  if (data.euAiActRiskStepEnabled !== undefined) {
    updates.push("eu_ai_act_risk_step_enabled = :euAiActRiskStepEnabled");
    replacements.euAiActRiskStepEnabled = data.euAiActRiskStepEnabled;
  }
  if (data.liveChecksEnabled !== undefined) {
    updates.push("live_checks_enabled = :liveChecksEnabled");
    replacements.liveChecksEnabled = data.liveChecksEnabled;
  }
  if (data.designSettings !== undefined) {
    updates.push("design_settings = :designSettings");
    replacements.designSettings = data.designSettings ? JSON.stringify(data.designSettings) : null;
  }
  if (data.routing !== undefined) {
    updates.push("routing = :routing");
    replacements.routing = data.routing ? JSON.stringify(data.routing) : null;
  }

  if (updates.length === 0) {
    return getIntakeFormByIdQuery(id, organizationId);
  }

  updates.push("updated_at = NOW()");

  const result = await sequelize.query(
    `UPDATE intake_forms
    SET ${updates.join(", ")}
    WHERE organization_id = :organizationId AND id = :id
    RETURNING ${FORM_SELECT_COLUMNS}`,
    {
      replacements,
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  return result.length > 0 ? (result[0] as IIntakeForm) : null;
};

/**
 * Delete intake form (draft and archived forms can be deleted)
 */
export const deleteIntakeFormQuery = async (
  id: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<boolean> => {
  const result = await sequelize.query(
    `DELETE FROM intake_forms
    WHERE organization_id = :organizationId AND id = :id AND status IN (:draft, :archived)`,
    {
      replacements: {
        organizationId,
        id,
        draft: IntakeFormStatus.DRAFT,
        archived: IntakeFormStatus.ARCHIVED,
      },
      transaction,
    },
  );
  const rowCount = (result as any)[1] ?? 0;
  return rowCount > 0;
};

/**
 * Archive intake form (soft delete for active/archived forms)
 */
export const archiveIntakeFormQuery = async (
  id: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<IIntakeForm | null> => {
  return updateIntakeFormQuery(
    id,
    { status: IntakeFormStatus.ARCHIVED },
    organizationId,
    transaction,
  );
};

/**
 * Archive expired forms (called by cron job)
 */
export const archiveExpiredFormsQuery = async (
  organizationId: number,
  transaction?: Transaction,
): Promise<number> => {
  const result = await sequelize.query(
    `UPDATE intake_forms
    SET status = :archivedStatus, updated_at = NOW()
    WHERE organization_id = :organizationId
      AND status = :activeStatus
      AND ttl_expires_at IS NOT NULL
      AND ttl_expires_at <= NOW()`,
    {
      replacements: {
        organizationId,
        archivedStatus: IntakeFormStatus.ARCHIVED,
        activeStatus: IntakeFormStatus.ACTIVE,
      },
      type: QueryTypes.UPDATE,
      transaction,
    },
  );
  return result[1]; // Number of affected rows
};

// ============================================================================
// INTAKE SUBMISSION QUERIES
// ============================================================================

/**
 * Get submissions for a form (paginated, default limit 200)
 */
export const getSubmissionsByFormIdQuery = async (
  formId: number,
  organizationId: number,
  status?: IntakeSubmissionStatus,
  limit: number = 200,
  offset: number = 0,
): Promise<IIntakeSubmission[]> => {
  let query = `SELECT ${SUBMISSION_SELECT_COLUMNS}
  FROM intake_submissions
  WHERE organization_id = :organizationId AND form_id = :formId`;

  const replacements: Record<string, unknown> = { organizationId, formId, limit, offset };

  if (status) {
    query += " AND status = :status";
    replacements.status = status;
  }

  query += " ORDER BY created_at DESC LIMIT :limit OFFSET :offset";

  const submissions = await sequelize.query(query, {
    replacements,
    type: QueryTypes.SELECT,
  });

  return submissions as IIntakeSubmission[];
};

/**
 * Get pending submissions for an organization (for dashboard, capped at 500)
 */
export const getPendingSubmissionsQuery = async (
  organizationId: number,
  status?: IntakeSubmissionStatus,
): Promise<Array<IIntakeSubmission & { formRouting: IFormRouting | null }>> => {
  const statusFilter = status ? "AND s.status = :status" : "";
  const submissions = await sequelize.query(
    `SELECT
      s.id, s.form_id as "formId", s.submitter_email as "submitterEmail",
      s.submitter_name as "submitterName", s.data, s.entity_type as "entityType",
      s.entity_id as "entityId", s.status, s.rejection_reason as "rejectionReason",
      s.reviewed_by as "reviewedBy", s.reviewed_at as "reviewedAt",
      s.original_submission_id as "originalSubmissionId",
      s.resubmission_count as "resubmissionCount", s.ip_address as "ipAddress",
      s.risk_assessment as "riskAssessment", s.risk_tier as "riskTier",
      s.risk_override as "riskOverride",
      s.suggested_risks as "suggestedRisks",
      s.routing, s.decision_record as "decisionRecord",
      s.live_checks AS "liveChecks",
      s.notification_sent_at as "notificationSentAt",
      s.created_at as "createdAt", s.updated_at as "updatedAt",
      f.name as "formName", f.entity_type as "formEntityType",
      f.routing as "formRouting"
    FROM intake_submissions s
    JOIN intake_forms f ON s.organization_id = f.organization_id AND s.form_id = f.id
    WHERE s.organization_id = :organizationId
    ${statusFilter}
    ORDER BY s.created_at DESC
    LIMIT 500`,
    {
      replacements: status ? { organizationId, status } : { organizationId },
      type: QueryTypes.SELECT,
    },
  );

  return submissions as Array<IIntakeSubmission & { formRouting: IFormRouting | null }>;
};

/**
 * Get submission by ID
 */
export const getSubmissionByIdQuery = async (
  id: number,
  organizationId: number,
  transaction?: Transaction,
  forUpdate?: boolean,
): Promise<IIntakeSubmission | null> => {
  const lock = forUpdate ? " FOR UPDATE" : "";
  const submissions = await sequelize.query(
    `SELECT ${SUBMISSION_SELECT_COLUMNS}
    FROM intake_submissions
    WHERE organization_id = :organizationId AND id = :id${lock}`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  return submissions.length > 0 ? (submissions[0] as IIntakeSubmission) : null;
};

/**
 * Create new submission
 */
export const createSubmissionQuery = async (
  data: ICreateIntakeSubmissionInput,
  organizationId: number,
  transaction?: Transaction,
): Promise<IIntakeSubmission> => {
  // Use atomic subquery for resubmission count to avoid read-then-write race condition
  const resubmissionCountExpr = data.originalSubmissionId
    ? `COALESCE((SELECT resubmission_count + 1 FROM intake_submissions WHERE organization_id = :organizationId AND id = :originalSubmissionId FOR UPDATE), 0)`
    : "0";

  const result = await sequelize.query(
    `INSERT INTO intake_submissions
      (organization_id, form_id, submitter_email, submitter_name, data, entity_type, status,
       original_submission_id, resubmission_count, ip_address, created_at, updated_at)
    VALUES
      (:organizationId, :formId, :submitterEmail, :submitterName, :data, :entityType, :status,
       :originalSubmissionId, ${resubmissionCountExpr}, :ipAddress, NOW(), NOW())
    RETURNING ${SUBMISSION_SELECT_COLUMNS}`,
    {
      replacements: {
        organizationId,
        formId: data.formId,
        submitterEmail: data.submitterEmail,
        submitterName: data.submitterName,
        data: JSON.stringify(data.data),
        entityType: data.entityType,
        status: IntakeSubmissionStatus.PENDING,
        originalSubmissionId: data.originalSubmissionId || null,
        ipAddress: data.ipAddress || null,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  // Supersede the original submission when this is a resubmission
  if (data.originalSubmissionId) {
    await sequelize.query(
      `UPDATE intake_submissions
       SET status = :superseded, updated_at = NOW()
       WHERE organization_id = :organizationId AND id = :originalId
         AND status IN (:pending, :rejected)`,
      {
        replacements: {
          organizationId,
          originalId: data.originalSubmissionId,
          superseded: IntakeSubmissionStatus.SUPERSEDED,
          pending: IntakeSubmissionStatus.PENDING,
          rejected: IntakeSubmissionStatus.REJECTED,
        },
        type: QueryTypes.UPDATE,
        transaction,
      },
    );
  }

  return result[0] as IIntakeSubmission;
};

/**
 * Approve submission and link to entity
 */
export const approveSubmissionQuery = async (
  id: number,
  entityId: number,
  reviewedBy: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<IIntakeSubmission | null> => {
  const result = await sequelize.query(
    `UPDATE intake_submissions
    SET status = :status, entity_id = :entityId, reviewed_by = :reviewedBy,
        reviewed_at = NOW(), updated_at = NOW()
    WHERE organization_id = :organizationId AND id = :id
    RETURNING ${SUBMISSION_SELECT_COLUMNS}`,
    {
      replacements: {
        organizationId,
        id,
        status: IntakeSubmissionStatus.APPROVED,
        entityId,
        reviewedBy,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  return result.length > 0 ? (result[0] as IIntakeSubmission) : null;
};

/**
 * Reject submission with reason
 */
export const rejectSubmissionQuery = async (
  id: number,
  rejectionReason: string,
  reviewedBy: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<IIntakeSubmission | null> => {
  const result = await sequelize.query(
    `UPDATE intake_submissions
    SET status = :status, rejection_reason = :rejectionReason,
        reviewed_by = :reviewedBy, reviewed_at = NOW(), updated_at = NOW()
    WHERE organization_id = :organizationId AND id = :id
    RETURNING ${SUBMISSION_SELECT_COLUMNS}`,
    {
      replacements: {
        organizationId,
        id,
        status: IntakeSubmissionStatus.REJECTED,
        rejectionReason,
        reviewedBy,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  );

  return result.length > 0 ? (result[0] as IIntakeSubmission) : null;
};

/**
 * Update submission risk assessment
 */
export const updateSubmissionRiskQuery = async (
  id: number,
  riskResult: IRiskAssessment,
  organizationId: number,
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(
    `UPDATE intake_submissions
    SET risk_assessment = :riskAssessment, risk_tier = :riskTier, updated_at = NOW()
    WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: {
        organizationId,
        id,
        riskAssessment: JSON.stringify(riskResult),
        riskTier: riskResult.tier,
      },
      type: QueryTypes.UPDATE,
      transaction,
    },
  );
};

/**
 * Store a v2 assessment on a pending submission. risk_tier mirrors the band
 * (assessment.tier) unless a reviewer override set it. A job that finishes
 * after approve or reject changes nothing.
 */
export const updateSubmissionAssessmentV2Query = async (
  id: number,
  assessment: IRiskAssessmentV2,
  organizationId: number,
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(
    `UPDATE intake_submissions
    SET risk_assessment = :riskAssessment,
        risk_tier = COALESCE(risk_override->>'tier', :riskTier),
        updated_at = NOW()
    WHERE organization_id = :organizationId AND id = :id AND status = :pending`,
    {
      replacements: {
        organizationId,
        id,
        riskAssessment: JSON.stringify(assessment),
        riskTier: assessment.tier,
        pending: IntakeSubmissionStatus.PENDING,
      },
      type: QueryTypes.UPDATE,
      transaction,
    },
  );
};

/**
 * Replace the whole suggested-risks block (stage start / completion / failure)
 * on a pending submission; a job that finishes after a decision changes nothing.
 */
export const updateSubmissionSuggestionsQuery = async (
  id: number,
  block: ISuggestedRisksBlock,
  organizationId: number,
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(
    `UPDATE intake_submissions
    SET suggested_risks = :suggestedRisks, updated_at = NOW()
    WHERE organization_id = :organizationId AND id = :id AND status = :pending`,
    {
      replacements: {
        organizationId,
        id,
        suggestedRisks: JSON.stringify(block),
        pending: IntakeSubmissionStatus.PENDING,
      },
      type: QueryTypes.UPDATE,
      transaction,
    },
  );
};

/**
 * Merge a patch into one suggested risk, atomically. A single UPDATE finds the
 * element by id inside the row, so two reviewers acting on different (or the
 * same) suggestions at once cannot overwrite each other's change with a stale
 * copy of the block. Returns the updated item, or null if it was not found.
 */
export const updateSuggestedRiskItemQuery = async (
  id: number,
  suggestionId: string,
  patch: Partial<IntakeSuggestedRisk>,
  organizationId: number,
): Promise<IntakeSuggestedRisk | null> => {
  const rows = (await sequelize.query(
    `UPDATE intake_submissions s
    SET suggested_risks = jsonb_set(
          s.suggested_risks,
          ARRAY['items', (
            SELECT (e.ord - 1)::text
            FROM jsonb_array_elements(s.suggested_risks->'items') WITH ORDINALITY AS e(item, ord)
            WHERE e.item->>'id' = :suggestionId
            LIMIT 1
          )],
          (
            SELECT e.item || :patch::jsonb
            FROM jsonb_array_elements(s.suggested_risks->'items') WITH ORDINALITY AS e(item, ord)
            WHERE e.item->>'id' = :suggestionId
            LIMIT 1
          )
        ),
        updated_at = NOW()
    WHERE s.organization_id = :organizationId AND s.id = :id AND s.status = :pending
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(s.suggested_risks->'items') AS e(item)
        WHERE e.item->>'id' = :suggestionId
          -- an accepted risk always keeps a mitigation plan (the register requires one)
          AND (
            COALESCE((e.item || :patch::jsonb)->>'state', '') <> 'accepted'
            OR btrim(COALESCE((e.item || :patch::jsonb)->>'mitigationPlan', '')) <> ''
          )
      )
    RETURNING (
      SELECT e.item
      FROM jsonb_array_elements(s.suggested_risks->'items') AS e(item)
      WHERE e.item->>'id' = :suggestionId
      LIMIT 1
    ) AS item`,
    {
      replacements: {
        organizationId,
        id,
        suggestionId,
        patch: JSON.stringify(patch),
        pending: IntakeSubmissionStatus.PENDING,
      },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ item: IntakeSuggestedRisk }>;

  return rows.length > 0 ? rows[0].item : null;
};

/**
 * Move every suggestion in state `from` to state `to` (bulk accept / dismiss),
 * in one statement, on a pending submission only. With
 * `requireMitigationPlan`, items whose mitigation plan is blank are left as
 * they are (the risk register requires one). Returns how many items changed.
 */
export const setAllSuggestionStatesQuery = async (
  id: number,
  from: SuggestionState,
  to: SuggestionState,
  userId: number,
  organizationId: number,
  opts: { requireMitigationPlan?: boolean } = {},
): Promise<number> => {
  const matches = opts.requireMitigationPlan
    ? `e.item->>'state' = :from AND btrim(COALESCE(e.item->>'mitigationPlan', '')) <> ''`
    : `e.item->>'state' = :from`;
  const rows = (await sequelize.query(
    `WITH target AS (
      SELECT id,
        (SELECT COUNT(*) FROM jsonb_array_elements(suggested_risks->'items') AS e(item)
          WHERE ${matches}) AS n
      FROM intake_submissions
      WHERE organization_id = :organizationId AND id = :id AND suggested_risks IS NOT NULL
        AND status = :pending
      FOR UPDATE
    )
    UPDATE intake_submissions s
    SET suggested_risks = jsonb_set(
          s.suggested_risks,
          '{items}',
          (
            SELECT COALESCE(jsonb_agg(
              CASE WHEN ${matches}
                THEN e.item || jsonb_build_object(
                  'state', CAST(:to AS text),
                  'decidedBy', CAST(:userId AS integer),
                  'decidedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                )
                ELSE e.item
              END
              ORDER BY e.ord
            ), '[]'::jsonb)
            FROM jsonb_array_elements(s.suggested_risks->'items') WITH ORDINALITY AS e(item, ord)
          )
        ),
        updated_at = NOW()
    FROM target t
    WHERE s.organization_id = :organizationId AND s.id = t.id
    RETURNING t.n AS count`,
    {
      replacements: {
        organizationId,
        id,
        from,
        to,
        userId,
        pending: IntakeSubmissionStatus.PENDING,
      },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ count: string | number }>;

  return rows.length > 0 ? Number(rows[0].count) : 0;
};

/**
 * Claim the one-time "needs review" notification for a submission. True only
 * for the caller that actually flipped notification_sent_at from NULL.
 */
export const claimSubmissionNotificationQuery = async (
  id: number,
  organizationId: number,
): Promise<boolean> => {
  const rows = await sequelize.query(
    `UPDATE intake_submissions
    SET notification_sent_at = NOW()
    WHERE organization_id = :organizationId AND id = :id AND notification_sent_at IS NULL
    RETURNING id`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.SELECT,
    },
  );

  return rows.length > 0;
};

/**
 * Pending submissions with a stage to (re)run or an email still to send,
 * across organizations, for the worker-start backfill. Scoring is needed when
 * the assessment is missing or
 * pre-v2 (legacy / never queued); suggestions when the block is missing. Either
 * is also needed when it has been "pending" for over 10 minutes (the job was
 * lost). A completed or failed stage is never listed, so a backfill cannot
 * regenerate it or wipe reviewer decisions on suggestions. emailUnclaimed:
 * the new-submission email has not been claimed and the form has recipients,
 * so a re-run sends it (the cap job's id keeps it to one). needsNotification:
 * also over 10 minutes old (past the 2-minute cap, so the job or cap was
 * lost), for a direct send when no stage needs re-running; a live job keeps
 * its own email and language. A form without recipients, which never claims,
 * is not listed again and again. needsLiveChecks: the AI live checks are
 * still "pending" 10 minutes after the stage started (or after submit, when
 * the stage never started). Listed whatever the submission's status,
 * since that stage writes for decided submissions too; the other flags are
 * for pending submissions only. A null live_checks (made before the feature,
 * or checks off) is never listed.
 */
export const getSubmissionsNeedingAssessmentQuery = async (): Promise<
  Array<{
    id: number;
    organizationId: number;
    needsScoring: boolean;
    needsSuggestions: boolean;
    needsLiveChecks: boolean;
    emailUnclaimed: boolean;
    needsNotification: boolean;
  }>
> => {
  const rows = await sequelize.query(
    `SELECT id, "organizationId", "needsScoring", "needsSuggestions", "needsLiveChecks",
      "emailUnclaimed",
      ("emailUnclaimed" AND created_at < NOW() - interval '10 minutes') AS "needsNotification"
    FROM (
      SELECT id, organization_id AS "organizationId", created_at,
        (
          status = :status
          AND notification_sent_at IS NULL
          AND EXISTS (
            SELECT 1 FROM intake_forms f
            WHERE f.id = intake_submissions.form_id
              AND f.organization_id = intake_submissions.organization_id
              AND jsonb_typeof(f.recipients) = 'array'
              AND f.recipients <> '[]'::jsonb
          )
        ) AS "emailUnclaimed",
        status = :status AND COALESCE(
          risk_assessment IS NULL
          OR risk_assessment->>'version' IS NULL
          OR (
            risk_assessment->>'status' = 'pending'
            AND (risk_assessment->>'stageStartedAt')::timestamptz < NOW() - interval '10 minutes'
          ),
          false
        ) AS "needsScoring",
        status = :status AND COALESCE(
          suggested_risks IS NULL
          OR (
            suggested_risks->>'status' = 'pending'
            AND (suggested_risks->>'stageStartedAt')::timestamptz < NOW() - interval '10 minutes'
          ),
          false
        ) AS "needsSuggestions",
        COALESCE(
          live_checks->'ai'->>'status' = 'pending'
          AND COALESCE((live_checks->'ai'->>'stageStartedAt')::timestamptz, created_at)
            < NOW() - interval '10 minutes',
          false
        ) AS "needsLiveChecks"
      FROM intake_submissions
      WHERE status = :status OR live_checks->'ai'->>'status' = 'pending'
    ) s
    WHERE "needsScoring" OR "needsSuggestions"
      OR ("emailUnclaimed" AND created_at < NOW() - interval '10 minutes')
      OR "needsLiveChecks"
    ORDER BY id`,
    {
      replacements: { status: IntakeSubmissionStatus.PENDING },
      type: QueryTypes.SELECT,
    },
  );

  return rows as Array<{
    id: number;
    organizationId: number;
    needsScoring: boolean;
    needsSuggestions: boolean;
    needsLiveChecks: boolean;
    emailUnclaimed: boolean;
    needsNotification: boolean;
  }>;
};

/**
 * Update submission risk override
 */
export const updateSubmissionRiskOverrideQuery = async (
  id: number,
  override: IRiskOverride,
  organizationId: number,
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(
    `UPDATE intake_submissions
    SET risk_override = :riskOverride, risk_tier = :riskTier, updated_at = NOW()
    WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: {
        organizationId,
        id,
        riskOverride: JSON.stringify(override),
        riskTier: override.tier,
      },
      type: QueryTypes.UPDATE,
      transaction,
    },
  );
};

/**
 * Get submission stats for dashboard
 */
export const getSubmissionStatsQuery = async (
  organizationId: number,
): Promise<IIntakeSubmissionStats> => {
  const result = await sequelize.query(
    `SELECT
      COUNT(*) FILTER (WHERE status = :pending) as pending,
      COUNT(*) FILTER (WHERE status = :approved) as approved,
      COUNT(*) FILTER (WHERE status = :rejected) as rejected,
      COUNT(*) FILTER (WHERE status = :superseded) as superseded,
      COUNT(*) as total
    FROM intake_submissions
    WHERE organization_id = :organizationId`,
    {
      replacements: {
        organizationId,
        pending: IntakeSubmissionStatus.PENDING,
        approved: IntakeSubmissionStatus.APPROVED,
        rejected: IntakeSubmissionStatus.REJECTED,
        superseded: IntakeSubmissionStatus.SUPERSEDED,
      },
      type: QueryTypes.SELECT,
    },
  );

  const stats = result[0] as any;
  return {
    pending: parseInt(stats.pending, 10) || 0,
    approved: parseInt(stats.approved, 10) || 0,
    rejected: parseInt(stats.rejected, 10) || 0,
    superseded: parseInt(stats.superseded, 10) || 0,
    total: parseInt(stats.total, 10) || 0,
  };
};

/**
 * Get the approved submission + form schema for a given entity.
 * Used for surfacing original intake data on entity detail pages.
 */
export const getSubmissionByEntityQuery = async (
  entityType: string,
  entityId: number,
  organizationId: number,
): Promise<{
  submission: IIntakeSubmission;
  formName: string;
  formSchema: Record<string, unknown> | null;
} | null> => {
  const results = await sequelize.query(
    `SELECT
      s.id, s.form_id as "formId", s.submitter_email as "submitterEmail",
      s.submitter_name as "submitterName", s.data, s.entity_type as "entityType",
      s.entity_id as "entityId", s.status, s.rejection_reason as "rejectionReason",
      s.reviewed_by as "reviewedBy", s.reviewed_at as "reviewedAt",
      s.original_submission_id as "originalSubmissionId",
      s.resubmission_count as "resubmissionCount", s.ip_address as "ipAddress",
      s.risk_assessment as "riskAssessment", s.risk_tier as "riskTier",
      s.risk_override as "riskOverride",
      s.suggested_risks as "suggestedRisks",
      s.routing, s.decision_record as "decisionRecord",
      s.notification_sent_at as "notificationSentAt",
      s.created_at as "createdAt", s.updated_at as "updatedAt",
      f.name as "formName",
      f.schema as "formSchema"
    FROM intake_submissions s
    LEFT JOIN intake_forms f ON s.organization_id = f.organization_id AND s.form_id = f.id
    WHERE s.organization_id = :organizationId
      AND s.entity_type = :entityType
      AND s.entity_id = :entityId
      AND s.status = :status
    ORDER BY s.created_at DESC
    LIMIT 1`,
    {
      replacements: {
        organizationId,
        entityType,
        entityId,
        status: IntakeSubmissionStatus.APPROVED,
      },
      type: QueryTypes.SELECT,
    },
  );

  if (results.length === 0) return null;

  const row = results[0] as any;
  const formSchema = row.formSchema
    ? typeof row.formSchema === "string"
      ? JSON.parse(row.formSchema)
      : row.formSchema
    : null;

  return {
    submission: {
      id: row.id,
      formId: row.formId,
      submitterEmail: row.submitterEmail,
      submitterName: row.submitterName,
      data: row.data,
      entityType: row.entityType,
      entityId: row.entityId,
      status: row.status,
      rejectionReason: row.rejectionReason,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      originalSubmissionId: row.originalSubmissionId,
      resubmissionCount: row.resubmissionCount,
      ipAddress: row.ipAddress,
      riskAssessment: row.riskAssessment,
      riskTier: row.riskTier,
      riskOverride: row.riskOverride,
      suggestedRisks: row.suggestedRisks,
      routing: row.routing,
      decisionRecord: row.decisionRecord,
      notificationSentAt: row.notificationSentAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as IIntakeSubmission,
    formName: row.formName || "Deleted form",
    formSchema,
  };
};

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check rate limit for IP address (10 submissions per hour per organization)
 */
export const checkRateLimitQuery = async (
  ipAddress: string,
  organizationId: number,
): Promise<boolean> => {
  const result = await sequelize.query(
    `SELECT COUNT(*) as count
    FROM intake_submissions
    WHERE organization_id = :organizationId
      AND ip_address = :ipAddress
      AND created_at > NOW() - INTERVAL '1 hour'`,
    {
      replacements: { organizationId, ipAddress },
      type: QueryTypes.SELECT,
    },
  );

  const count = parseInt((result[0] as any).count, 10) || 0;
  return count < 10;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate slug from name
 */
export function generateSlug(name: string): string {
  let slug = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-");

  // Trim leading/trailing hyphens without using the ambiguous /-+$/ regex.
  let start = 0;
  let end = slug.length;
  while (start < end && slug[start] === "-") start++;
  while (end > start && slug[end - 1] === "-") end--;
  return slug.slice(start, end);
}

/**
 * Ensure slug is unique by appending number if necessary
 */
export async function ensureUniqueSlug(
  slug: string,
  organizationId: number,
  transaction?: Transaction,
  excludeId?: number,
): Promise<string> {
  let uniqueSlug = slug;
  let counter = 1;

  while (true) {
    let query = `SELECT COUNT(*) as count FROM intake_forms WHERE organization_id = :organizationId AND slug = :slug`;
    const replacements: Record<string, unknown> = { organizationId, slug: uniqueSlug };

    if (excludeId) {
      query += " AND id != :excludeId";
      replacements.excludeId = excludeId;
    }

    const result = await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT,
      transaction,
    });

    const count = parseInt((result[0] as any).count, 10) || 0;

    if (count === 0) {
      return uniqueSlug;
    }

    uniqueSlug = `${slug}-${counter}`;
    counter++;

    // Safety limit
    if (counter > 100) {
      throw new Error("Unable to generate unique slug");
    }
  }
}

/**
 * Get tenant slug from organization ID
 */
export async function getTenantSlugById(organizationId: number): Promise<string | null> {
  const result = await sequelize.query(`SELECT slug FROM organizations WHERE id = :id`, {
    replacements: { id: organizationId },
    type: QueryTypes.SELECT,
  });

  return result.length > 0 ? (result[0] as any).slug : null;
}

/**
 * Get organization ID from organization slug
 */
export async function getTenantHashBySlug(
  slug: string,
): Promise<{ id: number; hash: string } | null> {
  const result = await sequelize.query(`SELECT id FROM organizations WHERE slug = :slug`, {
    replacements: { slug },
    type: QueryTypes.SELECT,
  });

  if (result.length === 0) {
    return null;
  }

  const orgId = (result[0] as any).id;
  return { id: orgId, hash: "" };
}

/**
 * Users of the organisation whose role holds intakeForm.edit (built-in or
 * custom role). Pass `ids` to narrow to those users.
 */
export async function getEligibleReviewersQuery(
  organizationId: number,
  ids?: number[],
): Promise<Array<{ id: number; name: string; surname: string; email: string }>> {
  if (ids && ids.length === 0) return [];

  const users = (await sequelize.query(
    `SELECT u.id, u.name, u.surname, u.email, om.role_id
    FROM users u
    JOIN organization_members om ON om.user_id = u.id AND om.organization_id = :organizationId
    ${ids ? "WHERE u.id = ANY(ARRAY[:ids]::INTEGER[])" : ""}
    ORDER BY u.name, u.surname, u.id`,
    {
      replacements: { organizationId, ids: ids ?? [] },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ id: number; name: string; surname: string; email: string; role_id: number }>;

  const allowedByRole = new Map<number, boolean>();
  for (const roleId of new Set(users.map((u) => u.role_id))) {
    const role = await getRoleById(roleId);
    allowedByRole.set(
      roleId,
      role ? await roleInfoHasPermission(organizationId, role, "intakeForm.edit") : false,
    );
  }

  return users
    .filter((u) => allowedByRole.get(u.role_id))
    .map(({ id, name, surname, email }) => ({ id, name, surname, email }));
}

export async function getEligibleReviewerIdsQuery(
  organizationId: number,
  ids?: number[],
): Promise<number[]> {
  return (await getEligibleReviewersQuery(organizationId, ids)).map((u) => u.id);
}

/**
 * Store the lane decision on a pending submission; a decided one is left alone.
 * With `expected` (null meaning "no routing yet") the write only lands while the
 * stored routing is still that value, so a concurrent escalation is not
 * overwritten. Returns whether a row was updated.
 */
export const updateSubmissionRoutingQuery = async (
  id: number,
  routing: ISubmissionRouting | null,
  organizationId: number,
  transaction?: Transaction,
  expected?: ISubmissionRouting | null,
): Promise<boolean> => {
  const guarded = expected !== undefined;
  const result = await sequelize.query(
    `UPDATE intake_submissions
    SET routing = :routing, updated_at = NOW()
    WHERE organization_id = :organizationId AND id = :id AND status = :pending
      ${guarded ? "AND routing IS NOT DISTINCT FROM CAST(:expected AS jsonb)" : ""}`,
    {
      replacements: {
        organizationId,
        id,
        routing: routing ? JSON.stringify(routing) : null,
        pending: IntakeSubmissionStatus.PENDING,
        ...(guarded ? { expected: expected ? JSON.stringify(expected) : null } : {}),
      },
      type: QueryTypes.UPDATE,
      transaction,
    },
  );
  return result[1] > 0;
};

/**
 * Merge `patch` into an approved submission's second review, only while the
 * review is still in the expected state (`unresolved`: no resolution stored
 * yet). One statement, so two reviewers can't both win. Returns the new
 * routing, or null when the state had moved on.
 */
export const updateSecondReviewQuery = async (
  id: number,
  organizationId: number,
  expected: { status: "open" | "missed"; unresolved?: boolean },
  patch: Partial<ISecondReview>,
): Promise<ISubmissionRouting | null> => {
  const rows = (await sequelize.query(
    `UPDATE intake_submissions
    SET routing = jsonb_set(routing, '{secondReview}', (routing->'secondReview') || CAST(:patch AS jsonb)),
        updated_at = NOW()
    WHERE organization_id = :organizationId AND id = :id AND status = :approved
      AND routing->'secondReview'->>'status' = :expectedStatus
      ${expected.unresolved ? "AND routing->'secondReview'->>'resolvedAt' IS NULL" : ""}
    RETURNING routing`,
    {
      replacements: {
        organizationId,
        id,
        approved: IntakeSubmissionStatus.APPROVED,
        expectedStatus: expected.status,
        patch: JSON.stringify(patch),
      },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ routing: ISubmissionRouting }>;
  return rows[0]?.routing ?? null;
};

/** Store what was in force when the submission was approved or rejected. */
export const setDecisionRecordQuery = async (
  id: number,
  record: IDecisionRecord,
  organizationId: number,
  transaction: Transaction,
): Promise<void> => {
  await sequelize.query(
    `UPDATE intake_submissions
    SET decision_record = :record, updated_at = NOW()
    WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id, record: JSON.stringify(record) },
      type: QueryTypes.UPDATE,
      transaction,
    },
  );
};

/**
 * Store the live checks a submitter saw on a submission.
 */
export const updateLiveChecksQuery = async (
  submissionId: number,
  organizationId: number,
  liveChecks: ILiveChecks,
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(
    `UPDATE intake_submissions
    SET live_checks = :liveChecks, updated_at = NOW()
    WHERE organization_id = :organizationId AND id = :submissionId`,
    {
      replacements: { organizationId, submissionId, liveChecks: JSON.stringify(liveChecks) },
      type: QueryTypes.UPDATE,
      transaction,
    },
  );
};

/**
 * Replace only the `ai` block of a submission's live checks. A no-op when the
 * submission has no live checks stored.
 */
export const setLiveChecksAiQuery = async (
  submissionId: number,
  organizationId: number,
  ai: ILiveChecks["ai"],
): Promise<void> => {
  await sequelize.query(
    `UPDATE intake_submissions
    SET live_checks = jsonb_set(live_checks, '{ai}', :ai::jsonb), updated_at = NOW()
    WHERE organization_id = :organizationId AND id = :submissionId
      AND live_checks IS NOT NULL`,
    {
      replacements: { organizationId, submissionId, ai: JSON.stringify(ai) },
      type: QueryTypes.UPDATE,
    },
  );
};

/**
 * Get users by IDs (for per-form recipients)
 */
export async function getUsersByIds(
  userIds: number[],
): Promise<Array<{ id: number; name: string; email: string }>> {
  if (!userIds || userIds.length === 0) return [];

  const result = await sequelize.query(
    `SELECT id, name, email FROM users WHERE id = ANY(ARRAY[:ids]::INTEGER[])`,
    {
      replacements: { ids: userIds },
      type: QueryTypes.SELECT,
    },
  );

  return result as Array<{ id: number; name: string; email: string }>;
}

/**
 * Resolve organization from publicId — direct lookup in shared intake_forms table.
 */
export async function getOrganizationByPublicId(
  publicId: string,
): Promise<{ orgId: number } | null> {
  // Validate publicId format (8 or 16 char hex string) to prevent injection
  if (!/^[a-f0-9]{8,16}$/i.test(publicId)) {
    return null;
  }

  const result = (await sequelize.query(
    `SELECT organization_id as org_id FROM intake_forms WHERE public_id = :publicId LIMIT 1`,
    { replacements: { publicId }, type: QueryTypes.SELECT },
  )) as Array<{ org_id: number }>;

  if (result.length > 0) {
    return { orgId: result[0].org_id };
  }

  return null;
}

/**
 * @deprecated Use getOrganizationByPublicId instead. Maintained for backward compatibility.
 */
export async function getTenantByPublicId(
  publicId: string,
): Promise<{ tenantHash: string; orgId: number } | null> {
  const result = await getOrganizationByPublicId(publicId);
  if (!result) return null;
  // Return a placeholder tenantHash for backward compatibility
  return { tenantHash: String(result.orgId), orgId: result.orgId };
}
