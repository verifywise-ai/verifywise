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
} from "../utils/agentDiscovery.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logStructured } from "../utils/logger/fileLogger";
import { runAgentDiscoverySyncForTenant } from "../services/agentDiscovery/agentDiscoverySync.service";

const fileName = "agentDiscovery.ctrl.ts";

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

    const primitives = await getAllAgentPrimitivesQuery(req.organizationId!, filters);
    logStructured("successful", `found ${primitives.length} agent primitives`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](primitives));
  } catch (error) {
    logStructured("error", "failed to retrieve agent primitives", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
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
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
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
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
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
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
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
      return res.status(400).json(STATUS_CODE[400]("Invalid agent primitive ID"));
    }

    const primitive = await getAgentPrimitiveByIdQuery(id, req.organizationId!);
    if (!primitive) {
      logStructured("error", "agent primitive not found", functionName, fileName);
      return res.status(404).json(STATUS_CODE[404]("Agent primitive not found"));
    }

    logStructured("successful", "agent primitive found", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](primitive));
  } catch (error) {
    logStructured("error", "failed to retrieve agent primitive", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Create agent primitive (manual entry)
 */
export async function createAgentPrimitive(req: Request, res: Response) {
  const functionName = "createAgentPrimitive";
  logStructured("processing", "creating agent primitive", functionName, fileName);

  try {
    const { display_name, primitive_type, owner_id, permissions, permission_categories, metadata } = req.body;
    if (!display_name || !primitive_type) {
      return res.status(400).json(STATUS_CODE[400]("display_name and primitive_type are required"));
    }

    const primitive = await createAgentPrimitiveQuery(
      {
        display_name,
        primitive_type,
        owner_id,
        permissions,
        permission_categories,
        metadata,
        source_system: "manual",
        external_id: `manual_${Date.now()}`,
        is_manual: true,
      },
      req.organizationId!
    );

    logStructured("successful", "agent primitive created", functionName, fileName);
    return res.status(201).json(STATUS_CODE[201](primitive));
  } catch (error) {
    logStructured("error", "failed to create agent primitive", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
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
      return res.status(400).json(STATUS_CODE[400]("Invalid agent primitive ID"));
    }

    const existing = await getAgentPrimitiveByIdQuery(id, req.organizationId!);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404]("Agent primitive not found"));
    }
    if (!existing.is_manual) {
      return res.status(403).json(STATUS_CODE[403]("Only manually-added agents can be edited"));
    }

    const { display_name, primitive_type, owner_id, metadata } = req.body;

    if (display_name === undefined && primitive_type === undefined && owner_id === undefined && metadata === undefined) {
      return res.status(400).json(STATUS_CODE[400]("No fields to update"));
    }

    const updated = await updateAgentPrimitiveQuery(
      id,
      { display_name, primitive_type, owner_id, metadata },
      req.organizationId!
    );

    // Create audit log entries for each changed field
    const fieldsToCheck: Array<{ field: string; oldVal: any; newVal: any }> = [
      { field: "display_name", oldVal: existing.display_name, newVal: display_name },
      { field: "primitive_type", oldVal: existing.primitive_type, newVal: primitive_type },
      { field: "owner_id", oldVal: existing.owner_id, newVal: owner_id },
      { field: "metadata", oldVal: JSON.stringify(existing.metadata), newVal: metadata !== undefined ? JSON.stringify(metadata) : undefined },
    ];

    for (const { field, oldVal, newVal } of fieldsToCheck) {
      if (newVal !== undefined && String(oldVal ?? "") !== String(newVal ?? "")) {
        await createAuditLogQuery({
          agent_primitive_id: id,
          action: "field_updated",
          field_changed: field,
          old_value: oldVal != null ? String(oldVal) : null,
          new_value: newVal != null ? String(newVal) : null,
          performed_by: req.userId!,
        }, req.organizationId!);
      }
    }

    logStructured("successful", "agent primitive updated", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    logStructured("error", "failed to update agent primitive", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
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
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
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
      return res.status(400).json(STATUS_CODE[400]("Invalid agent primitive ID"));
    }

    const { review_status } = req.body;
    if (!review_status || !["confirmed", "rejected", "unreviewed"].includes(review_status)) {
      return res.status(400).json(STATUS_CODE[400]("review_status must be 'confirmed', 'rejected', or 'unreviewed'"));
    }

    const existing = await getAgentPrimitiveByIdQuery(id, req.organizationId!);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404]("Agent primitive not found"));
    }

    const primitive = await updateReviewStatusQuery(id, review_status, req.userId!, req.organizationId!);

    await createAuditLogQuery({
      agent_primitive_id: id,
      action: "review_status_changed",
      field_changed: "review_status",
      old_value: existing.review_status,
      new_value: review_status,
      performed_by: req.userId!,
    }, req.organizationId!);

    logStructured("successful", `agent primitive reviewed as ${review_status}`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](primitive));
  } catch (error) {
    logStructured("error", "failed to review agent primitive", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
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
      return res.status(400).json(STATUS_CODE[400]("Invalid agent primitive ID"));
    }

    const { model_id } = req.body;
    if (!model_id) {
      return res.status(400).json(STATUS_CODE[400]("model_id is required"));
    }

    const existing = await getAgentPrimitiveByIdQuery(id, req.organizationId!);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404]("Agent primitive not found"));
    }

    const primitive = await linkModelQuery(id, model_id, req.organizationId!);

    await createAuditLogQuery({
      agent_primitive_id: id,
      action: "model_linked",
      field_changed: "linked_model_inventory_id",
      old_value: existing.linked_model_inventory_id?.toString() || null,
      new_value: model_id.toString(),
      performed_by: req.userId!,
    }, req.organizationId!);

    logStructured("successful", "model linked to agent", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](primitive));
  } catch (error) {
    logStructured("error", "failed to link model to agent", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
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
      return res.status(400).json(STATUS_CODE[400]("Invalid agent primitive ID"));
    }

    const existing = await getAgentPrimitiveByIdQuery(id, req.organizationId!);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404]("Agent primitive not found"));
    }

    const primitive = await unlinkModelQuery(id, req.organizationId!);

    await createAuditLogQuery({
      agent_primitive_id: id,
      action: "model_unlinked",
      field_changed: "linked_model_inventory_id",
      old_value: existing.linked_model_inventory_id?.toString() || null,
      new_value: null,
      performed_by: req.userId!,
    }, req.organizationId!);

    logStructured("successful", "model unlinked from agent", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](primitive));
  } catch (error) {
    logStructured("error", "failed to unlink model from agent", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
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
      return res.status(400).json(STATUS_CODE[400]("Invalid agent primitive ID"));
    }

    const logs = await getAuditLogsForAgentQuery(id, req.organizationId!);
    logStructured("successful", `found ${logs.length} audit logs`, functionName, fileName);
    return res.status(200).json(STATUS_CODE[200](logs));
  } catch (error) {
    logStructured("error", "failed to retrieve agent audit logs", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
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
      return res.status(400).json(STATUS_CODE[400]("Invalid agent primitive ID"));
    }

    await deleteAgentPrimitiveByIdQuery(id, req.organizationId!);
    logStructured("successful", "agent primitive deleted", functionName, fileName);
    return res.status(200).json(STATUS_CODE[200]({ deleted: true }));
  } catch (error) {
    logStructured("error", "failed to delete agent primitive", functionName, fileName);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
