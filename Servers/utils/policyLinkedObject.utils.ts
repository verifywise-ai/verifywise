import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import logger from "../utils/logger/fileLogger";
import { PolicyLinkedObjectsModel } from "../domain.layer/models/policy/policy_linked_objects.model";
import { assertOrgOwnsIds } from "./bulkAction.utils";
import { policyExistsInOrganizationQuery } from "./policyManager.utils";
import { riskIdVisibilitySql, riskVisibilitySql, RiskViewer } from "./riskVisibility.utils";
import {
  NotFoundException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";

/** The object types a policy can link to, and the table each id lives in. */
const LINKABLE_OBJECT_TABLES = new Map<string, string>([
  ["risk", "risks"],
  ["evidence", "files"],
]);

/**
 * Link objects to a policy, the one path every caller (REST, advisor) uses.
 * The object type must be risk or evidence, the policy and every object must
 * belong to the organization, and ids already linked are skipped. The policy
 * row is locked for the rest of the transaction, so two concurrent requests
 * cannot both insert the same link. A risk the viewer cannot see (risk
 * visibility rule) counts as one outside the organization, so it gets the
 * answer an unknown id gets.
 *
 * @returns The number of links actually created.
 * @throws ValidationException for an unknown object type.
 * @throws NotFoundException when the policy is not in the organization.
 * @throws ForbiddenException when an object is not in the organization.
 */
export const linkObjectsToPolicyQuery = async (
  policyId: number,
  objectType: unknown,
  objectIds: number[],
  organizationId: number,
  transaction: Transaction,
  viewer: RiskViewer,
): Promise<number> => {
  const table = LINKABLE_OBJECT_TABLES.get(String(objectType));
  if (!table) {
    throw new ValidationException(
      "object_type must be risk or evidence",
      "object_type",
      objectType,
    );
  }
  if (!(await policyExistsInOrganizationQuery(organizationId, policyId, transaction, true))) {
    throw new NotFoundException("Policy not found", "policy_manager", policyId);
  }
  if (objectIds.length === 0) return 0;

  await assertOrgOwnsIds({
    table,
    ids: objectIds,
    organizationId,
    transaction,
    extra: table === "risks" ? riskVisibilitySql(table, viewer) : undefined,
  });

  const existingRows = (await sequelize.query(
    `SELECT object_id FROM policy_linked_objects
     WHERE organization_id = :organizationId AND policy_id = :policyId
       AND object_type = :objectType AND object_id IN (:ids)`,
    {
      replacements: { organizationId, policyId, objectType, ids: objectIds },
      type: QueryTypes.SELECT,
      transaction,
    },
  )) as { object_id: number }[];
  const alreadyLinked = new Set(existingRows.map((r) => Number(r.object_id)));
  const newIds = objectIds.filter((id) => !alreadyLinked.has(id));

  for (const id of newIds) {
    await createPolicyLinkedObjectQuery(
      policyId,
      String(objectType),
      id,
      organizationId,
      transaction,
    );
  }
  return newIds.length;
};

/**
 * Leaves out the links to risks the viewer cannot see (risk visibility rule),
 * so a policy's links never name a hidden risk. Empty for a viewer who sees
 * every risk. Bound against policy_linked_objects (unaliased).
 */
const hiddenRiskLinksFilter = (
  viewer: RiskViewer,
): { sql: string; replacements: Record<string, unknown> } => {
  // object_type and object_id are NOT NULL, so `<>` needs no NULL case.
  const visibility = riskIdVisibilitySql("policy_linked_objects.object_id", viewer);
  if (!visibility.sql) return visibility;
  return {
    sql: ` AND (policy_linked_objects.object_type <> 'risk' OR ${visibility.sql})`,
    replacements: visibility.replacements,
  };
};

/**
 * GET all linked objects
 */
export const getAllPolicyLinkedObjectsQuery = async (
  organizationId: number,
  viewer: RiskViewer,
) => {
  logger.debug(`📥 Fetching all policy_linked_objects for organization ${organizationId}`);

  const hidden = hiddenRiskLinksFilter(viewer);
  const rows = await sequelize.query(
    `SELECT * FROM policy_linked_objects WHERE organization_id = :organizationId${hidden.sql} ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId, ...hidden.replacements },
      mapToModel: true,
      model: PolicyLinkedObjectsModel,
    },
  );

  return rows;
};

/**
 * GET linked object by ID
 */

export const getPolicyLinkedObjectByIdQuery = async (
  policy_id: number,
  organizationId: number,
  viewer: RiskViewer,
) => {
  logger.debug(`📥 Fetching linked objects for policy ${policy_id}`);

  const hidden = hiddenRiskLinksFilter(viewer);
  const rows = await sequelize.query(
    `SELECT * FROM policy_linked_objects WHERE organization_id = :organizationId AND policy_id = :policy_id${hidden.sql}`,
    {
      replacements: { organizationId, policy_id, ...hidden.replacements },
      mapToModel: true,
      model: PolicyLinkedObjectsModel,
    },
  );

  return rows;
};

/**
 * CREATE linked object
 */
export const createPolicyLinkedObjectQuery = async (
  policy_id: number,
  object_type: string,
  object_id: number,
  organizationId: number,
  transaction?: Transaction,
) => {
  logger.debug(
    `🟢 Creating policy_linked_object → policy:${policy_id}, type:${object_type}, id:${object_id}`,
  );

  const result = await sequelize.query(
    `INSERT INTO policy_linked_objects
        (organization_id, policy_id, object_type, object_id, created_at, updated_at)
       VALUES (:organizationId, :policy_id, :object_type, :object_id, NOW(), NOW())
       RETURNING *`,
    {
      replacements: { organizationId, policy_id, object_type, object_id },
      mapToModel: true,
      model: PolicyLinkedObjectsModel,
      transaction,
    },
  );

  return result[0];
};

/**
 * UPDATE linked object (by id)
 */
export const updatePolicyLinkedObjectQuery = async (
  policy_id: number,
  old_object_type: string,
  old_object_id: number,
  new_object_type: string,
  new_object_id: number,
  organizationId: number,
  transaction?: Transaction,
) => {
  logger.debug(
    `♻️ Updating policy_linked_object for policy:${policy_id}: ${old_object_type}(${old_object_id}) → ${new_object_type}(${new_object_id})`,
  );

  const result = await sequelize.query(
    `UPDATE policy_linked_objects
       SET object_type = :new_object_type,
           object_id = :new_object_id,
           updated_at = NOW()
       WHERE organization_id = :organizationId AND policy_id = :policy_id AND object_type = :old_object_type AND object_id = :old_object_id
       RETURNING *`,
    {
      replacements: {
        organizationId,
        policy_id,
        old_object_type,
        old_object_id,
        new_object_type,
        new_object_id,
      },
      mapToModel: true,
      model: PolicyLinkedObjectsModel,
      transaction,
    },
  );

  return result[0];
};

/**
 * DELETE linked object (by id). A link to a risk the viewer cannot see (risk
 * visibility rule) does not match, so it is deleted and answered exactly like
 * a missing row.
 */
export const deletePolicyLinkedObjectQuery = async (
  id: number,
  organizationId: number,
  viewer: RiskViewer,
  transaction?: Transaction,
) => {
  logger.debug(`🗑 Deleting policy_linked_object → policy:${id}`);

  const hidden = hiddenRiskLinksFilter(viewer);
  const result = await sequelize.query(
    `DELETE FROM policy_linked_objects
       WHERE organization_id = :organizationId AND id = :id${hidden.sql}
       RETURNING *`,
    {
      replacements: { organizationId, id, ...hidden.replacements },
      mapToModel: true,
      model: PolicyLinkedObjectsModel,
      transaction,
    },
  );

  return result[0];
};

/**
 * Unlink one risk from every policy in the organization. Used when a risk is
 * archived and by DELETE /policy-linked/risk/:riskId.
 */
export const unlinkRiskFromAllPoliciesQuery = async (
  riskId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<void> => {
  await sequelize.query(
    `DELETE FROM policy_linked_objects
      WHERE organization_id = :organizationId AND object_type = 'risk' AND object_id = :riskId`,
    { replacements: { organizationId, riskId }, transaction },
  );
};
