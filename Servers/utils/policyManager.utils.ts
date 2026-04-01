import { Transaction, QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import {
  IPolicy,
  PolicyTag,
  PolicyTagsSet,
} from "../domain.layer/interfaces/i.policy";
import { PolicyManagerModel } from "../domain.layer/models/policy/policy.model";
import { TenantAutomationActionModel } from "../domain.layer/models/tenantAutomationAction/tenantAutomationAction.model";
import { replaceTemplateVariables } from "./automation/automation.utils";
import { enqueueAutomationAction } from "../services/automations/automationProducer";
import {
  buildPolicyReplacements,
  buildPolicyUpdateReplacements,
} from "./automation/policy.automation.utils";

export type PolicyReviewStatus = "pending_review" | "approved" | "changes_requested";

export const updatePolicyReviewStatusQuery = async (
  organizationId: number,
  policyId: number,
  reviewStatus: PolicyReviewStatus,
  reviewerId: number,
  comment?: string,
  transaction?: Transaction
) => {
  const queryOptions: any = {
    replacements: {
      organizationId,
      reviewStatus,
      reviewerId,
      comment: comment || null,
      reviewedAt: new Date(),
      policyId,
    },
    type: QueryTypes.UPDATE,
  };
  if (transaction) {
    queryOptions.transaction = transaction;
  }

  await sequelize.query(
    `UPDATE policy_manager
     SET review_status = :reviewStatus,
         review_comment = :comment,
         reviewed_by = :reviewerId,
         reviewed_at = :reviewedAt
     WHERE organization_id = :organizationId AND id = :policyId`,
    queryOptions
  );
};

export const getAllPoliciesQuery = async (organizationId: number) => {
  const result = await sequelize.query(
    `SELECT
      pm.*,
      COALESCE(
        ARRAY_AGG(DISTINCT pmr.user_id) FILTER (WHERE pmr.user_id IS NOT NULL),
        ARRAY[]::INTEGER[]
      ) as assigned_reviewer_ids
    FROM policy_manager pm
    LEFT JOIN policy_manager__assigned_reviewer_ids pmr
      ON pm.id = pmr.policy_manager_id AND pmr.organization_id = :organizationId
    WHERE pm.organization_id = :organizationId
    GROUP BY pm.id`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    }
  );

  return result;
};

