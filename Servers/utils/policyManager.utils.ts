import { Transaction, QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { IPolicy, PolicyTag, PolicyTagsSet } from "../domain.layer/interfaces/i.policy";
import {
  enqueueAutomationActions,
  getEventAutomationActionsQuery,
} from "./automation/automationActions.utils";
import {
  buildPolicyReplacements,
  buildPolicyUpdateReplacements,
} from "./automation/policy.automation.utils";
import {
  deleteAllCustomFieldValuesForEntityQuery,
  fetchCustomFieldsForEntities,
} from "./customField.utils";
import { findUsersNotInOrganization, parseReferencedIds } from "./user.utils";
import {
  CLEAR_REVIEW_REMINDERS_ON_DATE_CHANGE_SQL,
  POLICY_REVIEW_DATE_SQL,
  toReviewDateValue,
} from "./policyReviewDate.utils";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

/**
 * Tenant guard for policy owners and reviewers: every id must be a member of
 * the organization, so names and notifications never cross tenants.
 *
 * @throws ValidationException when any id belongs to no member of the organization.
 */
export const assertPolicyUsersInOrganization = async (
  userIds: Array<number | string | null | undefined>,
  field: "policy_owner_id" | "assigned_reviewer_ids" | "reviewer_ids" | "reviewerId",
  organizationId: number,
  transaction?: Transaction,
): Promise<void> => {
  // Fails closed: a malformed id (5.5, "5x") is rejected, never skipped.
  const ids = parseReferencedIds(userIds);
  if (ids !== null && ids.length === 0) return;
  const outside =
    ids === null
      ? userIds
      : await findUsersNotInOrganization(ids, organizationId, transaction ?? null);
  if (outside.length === 0) return;
  if (field === "policy_owner_id") {
    throw new ValidationException(
      "The policy owner must be a member of this organization",
      field,
      outside,
    );
  }
  throw new ValidationException("Reviewers must be members of this organization", field, outside);
};

/**
 * True when the policy exists in the organization. With `lock`, the row is
 * locked FOR UPDATE until the transaction ends, so concurrent writes that
 * depend on the policy (e.g. linking objects) run one after another.
 */
export const policyExistsInOrganizationQuery = async (
  organizationId: number,
  policyId: number,
  transaction?: Transaction,
  lock = false,
): Promise<boolean> => {
  if (!Number.isInteger(policyId) || policyId <= 0) return false;
  const sql = lock
    ? "SELECT id FROM policy_manager WHERE id = :policyId AND organization_id = :organizationId FOR UPDATE"
    : "SELECT id FROM policy_manager WHERE id = :policyId AND organization_id = :organizationId";
  const rows = await sequelize.query(sql, {
    replacements: { policyId, organizationId },
    type: QueryTypes.SELECT,
    transaction,
  });
  return rows.length > 0;
};

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

/**
 * A policy row without the review reminder stamps (P-H3). They are the daily
 * sweep's bookkeeping, not policy data: rows read with `pm.*` or
 * `RETURNING *` pass through here before they leave for the API or the
 * advisor, so responses keep their shape.
 */
export const omitReminderStamps = <T extends Record<string, any>>(
  row: T,
): Omit<T, "due_soon_reminded_at" | "overdue_reminded_at"> => {
  if (!row || typeof row !== "object") return row;
  const { due_soon_reminded_at: _dueSoon, overdue_reminded_at: _overdue, ...rest } = row;
  return rest;
};

export const getAllPoliciesQuery = async (organizationId: number) => {
  const result = (await sequelize.query(
    `SELECT
      pm.*,
      ${POLICY_REVIEW_DATE_SQL},
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
  )) as any[];

  const ids = result.map((p) => p.id).filter((id): id is number => typeof id === "number");
  const customFieldsByPolicy = await fetchCustomFieldsForEntities("policy", ids, organizationId);
  return result.map((p): any => ({
    ...omitReminderStamps(p),
    custom_fields: customFieldsByPolicy.get(p.id) ?? [],
  }));
};

export type PolicyReminderKind = "due_soon" | "overdue";

export interface PolicyReminderDue {
  id: number;
  title: string;
  /** The review day, "YYYY-MM-DD". */
  review_date: string;
  kind: PolicyReminderKind;
  recipient_ids: number[];
}

/** Days before the review date in which a policy counts as due soon. */
export const POLICY_REVIEW_DUE_SOON_DAYS = 7;

const POLICY_REMINDER_COLUMNS: Record<PolicyReminderKind, string> = {
  due_soon: "due_soon_reminded_at",
  overdue: "overdue_reminded_at",
};

const isOrgMember = (userIdSql: string) => `EXISTS (
  SELECT 1 FROM organization_members om
   WHERE om.organization_id = pm.organization_id AND om.user_id = ${userIdSql}
)`;

/**
 * Policies of the organization with a review reminder waiting (P-H3, P-M2):
 * not retired, review day within the next seven days or passed, and that
 * kind not sent yet. The review date is a calendar day stored at midnight, so
 * it is compared by day against CURRENT_DATE, as the training sweep does.
 *
 * Recipients are the owner and the assigned reviewers who are still members
 * of the organization; when there is none, the author, if still a member. A
 * policy nobody can be told about is not returned.
 */
export const findPolicyRemindersDueQuery = async (
  organizationId: number,
): Promise<PolicyReminderDue[]> => {
  return (await sequelize.query(
    `SELECT due.id, due.title, due.review_date, due.kind, due.recipient_ids
       FROM (
         SELECT pm.id, pm.title,
                to_char(pm.next_review_date, 'YYYY-MM-DD') AS review_date,
                CASE WHEN pm.next_review_date::date < CURRENT_DATE
                     THEN 'overdue' ELSE 'due_soon' END AS kind,
                COALESCE(
                  (SELECT array_agg(assigned.user_id ORDER BY assigned.user_id)
                     FROM (
                       SELECT pm.policy_owner_id AS user_id
                       UNION
                       SELECT r.user_id
                         FROM policy_manager__assigned_reviewer_ids r
                        WHERE r.organization_id = pm.organization_id
                          AND r.policy_manager_id = pm.id
                     ) assigned
                    WHERE ${isOrgMember("assigned.user_id")}),
                  (SELECT ARRAY[pm.author_id] WHERE ${isOrgMember("pm.author_id")})
                ) AS recipient_ids
           FROM policy_manager pm
          WHERE pm.organization_id = :organizationId
            AND pm.status IS DISTINCT FROM 'Archived'
            AND pm.status IS DISTINCT FROM 'Deprecated'
            AND pm.next_review_date IS NOT NULL
            AND (
              (pm.next_review_date::date < CURRENT_DATE AND pm.overdue_reminded_at IS NULL)
              OR (
                pm.next_review_date::date BETWEEN CURRENT_DATE
                  AND CURRENT_DATE + ${POLICY_REVIEW_DUE_SOON_DAYS}
                AND pm.due_soon_reminded_at IS NULL
              )
            )
       ) due
      WHERE due.recipient_ids IS NOT NULL
      ORDER BY due.id`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as PolicyReminderDue[];
};

/**
 * Record that the reminder of this kind went out for the policy. Stamps only
 * while the row still has the review day the sweep selected (`reviewDate`,
 * "YYYY-MM-DD") and the kind is unstamped, so a date changed mid-sweep is not
 * marked reminded. Returns whether the policy was stamped.
 */
export const markPolicyReminderSentQuery = async (
  id: number,
  kind: PolicyReminderKind,
  reviewDate: string,
  organizationId: number,
): Promise<boolean> => {
  const column = POLICY_REMINDER_COLUMNS[kind];
  const [, affected] = (await sequelize.query(
    `UPDATE policy_manager
        SET ${column} = now()
      WHERE organization_id = :organizationId AND id = :id
        AND next_review_date::date = CAST(:reviewDate AS date)
        AND ${column} IS NULL`,
    { replacements: { organizationId, id, reviewDate }, type: QueryTypes.UPDATE },
  )) as unknown as [unknown, number];
  return affected > 0;
};

/**
 * Full names of the given users, for automation templates. Returns [] without
 * querying when there are no ids: `IN ()` is a SQL syntax error (P-H2).
 */
const getReviewerNamesQuery = async (
  reviewerIds: number[] | null | undefined,
  transaction?: Transaction,
): Promise<{ full_name: string }[]> => {
  const ids = reviewerIds ?? [];
  if (ids.length === 0) return [];
  return (await sequelize.query(
    `SELECT name || ' ' || surname AS full_name FROM users WHERE id IN (:reviewer_ids);`,
    { replacements: { reviewer_ids: ids }, transaction, type: QueryTypes.SELECT },
  )) as { full_name: string }[];
};

/**
 * A policy with its assigned reviewer ids. Pass the transaction when reading
 * inside a write, or the read misses the uncommitted change (P-H1).
 */
export const getPolicyByIdQuery = async (
  organizationId: number,
  id: number,
  transaction?: Transaction,
) => {
  const result = (await sequelize.query(
    `SELECT
      pm.*,
      ${POLICY_REVIEW_DATE_SQL},
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
      transaction,
    },
  )) as any[];

  return result.map((row): any => omitReminderStamps(row));
};

