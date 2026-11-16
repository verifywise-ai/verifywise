import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import logger from "../../utils/logger/fileLogger";
import {
  hiddenRiskLinksFilter,
  linkObjectsToPolicyQuery,
} from "../../utils/policyLinkedObject.utils";
import { actingRiskViewer } from "./riskFunctions";
import { parseBulkIds } from "../../utils/bulkAction.utils";
import { riskIdVisibilitySql } from "../../utils/riskVisibility.utils";

// --- Read Tools ---

const getPolicyLinkedObjects = async (
  params: { policy_id: number; _userId?: number },
  organizationId: number,
): Promise<any> => {
  try {
    // Get all linked objects for the policy. Like the REST read, a link to a
    // risk the acting user cannot see is left out, from the count too.
    const hidden = hiddenRiskLinksFilter(await actingRiskViewer(params, organizationId));
    const linkedObjects = (await sequelize.query(
      `SELECT id, policy_id, object_type, object_id, created_at
       FROM policy_linked_objects
       WHERE policy_id = :policy_id AND organization_id = :organizationId${hidden.sql}
       ORDER BY created_at DESC`,
      {
        replacements: { policy_id: params.policy_id, organizationId, ...hidden.replacements },
        type: QueryTypes.SELECT,
      },
    )) as any[];

    // Group by object type
    const grouped: Record<string, any[]> = {};
    for (const obj of linkedObjects) {
      const type = obj.object_type;
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push({
        link_id: obj.id,
        object_id: obj.object_id,
        created_at: obj.created_at,
      });
    }

    return {
      policy_id: params.policy_id,
      linked_objects: grouped,
      total_count: linkedObjects.length,
      object_types: Object.keys(grouped),
    };
  } catch (error) {
    logger.error("Error getting policy linked objects:", error);
    throw new Error(
      `Failed to get policy linked objects: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write Tools ---

const agentLinkObjectToPolicy = createWriteToolFn({
  toolName: "agent_link_object_to_policy",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Link ${params.object_type} #${params.object_id} to policy #${params.policy_id}`,
  executeFn: async (params, organizationId) => {
    // Same checks as the REST endpoint: type, policy and object in the org, no duplicates.
    const objectIds = parseBulkIds([params.object_id], { field: "object_id" });
    // A risk the acting user cannot see is answered like an unknown id.
    const viewer = await actingRiskViewer(params, organizationId);
    const transaction = await sequelize.transaction();
    try {
      await linkObjectsToPolicyQuery(
        Number(params.policy_id),
        params.object_type,
        objectIds,
        organizationId,
        transaction,
        viewer,
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    return {
      policy_id: params.policy_id,
      object_type: params.object_type,
      object_id: params.object_id,
      message: "Object linked to policy successfully",
    };
  },
});

const agentUnlinkObjectFromPolicy = createWriteToolFn({
  toolName: "agent_unlink_object_from_policy",
  warningLevel: "warning",
  descriptionFn: (params) =>
    `Unlink ${params.object_type} #${params.object_id} from policy #${params.policy_id}`,
  executeFn: async (params, organizationId) => {
    // A link to a risk the acting user cannot see is treated like a missing
    // link: nothing is deleted and the answer is the same.
    const visibility =
      params.object_type === "risk"
        ? riskIdVisibilitySql(
            "policy_linked_objects.object_id",
            await actingRiskViewer(params, organizationId),
          )
        : { sql: "", replacements: {} };
    const hiddenRisk = visibility.sql ? ` AND ${visibility.sql}` : "";
    await sequelize.query(
      `DELETE FROM policy_linked_objects
       WHERE organization_id = :organizationId
       AND policy_id = :policy_id
       AND object_type = :object_type
       AND object_id = :object_id${hiddenRisk}`,
      {
        replacements: {
          organizationId,
          policy_id: params.policy_id,
          object_type: params.object_type,
          object_id: params.object_id,
          ...visibility.replacements,
        },
      },
    );
    return {
      policy_id: params.policy_id,
      object_type: params.object_type,
      object_id: params.object_id,
      message: "Object unlinked from policy successfully",
    };
  },
});

const availablePolicyLinkedObjectTools: any = {
  get_policy_linked_objects: getPolicyLinkedObjects,
  agent_link_object_to_policy: agentLinkObjectToPolicy,
  agent_unlink_object_from_policy: agentUnlinkObjectFromPolicy,
};

export { availablePolicyLinkedObjectTools };
