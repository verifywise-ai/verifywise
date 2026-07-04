import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { MrmValidationModel } from "../domain.layer/models/mrm/mrmValidation.model";
import { MrmFindingModel } from "../domain.layer/models/mrm/mrmFinding.model";
import { MrmModelRoleModel } from "../domain.layer/models/mrm/mrmModelRole.model";
import {
  MrmFindingSeverity,
  MrmFindingStage,
  MrmModelRole,
  MrmTier,
  MrmValidationOutcome,
  MrmValidationStage,
  MrmValidationTrigger,
} from "../domain.layer/enums/mrm.enum";
import { MrmValidationReport } from "../domain.layer/interfaces/i.mrmValidation";
import { ConflictException, DatabaseException } from "../domain.layer/exceptions/custom.exception";

/**
 * MRM (Model Risk Management) data-access layer.
 *
 * Every query is tenant-isolated: `WHERE organization_id = :organizationId`.
 * Table names are UNQUALIFIED — the `search_path = verifywise` afterConnect hook
 * resolves the schema. Thin controllers call into these functions; all SQL lives
 * here per the backend Layer Flow.
 */

// PostgreSQL SQLSTATE for unique_violation (partial-unique index breach).
const PG_UNIQUE_VIOLATION = "23505";

// ---------------------------------------------------------------------------
// Tiering (operates on model_inventories MRM columns)
// ---------------------------------------------------------------------------

export interface MrmFleetRow {
  id: number;
  provider: string | null;
  model: string | null;
  version: string | null;
  status: string | null;
  external_key: string | null;
  mrm_tier: MrmTier | null;
  mrm_materiality_drivers: string | null;
  mrm_tiered_at: Date | null;
  mrm_tiered_by: number | null;
}

/**
 * Fleet tiering list — every model with its current tier, materiality drivers,
 * who/when it was last tiered, and its inventory status.
 */
export const getFleetTieringQuery = async (organizationId: number): Promise<MrmFleetRow[]> => {
  return (await sequelize.query(
    `SELECT id, provider, model, version, status,
            external_key, mrm_tier, mrm_materiality_drivers, mrm_tiered_at, mrm_tiered_by
       FROM model_inventories
      WHERE organization_id = :organizationId
      ORDER BY mrm_tier ASC NULLS LAST, created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  )) as MrmFleetRow[];
};

/**
 * The model's current tier (before an update), or null when untiered or the
 * model does not exist for this org. Used by the tier-increase revalidation
 * trigger to compare old vs new before writing.
 */
export const getModelTierQuery = async (
  modelId: number,
  organizationId: number,
): Promise<MrmTier | null> => {
  const rows = (await sequelize.query(
    `SELECT mrm_tier FROM model_inventories
      WHERE organization_id = :organizationId AND id = :modelId
      LIMIT 1`,
    {
      replacements: { organizationId, modelId },
      type: QueryTypes.SELECT,
    },
  )) as { mrm_tier: MrmTier | null }[];
  return rows[0]?.mrm_tier ?? null;
};

/**
 * Assign / update a model's tier. Manual only — no formula. Stamps
 * mrm_tiered_at = now() and mrm_tiered_by = the acting user. Returns null when
 * the model does not exist for this org.
 */
export const assignModelTierQuery = async (
  modelId: number,
  organizationId: number,
  tier: MrmTier,
  materialityDrivers: string | null,
  tieredBy: number,
  transaction?: Transaction,
): Promise<MrmFleetRow | null> => {
  const result = (await sequelize.query(
    `UPDATE model_inventories
        SET mrm_tier = :tier,
            mrm_materiality_drivers = :materialityDrivers,
            mrm_tiered_at = :tieredAt,
            mrm_tiered_by = :tieredBy,
            updated_at = :tieredAt
      WHERE organization_id = :organizationId AND id = :modelId
      RETURNING id, provider, model, version, status,
                external_key, mrm_tier, mrm_materiality_drivers, mrm_tiered_at, mrm_tiered_by`,
    {
      replacements: {
        organizationId,
        modelId,
        tier,
        materialityDrivers: materialityDrivers ?? null,
        tieredBy,
        tieredAt: new Date(),
      },
      // SELECT type parses the RETURNING rows as a flat array (an UPDATE ...
      // RETURNING behaves like a SELECT for result mapping); QueryTypes.UPDATE
      // would yield [rows, meta] and break the result[0] access below.
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as MrmFleetRow[];
  return result[0] ?? null;
};

/** Does a model exist for this org? Used to 404 cleanly before writes. */
export const modelExistsForOrgQuery = async (
  modelId: number,
  organizationId: number,
): Promise<boolean> => {
  const rows = (await sequelize.query(
    `SELECT 1 AS ok FROM model_inventories WHERE organization_id = :organizationId AND id = :modelId LIMIT 1`,
    {
      replacements: { organizationId, modelId },
      type: QueryTypes.SELECT,
    },
  )) as { ok: number }[];
  return rows.length > 0;
};

// ---------------------------------------------------------------------------
// Validations
// ---------------------------------------------------------------------------

export const getValidationsQuery = async (
  organizationId: number,
  modelId?: number,
): Promise<MrmValidationModel[]> => {
  const where = modelId
    ? `WHERE organization_id = :organizationId AND model_inventory_id = :modelId`
    : `WHERE organization_id = :organizationId`;
  return (await sequelize.query(
    `SELECT * FROM mrm_validations ${where} ORDER BY created_at DESC, id DESC`,
    {
      replacements: { organizationId, modelId },
      mapToModel: true,
      model: MrmValidationModel,
    },
  )) as MrmValidationModel[];
};

export const getValidationByIdQuery = async (
  id: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<MrmValidationModel | null> => {
  const rows = (await sequelize.query(
    `SELECT * FROM mrm_validations WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: MrmValidationModel,
      transaction,
    },
  )) as MrmValidationModel[];
  return rows[0] ?? null;
};