export const getAllPoliciesDueSoonQuery = async (
  organizationId: number,
  daysAhead: number = 7
) => {
  const result = await sequelize.query(
    `SELECT * FROM policy_manager
     WHERE organization_id = :organizationId
     AND next_review_date IS NOT NULL
     AND next_review_date <= NOW() + INTERVAL '${daysAhead} days'
     AND next_review_date >= NOW()
     ORDER BY next_review_date ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: PolicyManagerModel,
    }
  );

  return result;
};

export const getPolicyByIdQuery = async (organizationId: number, id: number) => {
  const result = await sequelize.query(
    `SELECT
      pm.*,
      COALESCE(
        ARRAY_AGG(DISTINCT pmr.user_id) FILTER (WHERE pmr.user_id IS NOT NULL),
        ARRAY[]::INTEGER[]
      ) as assigned_reviewer_ids
    FROM policy_manager pm
    LEFT JOIN policy_manager__assigned_reviewer_ids pmr
      ON pm.id = pmr.policy_manager_id AND pmr.organization_id = :organizationId
    WHERE pm.organization_id = :organizationId AND pm.id = :id
    GROUP BY pm.id`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.SELECT,
    }
  ) as any[];

  return result;
};

const verifyPolicyTags = (policyTags: PolicyTag[]) => {
  for (const tag of policyTags) {
    if (!PolicyTagsSet.has(tag)) {
      throw new Error(`Invalid policy tag: ${tag}`);
    }
  }
};

export const createPolicyQuery = async (
  policy: IPolicy,
  organizationId: number,
  userId: number,
  transaction: Transaction
) => {
  verifyPolicyTags(policy.tags || []);

  // Insert policy without assigned_reviewer_ids
  const result = await sequelize.query(
    `INSERT INTO policy_manager (
      organization_id, title, content_html, status, tags, next_review_date, author_id, last_updated_by, last_updated_at, is_demo
    ) VALUES (
      :organization_id, :title, :content_html, :status, ARRAY[:tags], :next_review_date, :author_id, :last_updated_by, :last_updated_at, :is_demo
    ) RETURNING *`,
    {
      replacements: {
        organization_id: organizationId,
        title: policy.title,
        content_html: policy.content_html,
        status: policy.status,
        tags: policy.tags,
        next_review_date: policy.next_review_date,
        author_id: userId,
        last_updated_by: userId,
        last_updated_at: new Date(),
        is_demo: policy.is_demo || false,
      },
      transaction,
      type: QueryTypes.INSERT,
    }
  ) as any;

  const createdPolicy = result[0][0] as any;
  const policyId = createdPolicy.id;

  // Insert assigned reviewers into mapping table
  if (policy.assigned_reviewer_ids && policy.assigned_reviewer_ids.length > 0) {
    for (const reviewerId of policy.assigned_reviewer_ids) {
      await sequelize.query(
        `INSERT INTO policy_manager__assigned_reviewer_ids
         (organization_id, policy_manager_id, user_id)
         VALUES (:organizationId, :policyId, :userId)`,
        {
          replacements: { organizationId, policyId, userId: reviewerId },
          transaction,
        }
      );
    }
  }

  // Add assigned_reviewer_ids to the returned object for consistency
  createdPolicy.assigned_reviewer_ids = policy.assigned_reviewer_ids || [];

  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'policy_added' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction }
  )) as [
    (TenantAutomationActionModel & {
      trigger_key: string;
      action_key: string;
      automation_id: number;
    })[],
    number,
  ];
  if (automations[0].length > 0) {
    const automation = automations[0][0];
    if (automation["trigger_key"] === "policy_added") {
      const reviewer_names = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id IN(:reviewer_ids);`,
        {
          replacements: {
            reviewer_ids: createdPolicy.assigned_reviewer_ids || [],
          },
          transaction,
          type: QueryTypes.SELECT,
        }
      )) as { full_name: string }[];

      const params = automation.params!;

      // Build replacements
      const replacements = buildPolicyReplacements({
        ...createdPolicy,
        reviewer_names: reviewer_names.map((r) => r.full_name).join(", "),
      });

      // Replace variables in subject and body
      const processedParams = {
        ...params,
        subject: replaceTemplateVariables(params.subject || "", replacements),
        body: replaceTemplateVariables(params.body || "", replacements),
        automation_id: automation.automation_id,
      };

      // Enqueue with processed params
      await enqueueAutomationAction(automation.action_key, {
        ...processedParams,
        organizationId,
      });
    } else {
      console.warn(
        `No matching trigger found for key: ${automation["trigger_key"]}`
      );
    }
  }

  return createdPolicy;
};

