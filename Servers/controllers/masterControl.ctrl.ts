/**
 * Controls Hub — master_controls REST controller.
 *
 * Routes wired in `routes/masterControl.route.ts` and registered in
 * `index.ts`. Uses `req.organizationId` from auth middleware for multi-tenant
 * isolation. All mutations are wrapped in a single Sequelize transaction.
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { sequelize } from "../database/db";
import {
  logFailure,
  logProcessing,
  logSuccess,
} from "../utils/logger/logHelper";
import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
} from "../domain.layer/exceptions/custom.exception";
import { MasterControlModel } from "../domain.layer/models/masterControl/masterControl.model";
import { MasterControlFrameworkMappingModel } from "../domain.layer/models/masterControl/masterControlMapping.model";
import {
  hasPropagatableChanges,
  previewPropagation,
  propagateMasterControlUpdate,
  PropagationError,
  type PropagationPayload,
  type PropagationResult,
} from "../services/masterControlPropagation.service";
import { buildMasterControlsCsv } from "../services/masterControlExport.service";
import { importRecommendedMasterControls } from "../services/masterControlSeed.service";
import {
  recordEntityChange,
  recordEntityCreation,
  recordEntityDeletion,
  recordMultipleFieldChanges,
  trackEntityChanges,
} from "../utils/changeHistory.base.utils";
import {
  createMappingQuery,
  createMasterControlQuery,
  deleteMappingQuery,
  deleteMasterControlQuery,
  getAllMasterControlsQuery,
  getFrameworkCatalogQuery,
  getMappingsForMasterQuery,
  getMasterControlByIdQuery,
  updateMasterControlQuery,
} from "../utils/masterControl.utils";

const FILE = "masterControl.ctrl.ts";

export async function getAllMasterControls(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "starting getAllMasterControls",
    functionName: "getAllMasterControls",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    const rows = await getAllMasterControlsQuery(req.organizationId!);
    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${rows.length} master controls`,
      functionName: "getAllMasterControls",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve master controls",
      functionName: "getAllMasterControls",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getMasterControlById(
  req: Request,
  res: Response
): Promise<any> {
  const id = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );
  logProcessing({
    description: `starting getMasterControlById for ID ${id}`,
    functionName: "getMasterControlById",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json(STATUS_CODE[400]("Invalid master control id"));
    }
    const row = await getMasterControlByIdQuery(id, req.organizationId!);
    if (!row) {
      await logSuccess({
        eventType: "Read",
        description: `Master control not found: ID ${id}`,
        functionName: "getMasterControlById",
        fileName: FILE,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({}));
    }
    await logSuccess({
      eventType: "Read",
      description: `Retrieved master control ID ${id}`,
      functionName: "getMasterControlById",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](row));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve master control ID ${id}`,
      functionName: "getMasterControlById",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createMasterControl(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const body = req.body ?? {};
  logProcessing({
    description: "starting createMasterControl",
    functionName: "createMasterControl",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    const model = await MasterControlModel.createNewMasterControl(
      body.title,
      body.description ?? null,
      body.status ?? "Waiting",
      body.risk_review ?? null,
      body.owner ?? null,
      body.reviewer ?? null,
      body.approver ?? null,
      body.due_date ?? null,
      body.implementation_details ?? null,
      false
    );
    await model.validateMasterControlData();

    const created = await createMasterControlQuery(
      model,
      req.organizationId!,
      transaction
    );

    if (req.userId && created.id) {
      await recordEntityCreation(
        "master_control",
        created.id,
        req.userId,
        req.organizationId!,
        body,
        transaction
      );
    }

    await transaction.commit();
    await logSuccess({
      eventType: "Create",
      description: `Created master control: ${created.title} (ID ${created.id})`,
      functionName: "createMasterControl",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](created));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Create",
        description: `Validation failed: ${error.message}`,
        functionName: "createMasterControl",
        fileName: FILE,
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Create",
        description: `Business logic error: ${error.message}`,
        functionName: "createMasterControl",
        fileName: FILE,
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](error.message));
    }
    await logFailure({
      eventType: "Create",
      description: "Failed to create master control",
      functionName: "createMasterControl",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateMasterControl(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const id = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );
  const updateData = req.body ?? {};
  logProcessing({
    description: `starting updateMasterControl for ID ${id}`,
    functionName: "updateMasterControl",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    if (!Number.isFinite(id) || id < 1) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid master control id"));
    }

    const existing = await getMasterControlByIdQuery(id, req.organizationId!);
    if (!existing) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    // Reject mutations on demo rows.
    const instance = new MasterControlModel(existing);
    instance.canBeModified();

    // Track field-level changes BEFORE applying the update so we compare
    // against the persisted snapshot rather than the mutated in-memory one.
    const changes = await trackEntityChanges(
      "master_control",
      instance,
      updateData
    );

    await instance.updateMasterControl(updateData);
    await instance.validateMasterControlData();

    // Pass updateData through directly so the utils' allow-list sees only
    // the keys the client actually sent. Re-packing every column here would
    // turn absent fields into `undefined`, which the SET-builder treats as
    // "present-with-null" and clears NOT NULL columns like title/status.
    const updated = await updateMasterControlQuery(
      id,
      updateData,
      req.organizationId!,
      transaction
    );

    // Build propagation payload from fields that were actually sent AND
    // changed vs the pre-update snapshot.
    const propagationPayload: Partial<PropagationPayload> = {};
    const trackableFields: (keyof PropagationPayload)[] = [
      "status",
      "owner",
      "reviewer",
      "approver",
      "due_date",
      "implementation_details",
    ];
    for (const field of trackableFields) {
      if (field in updateData) {
        const next = (updateData as any)[field];
        const prev = (existing as any)[field];
        if (next !== prev) {
          (propagationPayload as any)[field] = next;
        }
      }
    }

    let propagation: PropagationResult[] = [];
    if (hasPropagatableChanges(propagationPayload)) {
      propagation = await propagateMasterControlUpdate(
        id,
        req.organizationId!,
        propagationPayload,
        transaction
      );
    }

    // Record field-level change history after the update succeeded so the
    // audit log doesn't diverge from the DB state on rollback.
    if (req.userId && changes.length > 0) {
      await recordMultipleFieldChanges(
        "master_control",
        id,
        req.userId,
        req.organizationId!,
        changes,
        transaction
      );
    }

    await transaction.commit();
    await logSuccess({
      eventType: "Update",
      description: `Updated master control ID ${id} (propagated to ${propagation.filter((p) => !p.skipped).length} framework groups)`,
      functionName: "updateMasterControl",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ master: updated, propagation }));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Update",
        description: `Validation failed: ${error.message}`,
        functionName: "updateMasterControl",
        fileName: FILE,
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Update",
        description: `Business logic error: ${error.message}`,
        functionName: "updateMasterControl",
        fileName: FILE,
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](error.message));
    }
    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404](error.message));
    }
    if (error instanceof PropagationError) {
      await logFailure({
        eventType: "Update",
        description: `Propagation failed for master ID ${id}: ${error.message}`,
        functionName: "updateMasterControl",
        fileName: FILE,
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res
        .status(502)
        .json(STATUS_CODE[500]({ error: error.message, context: error.context }));
    }
    await logFailure({
      eventType: "Update",
      description: `Failed to update master control ID ${id}`,
      functionName: "updateMasterControl",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ---------- Bulk Update ----------

interface BulkUpdateRowResult {
  id: number;
  success: boolean;
  master?: any;
  propagation?: PropagationResult[];
  error?: string;
}

/**
 * PATCH /master-controls/bulk — apply the same patch to every listed master.
 *
 * Each master is updated inside its own transaction so a failure on one row
 * (validation, demo-row rejection, propagation error) does not roll back the
 * rows that already succeeded. Returns a per-row result array plus a summary.
 */
