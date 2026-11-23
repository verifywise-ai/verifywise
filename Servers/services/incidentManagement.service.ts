/**
 * Shared write path for updating an AI incident.
 *
 * Every caller that changes an existing incident (the HTTP controller, the
 * AI Advisor tools, the MCP server and the Jira incidents status sync) goes
 * through updateIncident so the same rules apply everywhere:
 *   1. the row is loaded once, locked FOR UPDATE inside the transaction;
 *   2. optional optimistic-concurrency check (expectedUpdatedAt);
 *   3. the caller's access: changed details need incident.edit, changed
 *      approval_status / approval_notes need incident.approve
 *      (IncidentAccessDeniedError, HTTP 403);
 *   4. validation against the locked row;
 *   5. reopening a Closed incident drops a stale Approved closure sign-off
 *      (applyReopenApprovalReset), and the server sets approved_by and
 *      approval_date when approval_status changes (approvalStampFor);
 *   6. one diff (diffIncidentColumns) decides which columns are written and
 *      which fields are recorded in change history; nothing changed means no
 *      write, no updated_at bump, no history and no automations;
 *   7. `incident_updated` automations are enqueued only after commit.
 */

import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { AIIncidentManagementModel } from "../domain.layer/models/incidentManagement/incidemtManagement.model";
import { ConflictException } from "../domain.layer/exceptions/custom.exception";
import {
  diffIncidentColumns,
  enqueueIncidentUpdatedAutomations,
  getIncidentApproverName,
  getIncidentByIdQuery,
  incidentReferenceFieldFromError,
  incidentWriteNeeds,
  invalidReferenceErrors,
  updateIncidentByIdQuery,
  validateIncidentReferences,
} from "../utils/incidentManagement.utils";
import {
  applyReopenApprovalReset,
  approvalStampFor,
  validateCompleteIncidentUpdate,
  withoutServerSetApprovalFields,
} from "../utils/validations/incidentManagementValidation.utils";
import { ValidationError } from "../utils/validations/validation.utils";
import {
  formatEntityFieldChanges,
  recordMultipleFieldChanges,
} from "../utils/changeHistory.base.utils";
import logger from "../utils/logger/fileLogger";

/** Message for a write that lost an optimistic-concurrency check. */
export const INCIDENT_CHANGED_MESSAGE =
  "This incident was changed since you opened it. Reload to see the latest version.";

/**
 * Thrown when an update fails validation; `errors` match the HTTP 400 body.
 * `transactionAborted` is true when the write itself failed (a reference
 * deleted after the check broke the FK): Postgres has aborted the
 * transaction, so a caller that passed its own must roll it back.
 */
export class IncidentUpdateValidationError extends Error {
  constructor(
    public readonly errors: ValidationError[],
    { transactionAborted = false }: { transactionAborted?: boolean } = {},
  ) {
    super("Incident update validation failed");
    this.name = "IncidentUpdateValidationError";
    this.transactionAborted = transactionAborted;
  }

  readonly transactionAborted: boolean;
}

/**
 * What the caller may change: incident.edit (the incident's details,
 * archived included) and incident.approve (approval_status and
 * approval_notes). Resolved by the caller from its own permission source
 * (the request's role, the Advisor's requester, the MCP caller).
 */
export interface IncidentWriteAccess {
  canEdit: boolean;
  canApprove: boolean;
}

/** Access of a system writer (`changedBySystem`): details only, never sign-off. */
export const SYSTEM_INCIDENT_ACCESS: IncidentWriteAccess = { canEdit: true, canApprove: false };

/** Message for a write that needs incident.edit and the caller lacks it. */
export const INCIDENT_EDIT_DENIED_MESSAGE =
  "Your role does not allow editing this incident's details.";
/** Message for a write that needs incident.approve and the caller lacks it. */
export const INCIDENT_APPROVE_DENIED_MESSAGE =
  "Your role does not allow approving or rejecting incidents.";

/**
 * Thrown when the update changes fields the caller's access does not cover:
 * `need` is the missing key ("edit" for incident.edit, "approve" for
 * incident.approve) and `fields` the changed fields that need it. The
 * message is the matching one above; the controller answers 403.
 */
