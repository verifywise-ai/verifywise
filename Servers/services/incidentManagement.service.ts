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
 *   7. `incident_updated` automations are enqueued only after commit, and so
 *      is the incident response workflow when the update raises severity
 *      into the critical tier (at most one run per incident).
 *
 * Archive and restore are updates of `archived` through the same path
 * (setIncidentArchived). Creating (createIncident) and deleting
 * (deleteIncident) also live here, so the console, the AI Advisor and any
 * other writer record the same history and send the same automations.
 */

import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { AIIncidentManagementModel } from "../domain.layer/models/incidentManagement/incidemtManagement.model";
import { IAIIncidentManagement } from "../domain.layer/interfaces/i.aiIncidentManagement";
import { ConflictException } from "../domain.layer/exceptions/custom.exception";
import {
  createNewIncidentQuery,
  deleteIncidentByIdQuery,
  diffIncidentColumns,
  enqueueIncidentUpdatedAutomations,
  getIncidentApproverName,
  getIncidentByIdQuery,
  getIncidentMemberName,
  incidentReferenceFieldFromError,
  incidentWriteNeeds,
  invalidReferenceErrors,
  updateIncidentByIdQuery,
  validateIncidentReferences,
} from "../utils/incidentManagement.utils";
import {
  applyReopenApprovalReset,
  approvalStampFor,
  INCIDENT_CREATE_DEFAULTS,
  incidentToday,
  isBlankIncidentValue,
  isSameIncidentValue,
  parseCreateHarmCategories,
  toIncidentDateValue,
  toIncidentUserId,
  validateCompleteIncidentCreation,
  validateCompleteIncidentUpdate,
  withoutServerSetApprovalFields,
} from "../utils/validations/incidentManagementValidation.utils";
import { ValidationError } from "../utils/validations/validation.utils";
import {
  formatEntityFieldChanges,
  recordEntityCreation,
  recordEntityDeletion,
  recordMultipleFieldChanges,
} from "../utils/changeHistory.base.utils";
import { recordIncidentCreation } from "../utils/incidentChangeHistory.utils";
import { isCriticalIncidentSeverity } from "../domain.layer/enums/ai-incident-management.enum";
import { triggerIncidentResponse } from "./workflows/triggers";
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

/** Message for a change to an archived incident other than restoring it. */
export const INCIDENT_ARCHIVED_MESSAGE = "Restore this incident before editing it.";

/**
 * Thrown when an update changes an archived incident's fields other than
 * `archived` (restoring it). The controller answers 409 with
 * INCIDENT_ARCHIVED_MESSAGE; nothing is written.
 */
export class IncidentArchivedError extends Error {
  constructor(public readonly fields: string[]) {
    super(INCIDENT_ARCHIVED_MESSAGE);
    this.name = "IncidentArchivedError";
  }
}

/**
 * The reference columns (use case, model, owner) an update changes against
 * the stored row: only those are checked against the organization, so a
 * reference that has since become invalid (an owner who left the
 * organization) never blocks other edits, archive or restore.
 */
