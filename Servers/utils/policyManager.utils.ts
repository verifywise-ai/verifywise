import { Transaction, QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { IPolicy, PolicyTag, PolicyTagsSet } from "../domain.layer/interfaces/i.policy";
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
  transaction?: Transaction,
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
    queryOptions,
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
    },
  );

  return result;
};

export const getAllPoliciesDueSoonQuery = async (organizationId: number, daysAhead: number = 7) => {
  const result = (await sequelize.query(
    `SELECT 
        pm.*,
        array_agg(pm_rev.user_id) AS reviewer_ids
      FROM verifywise.policy_manager AS pm
      INNER JOIN verifywise.policy_manager__assigned_reviewer_ids AS pm_rev
        ON pm.id = pm_rev.policy_manager_id
      WHERE pm.organization_id = :organizationId
        AND pm.next_review_date IS NOT NULL
        AND pm.next_review_date <= NOW() + INTERVAL '${daysAhead} days'
        AND pm.next_review_date >= NOW()
      GROUP BY pm.id
      ORDER BY pm.next_review_date ASC;`,
    {
      replacements: { organizationId },
    },
  )) as [(PolicyManagerModel & { reviewer_ids: number[] })[], number];

  return result[0];
};

export const getPolicyByIdQuery = async (organizationId: number, id: number) => {
  const result = (await sequelize.query(
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
    },
  )) as any[];

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
  transaction: Transaction,
) => {
  verifyPolicyTags(policy.tags || []);

  const ownerId = policy.policy_owner_id ?? null;
  const reviewerIds = (policy.assigned_reviewer_ids || []).filter((id) => id !== ownerId);

  // Insert policy without assigned_reviewer_ids
  const result = (await sequelize.query(
    `INSERT INTO policy_manager (
      organization_id, title, content_html, status, tags, next_review_date, author_id, policy_owner_id, last_updated_by, last_updated_at, is_demo
    ) VALUES (
      :organization_id, :title, :content_html, :status, ARRAY[:tags], :next_review_date, :author_id, :policy_owner_id, :last_updated_by, :last_updated_at, :is_demo
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
        policy_owner_id: ownerId,
        last_updated_by: userId,
        last_updated_at: new Date(),
        is_demo: policy.is_demo || false,
      },
      transaction,
      type: QueryTypes.INSERT,
    },
  )) as any;

  const createdPolicy = result[0][0] as any;
  const policyId = createdPolicy.id;

  // Insert assigned reviewers into mapping table
  if (reviewerIds.length > 0) {
    for (const reviewerId of reviewerIds) {
      await sequelize.query(
        `INSERT INTO policy_manager__assigned_reviewer_ids
         (organization_id, policy_manager_id, user_id)
         VALUES (:organizationId, :policyId, :userId)`,
        {
          replacements: { organizationId, policyId, userId: reviewerId },
          transaction,
        },
      );
    }
  }

  // Add assigned_reviewer_ids to the returned object for consistency
  createdPolicy.assigned_reviewer_ids = reviewerIds;

  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'policy_added' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction },
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
        },
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
      console.warn(`No matching trigger found for key: ${automation["trigger_key"]}`);
    }
  }

  return createdPolicy;
};

export const updatePolicyByIdQuery = async (
  id: number,
  policy: Partial<IPolicy>,
  organizationId: number,
  userId: number,
  transaction: Transaction,
) => {
  const existingPolicy = await getPolicyByIdQuery(organizationId, id);
  const updatePolicy: Partial<Record<keyof IPolicy, any>> & { organizationId?: number } = {};
  const setClause = [
    "title",
    "content_html",
    "status",
    "tags",
    "next_review_date",
    "policy_owner_id",
    "last_updated_by",
    "last_updated_at",
  ]
    .filter((f) => {
      if (f === "last_updated_by" || f === "last_updated_at") {
        return true;
      }

      // policy_owner_id is nullable — accept null/undefined explicitly so the caller can clear it
      if (f === "policy_owner_id") {
        if (policy.policy_owner_id !== undefined) {
          updatePolicy.policy_owner_id = policy.policy_owner_id;
          return true;
        }
        return false;
      }

      if (policy[f as keyof IPolicy] !== undefined && policy[f as keyof IPolicy]) {
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

  // Determine the effective owner after this update so reviewers can be filtered.
  const effectiveOwnerId =
    policy.policy_owner_id !== undefined
      ? policy.policy_owner_id
      : ((existingPolicy[0] as any)?.policy_owner_id ?? null);

  // Handle assigned_reviewer_ids update
  if (policy.assigned_reviewer_ids !== undefined) {
    const reviewerIds = (policy.assigned_reviewer_ids || []).filter(
      (rid) => rid !== effectiveOwnerId,
    );

    // Delete existing reviewer mappings
    await sequelize.query(
      `DELETE FROM policy_manager__assigned_reviewer_ids
       WHERE organization_id = :organizationId AND policy_manager_id = :policyId`,
      {
        replacements: { organizationId, policyId: id },
        transaction,
      },
    );

    // Insert new reviewer mappings
    if (reviewerIds.length > 0) {
      for (const reviewerId of reviewerIds) {
        await sequelize.query(
          `INSERT INTO policy_manager__assigned_reviewer_ids
           (organization_id, policy_manager_id, user_id)
           VALUES (:organizationId, :policyId, :userId)`,
          {
            replacements: { organizationId, policyId: id, userId: reviewerId },
            transaction,
          },
        );
      }
    }
  } else if (policy.policy_owner_id !== undefined && effectiveOwnerId !== null) {
    // Owner changed but reviewers payload not supplied — still remove the owner
    // from the existing reviewers so they never both hold the same user.
    await sequelize.query(
      `DELETE FROM policy_manager__assigned_reviewer_ids
       WHERE organization_id = :organizationId
         AND policy_manager_id = :policyId
         AND user_id = :ownerId`,
      {
        replacements: { organizationId, policyId: id, ownerId: effectiveOwnerId },
        transaction,
      },
    );
  }

  // Get the updated policy with reviewer IDs
  const updatedPolicyResult = await getPolicyByIdQuery(organizationId, id);
  if (!updatedPolicyResult || updatedPolicyResult.length === 0) {
    throw new Error("Policy not found after update");
  }
  const updatedPolicy = updatedPolicyResult[0];
  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'policy_updated' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction },
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
        },
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
      console.warn(`No matching trigger found for key: ${automation["trigger_key"]}`);
    }
  }
  return updatedPolicy;
};

export const deletePolicyByIdQuery = async (
  organizationId: number,
  id: number,
  transaction: Transaction,
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
    },
  );

  const automations = (await sequelize.query(
    `SELECT
      pat.key AS trigger_key,
      paa.key AS action_key,
      a.id AS automation_id,
      aa.*
    FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'policy_deleted' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId }, transaction },
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
        },
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
      console.warn(`No matching trigger found for key: ${automation["trigger_key"]}`);
    }
  }

  return true;
};