export class IncidentAccessDeniedError extends Error {
  constructor(
    public readonly need: "edit" | "approve",
    public readonly fields: string[],
  ) {
    super(need === "edit" ? INCIDENT_EDIT_DENIED_MESSAGE : INCIDENT_APPROVE_DENIED_MESSAGE);
    this.name = "IncidentAccessDeniedError";
  }
}

export interface UpdateIncidentOptions {
  /**
   * What the caller may change (see IncidentWriteAccess). Required unless
   * `changedBySystem` is set, which defaults to SYSTEM_INCIDENT_ACCESS. An
   * update without either is refused: the write path never guesses access.
   */
  access?: IncidentWriteAccess;
  /**
   * Run inside the caller's transaction; the caller commits or rolls back.
   * After an IncidentUpdateValidationError the transaction is still usable
   * unless the error has `transactionAborted: true` (the UPDATE hit a foreign
   * key violation); then the caller can only roll it back.
   */
  transaction?: Transaction;
  /**
   * Record history as a system change (null actor, changed_by_system = true)
   * rather than as `userId`. Meant for writers that act for no person, such
   * as integrations and background jobs.
   */
  changedBySystem?: boolean;
  /**
   * The incident's updated_at as the caller last saw it. When given and the
   * stored value differs, the update is refused with a ConflictException
   * (HTTP 409). null and undefined mean "no version check"; any other value
   * that is not a date-time, including '' and whitespace, is a validation
   * error (HTTP 400).
   * Interactive editors pass it; background writers do not.
   */
  expectedUpdatedAt?: unknown;
}

/** The instant of a Date or date string, or NaN when it is not one. */
const toTime = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" || value.trim() === "") return NaN;
  return new Date(value).getTime();
};

/** No version given: null or undefined. ('' is a malformed version, not an absent one.) */
const isAbsentVersion = (value: unknown): boolean => value === null || value === undefined;

/**
 * Applies `updates` to incident `incidentId`. Returns the updated incident
 * (or the unchanged one when nothing differs), or null when it does not
 * exist in the organization.
 *
 * Throws ConflictException when `expectedUpdatedAt` is stale,
 * IncidentAccessDeniedError when the update changes a field `options.access`
 * does not cover, and IncidentUpdateValidationError when the update is
 * invalid.
 *
 * approved_by and approval_date in `updates` are ignored: the server sets
 * them when approval_status changes (the acting user and now for Approved or
 * Rejected, cleared for Pending or Not required).
 *
 * History is recorded as `userId`, or as the system when
 * `options.changedBySystem` is set. With neither, no history is written.
 */