export interface CreateValidationInput {
  trigger?: MrmValidationTrigger;
  validator_id?: number | null;
  report_version?: string | null;
  report?: MrmValidationReport;
  next_due?: Date | null;
  // Optional opening stage. Defaults to IN_VALIDATION (the manual "start a
  // validation" flow). Trigger-fired revalidations pass NOT_STARTED so the task
  // lands in the queue for the validator to pick up rather than being marked
  // already in progress.
  stage?: MrmValidationStage;
}

/**
 * Start a validation for a model. The partial-unique index
 * `idx_mrm_validations_one_active` allows only one row per (org, model) where
 * stage <> 'validated'; a second in-flight validation raises a 23505, which we
 * translate into a clean ConflictException rather than surfacing a raw DB error.
 *
 * Transaction-aware: pass a transaction so the insert and any accompanying audit
 * writes (e.g. the revalidation-event log) commit atomically.
 */
export const createValidationQuery = async (
  modelId: number,
  organizationId: number,
  input: CreateValidationInput,
  transaction?: Transaction,
): Promise<MrmValidationModel> => {
  try {
    const rows = (await sequelize.query(
      `INSERT INTO mrm_validations
         (organization_id, model_inventory_id, stage, trigger, validator_id,
          report_version, report, next_due, created_at, updated_at)
       VALUES
         (:organizationId, :modelId, :stage, :trigger, :validatorId,
          :reportVersion, :report, :nextDue, :now, :now)
       RETURNING *`,
      {
        replacements: {
          organizationId,
          modelId,
          stage: input.stage ?? MrmValidationStage.IN_VALIDATION,
          trigger: input.trigger ?? null,
          validatorId: input.validator_id ?? null,
          reportVersion: input.report_version ?? null,
          report: JSON.stringify(input.report ?? {}),
          nextDue: input.next_due ?? null,
          now: new Date(),
        },
        mapToModel: true,
        model: MrmValidationModel,
        transaction,
      },
    )) as MrmValidationModel[];
    return rows[0];
  } catch (error) {
    if ((error as any)?.original?.code === PG_UNIQUE_VIOLATION) {
      throw new ConflictException(
        "A validation is already in progress for this model",
        "mrm_validations",
        "model_inventory_id",
      );
    }
    throw error;
  }
};

