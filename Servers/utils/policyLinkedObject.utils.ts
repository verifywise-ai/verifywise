import { sequelize } from "../database/db";
import { Transaction } from "sequelize";
import logger from "../utils/logger/fileLogger";
import { PolicyLinkedObjectsModel } from "../domain.layer/models/policy/policy_linked_objects.model";

/**
 * GET all linked objects
 */
export const getAllPolicyLinkedObjectsQuery = async (organizationId: number) => {
  logger.debug(`📥 Fetching all policy_linked_objects for organization ${organizationId}`);

  const rows = await sequelize.query(
    `SELECT * FROM policy_linked_objects WHERE organization_id = :organizationId ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: PolicyLinkedObjectsModel,
    }
  );

  return rows;
};

/**
 * GET linked object by ID
 */

export const getPolicyLinkedObjectByIdQuery = async (policy_id: number, organizationId: number) => {
    logger.debug(`📥 Fetching linked objects for policy ${policy_id}`);

    const rows = await sequelize.query(
      `SELECT * FROM policy_linked_objects WHERE organization_id = :organizationId AND policy_id = :policy_id`,
      {
        replacements: { organizationId, policy_id },
        mapToModel: true,
        model: PolicyLinkedObjectsModel,
      }
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
    transaction?: Transaction
  ) => {
    logger.debug(
      `🟢 Creating policy_linked_object → policy:${policy_id}, type:${object_type}, id:${object_id}`
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
      }
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
    transaction?: Transaction
  ) => {
    logger.debug(
      `♻️ Updating policy_linked_object for policy:${policy_id}: ${old_object_type}(${old_object_id}) → ${new_object_type}(${new_object_id})`
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
      }
    );

    return result[0];
};

/**
 * DELETE linked object (by id)
 */
export const deletePolicyLinkedObjectQuery = async (
    id: number,
    organizationId: number,
    transaction?: Transaction
  ) => {
    logger.debug(
      `🗑 Deleting policy_linked_object → policy:${id}`
    );

    const result = await sequelize.query(
      `DELETE FROM policy_linked_objects
       WHERE organization_id = :organizationId AND id = :id
       RETURNING *`,
      {
        replacements: { organizationId, id },
        mapToModel: true,
        model: PolicyLinkedObjectsModel,
        transaction,
      }
    );

    return result[0];
  };
  