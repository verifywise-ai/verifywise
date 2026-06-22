import { getEntityChangeHistory } from "../../utils/changeHistory.base.utils";
import { EntityType } from "../../config/changeHistory.config";
import logger from "../../utils/logger/fileLogger";

interface ChangeHistoryParams {
  risk_id?: number;
  vendor_id?: number;
  model_id?: number;
  policy_id?: number;
  incident_id?: number;
  task_id?: number;
  limit?: number;
  offset?: number;
}

const fetchChangeHistory = async (
  entityType: EntityType,
  entityId: number,
  organizationId: number,
  limit?: number,
  offset?: number,
): Promise<{ data: any[]; hasMore: boolean; total: number }> => {
  try {
    const result = await getEntityChangeHistory(
      entityType,
      entityId,
      organizationId,
      limit || 100,
      offset || 0,
    );

    // Return lightweight projections
    return {
      data: result.data.map((entry: any) => ({
        id: entry.id,
        action: entry.action,
        field_name: entry.field_name,
        old_value: entry.old_value,
        new_value: entry.new_value,
        changed_by_user_id: entry.changed_by_user_id,
        user_name: entry.user_name,
        user_surname: entry.user_surname,
        user_email: entry.user_email,
        changed_at: entry.changed_at,
      })),
      hasMore: result.hasMore,
      total: result.total,
    };
  } catch (error) {
    logger.error(`Error fetching ${entityType} change history:`, error);
    throw new Error(
      `Failed to fetch ${entityType} change history: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getRiskChangeHistory = async (params: ChangeHistoryParams, organizationId: number) => {
  return fetchChangeHistory("risk", params.risk_id!, organizationId, params.limit, params.offset);
};

const getVendorChangeHistory = async (params: ChangeHistoryParams, organizationId: number) => {
  return fetchChangeHistory(
    "vendor",
    params.vendor_id!,
    organizationId,
    params.limit,
    params.offset,
  );
};

const getModelChangeHistory = async (params: ChangeHistoryParams, organizationId: number) => {
  return fetchChangeHistory(
    "model_inventory",
    params.model_id!,
    organizationId,
    params.limit,
    params.offset,
  );
};

const getPolicyChangeHistory = async (params: ChangeHistoryParams, organizationId: number) => {
  return fetchChangeHistory(
    "policy",
    params.policy_id!,
    organizationId,
    params.limit,
    params.offset,
  );
};

const getIncidentChangeHistory = async (params: ChangeHistoryParams, organizationId: number) => {
  return fetchChangeHistory(
    "incident",
    params.incident_id!,
    organizationId,
    params.limit,
    params.offset,
  );
};

const getTaskChangeHistory = async (params: ChangeHistoryParams, organizationId: number) => {
  return fetchChangeHistory("task", params.task_id!, organizationId, params.limit, params.offset);
};

const availableChangeHistoryTools: any = {
  get_risk_change_history: getRiskChangeHistory,
  get_vendor_change_history: getVendorChangeHistory,
  get_model_change_history: getModelChangeHistory,
  get_policy_change_history: getPolicyChangeHistory,
  get_incident_change_history: getIncidentChangeHistory,
  get_task_change_history: getTaskChangeHistory,
};

export { availableChangeHistoryTools };
