import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import logger from "../../utils/logger/fileLogger";

// --- Read Tools ---

const getPolicyLinkedObjects = async (
  params: { policy_id: number },
  organizationId: number,
): Promise<any> => {
  try {
    // Get all linked objects for the policy
    const linkedObjects = (await sequelize.query(
      `SELECT id, policy_id, object_type, object_id, created_at
       FROM policy_linked_objects
       WHERE policy_id = :policy_id AND organization_id = :organization_id
       ORDER BY created_at DESC`,
      {
        replacements: { policy_id: params.policy_id, organization_id: organizationId },
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
    await sequelize.query(
      `INSERT INTO policy_linked_objects (organization_id, policy_id, object_type, object_id, created_at)
       VALUES (:organization_id, :policy_id, :object_type, :object_id, NOW())
       ON CONFLICT DO NOTHING`,
      {
        replacements: {
          organization_id: organizationId,
          policy_id: params.policy_id,
          object_type: params.object_type,
          object_id: params.object_id,
        },
      },
    );
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
    await sequelize.query(
      `DELETE FROM policy_linked_objects
       WHERE organization_id = :organization_id
       AND policy_id = :policy_id
       AND object_type = :object_type
       AND object_id = :object_id`,
      {
        replacements: {
          organization_id: organizationId,
          policy_id: params.policy_id,
          object_type: params.object_type,
          object_id: params.object_id,
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