const changedReferences = (
  stored: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<"model_inventory_id" | "project_id" | "assignee_id", unknown> => {
  const changed = (column: "model_inventory_id" | "project_id" | "assignee_id") =>
    updates[column] !== undefined &&
    String(updates[column] ?? "").trim() !== String(stored[column] ?? "")
      ? updates[column]
      : undefined;
  return {
    model_inventory_id: changed("model_inventory_id"),
    project_id: changed("project_id"),
    assignee_id: changed("assignee_id"),
  };
};

/**
 * Resolves a reporter_id the caller sent to the member's full name, for the
 * reporter text column. Returns undefined when no reporter id is set
 * (blank), the name when the user is a member of the organization, and
 * null when they are not (or the value is not a user id): a 400 for the
 * caller.
 */
const reporterNameFor = async (
  reporterId: unknown,
  organizationId: number,
  transaction: Transaction,
): Promise<string | null | undefined> => {
  if (isBlankIncidentValue(reporterId)) return undefined;
  const id = toIncidentUserId(reporterId);
  if (id === null) return null;
  return getIncidentMemberName(id, organizationId, transaction);
};

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

/**
 * Whether an update moves severity from below the critical tier into it.
 * `changedSeverity` is the diffed value: undefined when severity is unchanged.
 */
export const isCriticalEscalation = (storedSeverity: unknown, changedSeverity: unknown): boolean =>
  changedSeverity !== undefined &&
  isCriticalIncidentSeverity(changedSeverity) &&
  !isCriticalIncidentSeverity(storedSeverity);

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
 * approved_by, approved_by_id and approval_date in `updates` are ignored:
 * the server sets them when approval_status changes (the acting user's name
 * and id and today's date for Approved or Rejected, cleared for Pending or
 * Not required).
 *
 * A reporter_id sent (changed or not) sets the reporter text to that
 * member's current full name, ignoring any reporter text sent. A changed one
 * must be a member of the organization (else IncidentUpdateValidationError,
 * INVALID_REFERENCE); an unchanged one whose user has left keeps the stored
 * reporter. A changed reporter text sent without a reporter_id clears the
 * stored reporter_id.
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

    // An archived incident is read-only until restored: the only change it
    // takes is `archived` itself (restore, possibly with nothing else).
    if (stored.archived) {
      const blocked = [...needs.edit, ...needs.approve].filter((column) => column !== "archived");
      if (blocked.length > 0) throw new IncidentArchivedError(blocked);
    }

    // Field validation first: a malformed value never reaches the reference SQL.
    const validationErrors: ValidationError[] = validateCompleteIncidentUpdate(updates, stored);
    if (validationErrors.length > 0) throw new IncidentUpdateValidationError(validationErrors);

    // Only references the update changes are checked; unchanged ones (and
    // ones sent back with their stored value) are not looked up.
    const invalidRefs = await validateIncidentReferences(
      changedReferences(stored, updates),
      organizationId,
      transaction,
    );
    // A reporter picked from the users (reporter_id, changed or sent back
    // unchanged) is the reporter: their current full name goes into the
    // reporter text, whatever text was sent. A changed one must be a member
    // of the organization. One sent back unchanged whose user has since left
    // keeps the stored reporter as it is.
    const reporterIdSent = updates.reporter_id !== undefined;
    const reporterIdChanges =
      reporterIdSent &&
      !isSameIncidentValue("reporter_id", stored.reporter_id, updates.reporter_id);
    const reporterName = reporterIdSent
      ? await reporterNameFor(updates.reporter_id, organizationId, transaction)
      : undefined;
    if (reporterName === null && reporterIdChanges) {
      throw new IncidentUpdateValidationError(invalidReferenceErrors(["reporter_id"]));
    }
    if (invalidRefs.length > 0) {
      throw new IncidentUpdateValidationError(invalidReferenceErrors(invalidRefs));
    }

    const effective: Record<string, unknown> = { ...applyReopenApprovalReset(stored, updates) };
    if (typeof reporterName === "string") {
      effective.reporter = reporterName;
    } else if (reporterName === null) {
      effective.reporter = stored.reporter;
    } else if (
      !reporterIdSent &&
      effective.reporter !== undefined &&
      !isSameIncidentValue("reporter", stored.reporter, effective.reporter)
    ) {
      // A new reporter text without a user (the Advisor, an API caller)
      // names someone else: the stored user no longer applies.
      effective.reporter_id = null;
    }
    const stamp = approvalStampFor(stored.approval_status, effective.approval_status);
    if (stamp === "stamp") {
      effective.approved_by = userId
        ? await getIncidentApproverName(userId, organizationId, transaction)
        : null;
      effective.approved_by_id = userId ?? null;
      effective.approval_date = incidentToday();
    } else if (stamp === "clear") {
      effective.approved_by = null;
      effective.approved_by_id = null;
      effective.approval_date = null;
    }
    const changed = diffIncidentColumns(stored, effective);
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

    // Raising an incident into the critical tier starts the incident response
    // workflow, as creating it critical does. The trigger starts at most one
    // run per incident, so an incident that already had one is left alone.
    if (isCriticalEscalation(stored.severity, changed.severity)) {
      const severity = changed.severity as string;
      transaction.afterCommit(() => {
        triggerIncidentResponse(organizationId, incidentId, severity).catch((err) =>
          logger.error(`[incident] incident_response trigger failed: ${err}`),
        );
      });
    }

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

/**
 * Archives (`archived: true`) or restores (`archived: false`) an incident
 * through updateIncident, so both take the row lock and record the change in
 * history ("Archived": No -> Yes, or back) and send `incident_updated` after
 * commit. Archiving an archived incident (or restoring an active one) changes
 * nothing and records nothing. Returns null when the incident does not exist
 * in the organization. Callers check incident.edit first; archived is an
 * incident detail, so the write needs edit access and never approval.
 */
export function setIncidentArchived(
  organizationId: number,
  incidentId: number,
  archived: boolean,
  userId: number | null | undefined,
  options: Pick<UpdateIncidentOptions, "changedBySystem" | "transaction"> = {},
): Promise<AIIncidentManagementModel | null> {
  return updateIncident(organizationId, incidentId, { archived }, userId, {
    ...options,
    access: { canEdit: true, canApprove: false },
  });
}

/**
 * Thrown when a create fails validation: field rules, or a reference
 * (use case, model, owner) outside the organization, including one deleted
 * between the check and the insert. `errors` match the HTTP 400 body.
 */
export class IncidentCreateValidationError extends Error {
  constructor(public readonly errors: ValidationError[]) {
    super("Incident creation validation failed");
    this.name = "IncidentCreateValidationError";
  }
}

/** Who creates an incident, and whether they may record an approval decision. */
export interface CreateIncidentActor {
  /** The acting user: recorded in history and as approver when they approve. */
  userId?: number | null;
  /** incident.approve: without it the incident starts Pending, without notes. */
  canApprove: boolean;
  /**
   * Record creation history as the system (null actor) when there is no
   * user, as the AI Advisor does for an execution without one.
   */
  changedBySystem?: boolean;
}

/**
 * The saved incident's values for creation history, without the column
 * defaults the caller did not send (false booleans such as archived and
 * interim_report, an empty harm category list): history lists what the
 * incident was created with, not every default.
 */
export const creationHistoryValues = (
  saved: Record<string, unknown>,
  input: Record<string, unknown> | undefined,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(saved).filter(
      ([key, value]) =>
        input?.[key] !== undefined ||
        !(value === false || (Array.isArray(value) && value.length === 0)),
    ),
  );

/**
 * Creates an incident for a person (the console, the AI Advisor). In order:
 *   1. field validation (validateCompleteIncidentCreation), before any
 *      transaction;
 *   2. the references (use case, model, owner) must be in the organization,
 *      checked on the create transaction;
 *   3. approval: only an actor with incident.approve may record a decision;
 *      the approver and date are the server's (the actor and now);
 *   4. the insert (`incident_added` is enqueued after commit by the query);
 *   5. creation history, as the actor or as the system;
 *   6. after commit, the incident response workflow for critical severity.
 * Throws IncidentCreateValidationError for 1, 2 and a reference deleted
 * after the check (the insert's foreign key), ValidationException from the
 * write query's description backstop, and anything else unchanged.
 */
export async function createIncident(
  organizationId: number,
  input: Record<string, unknown>,
  actor: CreateIncidentActor,
): Promise<AIIncidentManagementModel> {
  const fieldErrors = validateCompleteIncidentCreation(input);
  if (fieldErrors.length > 0) throw new IncidentCreateValidationError(fieldErrors);

  const transaction = await sequelize.transaction();
  // Set once the transaction is committed or rolled back, so the catch below
  // never rolls back a finished one.
  let finished = false;
  const rollback = async () => {
    if (finished) return;
    finished = true;
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      logger.error(`[incident] create rollback failed: ${rollbackError}`);
    }
  };
  try {
    // Plain reads, no locks. A reference deleted after this check fails the
    // insert's FK check, answered below with the same error.
    const invalidRefs = await validateIncidentReferences(
      {
        model_inventory_id: input.model_inventory_id,
        project_id: input.project_id,
        assignee_id: input.assignee_id,
      },
      organizationId,
      transaction,
    );
    // A reporter picked from the users must be a member of the organization;
    // the reporter text becomes their full name. Without one, the text sent
    // (required by validation) is the reporter.
    const reporterName = await reporterNameFor(input.reporter_id, organizationId, transaction);
    if (reporterName === null) invalidRefs.push("reporter_id");
    if (invalidRefs.length > 0) {
      throw new IncidentCreateValidationError(invalidReferenceErrors(invalidRefs));
    }

    // Validation allowed an absent, null or "" approval_status / status:
    // those take the defaults (Pending, Open).
    const approvalStatus =
      actor.canApprove && !isBlankIncidentValue(input.approval_status)
        ? input.approval_status
        : INCIDENT_CREATE_DEFAULTS.approval_status;
    const stamped = approvalStampFor(undefined, approvalStatus) === "stamp" && !!actor.userId;
    // undefined is stored as NULL (createNewIncidentQuery).
    const approvedBy = stamped
      ? await getIncidentApproverName(actor.userId!, organizationId, transaction)
      : undefined;

    const incident = new AIIncidentManagementModel({
      ai_project: input.ai_project,
      model_inventory_id: input.model_inventory_id ?? null,
      project_id: input.project_id ?? null,
      assignee_id: input.assignee_id ?? null,
      type: input.type,
      severity: input.severity,
      status: isBlankIncidentValue(input.status) ? INCIDENT_CREATE_DEFAULTS.status : input.status,
      occurred_date: toIncidentDateValue(input.occurred_date),
      date_detected: toIncidentDateValue(input.date_detected),
      reporter: reporterName ?? input.reporter,
      reporter_id: reporterName ? toIncidentUserId(input.reporter_id) : null,
      approval_status: approvalStatus,
      approved_by: approvedBy,
      approved_by_id: stamped ? actor.userId : null,
      // A list, or the comma-separated string form; validated above.
      categories_of_harm: parseCreateHarmCategories(input.categories_of_harm) as string[],
      affected_persons_groups: input.affected_persons_groups,
      description: input.description,
      relationship_causality: input.relationship_causality,
      immediate_mitigations: input.immediate_mitigations,
      planned_corrective_actions: input.planned_corrective_actions,
      model_system_version: input.model_system_version,
      interim_report: input.interim_report,
      archived: input.archived || false,
      approval_date: stamped ? incidentToday() : undefined,
      approval_notes: actor.canApprove ? input.approval_notes : undefined,
      created_at: new Date(),
      updated_at: new Date(),
    } as Partial<IAIIncidentManagement>);

    const saved = await createNewIncidentQuery(incident, organizationId, transaction);

    // History records the incident as saved (defaults, parsed harm
    // categories and the server's approval fields), not the request.
    if (saved.id && (actor.userId || actor.changedBySystem)) {
      const values = creationHistoryValues(
        (saved.dataValues ?? saved) as unknown as Record<string, unknown>,
        input,
      );
      if (actor.userId) {
        await recordIncidentCreation(saved.id, actor.userId, organizationId, values, transaction);
      } else {
        await recordEntityCreation(
          "incident",
          saved.id,
          null,
          organizationId,
          values,
          transaction,
          true,
        );
      }
    }

    // Phase 6 / issue 3813: the critical incident_response autopilot
    // workflow, only once the incident exists. Never blocks the create.
    if (saved.id && isCriticalIncidentSeverity(saved.severity)) {
      const savedId = saved.id;
      transaction.afterCommit(() => {
        triggerIncidentResponse(organizationId, savedId, saved.severity).catch((err) =>
          logger.error(`[incident] incident_response trigger failed: ${err}`),
        );
      });
    }

    await transaction.commit();
    finished = true;
    return saved;
  } catch (error) {
    await rollback();
    const deletedReference = incidentReferenceFieldFromError(error);
    if (deletedReference) {
      throw new IncidentCreateValidationError(invalidReferenceErrors([deletedReference]));
    }
    throw error;
  }
}

