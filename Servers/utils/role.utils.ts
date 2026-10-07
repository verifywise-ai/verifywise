import { RoleModel } from "../domain.layer/models/role/role.model";
import { sequelize } from "../database/db";
import { QueryTypes, Transaction } from "sequelize";
import { IRoleAttributes } from "../domain.layer/interfaces/i.role";

export const getAllRolesQuery = async (): Promise<RoleModel[]> => {
  const roles = await sequelize.query("SELECT * FROM roles ORDER BY created_at DESC, id ASC", {
    mapToModel: true,
    model: RoleModel,
  });
  return roles;
};

/**
 * Roles visible to one organization: the global built-in roles
 * (organization_id IS NULL) plus that organization's custom roles.
 * Used by the role controller's GET endpoint (issue #4588) — unlike
 * getAllRolesQuery above, which must keep returning every row for the
 * tenant-aware roleMap cache.
 */
export const getAllRolesForOrganizationQuery = async (
  organizationId: number | null,
): Promise<RoleModel[]> => {
  const scoped = organizationId != null;
  const roles = await sequelize.query(
    `SELECT * FROM roles
      WHERE organization_id IS NULL${scoped ? " OR organization_id = :organizationId" : ""}
      ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: RoleModel,
    },
  );
  return roles;
};

/**
 * Name collision lookup within an organization's namespace: matches built-in
 * roles (organization_id IS NULL — names are global) and the org's own custom
 * roles. Used to enforce the unique (organization, name) pair on create/rename.
 */
export const getRoleByNameInOrganizationQuery = async (
  name: string,
  organizationId: number,
): Promise<RoleModel | null> => {
  const result = await sequelize.query(
    `SELECT * FROM roles WHERE name = :name
      AND (organization_id IS NULL OR organization_id = :organizationId)
      LIMIT 1`,
    {
      replacements: { name, organizationId },
      mapToModel: true,
      model: RoleModel,
    },
  );
  return result[0];
};

/** Number of users currently assigned to a role (delete guard, issue #4588). */
export const countUsersWithRoleQuery = async (roleId: number): Promise<number> => {
  const result = await sequelize.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM users WHERE role_id = :roleId",
    {
      replacements: { roleId },
      type: QueryTypes.SELECT,
    },
  );
  return result[0]?.count ?? 0;
};

export const getRoleByIdQuery = async (id: number): Promise<RoleModel | null> => {
  const result = await sequelize.query("SELECT * FROM roles WHERE id = :id", {
    replacements: { id },
    mapToModel: true,
    model: RoleModel,
  });
  return result[0];
};

export const createNewRoleQuery = async (
  role: Partial<IRoleAttributes>,
  transaction: Transaction,
): Promise<RoleModel> => {
  const result = await sequelize.query(
    `INSERT INTO roles(name, description, organization_id)
      VALUES (:name, :description, :organizationId) RETURNING *`,
    {
      replacements: {
        name: role.name,
        description: role.description,
        // NULL = global built-in; set = custom organization role (issue #4588).
        organizationId: role.organization_id ?? null,
      },
      mapToModel: true,
      model: RoleModel,
      // type: QueryTypes.INSERT
      transaction,
    },
  );
  return result[0];
};

export const updateRoleByIdQuery = async (
  id: number,
  role: Partial<RoleModel>,
  transaction: Transaction,
): Promise<RoleModel | null> => {
  const updateRole: Partial<Record<keyof IRoleAttributes, any>> = {};
  const setClause = ["name", "description"]
    .filter((f) => {
      if (role[f as keyof IRoleAttributes] !== undefined && role[f as keyof IRoleAttributes]) {
        updateRole[f as keyof IRoleAttributes] = role[f as keyof IRoleAttributes];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  const query = `UPDATE roles SET ${setClause} WHERE id = :id RETURNING *;`;

  updateRole.id = id;

  const result = await sequelize.query(query, {
    replacements: updateRole,
    mapToModel: true,
    model: RoleModel,
    // type: QueryTypes.UPDATE,
    transaction,
  });

  return result[0];
};

export const deleteRoleByIdQuery = async (
  id: number,
  transaction: Transaction,
): Promise<boolean> => {
  const result = await sequelize.query(`DELETE FROM roles WHERE id = :id RETURNING *`, {
    replacements: { id },
    mapToModel: true,
    model: RoleModel,
    type: QueryTypes.DELETE,
    transaction,
  });
  return result.length > 0;
};