export async function bulkUpdateMasterControls(
  req: Request,
  res: Response
): Promise<any> {
  const body = req.body ?? {};
  const ids: number[] = Array.isArray(body.ids) ? body.ids : [];
  const patch = (body.patch ?? {}) as Record<string, unknown>;

  logProcessing({
    description: `starting bulkUpdateMasterControls for ${ids.length} ids`,
    functionName: "bulkUpdateMasterControls",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  if (!ids.length) {
    return res
      .status(400)
      .json(STATUS_CODE[400]("ids must be a non-empty array"));
  }
  if (!ids.every((id) => Number.isFinite(id) && id > 0)) {
    return res
      .status(400)
      .json(STATUS_CODE[400]("ids must all be positive integers"));
  }
  if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) {
    return res.status(400).json(STATUS_CODE[400]("patch body is required"));
  }

  const results: BulkUpdateRowResult[] = [];

  for (const id of ids) {
    const transaction = await sequelize.transaction();
    try {
      const existing = await getMasterControlByIdQuery(id, req.organizationId!);
      if (!existing) {
        await transaction.rollback();
        results.push({ id, success: false, error: "Not found" });
        continue;
      }

      const instance = new MasterControlModel(existing);
      instance.canBeModified();

      const changes = await trackEntityChanges(
        "master_control",
        instance,
        patch
      );

      await instance.updateMasterControl(patch);
      await instance.validateMasterControlData();

      // Pass the sparse patch through directly — see updateMasterControl for
      // why re-packing every column here would null out NOT NULL fields.
      const updated = await updateMasterControlQuery(
        id,
        patch as Parameters<typeof updateMasterControlQuery>[1],
        req.organizationId!,
        transaction
      );

      const propagationPayload: Partial<PropagationPayload> = {};
      const trackableFields: (keyof PropagationPayload)[] = [
        "status",
        "owner",
        "reviewer",
        "approver",
        "due_date",
        "implementation_details",
      ];
      for (const field of trackableFields) {
        if (field in patch) {
          const next = (patch as any)[field];
          const prev = (existing as any)[field];
          if (next !== prev) {
            (propagationPayload as any)[field] = next;
          }
        }
      }

      let propagation: PropagationResult[] = [];
      if (hasPropagatableChanges(propagationPayload)) {
        propagation = await propagateMasterControlUpdate(
          id,
          req.organizationId!,
          propagationPayload,
          transaction
        );
      }

      if (req.userId && changes.length > 0) {
        await recordMultipleFieldChanges(
          "master_control",
          id,
          req.userId,
          req.organizationId!,
          changes,
          transaction
        );
      }

      await transaction.commit();
      results.push({ id, success: true, master: updated, propagation });
    } catch (error) {
      await transaction.rollback();
      const message = (error as Error).message;
      results.push({ id, success: false, error: message });
    }
  }

  const updatedCount = results.filter((r) => r.success).length;
  const failedCount = results.length - updatedCount;

  await logSuccess({
    eventType: "Update",
    description: `Bulk update: ${updatedCount}/${results.length} succeeded`,
    functionName: "bulkUpdateMasterControls",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  return res.status(200).json(
    STATUS_CODE[200]({
      results,
      summary: {
        total: results.length,
        updated: updatedCount,
        failed: failedCount,
      },
    })
  );
}

// ---------- Framework Catalog ----------

/**
 * GET /master-controls/framework-catalog — returns the full list of struct
 * rows for every framework_entity_type so the Mappings tab picker can render
 * real requirement titles instead of asking the user for raw numeric ids.
 * Struct tables are framework metadata (not tenant-scoped).
 */
export async function getFrameworkCatalog(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "starting getFrameworkCatalog",
    functionName: "getFrameworkCatalog",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    const catalog = await getFrameworkCatalogQuery();
    await logSuccess({
      eventType: "Read",
      description: "Retrieved framework catalog",
      functionName: "getFrameworkCatalog",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](catalog));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve framework catalog",
      functionName: "getFrameworkCatalog",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ---------- Recommended Mappings Import ----------

/**
 * POST /master-controls/seed-recommended — import the curated master
 * controls + framework mappings for bootstrap. Every master is created;
 * mappings that cannot be resolved to a struct row are reported back so
 * the UI can surface them.
 */
export async function importRecommendedMappings(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "starting importRecommendedMappings",
    functionName: "importRecommendedMappings",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    const summary = await importRecommendedMasterControls(req.organizationId!);
    await logSuccess({
      eventType: "Create",
      description: `Seed import: ${summary.mastersCreated} masters, ${summary.mappingsCreated} mappings (${summary.mappingsSkipped} skipped)`,
      functionName: "importRecommendedMappings",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](summary));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to import recommended mappings",
      functionName: "importRecommendedMappings",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ---------- CSV Export ----------

/**
 * GET /master-controls/export — streams a CSV of every master control in
 * the current organization, one row per control, with per-framework
 * mapping counts and a semicolon-joined list of mapped entity codes.
 */
export async function exportMasterControlsCsv(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "starting exportMasterControlsCsv",
    functionName: "exportMasterControlsCsv",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    const csv = await buildMasterControlsCsv(req.organizationId!);
    const filename = `master-controls-${new Date().toISOString().slice(0, 10)}.csv`;

    await logSuccess({
      eventType: "Read",
      description: `Exported master controls CSV (${csv.length} bytes)`,
      functionName: "exportMasterControlsCsv",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    return res.status(200).send(csv);
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to export master controls CSV",
      functionName: "exportMasterControlsCsv",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ---------- Propagation Preview ----------

export async function getMasterControlPropagationPreview(
  req: Request,
  res: Response
): Promise<any> {
  const id = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );
  const payload = (req.body ?? {}) as Partial<PropagationPayload>;
  logProcessing({
    description: `starting getMasterControlPropagationPreview for master ID ${id}`,
    functionName: "getMasterControlPropagationPreview",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json(STATUS_CODE[400]("Invalid master control id"));
    }
    const existing = await getMasterControlByIdQuery(id, req.organizationId!);
    if (!existing) return res.status(404).json(STATUS_CODE[404]({}));

    const preview = await previewPropagation(id, req.organizationId!, payload);
    await logSuccess({
      eventType: "Read",
      description: `Propagation preview computed for master ID ${id}: ${preview.length} mapping(s)`,
      functionName: "getMasterControlPropagationPreview",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](preview));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to compute propagation preview for ID ${id}`,
      functionName: "getMasterControlPropagationPreview",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ---------- Mappings ----------

export async function getMasterControlMappings(
  req: Request,
  res: Response
): Promise<any> {
  const id = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );
  logProcessing({
    description: `starting getMasterControlMappings for master ID ${id}`,
    functionName: "getMasterControlMappings",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json(STATUS_CODE[400]("Invalid master control id"));
    }
    const master = await getMasterControlByIdQuery(id, req.organizationId!);
    if (!master) {
      return res.status(404).json(STATUS_CODE[404]({}));
    }
    const mappings = await getMappingsForMasterQuery(id, req.organizationId!);
    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${mappings.length} mappings for master ID ${id}`,
      functionName: "getMasterControlMappings",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](mappings));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve mappings for master ID ${id}`,
      functionName: "getMasterControlMappings",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function addMasterControlMapping(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const masterId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );
  const body = req.body ?? {};
  logProcessing({
    description: `starting addMasterControlMapping for master ID ${masterId}`,
    functionName: "addMasterControlMapping",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    if (!Number.isFinite(masterId) || masterId < 1) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid master control id"));
    }
    const existing = await getMasterControlByIdQuery(masterId, req.organizationId!);
    if (!existing) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    }
    // Reject mapping mutations on demo masters.
    new MasterControlModel(existing).canBeModified();

    const mapping = await MasterControlFrameworkMappingModel.createNewMapping(
      masterId,
      body.framework,
      body.framework_entity_type,
      body.framework_entity_id,
      body.rationale,
      body.coverage,
      body.confidence
    );

    const created = await createMappingQuery(
      mapping,
      req.organizationId!,
      transaction
    );

    if (created && req.userId) {
      await recordEntityChange(
        "master_control",
        masterId,
        "updated",
        req.userId,
        req.organizationId!,
        "mapping",
        undefined,
        mapping.toKey(),
        transaction
      );
    }

    await transaction.commit();

    if (!created) {
      // ON CONFLICT DO NOTHING returned zero rows — mapping already existed.
      await logSuccess({
        eventType: "Create",
        description: `Mapping already exists for master ID ${masterId}`,
        functionName: "addMasterControlMapping",
        fileName: FILE,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200]({ duplicate: true }));
    }

    await logSuccess({
      eventType: "Create",
      description: `Added mapping ${mapping.toKey()} to master ID ${masterId}`,
      functionName: "addMasterControlMapping",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](created));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Create",
        description: `Validation failed: ${error.message}`,
        functionName: "addMasterControlMapping",
        fileName: FILE,
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    if (error instanceof BusinessLogicException) {
      return res.status(403).json(STATUS_CODE[403](error.message));
    }
    await logFailure({
      eventType: "Create",
      description: `Failed to add mapping to master ID ${masterId}`,
      functionName: "addMasterControlMapping",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteMasterControlMapping(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const mappingId = parseInt(
    Array.isArray(req.params.mappingId)
      ? req.params.mappingId[0]
      : req.params.mappingId
  );
  logProcessing({
    description: `starting deleteMasterControlMapping for mapping ID ${mappingId}`,
    functionName: "deleteMasterControlMapping",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    if (!Number.isFinite(mappingId) || mappingId < 1) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid mapping id"));
    }
    const deleted = await deleteMappingQuery(
      mappingId,
      req.organizationId!,
      transaction
    );
    if (!deleted) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    // Verify parent master isn't demo (tenant-scoped check after we know
    // the parent id).
    const parent = await getMasterControlByIdQuery(
      deleted.master_control_id,
      req.organizationId!
    );
    if (parent && parent.is_demo) {
      await transaction.rollback();
      return res
        .status(403)
        .json(STATUS_CODE[403]("Demo master controls cannot be modified"));
    }

    if (req.userId) {
      const key = `${deleted.framework}:${deleted.framework_entity_type}:${deleted.framework_entity_id}`;
      await recordEntityChange(
        "master_control",
        deleted.master_control_id,
        "updated",
        req.userId,
        req.organizationId!,
        "mapping",
        key,
        undefined,
        transaction
      );
    }

    await transaction.commit();
    await logSuccess({
      eventType: "Delete",
      description: `Deleted mapping ID ${mappingId}`,
      functionName: "deleteMasterControlMapping",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](deleted));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof BusinessLogicException) {
      return res.status(403).json(STATUS_CODE[403](error.message));
    }
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete mapping ID ${mappingId}`,
      functionName: "deleteMasterControlMapping",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteMasterControl(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const id = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );
  logProcessing({
    description: `starting deleteMasterControl for ID ${id}`,
    functionName: "deleteMasterControl",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    if (!Number.isFinite(id) || id < 1) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid master control id"));
    }

    const existing = await getMasterControlByIdQuery(id, req.organizationId!);
    if (!existing) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    // Reject deletes on demo rows.
    new MasterControlModel(existing).canBeModified();

    const ok = await deleteMasterControlQuery(
      id,
      req.organizationId!,
      transaction
    );
    if (!ok) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    if (req.userId) {
      await recordEntityDeletion(
        "master_control",
        id,
        req.userId,
        req.organizationId!,
        transaction
      );
    }

    await transaction.commit();
    await logSuccess({
      eventType: "Delete",
      description: `Deleted master control ID ${id}`,
      functionName: "deleteMasterControl",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ id }));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof BusinessLogicException) {
      return res.status(403).json(STATUS_CODE[403](error.message));
    }
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete master control ID ${id}`,
      functionName: "deleteMasterControl",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