export interface UpdateValidationInput {
  stage?: MrmValidationStage;
  trigger?: MrmValidationTrigger;
  validator_id?: number | null;
  outcome?: MrmValidationOutcome | null;
  report_version?: string | null;
  report?: MrmValidationReport;
  next_due?: Date | null;
}

/**
 * Advance stage / save report sections / set validator / set outcome.
 * COALESCE keeps unspecified fields untouched; `report` is merged shallowly so a
 * caller can save a single section without clobbering the others.
 */
export const updateValidationQuery = async (
  id: number,
  organizationId: number,
  input: UpdateValidationInput,
): Promise<MrmValidationModel | null> => {
  try {
    const rows = (await sequelize.query(
      `UPDATE mrm_validations
        SET stage          = COALESCE(:stage, stage),
            trigger        = COALESCE(:trigger, trigger),
            validator_id   = CASE WHEN :validatorProvided THEN :validatorId ELSE validator_id END,
            outcome        = CASE WHEN :outcomeProvided THEN :outcome ELSE outcome END,
            report_version = COALESCE(:reportVersion, report_version),
            report         = COALESCE(report, '{}'::jsonb) || :reportPatch::jsonb,
            next_due       = CASE WHEN :nextDueProvided THEN :nextDue ELSE next_due END,
            updated_at     = :now
      WHERE organization_id = :organizationId AND id = :id
      RETURNING *`,
      {
        replacements: {
          organizationId,
          id,
          stage: input.stage ?? null,
          trigger: input.trigger ?? null,
          validatorProvided: input.validator_id !== undefined,
          validatorId: input.validator_id ?? null,
          outcomeProvided: input.outcome !== undefined,
          outcome: input.outcome ?? null,
          reportVersion: input.report_version ?? null,
          reportPatch: JSON.stringify(input.report ?? {}),
          nextDueProvided: input.next_due !== undefined,
          nextDue: input.next_due ?? null,
          now: new Date(),
        },
        mapToModel: true,
        model: MrmValidationModel,
      },
    )) as MrmValidationModel[];
    return rows[0] ?? null;
  } catch (error) {
    // Never leak raw Postgres/Sequelize internals (SQL text, table names) to the client.
    throw new DatabaseException(
      "Failed to update validation",
      "updateValidationQuery",
      "mrm_validations",
      {
        cause: error as Error,
      },
    );
  }
};

export interface SignoffValidationInput {
  outcome: MrmValidationOutcome;
  report_version?: string | null;
  signed_off_by: number;
}

/**
 * Sign off a validation: mark it VALIDATED, record outcome / report_version /
 * signer / timestamp.
 *
 * The single UPDATE is already atomic in Postgres, so the transaction is not
 * strictly required today. It is retained deliberately: sign-off is the point at
 * which model state (e.g. a future model-status write) may become a second
 * statement, and keeping the transaction here means that change is a one-line
 * addition inside an existing atomic boundary rather than a refactor.
 */
