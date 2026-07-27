import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { MrmValidationModel } from "../domain.layer/models/mrm/mrmValidation.model";
import {
  MrmValidationStage,
  MrmValidationTrigger,
  MrmModelRole,
} from "../domain.layer/enums/mrm.enum";
import { MrmRevalidationTriggerSource } from "../domain.layer/enums/mrmMonitoring.enum";
import { createValidationQuery } from "./mrm.utils";
import { ConflictException } from "../domain.layer/exceptions/custom.exception";

/**
 * MRM (Model Risk Management) — Branch 3 (revalidation triggers) data-access +
 * the unified trigger util.
 *
 * The 4 trigger sources (breach, material_change, tier_increase, scheduled) all
 * converge on ONE task-creation path: `triggerRevalidation`. Every firing is
 * recorded in the mrm_revalidation_events audit log — including no-ops where a
 * revalidation was already open for the model.
 *
 * Every query is tenant-isolated: `WHERE organization_id = :organizationId`.
 * Table names are UNQUALIFIED — the `search_path = verifywise` afterConnect hook
 * resolves the schema. Thin controllers call into these functions; all SQL lives
 * here per the backend Layer Flow.
 */

// PostgreSQL SQLSTATE for unique_violation (the one-active-validation partial
// unique index breach).
const PG_UNIQUE_VIOLATION = "23505";

// The stable key in a validation's report JSONB under which trigger-fired
// reasons are appended (so the open task carries the full list of what pushed
// for its revalidation, and the mrm_validations report is never clobbered).
const REVALIDATION_TRIGGERS_KEY = "revalidation_triggers";

/**
 * Map a trigger source to the mrm_validations.trigger enum:
 *   breach          -> breach
 *   tier_increase   -> change
 *   material_change -> change
 *   scheduled       -> periodic
 */
export function triggerSourceToValidationTrigger(
  source: MrmRevalidationTriggerSource,
): MrmValidationTrigger {
  switch (source) {
    case MrmRevalidationTriggerSource.BREACH:
      return MrmValidationTrigger.BREACH;
    case MrmRevalidationTriggerSource.SCHEDULED:
      return MrmValidationTrigger.PERIODIC;
    case MrmRevalidationTriggerSource.TIER_INCREASE:
    case MrmRevalidationTriggerSource.MATERIAL_CHANGE:
      return MrmValidationTrigger.CHANGE;
    default: {
      // Exhaustiveness guard: if a new MrmRevalidationTriggerSource value is
      // added and not handled above, `source` is no longer `never` and this
      // assignment fails to compile instead of silently mapping the new source
      // to CHANGE. The runtime fallback is intentional.
      const exhaustiveCheck: never = source;
      throw new Error(`Unhandled MrmRevalidationTriggerSource: ${String(exhaustiveCheck)}`);
    }
  }
}

/**
 * The open (non-validated) validation for a model, if any. Org-scoped. The
 * partial-unique index guarantees at most one, but ORDER BY id keeps this
 * deterministic even before the index is in place.
 */
export const getOpenValidationForModelQuery = async (
  organizationId: number,
  modelInventoryId: number,
  transaction?: Transaction,
): Promise<MrmValidationModel | null> => {
  const rows = (await sequelize.query(
    `SELECT * FROM mrm_validations
      WHERE organization_id = :organizationId
        AND model_inventory_id = :modelInventoryId
        AND stage <> :validated
      ORDER BY id ASC
      LIMIT 1`,
    {
      replacements: {
        organizationId,
        modelInventoryId,
        validated: MrmValidationStage.VALIDATED,
      },
      mapToModel: true,
      model: MrmValidationModel,
      transaction,
    },
  )) as MrmValidationModel[];
  return rows[0] ?? null;
};

/**
 * The user id assigned as the model's validator (from mrm_model_roles), or null
 * when unassigned. Deterministic: lowest id wins if somehow duplicated.
 */