/**
 * Validate every tag against the predefined PolicyTag enum.
 * Throws on the first invalid tag so the caller can surface it as a 400.
 */
export const verifyPolicyTagList = (tags: PolicyTag[]): void => {
  for (const tag of tags) {
    if (!PolicyTagsSet.has(tag)) {
      throw new Error(`Invalid policy tag: ${tag}`);
    }
  }
};

/**
 * Bulk archive policies by setting status='Archived' on each row owned by the org.
 * Caller must validate org ownership beforehand (e.g. via assertOrgOwnsIds).
 */
export const bulkArchivePoliciesQuery = async (
  organizationId: number,
  ids: number[],
  userId: number,
  transaction: Transaction,
): Promise<void> => {
  if (ids.length === 0) return;

  await sequelize.query(
    `UPDATE policy_manager
       SET status = :status,
           last_updated_by = :userId,
           last_updated_at = NOW()
     WHERE organization_id = :organizationId
       AND id IN (:ids)`,
    {
      replacements: {
        organizationId,
        ids,
        userId,
        status: "Archived",
      },
      transaction,
    },
  );
};

/**
 * Bulk-replace assigned reviewers for the given policies with a single reviewer.
 * Existing assignments for these (policy_id) rows are removed and one row per
 * policy is inserted, so every selected policy ends up with exactly one
 * assigned reviewer (the supplied `reviewerId`).
 */
export const bulkSetPoliciesReviewerQuery = async (
  organizationId: number,
  ids: number[],
  reviewerId: number,
  transaction: Transaction,
): Promise<void> => {
  if (ids.length === 0) return;

  await sequelize.query(
    `DELETE FROM policy_manager__assigned_reviewer_ids
     WHERE organization_id = :organizationId
       AND policy_manager_id IN (:ids)`,
    { replacements: { organizationId, ids }, transaction },
  );

  // Build a multi-row VALUES list, one per policy id, using indexed bindings.
  const values = ids.map((_, i) => `(:organizationId, :pid_${i}, :reviewerId)`).join(", ");
  const replacements: Record<string, unknown> = { organizationId, reviewerId };
  ids.forEach((id, i) => {
    replacements[`pid_${i}`] = id;
  });

  await sequelize.query(
    `INSERT INTO policy_manager__assigned_reviewer_ids (organization_id, policy_manager_id, user_id)
     VALUES ${values}
     ON CONFLICT (policy_manager_id, user_id) DO NOTHING`,
    { replacements, transaction },
  );

  // Move each policy into "pending_review" so the new reviewer sees it on their queue.
  await sequelize.query(
    `UPDATE policy_manager
       SET review_status = :reviewStatus
     WHERE organization_id = :organizationId
       AND id IN (:ids)`,
    {
      replacements: {
        organizationId,
        ids,
        reviewStatus: "pending_review",
      },
      transaction,
    },
  );
};

/**
 * Bulk replace the `tags` column for the given policies. Tag values must
 * already be validated against PolicyTagsSet (e.g. via verifyPolicyTagList).
 *
 * Uses a JSONB → text[] conversion so empty arrays are handled cleanly
 * without falling into `ARRAY[]` SQL syntax errors.
 */
export const bulkSetPoliciesTagsQuery = async (
  organizationId: number,
  ids: number[],
  tags: PolicyTag[],
  transaction: Transaction,
): Promise<void> => {
  if (ids.length === 0) return;

  await sequelize.query(
    `UPDATE policy_manager
       SET tags = ARRAY(SELECT jsonb_array_elements_text(CAST(:tags AS jsonb)))
     WHERE organization_id = :organizationId
       AND id IN (:ids)`,
    {
      replacements: {
        organizationId,
        ids,
        tags: JSON.stringify(tags),
      },
      transaction,
    },
  );
};