export async function updateIncident(
  organizationId: number,
  incidentId: number,
  requested: Record<string, unknown>,
  userId: number | null | undefined,
  options: UpdateIncidentOptions = {},
): Promise<AIIncidentManagementModel | null> {
  const access = options.access ?? (options.changedBySystem ? SYSTEM_INCIDENT_ACCESS : undefined);
  if (!access) {
    throw new Error("updateIncident needs the caller's access (options.access)");
  }
  // Who approved and when is the server's to record, never the caller's.
  const updates = withoutServerSetApprovalFields(requested);

  // A version that is present but not a date-time is a bad request (400),
  // not a conflict (409). Only null / undefined skip the check.
  const expectedTime = isAbsentVersion(options.expectedUpdatedAt)
    ? undefined
    : toTime(options.expectedUpdatedAt);
  if (expectedTime !== undefined && Number.isNaN(expectedTime)) {
    throw new IncidentUpdateValidationError([
      {
        field: "expected_updated_at",
        message: "expected_updated_at must be a valid date-time",
        code: "INVALID_DATE",
      },
    ]);
  }

  const ownsTransaction = !options.transaction;
  const transaction = options.transaction ?? (await sequelize.transaction());
  try {
    const existing = (await getIncidentByIdQuery(incidentId, organizationId, {
      transaction,
      lock: true,
    })) as AIIncidentManagementModel | null;
    if (!existing) {
      if (ownsTransaction) await transaction.rollback();
      return null;
    }
    const stored = existing.dataValues as unknown as Record<string, unknown>;

    // getIncidentByIdQuery maps rows onto the model (timestamps + underscored),
    // so the row's updated_at column lands on `updatedAt`; read it the way
    // toSafeJSON does.
    const storedUpdatedAt = existing.updatedAt ?? stored.updated_at;
    if (expectedTime !== undefined && toTime(storedUpdatedAt) !== expectedTime) {
      throw new ConflictException(INCIDENT_CHANGED_MESSAGE, "incident", "updated_at");
    }

    // Only fields the caller actually changes count: the drawer may send
    // values back unchanged. Checked on the caller's request, before the
    // server's own rewrites (reopen reset, approval stamp).
    const needs = incidentWriteNeeds(stored, updates);
    if (needs.edit.length > 0 && !access.canEdit) {
      throw new IncidentAccessDeniedError("edit", needs.edit);
    }
    if (needs.approve.length > 0 && !access.canApprove) {
      throw new IncidentAccessDeniedError("approve", needs.approve);
    }

    // Field validation first: a malformed value never reaches the reference SQL.
    const validationErrors: ValidationError[] = validateCompleteIncidentUpdate(updates, stored);
    if (validationErrors.length > 0) throw new IncidentUpdateValidationError(validationErrors);

    const invalidRefs = await validateIncidentReferences(
      {
        model_inventory_id:
          updates.model_inventory_id !== undefined
            ? updates.model_inventory_id
            : stored.model_inventory_id,
        project_id: updates.project_id !== undefined ? updates.project_id : stored.project_id,
        // Only a new owner is checked: one who has since left the organization
        // stays on the incident and must not block every other edit.
        assignee_id:
          updates.assignee_id !== undefined &&
          String(updates.assignee_id ?? "").trim() !== String(stored.assignee_id ?? "")
            ? updates.assignee_id
            : undefined,
      },
      organizationId,
      transaction,
    );
    if (invalidRefs.length > 0) {
      throw new IncidentUpdateValidationError(invalidReferenceErrors(invalidRefs));
    }

    const effective: Record<string, unknown> = { ...applyReopenApprovalReset(stored, updates) };
    const stamp = approvalStampFor(stored.approval_status, effective.approval_status);
    if (stamp === "stamp") {
      effective.approved_by = userId
        ? await getIncidentApproverName(userId, organizationId, transaction)
        : null;
      effective.approval_date = new Date();
    } else if (stamp === "clear") {
      effective.approved_by = null;
      effective.approval_date = null;
    }
    const changed = diffIncidentColumns(stored, effective);
    // approval_date is compared as a calendar day, so a second decision on the
    // same day would keep the first one's time. A new decision always writes it.
    if (stamp === "stamp") changed.approval_date = effective.approval_date;
    const changedColumns = Object.keys(changed);

    if (changedColumns.length === 0) {
      if (ownsTransaction) await transaction.commit();
      return existing;
    }

    const saved = await updateIncidentByIdQuery(incidentId, changed, organizationId, transaction);

    if (userId || options.changedBySystem) {
      // Name lookups are tenant-scoped and run on this transaction, the
      // connection that holds the row lock.
      const changes = await formatEntityFieldChanges("incident", stored, changed, changedColumns, {
        organizationId,
        transaction,
      });
      if (changes.length > 0) {
        await recordMultipleFieldChanges(
          "incident",
          incidentId,
          userId ?? null,
          organizationId,
          changes,
          transaction,
          options.changedBySystem ?? false,
        );
      }
    }

    transaction.afterCommit(() => {
      enqueueIncidentUpdatedAutomations(organizationId, existing, saved).catch((error) =>
        logger.error(`[incident] automation enqueue failed for #${incidentId}: ${error}`),
      );
    });

    if (ownsTransaction) await transaction.commit();
    return saved;
  } catch (error) {
    if (ownsTransaction) await transaction.rollback();
    // A reference deleted after the check fails the UPDATE's FK check: the
    // same 400 as a failed check. A caller's transaction is aborted by the
    // violation, so the caller must roll it back.
    const deletedReference = incidentReferenceFieldFromError(error);
    if (deletedReference) {
      throw new IncidentUpdateValidationError(invalidReferenceErrors([deletedReference]), {
        transactionAborted: true,
      });
    }
    throw error;
  }
}
