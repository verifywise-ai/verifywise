import { Request, Response } from "express";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  createPolicyLinkedObjectQuery,
  deletePolicyLinkedObjectQuery,
  getAllPolicyLinkedObjectsQuery,
  getPolicyLinkedObjectByIdQuery,
} from "../utils/policyLinkedObject.utils";
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { assertOrgOwnsIds, parseBulkIds } from "../utils/bulkAction.utils";
import {
  ForbiddenException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";

import { translateError } from "../utils/i18n.utils";

/** The object types a policy can link to, and the table each id lives in. */
const LINKABLE_OBJECT_TABLES = new Map<string, string>([
  ["risk", "risks"],
  ["evidence", "files"],
]);
/**
 * GET /policies/:policyId/linked-objects
 */

export async function getAllLinkedObjects(req: Request, res: Response) {
  logStructured(
    "processing",
    "starting getAllLinkedObjects",
    "getAllLinkedObjects",
    "policyLinkedObjects.ctrl.ts",
  );
  logger.debug("🔍 Fetching all linked objects");

  try {
    const tenant = req.organizationId!;
    const rows = await getAllPolicyLinkedObjectsQuery(tenant);

    const grouped = rows.reduce(
      (acc, row: any) => {
        switch (row.object_type) {
          case "control":
            acc.controls.push(row);
            break;
          case "risk":
            acc.risks.push(row);
            break;
          case "evidence":
            acc.evidence.push(row);
            break;
        }
        return acc;
      },
      {
        controls: [] as any[],
        risks: [] as any[],
        evidence: [] as any[],
      },
    );

    logStructured(
      "successful",
      rows.length > 0 ? "linked objects found" : "no linked objects found",
      "getAllLinkedObjects",
      "policyLinkedObjects.ctrl.ts",
    );

    logger.debug(
      `✅ Linked objects fetched: controls=${grouped.controls.length}, risks=${grouped.risks.length}, evidence=${grouped.evidence.length}`,
    );

    return res.status(200).json(STATUS_CODE[200](grouped));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve linked objects",
      "getAllLinkedObjects",
      "policyLinkedObjects.ctrl.ts",
    );
    logger.error("❌ Error in getAllLinkedObjects:", error);

    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function getLinkedObjects(req: Request, res: Response) {
  const policyId = parseInt(
    Array.isArray(req.params.policyId) ? req.params.policyId[0] : req.params.policyId,
  );

  logStructured(
    "processing",
    `Fetching linked objects for policy ${policyId}`,
    "getLinkedObjects",
    "policyLinkedObjects.ctrl.ts",
  );
  logger.debug(`🔍 Fetching linked objects for policy ${policyId}`);

  try {
    const tenant = req.organizationId!;
    const rows = await getPolicyLinkedObjectByIdQuery(policyId, tenant);

    const grouped = rows.reduce(
      (acc, row: any) => {
        switch (row.object_type) {
          case "control":
            acc.controls.push(row);
            break;
          case "risk":
            acc.risks.push(row);
            break;
          case "evidence":
            acc.evidence.push(row);
            break;
        }
        return acc;
      },
      {
        controls: [] as any[],
        risks: [] as any[],
        evidence: [] as any[],
      },
    );

    logStructured(
      "successful",
      `linked objects fetched for policy ${policyId}`,
      "getLinkedObjects",
      "policyLinkedObjects.ctrl.ts",
    );
    logger.debug(
      `✅ Linked objects fetched: controls=${grouped.controls.length}, risks=${grouped.risks.length}, evidence=${grouped.evidence.length}`,
    );

    return res.status(200).json(STATUS_CODE[200](grouped));
  } catch (error) {
    logStructured(
      "error",
      "failed to fetch linked objects",
      "getLinkedObjects",
      "policyLinkedObjects.ctrl.ts",
    );
    logger.error("❌ Error in getLinkedObjects:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * POST /policies/:policyId/linked-objects
 */
export async function createLinkedObject(req: Request, res: Response) {
  const policyId = parseInt(
    Array.isArray(req.params.policyId) ? req.params.policyId[0] : req.params.policyId,
  );
  const { object_type, object_id, object_ids } = req.body ?? {};

  logger.debug(`🔗 Linking ${object_type} to policy ${policyId}`);

  let transaction: Transaction | null = null;

  try {
    const tenant = req.organizationId!;

    const table = LINKABLE_OBJECT_TABLES.get(String(object_type));
    if (!table) {
      return res.status(400).json(STATUS_CODE[400](req.t!("object_type must be risk or evidence")));
    }
    // Single id (old clients) and/or a list (new clients), de-duplicated.
    const requestedIds = parseBulkIds(
      [
        ...(object_id !== undefined && object_id !== null ? [object_id] : []),
        ...(Array.isArray(object_ids) ? object_ids : []),
      ],
      { field: "object_ids" },
    );

    transaction = await sequelize.transaction();

    const policyRows = await sequelize.query(
      `SELECT id FROM policy_manager WHERE id = :policyId AND organization_id = :organizationId`,
      { replacements: { policyId, organizationId: tenant }, type: QueryTypes.SELECT, transaction },
    );
    if (policyRows.length === 0) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](null));
    }

    await assertOrgOwnsIds({ table, ids: requestedIds, organizationId: tenant, transaction });

    const existingRows = (await sequelize.query(
      `SELECT object_id FROM policy_linked_objects
       WHERE organization_id = :organizationId AND policy_id = :policyId
         AND object_type = :objectType AND object_id IN (:ids)`,
      {
        replacements: {
          organizationId: tenant,
          policyId,
          objectType: object_type,
          ids: requestedIds,
        },
        type: QueryTypes.SELECT,
        transaction,
      },
    )) as { object_id: number }[];
    const alreadyLinked = new Set(existingRows.map((r) => Number(r.object_id)));
    const newIds = requestedIds.filter((id) => !alreadyLinked.has(id));

    for (const id of newIds) {
      await createPolicyLinkedObjectQuery(policyId, object_type, id, tenant, transaction);
    }

    await transaction.commit();

    return res.status(newIds.length > 0 ? 201 : 200).json({
      message: req.t!("Linked successfully"),
      linked: newIds.length,
    });
  } catch (error: any) {
    if (transaction) await transaction.rollback();
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }
    if (error instanceof ForbiddenException) {
      return res.status(403).json(STATUS_CODE[403](translateError(req, error)));
    }
    logger.error("❌ Error in createLinkedObject:", error);
    return res.status(500).json(STATUS_CODE[500](req.t!("Internal server error")));
  }
}

export async function deleteRiskFromAllPolicies(req: Request, res: Response) {
  const riskId = parseInt(
    Array.isArray(req.params.riskId) ? req.params.riskId[0] : req.params.riskId,
  );

  logStructured(
    "processing",
    `Deleting risk ${riskId} from all policies`,
    "deleteRiskFromAllPolicies",
    "policyLinkedObjects.ctrl.ts",
  );

  let transaction: Transaction | null = null;

  try {
    const organizationId = req.organizationId!;
    transaction = await sequelize.transaction();

    await sequelize.query(
      `DELETE FROM policy_linked_objects
       WHERE organization_id = :organizationId AND object_id = :riskId AND object_type = 'risk'`,
      {
        replacements: { organizationId, riskId },
        transaction,
      },
    );

    await transaction.commit();

    logStructured(
      "successful",
      `Risk ${riskId} removed from all policies`,
      "deleteRiskFromAllPolicies",
      "policyLinkedObjects.ctrl.ts",
    );

    return res
      .status(200)
      .json(STATUS_CODE[200](req.t!("Risk unlinked from all policies successfully")));
  } catch (error) {
    if (transaction) await transaction.rollback();
    logStructured(
      "error",
      "failed to unlink risk from all policies",
      "deleteRiskFromAllPolicies",
      "policyLinkedObjects.ctrl.ts",
    );
    logger.error("❌ Error in deleteRiskFromAllPolicies:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function deleteEvidenceFromAllPolicies(req: Request, res: Response) {
  const evidenceId = parseInt(
    Array.isArray(req.params.evidenceId) ? req.params.evidenceId[0] : req.params.evidenceId,
  );

  let transaction: Transaction | null = null;

  try {
    const organizationId = req.organizationId!;
    transaction = await sequelize.transaction();

    await sequelize.query(
      `DELETE FROM policy_linked_objects
       WHERE organization_id = :organizationId AND object_id = :evidenceId AND object_type = 'evidence'`,
      {
        replacements: { organizationId, evidenceId },
        transaction,
      },
    );

    await transaction.commit();

    return res
      .status(200)
      .json(STATUS_CODE[200](req.t!("Evidence unlinked from all policies successfully")));
  } catch (error) {
    if (transaction) await transaction.rollback();
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * DELETE /policies/:policyId/linked-objects
 */
export async function deleteLinkedObject(req: Request, res: Response) {
  const id = parseInt(
    Array.isArray(req.params.policyId) ? req.params.policyId[0] : req.params.policyId,
  );
  logStructured(
    "processing",
    `Deleting link for policy ${id}`,
    "deleteLinkedObject",
    "policyLinkedObjects.ctrl.ts",
  );
  logger.debug(`🗑️ Unlinking ${id} ($ from policy ${id}`);

  let transaction: Transaction | null = null;

  try {
    const tenant = req.organizationId!;
    transaction = await sequelize.transaction();

    await deletePolicyLinkedObjectQuery(id, tenant, transaction);

    await transaction.commit();

    logStructured(
      "successful",
      `link removed for policy ${id}`,
      "deleteLinkedObject",
      "policyLinkedObjects.ctrl.ts",
    );
    logger.debug(`✅ Link removed for policy ${id}`);

    return res.status(200).json(STATUS_CODE[200](req.t!("Unlinked successfully")));
  } catch (error) {
    if (transaction) await transaction.rollback();

    logStructured(
      "error",
      "failed to unlink object",
      "deleteLinkedObject",
      "policyLinkedObjects.ctrl.ts",
    );
    logger.error("❌ Error in deleteLinkedObject:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