export const updatePolicyByIdQuery = async (
  id: number,
  policy: Partial<IPolicy>,
  organizationId: number,
  userId: number,
  transaction: Transaction
) => {
  const existingPolicy = await getPolicyByIdQuery(organizationId, id);
  const updatePolicy: Partial<Record<keyof IPolicy, any>> & { organizationId?: number } = {};
  const setClause = [
    "title",
    "content_html",
    "status",
    "tags",
    "next_review_date",
    "last_updated_by",
    "last_updated_at",
  ]
    .filter((f) => {
      if (f === "last_updated_by" || f === "last_updated_at") {
        return true;
      }

      if (
        policy[f as keyof IPolicy] !== undefined &&
        policy[f as keyof IPolicy]
      ) {
        if (f === "tags") {
          verifyPolicyTags(policy[f as keyof IPolicy] as PolicyTag[]);
        }
        updatePolicy[f as keyof IPolicy] = policy[f as keyof IPolicy];
        return true;
      }
      return false;
    })
    .map((f) => {
      if (f === "tags") {
        return `${f} = ARRAY[:${f}]`;
      }
      return `${f} = :${f}`;
    })
    .join(", ");

  const query = `UPDATE policy_manager SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

  updatePolicy.id = id;
  updatePolicy.organizationId = organizationId;
  updatePolicy.last_updated_by = userId;
  updatePolicy.last_updated_at = new Date();

  await sequelize.query(query, {
    replacements: updatePolicy,
    transaction,
    type: QueryTypes.UPDATE,
  });

  // Handle assigned_reviewer_ids update
  if (policy.assigned_reviewer_ids !== undefined) {
    // Delete existing reviewer mappings
    await sequelize.query(
      `DELETE FROM policy_manager__assigned_reviewer_ids
       WHERE organization_id = :organizationId AND policy_manager_id = :policyId`,
      {
        replacements: { organizationId, policyId: id },
        transaction,
      }
    );

    // Insert new reviewer mappings
    if (policy.assigned_reviewer_ids && policy.assigned_reviewer_ids.length > 0) {
      for (const reviewerId of policy.assigned_reviewer_ids) {
        await sequelize.query(
          `INSERT INTO policy_manager__assigned_reviewer_ids
           (organization_id, policy_manager_id, user_id)
           VALUES (:organizationId, :policyId, :userId)`,
          {
            replacements: { organizationId, policyId: id, userId: reviewerId },
            transaction,
          }
        );
      }
    }
  }

  // Get the updated policy with reviewer IDs
  const updatedPolicyResult = await getPolicyByIdQuery(organizationId, id);
  if (!updatedPolicyResult || updatedPolicyResult.length === 0) {
    throw new Error('Policy not found after update');
  }
  const updatedPolicy = updatedPolicyResult[0];
  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'policy_updated' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction }
  )) as [
    (TenantAutomationActionModel & {
      trigger_key: string;
      action_key: string;
      automation_id: number;
    })[],
    number,
  ];
  if (automations[0].length > 0) {
    const automation = automations[0][0];
    if (automation["trigger_key"] === "policy_updated") {
      const reviewer_names = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id IN(:reviewer_ids);`,
        {
          replacements: {
            reviewer_ids: (updatedPolicy as any).assigned_reviewer_ids || [],
          },
          transaction,
          type: QueryTypes.SELECT,
        }
      )) as { full_name: string }[];

      const params = automation.params!;

      // Build replacements
      const replacements = buildPolicyUpdateReplacements(existingPolicy[0], {
        ...updatedPolicy,
        reviewer_names: reviewer_names.map((r) => r.full_name).join(", "),
      });

      // Replace variables in subject and body
      const processedParams = {
        ...params,
        subject: replaceTemplateVariables(params.subject || "", replacements),
        body: replaceTemplateVariables(params.body || "", replacements),
        automation_id: automation.automation_id,
      };

      // Enqueue with processed params
      await enqueueAutomationAction(automation.action_key, {
        ...processedParams,
        organizationId,
      });
    } else {
      console.warn(
        `No matching trigger found for key: ${automation["trigger_key"]}`
      );
    }
  }
  return updatedPolicy;
};

export const deletePolicyByIdQuery = async (
  organizationId: number,
  id: number,
  transaction: Transaction
) => {
  // Get policy data with reviewer IDs BEFORE deleting (CASCADE will delete mappings)
  const policyToDelete = await getPolicyByIdQuery(organizationId, id);

  if (!policyToDelete || policyToDelete.length === 0) {
    return false;
  }

  const deletedPolicyData = policyToDelete[0] as any;

  // Delete the policy (CASCADE will handle mapping table deletion)
  await sequelize.query(
    `DELETE FROM policy_manager WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { organizationId, id },
      transaction,
      type: QueryTypes.DELETE,
    }
  );

  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'policy_deleted' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction }
  )) as [
    (TenantAutomationActionModel & {
      trigger_key: string;
      action_key: string;
      automation_id: number;
    })[],
    number,
  ];
  if (automations[0].length > 0) {
    const automation = automations[0][0];
    if (automation["trigger_key"] === "policy_deleted") {
      const reviewer_names = (await sequelize.query(
        `SELECT name || ' ' || surname AS full_name FROM users WHERE id IN(:reviewer_ids);`,
        {
          replacements: {
            reviewer_ids: deletedPolicyData.assigned_reviewer_ids || [],
          },
          transaction,
          type: QueryTypes.SELECT,
        }
      )) as { full_name: string }[];

      const params = automation.params!;

      // Build replacements
      const replacements = buildPolicyReplacements({
        ...deletedPolicyData,
        reviewer_names: reviewer_names.map((r) => r.full_name).join(", "),
      });

      // Replace variables in subject and body
      const processedParams = {
        ...params,
        subject: replaceTemplateVariables(params.subject || "", replacements),
        body: replaceTemplateVariables(params.body || "", replacements),
        automation_id: automation.automation_id,
      };

      // Enqueue with processed params
      await enqueueAutomationAction(automation.action_key, {
        ...processedParams,
        organizationId,
      });
    } else {
      console.warn(
        `No matching trigger found for key: ${automation["trigger_key"]}`
      );
    }
  }

  return true;
};
