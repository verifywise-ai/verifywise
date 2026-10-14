import { Request, Response } from "express";
import {
  getAllAgentPrimitivesQuery,
  getAgentPrimitiveByIdQuery,
  createAgentPrimitiveQuery,
  updateAgentPrimitiveQuery,
  deleteAgentPrimitiveByIdQuery,
  updateReviewStatusQuery,
  linkModelQuery,
  unlinkModelQuery,
  getAgentStatsQuery,
  getSyncLogsQuery,
  getLatestSyncStatusQuery,
  createAuditLogQuery,
  getAuditLogsForAgentQuery,
  setAgentOwnersQuery,
  getAgentOwnersQuery,
  getUserIdsInOrganizationQuery,
  lockAgentPrimitiveQuery,
} from "../utils/agentDiscovery.utils";
import { ForeignKeyConstraintError, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logStructured } from "../utils/logger/fileLogger";
import { runAgentDiscoverySyncForTenant } from "../services/agentDiscovery/agentDiscoverySync.service";

import { translateError } from "../utils/i18n.utils";
const fileName = "agentDiscovery.ctrl.ts";

/** Largest value a Postgres INTEGER user id can hold. */
const MAX_USER_ID = 2147483647;

/** Longest text agent_primitives.owner_id can hold (VARCHAR(255)). */
const MAX_OWNER_TEXT_LENGTH = 255;

/** Most owners one agent can have. */
const MAX_OWNERS = 50;
const TOO_MANY_OWNERS = "An agent can have at most 50 owners";

/** True for a decimal string, i.e. something meant as a user id. */
const isUserIdLike = (value: string) => /^\d+$/.test(value.trim());

/**
 * Parse one owner id. Accepts a number or a decimal string; returns null unless
 * it is a positive safe integer that fits a Postgres INTEGER.
 */
function parseOwnerId(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string" && isUserIdLike(value)) {
    n = Number(value.trim());
  } else {
    return null;
  }
  return Number.isSafeInteger(n) && n > 0 && n <= MAX_USER_ID ? n : null;
}

/**
 * The owner change a create or update request asks for.
 * - `set`: `owner_ids` was sent; the full owner set, primary first. An
 *   `owner_id` sent with it must be a user id and is moved to the front.
 * - `primary`: only a numeric `owner_id` was sent; it becomes the primary.
 * - `removePrimary`: only `owner_id: null` (or "") was sent; the primary owner
 *   is removed and the next owner becomes primary.
 * - `text`: only a non-numeric `owner_id` was sent. The old single-owner API
 *   stored any string, so it is kept as the agent's only owner, as free text.
 */
type OwnerChange =
  | { kind: "set"; owners: number[] }
  | { kind: "primary"; owner: number }
  | { kind: "removePrimary" }
  | { kind: "text"; text: string };

/**
 * Read the owner fields of a request. Returns undefined when neither field was
 * sent, or `{ error }` with the message for a 400.
 */
function parseOwnerChange(
  ownerIds: unknown,
  rawOwnerId: unknown,
): OwnerChange | undefined | { error: string } {
  // Free text is stored trimmed; whitespace-only counts as blank, like "".
  const ownerId = typeof rawOwnerId === "string" ? rawOwnerId.trim() : rawOwnerId;
  const ownerIdSent = ownerId !== undefined && ownerId !== null && ownerId !== "";
  if (ownerIds !== undefined) {
    if (ownerIds !== null && !Array.isArray(ownerIds)) {
      return { error: "Owner IDs must be valid user IDs" };
    }
    if (ownerIdSent && parseOwnerId(ownerId) === null) {
      return { error: "owner_id must be a user ID when sent with owner_ids" };
    }
    // Checked before the dedup loop, so an oversized array is never walked.
    if ((ownerIds?.length ?? 0) > MAX_OWNERS) return { error: TOO_MANY_OWNERS };
    const owners: number[] = [];
    for (const value of [...(ownerIdSent ? [ownerId] : []), ...(ownerIds ?? [])]) {
      const n = parseOwnerId(value);
      if (n === null) return { error: "Owner IDs must be valid user IDs" };
      if (!owners.includes(n)) owners.push(n);
    }
    // An owner_id sent alongside 50 other owners would make 51.
    if (owners.length > MAX_OWNERS) return { error: TOO_MANY_OWNERS };
    return { kind: "set", owners };
  }
  if (ownerId === undefined) return undefined;
  if (!ownerIdSent) return { kind: "removePrimary" };
  if (typeof ownerId === "string" && !isUserIdLike(ownerId)) {
    if (ownerId.length > MAX_OWNER_TEXT_LENGTH) {
      return { error: "owner_id must be at most 255 characters" };
    }
    return { kind: "text", text: ownerId };
  }
  const owner = parseOwnerId(ownerId);
  return owner === null
    ? { error: "Owner IDs must be valid user IDs" }
    : { kind: "primary", owner };
}