/**
 * Permanently deletes an incident (incident.delete; the caller checks it).
 * In one transaction: a Jira link is marked deleted_in_verifywise, the row is
 * deleted, and a deletion entry ("Incident": Active -> Deleted) is recorded in
 * incident_change_history as `userId`, or as the system with
 * `changedBySystem`. The history table has no foreign key to the incident,
 * so the entry outlives it (and goes to the audit ledger after commit). The
 * `incident_deleted` automation is enqueued only after commit.
 *
 * Returns the deleted row, or null when the incident does not exist in the
 * organization: then nothing is written and nothing is sent.
 */
export async function deleteIncident(
  organizationId: number,
  incidentId: number,
  userId: number | null | undefined,
  options: { changedBySystem?: boolean } = {},
): Promise<Record<string, unknown> | null> {
  const transaction = await sequelize.transaction();
  // Set once the transaction is committed or rolled back, so the catch below
  // never rolls back a finished one.
  let finished = false;
  const rollback = async () => {
    if (finished) return;
    finished = true;
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      logger.error(`[incident] delete rollback failed: ${rollbackError}`);
    }
  };
  try {
    // No SELECT ... FOR UPDATE first: the delete takes the link before the
    // incident, the order the Jira status sync locks them in.
    const deleted = await deleteIncidentByIdQuery(incidentId, organizationId, transaction);
    if (!deleted) {
      await rollback();
      return null;
    }
    if (userId || options.changedBySystem) {
      await recordEntityDeletion(
        "incident",
        incidentId,
        userId ?? null,
        organizationId,
        transaction,
        options.changedBySystem ?? false,
      );
    }
    await transaction.commit();
    finished = true;
    return deleted;
  } catch (error) {
    await rollback();
    throw error;
  }
}
