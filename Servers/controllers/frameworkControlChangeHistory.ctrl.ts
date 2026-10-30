import { Request, Response } from "express";
import { getEntityChangeHistory } from "../utils/changeHistory.base.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import { EntityType } from "../config/changeHistory.config";

/**
 * Read paths for the framework control history written since #4977: EU AI Act
 * controls and subcontrols, and ISO 42001 annex categories. All three use the
 * generic change-history tables, so one handler factory serves them.
 */
const historyHandler =
  (entityType: EntityType, invalidIdMessage: string, functionName: string) =>
  async (req: Request, res: Response): Promise<any> => {
    const entityId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

    if (isNaN(entityId) || entityId <= 0) {
      return res.status(400).json(STATUS_CODE[400](req.t!(invalidIdMessage)));
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    logProcessing({
      description: `fetching ${entityType} change history for id: ${entityId} (limit: ${limit}, offset: ${offset})`,
      functionName,
      fileName: "frameworkControlChangeHistory.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
    });

    try {
      const result = await getEntityChangeHistory(
        entityType,
        entityId,
        req.organizationId!,
        limit,
        offset,
      );

      await logSuccess({
        eventType: "Read",
        description: `${entityType} change history retrieved for id: ${entityId} (${result.data.length} entries, hasMore: ${result.hasMore})`,
        functionName,
        fileName: "frameworkControlChangeHistory.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });

      return res.status(200).json(STATUS_CODE[200](result));
    } catch (error) {
      await logFailure({
        eventType: "Read",
        description: `failed to retrieve ${entityType} change history`,
        functionName,
        fileName: "frameworkControlChangeHistory.ctrl.ts",
        error: error as Error,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(500).json(STATUS_CODE[500](req.t!("Failed to retrieve change history")));
    }
  };

export const getControlEUChangeHistoryById = historyHandler(
  "control_eu",
  "Invalid control ID",
  "getControlEUChangeHistoryById",
);

export const getSubcontrolEUChangeHistoryById = historyHandler(
  "subcontrol_eu",
  "Invalid subcontrol ID",
  "getSubcontrolEUChangeHistoryById",
);

export const getAnnexCategoryChangeHistoryById = historyHandler(
  "annex_category",
  "Invalid annex category ID",
  "getAnnexCategoryChangeHistoryById",
);