/**
 * The owner rows an agent has after a user-id change (any kind but `text`),
 * given its current rows (primary first).
 */
function ownersAfterChange(change: Exclude<OwnerChange, { kind: "text" }>, current: number[]) {
  switch (change.kind) {
    case "set":
      return change.owners;
    case "primary":
      // The new primary replaces the old one; the other owners stay.
      return [change.owner, ...current.slice(1).filter((u) => u !== change.owner)];
    case "removePrimary":
      return current.slice(1);
  }
}

/**
 * An agent's owners as shown and audited, primary first. The
 * agent_primitive_owners rows are the source of truth. The legacy owner_id
 * column stands in only when there are none and it is not a manual agent's
 * user id: a synced agent's source-reported owner, or free text a manual agent
 * got from the old single-owner API. (A manual agent's numeric owner_id with
 * no rows names someone who is not a user of the organization.)
 */
function effectiveOwners(
  owners: number[],
  agent: { owner_id: string | null; is_manual: boolean },
): string[] {
  if (owners.length > 0) return owners.map(String);
  if (!agent.owner_id) return [];
  if (agent.is_manual && isUserIdLike(agent.owner_id)) return [];
  return [agent.owner_id];
}

/**
 * An owner set as stored in the audit log: a JSON array of strings (user ids
 * and source or free-text owners), or null when there are none. JSON rather
 * than a comma-joined list, so an owner like "Doe, Jane" stays one owner.
 */
function ownerAuditValue(owners: string[]): string | null {
  return owners.length > 0 ? JSON.stringify(owners) : null;
}

/** True when every id in `ownerIds` belongs to a user of the organization. */
async function ownersBelongToOrganization(
  ownerIds: number[],
  organizationId: number,
  transaction?: Transaction,
): Promise<boolean> {
  if (ownerIds.length === 0) return true;
  const found = await getUserIdsInOrganizationQuery(ownerIds, organizationId, transaction);
  return ownerIds.every((id) => found.includes(id));
}

/**
 * True for a foreign-key violation on agent_primitive_owners.user_id: an owner
 * whose user was deleted after the membership check, before the insert.
 */
function isOwnerUserForeignKeyViolation(error: unknown): boolean {
  const err = error as {
    index?: string;
    table?: string;
    parent?: { code?: string; constraint?: string; table?: string };
  } | null;
  const isFkViolation = error instanceof ForeignKeyConstraintError || err?.parent?.code === "23503";
  if (!isFkViolation) return false;
  const table = err?.table ?? err?.parent?.table;
  const constraint = err?.index ?? err?.parent?.constraint ?? "";
  return table === "agent_primitive_owners" && constraint.includes("user_id");
}

const sameOwnerSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

/**
 * Get all agent primitives with optional filters
 */