export const signoffValidationQuery = async (
  id: number,
  organizationId: number,
  input: SignoffValidationInput,
): Promise<MrmValidationModel | null> => {
  const transaction = await sequelize.transaction();
  try {
    const now = new Date();
    const rows = (await sequelize.query(
      `UPDATE mrm_validations
          SET stage          = :stage,
              outcome        = :outcome,
              report_version = COALESCE(:reportVersion, report_version),
              signed_off_at  = :now,
              signed_off_by  = :signedOffBy,
              updated_at     = :now
        WHERE organization_id = :organizationId AND id = :id
        RETURNING *`,
      {
        replacements: {
          organizationId,
          id,
          stage: MrmValidationStage.VALIDATED,
          outcome: input.outcome,
          reportVersion: input.report_version ?? null,
          signedOffBy: input.signed_off_by,
          now,
        },
        mapToModel: true,
        model: MrmValidationModel,
        transaction,
      },
    )) as MrmValidationModel[];

    if (!rows[0]) {
      await transaction.rollback();
      return null;
    }

    await transaction.commit();
    return rows[0];
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export const getFindingsQuery = async (
  organizationId: number,
  modelId?: number,
  validationId?: number,
): Promise<MrmFindingModel[]> => {
  const clauses = ["organization_id = :organizationId"];
  if (modelId) clauses.push("model_inventory_id = :modelId");
  if (validationId) clauses.push("validation_id = :validationId");
  return (await sequelize.query(
    `SELECT * FROM mrm_findings WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC, id DESC`,
    {
      replacements: { organizationId, modelId, validationId },
      mapToModel: true,
      model: MrmFindingModel,
    },
  )) as MrmFindingModel[];
};

export const getFindingByIdQuery = async (
  id: number,
  organizationId: number,
): Promise<MrmFindingModel | null> => {
  const rows = (await sequelize.query(
    `SELECT * FROM mrm_findings WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: MrmFindingModel,
    },
  )) as MrmFindingModel[];
  return rows[0] ?? null;
};

/** Return the model_inventory_id a validation belongs to (org-scoped), else null. */
export const getValidationModelIdQuery = async (
  validationId: number,
  organizationId: number,
): Promise<number | null> => {
  const rows = (await sequelize.query(
    `SELECT model_inventory_id FROM mrm_validations
      WHERE organization_id = :organizationId AND id = :validationId LIMIT 1`,
    {
      replacements: { organizationId, validationId },
      type: QueryTypes.SELECT,
    },
  )) as { model_inventory_id: number }[];
  return rows[0]?.model_inventory_id ?? null;
};

export interface CreateFindingInput {
  title: string;
  severity?: MrmFindingSeverity;
  owner_id?: number | null;
  remediation_plan?: string | null;
  due_date?: Date | null;
}

export const createFindingQuery = async (
  validationId: number,
  modelId: number,
  organizationId: number,
  input: CreateFindingInput,
): Promise<MrmFindingModel> => {
  const now = new Date();
  const rows = (await sequelize.query(
    `INSERT INTO mrm_findings
       (organization_id, model_inventory_id, validation_id, title, severity, stage,
        owner_id, remediation_plan, due_date, closed_verified, created_at, updated_at)
     VALUES
       (:organizationId, :modelId, :validationId, :title, :severity, :stage,
        :ownerId, :remediationPlan, :dueDate, false, :now, :now)
     RETURNING *`,
    {
      replacements: {
        organizationId,
        modelId,
        validationId,
        title: input.title,
        severity: input.severity ?? MrmFindingSeverity.MEDIUM,
        stage: MrmFindingStage.OPEN,
        ownerId: input.owner_id ?? null,
        remediationPlan: input.remediation_plan ?? null,
        dueDate: input.due_date ?? null,
        now,
      },
      mapToModel: true,
      model: MrmFindingModel,
    },
  )) as MrmFindingModel[];
  return rows[0];
};

export interface UpdateFindingInput {
  stage?: MrmFindingStage;
  severity?: MrmFindingSeverity;
  owner_id?: number | null;
  remediation_plan?: string | null;
  due_date?: Date | null;
  closed_verified?: boolean;
  closed_at?: Date | null;
}

/**
 * Advance a finding's lifecycle / edit its fields. When the target stage is
 * CLOSED, closed_at is stamped (unless the caller passed one); otherwise
 * closed_at is cleared so a re-opened finding loses its stale close date.
 */
export const updateFindingQuery = async (
  id: number,
  organizationId: number,
  input: UpdateFindingInput,
): Promise<MrmFindingModel | null> => {
  let closedAtProvided = input.closed_at !== undefined;
  let closedAt: Date | null = input.closed_at ?? null;
  if (input.stage === MrmFindingStage.CLOSED && !closedAtProvided) {
    closedAtProvided = true;
    closedAt = new Date();
  } else if (input.stage && input.stage !== MrmFindingStage.CLOSED && !closedAtProvided) {
    // Leaving/never-in the closed state — clear any stale close timestamp.
    closedAtProvided = true;
    closedAt = null;
  }

  const rows = (await sequelize.query(
    `UPDATE mrm_findings
        SET stage            = COALESCE(:stage, stage),
            severity         = COALESCE(:severity, severity),
            owner_id         = CASE WHEN :ownerProvided THEN :ownerId ELSE owner_id END,
            remediation_plan = CASE WHEN :remediationProvided THEN :remediationPlan ELSE remediation_plan END,
            due_date         = CASE WHEN :dueDateProvided THEN :dueDate ELSE due_date END,
            closed_verified  = COALESCE(:closedVerified, closed_verified),
            closed_at        = CASE WHEN :closedAtProvided THEN :closedAt ELSE closed_at END,
            updated_at       = :now
      WHERE organization_id = :organizationId AND id = :id
      RETURNING *`,
    {
      replacements: {
        organizationId,
        id,
        stage: input.stage ?? null,
        severity: input.severity ?? null,
        ownerProvided: input.owner_id !== undefined,
        ownerId: input.owner_id ?? null,
        remediationProvided: input.remediation_plan !== undefined,
        remediationPlan: input.remediation_plan ?? null,
        dueDateProvided: input.due_date !== undefined,
        dueDate: input.due_date ?? null,
        closedVerified: input.closed_verified ?? null,
        closedAtProvided,
        closedAt,
        now: new Date(),
      },
      mapToModel: true,
      model: MrmFindingModel,
    },
  )) as MrmFindingModel[];
  return rows[0] ?? null;
};

// ---------------------------------------------------------------------------
// Per-model roles
// ---------------------------------------------------------------------------

export const getModelRolesQuery = async (
  modelId: number,
  organizationId: number,
): Promise<MrmModelRoleModel[]> => {
  return (await sequelize.query(
    `SELECT * FROM mrm_model_roles
      WHERE organization_id = :organizationId AND model_inventory_id = :modelId
      ORDER BY role ASC, id ASC`,
    {
      replacements: { organizationId, modelId },
      mapToModel: true,
      model: MrmModelRoleModel,
    },
  )) as MrmModelRoleModel[];
};

export interface RoleAssignmentInput {
  role: MrmModelRole;
  user_id: number | null;
}

/**
 * Replace the full set of per-model role assignments in one transaction:
 * delete the current assignments for the model, then insert the new set. This
 * is current-state config (CASCADE on model delete), not audit history.
 */
export const setModelRolesQuery = async (
  modelId: number,
  organizationId: number,
  assignments: RoleAssignmentInput[],
): Promise<MrmModelRoleModel[]> => {
  const transaction = await sequelize.transaction();
  try {
    await sequelize.query(
      `DELETE FROM mrm_model_roles
        WHERE organization_id = :organizationId AND model_inventory_id = :modelId`,
      {
        replacements: { organizationId, modelId },
        transaction,
      },
    );

    for (const assignment of assignments) {
      if (assignment.user_id === null || assignment.user_id === undefined) continue;
      await sequelize.query(
        `INSERT INTO mrm_model_roles (organization_id, model_inventory_id, role, user_id, created_at)
         VALUES (:organizationId, :modelId, :role, :userId, :now)`,
        {
          replacements: {
            organizationId,
            modelId,
            role: assignment.role,
            userId: assignment.user_id,
            now: new Date(),
          },
          transaction,
        },
      );
    }

    await transaction.commit();
    return await getModelRolesQuery(modelId, organizationId);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Model-delete protection (§7b) — used by the model-inventory delete path.
// ---------------------------------------------------------------------------

/**
 * True when the model has any MRM validation or finding rows for this org.
 * The inventory delete controller must block on this and direct the user to
 * decommission — the DB's ON DELETE RESTRICT is only the backstop.
 */
export const modelHasMrmHistoryQuery = async (
  modelId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<boolean> => {
  const rows = (await sequelize.query(
    `SELECT
       (EXISTS (SELECT 1 FROM mrm_validations
                 WHERE organization_id = :organizationId AND model_inventory_id = :modelId)
        OR EXISTS (SELECT 1 FROM mrm_findings
                 WHERE organization_id = :organizationId AND model_inventory_id = :modelId)) AS has_history`,
    {
      replacements: { organizationId, modelId },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as { has_history: boolean }[];
  return rows[0]?.has_history === true;
};