/** @throws ValidationException (400) for a non-array or an unknown tag, instead of a 500 (P-L6). */
const verifyPolicyTags = (policyTags: unknown) => {
  if (!Array.isArray(policyTags) || policyTags.some((tag) => !PolicyTagsSet.has(tag))) {
    throw new ValidationException("Choose tags from the list", "tags", policyTags);
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
  await assertPolicyUsersInOrganization([ownerId], "policy_owner_id", organizationId, transaction);
  await assertPolicyUsersInOrganization(
    reviewerIds,
    "assigned_reviewer_ids",
    organizationId,
    transaction,
  );

  // Insert policy without assigned_reviewer_ids
  const result = (await sequelize.query(
    `INSERT INTO policy_manager AS pm (
      organization_id, title, content_html, status, tags, next_review_date, author_id, policy_owner_id, last_updated_by, last_updated_at, is_demo
    ) VALUES (
      :organization_id, :title, :content_html, :status, ARRAY(SELECT jsonb_array_elements_text(CAST(:tags AS jsonb))), :next_review_date, :author_id, :policy_owner_id, :last_updated_by, :last_updated_at, :is_demo
    ) RETURNING *, ${POLICY_REVIEW_DATE_SQL}`,
    {
      replacements: {
        organization_id: organizationId,
        title: policy.title,
        content_html: policy.content_html,
        // New policies start as Draft when no status is sent.
        status: policy.status ?? "Draft",
        // JSON-bound so an empty list stores '{}' (ARRAY[] has no type, P-L6).
        tags: JSON.stringify(policy.tags ?? []),
        next_review_date: toReviewDateValue(policy.next_review_date),
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

  const createdPolicy = omitReminderStamps(result[0][0]) as any;
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

  // Every action of every active automation (legacy ones: the first only), after commit (P-L12).
  const actions = await getEventAutomationActionsQuery(organizationId, "policy_added", transaction);
  if (actions.length > 0) {
    const reviewerNames = await getReviewerNamesQuery(
      createdPolicy.assigned_reviewer_ids,
      transaction,
    );
    const replacements = buildPolicyReplacements({
      ...createdPolicy,
      reviewer_names: reviewerNames.map((r) => r.full_name).join(", "),
    });
    await enqueueAutomationActions(actions, replacements, organizationId, transaction);
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
  const existingPolicy = await getPolicyByIdQuery(organizationId, id, transaction);

  // Only newly named users are checked, so a policy whose owner or reviewer
  // has left the organization can still be saved.
  const existingRow = (existingPolicy?.[0] ?? {}) as Partial<IPolicy>;
  if (
    policy.policy_owner_id !== undefined &&
    Number(policy.policy_owner_id) !== Number(existingRow.policy_owner_id)
  ) {
    await assertPolicyUsersInOrganization(
      [policy.policy_owner_id],
      "policy_owner_id",
      organizationId,
      transaction,
    );
  }
  if (policy.assigned_reviewer_ids) {
    const alreadyAssigned = new Set((existingRow.assigned_reviewer_ids || []).map(Number));
    await assertPolicyUsersInOrganization(
      policy.assigned_reviewer_ids.filter((rid) => !alreadyAssigned.has(Number(rid))),
      "assigned_reviewer_ids",
      organizationId,
      transaction,
    );
  }

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

      // next_review_date is nullable: null or "" clears it.
      if (f === "next_review_date") {
        if (policy.next_review_date !== undefined) {
          updatePolicy.next_review_date = toReviewDateValue(policy.next_review_date);
          return true;
        }
        return false;
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
          verifyPolicyTags(policy.tags);
          updatePolicy.tags = JSON.stringify(policy.tags);
          return true;
        }
        updatePolicy[f as keyof IPolicy] = policy[f as keyof IPolicy];
        return true;
      }
      return false;
    })
    .map((f) => {
      if (f === "tags") {
        return "tags = ARRAY(SELECT jsonb_array_elements_text(CAST(:tags AS jsonb)))";
      }
      if (f === "next_review_date") {
        return `next_review_date = :next_review_date, ${CLEAR_REVIEW_REMINDERS_ON_DATE_CHANGE_SQL}`;
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
  const updatedPolicyResult = await getPolicyByIdQuery(organizationId, id, transaction);
  if (!updatedPolicyResult || updatedPolicyResult.length === 0) {
    throw new Error("Policy not found after update");
  }
  const updatedPolicy = updatedPolicyResult[0];
  // Every action of every active automation (legacy ones: the first only), after commit (P-L12).
  const actions = await getEventAutomationActionsQuery(
    organizationId,
    "policy_updated",
    transaction,
  );
  if (actions.length > 0) {
    const reviewerNames = await getReviewerNamesQuery(
      (updatedPolicy as any).assigned_reviewer_ids,
      transaction,
    );
    const replacements = buildPolicyUpdateReplacements(existingPolicy[0], {
      ...updatedPolicy,
      reviewer_names: reviewerNames.map((r) => r.full_name).join(", "),
    });
    await enqueueAutomationActions(actions, replacements, organizationId, transaction);
  }
  return updatedPolicy;
};

export const deletePolicyByIdQuery = async (
  organizationId: number,
  id: number,
  transaction: Transaction,
) => {
  // Get policy data with reviewer IDs BEFORE deleting (CASCADE will delete mappings)
  const policyToDelete = await getPolicyByIdQuery(organizationId, id, transaction);

  if (!policyToDelete || policyToDelete.length === 0) {
    return false;
  }

  const deletedPolicyData = policyToDelete[0] as any;

  await deleteAllCustomFieldValuesForEntityQuery("policy", id, organizationId, transaction);

  // Delete the policy (CASCADE will handle mapping table deletion)
  await sequelize.query(
    `DELETE FROM policy_manager WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { organizationId, id },
      transaction,
      type: QueryTypes.DELETE,
    },
  );

  // Every action of every active automation (legacy ones: the first only), after commit (P-L12).
  const actions = await getEventAutomationActionsQuery(
    organizationId,
    "policy_deleted",
    transaction,
  );
  if (actions.length > 0) {
    const reviewerNames = await getReviewerNamesQuery(
      deletedPolicyData.assigned_reviewer_ids,
      transaction,
    );
    const replacements = buildPolicyReplacements({
      ...deletedPolicyData,
      reviewer_names: reviewerNames.map((r) => r.full_name).join(", "),
    });
    await enqueueAutomationActions(actions, replacements, organizationId, transaction);
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
  await assertPolicyUsersInOrganization([reviewerId], "reviewerId", organizationId, transaction);

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