export async function getAllAgentPrimitives(req: Request, res: Response) {
  const functionName = "getAllAgentPrimitives";
  logStructured("processing", "fetching all agent primitives", functionName, fileName);

  try {
    const filters = {
      review_status: req.query.review_status as string | undefined,
      source_system: req.query.source_system as string | undefined,
      primitive_type: req.query.primitive_type as string | undefined,
      is_stale: req.query.is_stale !== undefined ? req.query.is_stale === "true" : undefined,
      search: req.query.search as string | undefined,
    };

    // The list page shows each agent's owners, so attach the owner sets.
    const primitives = await getAllAgentPrimitivesQuery(req.organizationId!, filters, {
      includeOwners: true,
    });
    logStructured(
      "successful",
      `found ${primitives.length} agent primitives`,
      functionName,
      fileName,
    );
    return res.status(200).json(STATUS_CODE[200](primitives));
  } catch (error) {
    logStructured("error", "failed to retrieve agent primitives", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get agent stats (counts by status)
 */
export async function getAgentStats(req: Request, res: Response) {
  const functionName = "getAgentStats";
  logStructured("processing", "fetching agent stats", functionName, fileName);

  try {
    const stats = await getAgentStatsQuery(req.organizationId!);
    logStructured("successful", "agent stats retrieved", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](stats));
  } catch (error) {
    logStructured("error", "failed to retrieve agent stats", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get sync logs
 */
export async function getSyncLogs(req: Request, res: Response) {
  const functionName = "getSyncLogs";
  logStructured("processing", "fetching sync logs", functionName, fileName);

  try {
    const logs = await getSyncLogsQuery(req.organizationId!);
    logStructured("successful", "sync logs retrieved", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](logs));
  } catch (error) {
    logStructured("error", "failed to retrieve sync logs", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get latest sync status
 */
export async function getSyncStatus(req: Request, res: Response) {
  const functionName = "getSyncStatus";
  logStructured("processing", "fetching sync status", functionName, fileName);

  try {
    const status = await getLatestSyncStatusQuery(req.organizationId!);
    logStructured("successful", "sync status retrieved", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](status));
  } catch (error) {
    logStructured("error", "failed to retrieve sync status", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get agent primitive by ID
 */
export async function getAgentPrimitiveById(req: Request, res: Response) {
  const functionName = "getAgentPrimitiveById";
  logStructured("processing", "fetching agent primitive by id", functionName, fileName);

  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid agent primitive ID")));
    }

    const primitive = await getAgentPrimitiveByIdQuery(id, req.organizationId!, {
      includeOwners: true,
    });
    if (!primitive) {
      logStructured("error", "agent primitive not found", functionName, fileName);
      return res.status(404).json(STATUS_CODE[404](req.t!("Agent primitive not found")));
    }

    logStructured("successful", "agent primitive found", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](primitive));
  } catch (error) {
    logStructured("error", "failed to retrieve agent primitive", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Create agent primitive (manual entry)
 */
export async function createAgentPrimitive(req: Request, res: Response) {
  const functionName = "createAgentPrimitive";
  logStructured("processing", "creating agent primitive", functionName, fileName);

  try {
    const {
      display_name,
      primitive_type,
      owner_id,
      owner_ids,
      permissions,
      permission_categories,
      metadata,
    } = req.body;
    if (!display_name || !primitive_type) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("display_name and primitive_type are required")));
    }

    // Owners: an owner_ids array (multi-owner, primary first) and/or the legacy
    // single owner_id, which may also be free text (see parseOwnerChange).
    const change = parseOwnerChange(owner_ids, owner_id);
    if (change && "error" in change) {
      return res.status(400).json(STATUS_CODE[400](req.t!(change.error)));
    }
    const textOwner = change?.kind === "text" ? change.text : null;
    const owners = change && change.kind !== "text" ? ownersAfterChange(change, []) : [];
    const notInOrganization = () =>
      res.status(400).json(STATUS_CODE[400](req.t!("Owners must be users in your organization")));

    const transaction = await sequelize.transaction();
    let primitive;
    try {
      // Checked in the transaction, like an update. A user deleted between this
      // check and the owner insert fails the foreign key, mapped to the same 400.
      if (!(await ownersBelongToOrganization(owners, req.organizationId!, transaction))) {
        await transaction.rollback();
        return notInOrganization();
      }
      primitive = await createAgentPrimitiveQuery(
        {
          display_name,
          primitive_type,
          owner_id: textOwner ?? (owners.length > 0 ? String(owners[0]) : undefined),
          permissions,
          permission_categories,
          metadata,
          source_system: "manual",
          external_id: `manual_${Date.now()}`,
          is_manual: true,
        },
        req.organizationId!,
        transaction,
      );

      if (owners.length > 0) {
        await setAgentOwnersQuery(primitive.id!, owners, req.organizationId!, transaction);
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      if (isOwnerUserForeignKeyViolation(error)) return notInOrganization();
      throw error;
    }
    (primitive as any).owner_ids = owners;

    logStructured("successful", "agent primitive created", functionName, fileName);
    return res.status(201).json(STATUS_CODE[201](primitive));
  } catch (error) {
    logStructured("error", "failed to create agent primitive", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Update a manually-added agent primitive
 */
export async function updateAgentPrimitive(req: Request, res: Response) {
  const functionName = "updateAgentPrimitive";
  logStructured("processing", "updating agent primitive", functionName, fileName);

  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid agent primitive ID")));
    }

    const existing = await getAgentPrimitiveByIdQuery(id, req.organizationId!);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Agent primitive not found")));
    }
    if (!existing.is_manual) {
      return res
        .status(403)
        .json(STATUS_CODE[403](req.t!("Only manually-added agents can be edited")));
    }

    const { display_name, primitive_type, owner_id, owner_ids, metadata } = req.body;

    if (
      display_name === undefined &&
      primitive_type === undefined &&
      owner_id === undefined &&
      owner_ids === undefined &&
      metadata === undefined
    ) {
      return res.status(400).json(STATUS_CODE[400](req.t!("No fields to update")));
    }

    const organizationId = req.organizationId!;
    // What to do with the owners. Undefined when the request leaves them alone
    // (e.g. a name-only edit), so the owner set is never touched.
    const change = parseOwnerChange(owner_ids, owner_id);
    if (change && "error" in change) {
      return res.status(400).json(STATUS_CODE[400](req.t!(change.error)));
    }

    const transaction = await sequelize.transaction();
    let updated;
    try {
      // Lock the agent row so concurrent edits of the owner set serialize.
      const locked = await lockAgentPrimitiveQuery(id, organizationId, transaction);
      if (!locked) {
        // Deleted between the existence check and the lock.
        await transaction.rollback();
        return res.status(404).json(STATUS_CODE[404](req.t!("Agent primitive not found")));
      }
      // Old values for the audit come from the locked row, not from `existing`
      // (read before the lock, so a concurrent edit could have changed it).
      const previousPrimary = locked.owner_id;
      const currentOwners = await getAgentOwnersQuery(id, organizationId, transaction);
      const previousShown = effectiveOwners(currentOwners, {
        owner_id: previousPrimary,
        is_manual: true,
      });

      let newOwners = currentOwners;
      let primaryOwnerId: string | null | undefined;
      let newShown = previousShown;
      if (change) {
        if (change.kind === "text") {
          // A free-text owner replaces every owner: the agent now has one
          // owner, who is not a VerifyWise user.
          newOwners = [];
          primaryOwnerId = change.text;
        } else {
          newOwners = ownersAfterChange(change, currentOwners);
          // Only owners being newly added are checked; current owner rows are
          // removed when their user is deleted, so they are always users.
          const added = newOwners.filter((u) => !currentOwners.includes(u));
          if (!(await ownersBelongToOrganization(added, organizationId, transaction))) {
            await transaction.rollback();
            return res
              .status(400)
              .json(STATUS_CODE[400](req.t!("Owners must be users in your organization")));
          }
          primaryOwnerId = newOwners.length > 0 ? String(newOwners[0]) : null;
        }
        newShown = effectiveOwners(newOwners, { owner_id: primaryOwnerId, is_manual: true });
      }

      updated = await updateAgentPrimitiveQuery(
        id,
        { display_name, primitive_type, owner_id: primaryOwnerId, metadata },
        organizationId,
        transaction,
      );
      if (change) {
        await setAgentOwnersQuery(id, newOwners, organizationId, transaction);
      }
      if (updated) (updated as any).owner_ids = newOwners;

      // One audit row per changed field. A change to the owner set is recorded
      // once, as owner_ids; owner_id is recorded only when the set is the same
      // but the primary owner changed (a reorder).
      const ownerSetChanged = change !== undefined && !sameOwnerSet(previousShown, newShown);
      const fieldsToCheck: Array<{ field: string; oldVal: any; newVal: any }> = [
        { field: "display_name", oldVal: locked.display_name, newVal: display_name },
        { field: "primitive_type", oldVal: locked.primitive_type, newVal: primitive_type },
        {
          field: "owner_ids",
          // A JSON array, so a text owner containing a comma stays one owner.
          oldVal: ownerAuditValue(previousShown),
          newVal: ownerSetChanged ? ownerAuditValue(newShown) : undefined,
        },
        {
          field: "owner_id",
          oldVal: previousPrimary,
          newVal: change !== undefined && !ownerSetChanged ? primaryOwnerId : undefined,
        },
        {
          field: "metadata",
          oldVal: JSON.stringify(locked.metadata),
          newVal: metadata !== undefined ? JSON.stringify(metadata) : undefined,
        },
      ];

      for (const { field, oldVal, newVal } of fieldsToCheck) {
        if (newVal !== undefined && String(oldVal ?? "") !== String(newVal ?? "")) {
          await createAuditLogQuery(
            {
              agent_primitive_id: id,
              action: "field_updated",
              field_changed: field,
              old_value: oldVal != null ? String(oldVal) : null,
              new_value: newVal != null ? String(newVal) : null,
              performed_by: req.userId!,
            },
            organizationId,
            transaction,
          );
        }
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      // A newly added owner deleted between the membership check and the insert.
      if (isOwnerUserForeignKeyViolation(error)) {
        return res
          .status(400)
          .json(STATUS_CODE[400](req.t!("Owners must be users in your organization")));
      }
      throw error;
    }

    logStructured("successful", "agent primitive updated", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    logStructured("error", "failed to update agent primitive", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Trigger sync for the requesting user's org
 */
export async function triggerSync(req: Request, res: Response) {
  const functionName = "triggerSync";
  logStructured("processing", "triggering agent discovery sync", functionName, fileName);

  try {
    const result = await runAgentDiscoverySyncForTenant(req.organizationId!);
    logStructured("successful", "agent discovery sync completed", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured("error", "failed to trigger sync", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Review an agent primitive (confirm/reject)
 */
export async function reviewAgentPrimitive(req: Request, res: Response) {
  const functionName = "reviewAgentPrimitive";
  logStructured("processing", "reviewing agent primitive", functionName, fileName);

  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid agent primitive ID")));
    }

    const { review_status } = req.body;
    if (!review_status || !["confirmed", "rejected", "unreviewed"].includes(review_status)) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            req.t!("review_status must be 'confirmed', 'rejected', or 'unreviewed'"),
          ),
        );
    }

    const existing = await getAgentPrimitiveByIdQuery(id, req.organizationId!);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Agent primitive not found")));
    }

    const primitive = await updateReviewStatusQuery(
      id,
      review_status,
      req.userId!,
      req.organizationId!,
    );

    await createAuditLogQuery(
      {
        agent_primitive_id: id,
        action: "review_status_changed",
        field_changed: "review_status",
        old_value: existing.review_status,
        new_value: review_status,
        performed_by: req.userId!,
      },
      req.organizationId!,
    );

    logStructured(
      "successful",
      `agent primitive reviewed as ${review_status}`,
      functionName,
      fileName,
    );
    return res.status(200).json(STATUS_CODE[200](primitive));
  } catch (error) {
    logStructured("error", "failed to review agent primitive", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Link agent primitive to a model inventory item
 */
export async function linkModelToAgent(req: Request, res: Response) {
  const functionName = "linkModelToAgent";
  logStructured("processing", "linking model to agent", functionName, fileName);

  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid agent primitive ID")));
    }

    const { model_id } = req.body;
    if (!model_id) {
      return res.status(400).json(STATUS_CODE[400](req.t!("model_id is required")));
    }

    const existing = await getAgentPrimitiveByIdQuery(id, req.organizationId!);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Agent primitive not found")));
    }

    const primitive = await linkModelQuery(id, model_id, req.organizationId!);

    await createAuditLogQuery(
      {
        agent_primitive_id: id,
        action: "model_linked",
        field_changed: "linked_model_inventory_id",
        old_value: existing.linked_model_inventory_id?.toString() || null,
        new_value: model_id.toString(),
        performed_by: req.userId!,
      },
      req.organizationId!,
    );

    logStructured("successful", "model linked to agent", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](primitive));
  } catch (error) {
    logStructured("error", "failed to link model to agent", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Unlink model from agent primitive
 */
export async function unlinkModelFromAgent(req: Request, res: Response) {
  const functionName = "unlinkModelFromAgent";
  logStructured("processing", "unlinking model from agent", functionName, fileName);

  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid agent primitive ID")));
    }

    const existing = await getAgentPrimitiveByIdQuery(id, req.organizationId!);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Agent primitive not found")));
    }

    const primitive = await unlinkModelQuery(id, req.organizationId!);

    await createAuditLogQuery(
      {
        agent_primitive_id: id,
        action: "model_unlinked",
        field_changed: "linked_model_inventory_id",
        old_value: existing.linked_model_inventory_id?.toString() || null,
        new_value: null,
        performed_by: req.userId!,
      },
      req.organizationId!,
    );

    logStructured("successful", "model unlinked from agent", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](primitive));
  } catch (error) {
    logStructured("error", "failed to unlink model from agent", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get audit logs for an agent primitive
 */
export async function getAgentAuditLogs(req: Request, res: Response) {
  const functionName = "getAgentAuditLogs";
  logStructured("processing", "fetching agent audit logs", functionName, fileName);

  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid agent primitive ID")));
    }

    const logs = await getAuditLogsForAgentQuery(id, req.organizationId!);
    logStructured("successful", `found ${logs.length} audit logs`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](logs));
  } catch (error) {
    logStructured("error", "failed to retrieve agent audit logs", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Delete agent primitive by ID
 */
export async function deleteAgentPrimitiveById(req: Request, res: Response) {
  const functionName = "deleteAgentPrimitiveById";
  logStructured("processing", "deleting agent primitive", functionName, fileName);

  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid agent primitive ID")));
    }

    await deleteAgentPrimitiveByIdQuery(id, req.organizationId!);
    logStructured("successful", "agent primitive deleted", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200]({ deleted: true }));
  } catch (error) {
    logStructured("error", "failed to delete agent primitive", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
