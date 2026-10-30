import { getEntityChangeHistory } from "../utils/changeHistory.base.utils";
import { EntityType } from "../config/changeHistory.config";
import { createChangeHistoryHandler } from "./changeHistoryHandler";

/**
 * Read paths for the framework control history written since #4977: EU AI Act
 * controls and subcontrols, and ISO 42001 annex categories. All three use the
 * generic change-history tables.
 */
const handlerFor = (entityType: EntityType, invalidIdMessage: string, functionName: string) =>
  createChangeHistoryHandler({
    subject: entityType,
    invalidIdMessage,
    functionName,
    fileName: "frameworkControlChangeHistory.ctrl.ts",
    fetchHistory: (organizationId, id, limit, offset) =>
      getEntityChangeHistory(entityType, id, organizationId, limit, offset),
  });

export const getControlEUChangeHistoryById = handlerFor(
  "control_eu",
  "Invalid control ID",
  "getControlEUChangeHistoryById",
);

export const getSubcontrolEUChangeHistoryById = handlerFor(
  "subcontrol_eu",
  "Invalid subcontrol ID",
  "getSubcontrolEUChangeHistoryById",
);

export const getAnnexCategoryChangeHistoryById = handlerFor(
  "annex_category",
  "Invalid annex category ID",
  "getAnnexCategoryChangeHistoryById",
);