export const getModelValidatorIdQuery = async (
  organizationId: number,
  modelInventoryId: number,
  transaction?: Transaction,
): Promise<number | null> => {
  const rows = (await sequelize.query(
    `SELECT user_id FROM mrm_model_roles
      WHERE organization_id = :organizationId
        AND model_inventory_id = :modelInventoryId
        AND role = :role
        AND user_id IS NOT NULL
      ORDER BY id ASC
      LIMIT 1`,
    {
      replacements: {
        organizationId,
        modelInventoryId,
        role: MrmModelRole.VALIDATOR,
      },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as { user_id: number | null }[];
  return rows[0]?.user_id ?? null;
};

/**
 * Append a trigger reason to an already-open validation's report JSONB under the
 * `revalidation_triggers` array — the least-invasive annotation (the validation
 * trigger enum can hold only ONE value, so the report array records the full
 * history of what pushed for this revalidation). The existing report sections
 * are preserved (jsonb concat merges at the top level). Idempotency of the array
 * itself is not required — each firing is a distinct dated entry.
 *
 * The read-modify-write (existing_array || new_entry) is serialized with a
 * SELECT ... FOR UPDATE row lock taken in the same transaction BEFORE the
 * UPDATE. Without it, two concurrent transactions each computing the concat
 * from the same pre-update value would silently drop one entry. The lock forces
 * the second appender to wait until the first commits, so it appends onto the
 * already-extended array.
 */
export const appendRevalidationReasonQuery = async (
  organizationId: number,
  validationId: number,
  entry: { source: MrmRevalidationTriggerSource; reason: string; at: string },
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(
    `SELECT id FROM mrm_validations
      WHERE organization_id = :organizationId AND id = :validationId
      FOR UPDATE`,
    {
      replacements: { organizationId, validationId },
      transaction,
    },
  );
  await sequelize.query(
    `UPDATE mrm_validations
        SET report = jsonb_set(
              COALESCE(report, '{}'::jsonb),
              ARRAY[:key],
              COALESCE(report -> :key, '[]'::jsonb) || :entry::jsonb,
              true
            ),
            updated_at = :now
      WHERE organization_id = :organizationId AND id = :validationId`,
    {
      replacements: {
        organizationId,
        validationId,
        key: REVALIDATION_TRIGGERS_KEY,
        entry: JSON.stringify(entry),
        now: new Date(),
      },
      transaction,
    },
  );
};

/**
 * Clear the model's revalidation SEED flag (set by Branch 2 on breach). Called
 * once a real revalidation task exists so the fast indicator does not linger.
 * Idempotent — safe when the flag was never set.
 */
export const clearRevalidationFlagQuery = async (
  organizationId: number,
  modelInventoryId: number,
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(
    `UPDATE model_inventories
        SET mrm_revalidation_flagged = false,
            mrm_revalidation_flagged_at = NULL,
            mrm_revalidation_reason = NULL,
            updated_at = :now
      WHERE organization_id = :organizationId AND id = :modelInventoryId`,
    {
      replacements: { organizationId, modelInventoryId, now: new Date() },
      transaction,
    },
  );
};

/**
 * Append-only audit write: record ONE revalidation-trigger firing. Written for
 * EVERY firing, including no-ops (created_validation = false). Never throws to
 * the caller in a way that would roll back the task creation — kept inside the
 * same transaction as the task write so the audit and the task commit together.
 */
export const recordRevalidationEventQuery = async (
  organizationId: number,
  modelInventoryId: number,
  input: {
    trigger_source: MrmRevalidationTriggerSource;
    reason: string | null;
    resulting_validation_id: number | null;
    created_validation: boolean;
    source_ref?: Record<string, unknown> | null;
  },
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(
    `INSERT INTO mrm_revalidation_events
       (organization_id, model_inventory_id, trigger_source, reason,
        resulting_validation_id, created_validation, source_ref, fired_at, created_at)
     VALUES
       (:organizationId, :modelInventoryId, :triggerSource, :reason,
        :resultingValidationId, :createdValidation, :sourceRef, :now, :now)`,
    {
      replacements: {
        organizationId,
        modelInventoryId,
        triggerSource: input.trigger_source,
        reason: input.reason,
        resultingValidationId: input.resulting_validation_id,
        createdValidation: input.created_validation,
        sourceRef: input.source_ref ? JSON.stringify(input.source_ref) : null,
        now: new Date(),
      },
      transaction,
    },
  );
};

export interface TriggerRevalidationResult {
  created_validation: boolean;
  validation_id: number | null;
}

/**
 * The ONE task-creation path all 4 trigger sources call.
 *
 * - No open validation for the model -> create a new mrm_validations row
 *   (stage not_started, trigger mapped from the source), routed to the model's
 *   validator (null if unassigned). Record a revalidation event with
 *   created_validation = true. Clear the seed flag if it was set.
 * - An open validation already exists -> do NOT create a second. Append the
 *   reason to the open validation's report `revalidation_triggers` array. Record
 *   a revalidation event with created_validation = false pointing at the
 *   already-open task.
 *
 * Idempotent and safe under the one-active-validation partial unique index: a
 * concurrent create that races and hits a 23505 is caught and re-resolved down
 * the "already-open" annotate path (no second task, audit still written).
 *
 * Deterministic, org-scoped, transaction-aware. When no transaction is passed,
 * one is opened internally so the task write + audit write commit atomically.
 */
export const triggerRevalidation = async (
  organizationId: number,
  modelInventoryId: number,
  source: MrmRevalidationTriggerSource,
  reason: string,
  sourceRef?: Record<string, unknown> | null,
  transaction?: Transaction,
): Promise<TriggerRevalidationResult> => {
  const ownTx = transaction === undefined;
  const tx = transaction ?? (await sequelize.transaction());
  try {
    const result = await runTriggerRevalidation(
      organizationId,
      modelInventoryId,
      source,
      reason,
      sourceRef ?? null,
      tx,
    );
    if (ownTx) await tx.commit();
    return result;
  } catch (error) {
    if (ownTx) await tx.rollback();
    throw error;
  }
};

/**
 * Inner body — always runs inside a transaction. Split out so both the internal
 * and caller-supplied transaction paths share one implementation.
 */
async function runTriggerRevalidation(
  organizationId: number,
  modelInventoryId: number,
  source: MrmRevalidationTriggerSource,
  reason: string,
  sourceRef: Record<string, unknown> | null,
  tx: Transaction,
): Promise<TriggerRevalidationResult> {
  const firedAtIso = new Date().toISOString();

  // Already open? -> annotate + record a no-op event.
  const open = await getOpenValidationForModelQuery(organizationId, modelInventoryId, tx);
  if (open) {
    await appendRevalidationReasonQuery(
      organizationId,
      open.id!,
      { source, reason, at: firedAtIso },
      tx,
    );
    await recordRevalidationEventQuery(
      organizationId,
      modelInventoryId,
      {
        trigger_source: source,
        reason,
        resulting_validation_id: open.id!,
        created_validation: false,
        source_ref: sourceRef,
      },
      tx,
    );
    return { created_validation: false, validation_id: open.id! };
  }

  // None open -> try to create a new not_started task routed to the validator.
  const validatorId = await getModelValidatorIdQuery(organizationId, modelInventoryId, tx);

  // SAVEPOINT around the INSERT: if it hits the one-active-validation unique index
  // (a concurrent trigger opened the task between our SELECT and INSERT), Postgres
  // poisons the whole transaction — every later statement, including the recovery
  // SELECT, would fail with "current transaction is aborted". Rolling back to the
  // savepoint restores a usable transaction so the annotate fallback can run and
  // the audit event is still written.
  const SAVEPOINT = "mrm_reval_insert";
  await sequelize.query(`SAVEPOINT ${SAVEPOINT}`, { transaction: tx });
  try {
    const created = await createValidationQuery(
      modelInventoryId,
      organizationId,
      {
        stage: MrmValidationStage.NOT_STARTED,
        trigger: triggerSourceToValidationTrigger(source),
        validator_id: validatorId,
      },
      tx,
    );
    await sequelize.query(`RELEASE SAVEPOINT ${SAVEPOINT}`, { transaction: tx });

    // Stamp the first trigger reason into the new task's report array (same
    // annotation path as later firings), so the task always carries its full
    // trigger history regardless of how many times it fires.
    await appendRevalidationReasonQuery(
      organizationId,
      created.id!,
      { source, reason, at: firedAtIso },
      tx,
    );

    await recordRevalidationEventQuery(
      organizationId,
      modelInventoryId,
      {
        trigger_source: source,
        reason,
        resulting_validation_id: created.id!,
        created_validation: true,
        source_ref: sourceRef,
      },
      tx,
    );

    await clearRevalidationFlagQuery(organizationId, modelInventoryId, tx);

    return { created_validation: true, validation_id: created.id! };
  } catch (error) {
    // Race fallback: a concurrent trigger opened the task between our SELECT and
    // INSERT. createValidationQuery re-wraps the unique-violation (23505) as a
    // ConflictException on mrm_validations. Roll back to the savepoint to un-poison
    // the transaction, then re-resolve as the already-open annotate path so we never
    // create a second task and the audit is still written.
    const isOneActiveConflict =
      (error instanceof ConflictException &&
        (error as any)?.metadata?.resource === "mrm_validations") ||
      (error as any)?.original?.code === PG_UNIQUE_VIOLATION;
    if (isOneActiveConflict) {
      await sequelize.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`, { transaction: tx });
      const raced = await getOpenValidationForModelQuery(organizationId, modelInventoryId, tx);
      if (raced) {
        await appendRevalidationReasonQuery(
          organizationId,
          raced.id!,
          { source, reason, at: firedAtIso },
          tx,
        );
        await recordRevalidationEventQuery(
          organizationId,
          modelInventoryId,
          {
            trigger_source: source,
            reason,
            resulting_validation_id: raced.id!,
            created_validation: false,
            source_ref: sourceRef,
          },
          tx,
        );
        return { created_validation: false, validation_id: raced.id! };
      }
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Scheduled sweep (BullMQ daily job)
// ---------------------------------------------------------------------------

export interface DueValidationRow {
  model_inventory_id: number;
  next_due: Date | null;
}

/**
 * Models with an OVERDUE + IDLE validation whose next_due has passed — org-scoped.
 * These are the periodic-revalidation candidates for the sweep.
 *
 * "Idle" is the key narrowing: the sweep only fires for validations still at
 * stage = 'not_started'. A validation that is IN_VALIDATION or UNDER_REVIEW is
 * being actively worked — annotating it daily with a spurious "periodic
 * revalidation due" nudge would be noise, so those are deliberately excluded.
 * A not_started task that is now past its next_due is the real "nobody has
 * picked this up yet" case the nudge is meant for.
 *
 * A model already handled (a fresh trigger fired today) is naturally deduped by
 * triggerRevalidation's annotate path, so re-running the sweep is safe.
 */
export const getDueRevalidationsQuery = async (
  organizationId: number,
  now: Date,
): Promise<DueValidationRow[]> => {
  return (await sequelize.query(
    `SELECT model_inventory_id, next_due
       FROM mrm_validations
      WHERE organization_id = :organizationId
        AND stage = :notStarted
        AND next_due IS NOT NULL
        AND next_due <= :now
      ORDER BY model_inventory_id ASC`,
    {
      replacements: {
        organizationId,
        notStarted: MrmValidationStage.NOT_STARTED,
        now,
      },
      type: QueryTypes.SELECT,
    },
  )) as DueValidationRow[];
};
