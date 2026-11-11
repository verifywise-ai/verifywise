import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import {
  ValidationException,
  NotFoundException,
  ConflictException,
} from "../domain.layer/exceptions/custom.exception";

/**
 * Groups / teams (#5253, VW-CQ-01).
 *
 * Raw-SQL, organization-scoped CRUD over `groups`, `group_members` and
 * `project_groups`, following the customField.utils.ts slice. Group access to
 * a use case is resolved at check time by projectVisibility.utils.ts.
 */

// ---------- Types ----------

export interface IGroup {
  id: number;
  organization_id: number;
  name: string;
  description: string | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  member_count?: number;
}

export interface IGroupMember {
  group_id: number;
  user_id: number;
  organization_id: number;
  created_at: Date;
}

export interface IProjectGroup {
  project_id: number;
  group_id: number;
  organization_id: number;
  created_at: Date;
  name?: string;
  member_count?: number;
}

// ---------- Allowlists / limits (mirror the DB constraints) ----------

const GROUP_NAME_MIN = 2;
const GROUP_NAME_MAX = 255;
const GROUP_DESCRIPTION_MAX = 2000;
const MAX_GROUP_MEMBERS = 500;
const MAX_PROJECT_GROUPS = 50;

// ---------- Internal validators ----------

const assertPositiveInt = (n: unknown, name: string): number => {
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
    throw new ValidationException(`${name} must be a positive integer`, name, n);
  }
  return n;
};

const assertGroupName = (name: unknown): string => {
  if (typeof name !== "string") {
    throw new ValidationException("name must be a string", "name", name);
  }
  const trimmed = name.trim();
  if (trimmed.length < GROUP_NAME_MIN || trimmed.length > GROUP_NAME_MAX) {
    throw new ValidationException(
      `name must be between ${GROUP_NAME_MIN} and ${GROUP_NAME_MAX} characters`,
      "name",
      name,
    );
  }
  return trimmed;
};

const assertDescription = (description: unknown): string | null => {
  if (description === null || description === undefined) return null;
  if (typeof description !== "string") {
    throw new ValidationException("description must be a string", "description", description);
  }
  if (description.length > GROUP_DESCRIPTION_MAX) {
    throw new ValidationException(
      `description must be at most ${GROUP_DESCRIPTION_MAX} characters`,
      "description",
      description,
    );
  }
  return description;
};

/**
 * Throws ValidationException naming the first user id that is not a member
 * of the organization. One query for the whole list.
 */
async function assertOrgMembersQuery(
  userIds: number[],
  organizationId: number,
  transaction: Transaction,
): Promise<void> {
  if (userIds.length === 0) return;
  const rows = await sequelize.query<{ user_id: number }>(
    `SELECT user_id
       FROM organization_members
      WHERE organization_id = :organizationId AND user_id IN (:userIds)`,
    {
      replacements: { organizationId, userIds },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  const members = new Set(rows.map((r) => Number(r.user_id)));
  const outsider = userIds.find((u) => !members.has(u));
  if (outsider !== undefined) {
    throw new ValidationException(
      `User ${outsider} is not a member of this organization`,
      "userIds",
      userIds,
    );
  }
}

// ---------- Group CRUD ----------

export async function listGroupsQuery(organizationId: number): Promise<IGroup[]> {
  return sequelize.query<IGroup>(
    `SELECT g.*, COUNT(gm.user_id)::int AS member_count
       FROM groups g
       LEFT JOIN group_members gm
         ON gm.group_id = g.id AND gm.organization_id = g.organization_id
      WHERE g.organization_id = :organizationId
      GROUP BY g.id
      ORDER BY g.name ASC`,
    {
      replacements: { organizationId },
      type: QueryTypes.SELECT,
    },
  );
}

export async function getGroupByIdQuery(
  groupId: number,
  organizationId: number,
): Promise<IGroup | null> {
  const rows = await sequelize.query<IGroup>(
    `SELECT g.*, COUNT(gm.user_id)::int AS member_count
       FROM groups g
       LEFT JOIN group_members gm
         ON gm.group_id = g.id AND gm.organization_id = g.organization_id
      WHERE g.organization_id = :organizationId AND g.id = :groupId
      GROUP BY g.id`,
    {
      replacements: { organizationId, groupId },
      type: QueryTypes.SELECT,
    },
  );
  return rows[0] ?? null;
}

export async function getGroupByIdOrThrowQuery(
  groupId: number,
  organizationId: number,
  transaction?: Transaction,
  forUpdate = false,
): Promise<IGroup> {
  const id = assertPositiveInt(groupId, "group id");
  const rows = await sequelize.query<IGroup>(
    `SELECT * FROM groups WHERE id = :id AND organization_id = :organizationId${
      forUpdate ? " FOR UPDATE" : ""
    }`,
    {
      replacements: { id, organizationId },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  if (rows.length === 0) {
    throw new NotFoundException(`Group ${id} not found`);
  }
  return rows[0];
}

export async function createGroupQuery(
  input: { name: unknown; description?: unknown },
  organizationId: number,
  userId: number,
): Promise<IGroup> {
  const name = assertGroupName(input.name);
  const description = assertDescription(input.description);
  try {
    const rows = await sequelize.query<IGroup>(
      `INSERT INTO groups (organization_id, name, description, created_by)
       VALUES (:organizationId, :name, :description, :userId)
       RETURNING *`,
      {
        replacements: { organizationId, name, description, userId },
        type: QueryTypes.SELECT,
      },
    );
    return rows[0];
  } catch (error) {
    if ((error as { original?: { code?: string } })?.original?.code === "23505") {
      throw new ConflictException(`A group named "${name}" already exists`, "name", name);
    }
    throw error;
  }
}

export async function updateGroupByIdQuery(
  groupId: number,
  organizationId: number,
  patch: { name?: unknown; description?: unknown },
): Promise<IGroup> {
  const id = assertPositiveInt(groupId, "group id");
  await getGroupByIdOrThrowQuery(id, organizationId);
  const sets: string[] = [];
  const replacements: Record<string, unknown> = { id, organizationId };
  let validatedName: string | undefined;
  if (patch.name !== undefined) {
    validatedName = assertGroupName(patch.name);
    sets.push("name = :name");
    replacements.name = validatedName;
  }
  if (patch.description !== undefined) {
    sets.push("description = :description");
    replacements.description = assertDescription(patch.description);
  }
  if (sets.length === 0) {
    throw new ValidationException("No updatable fields supplied", "patch", patch);
  }
  sets.push("updated_at = NOW()");
  try {
    const rows = await sequelize.query<IGroup>(
      `UPDATE groups SET ${sets.join(", ")}
        WHERE id = :id AND organization_id = :organizationId
        RETURNING *`,
      { replacements, type: QueryTypes.SELECT },
    );
    return rows[0];
  } catch (error) {
    if ((error as { original?: { code?: string } })?.original?.code === "23505") {
      throw new ConflictException(
        `A group named "${validatedName}" already exists`,
        "name",
        validatedName,
      );
    }
    throw error;
  }
}

export async function deleteGroupByIdQuery(groupId: number, organizationId: number): Promise<void> {
  const id = assertPositiveInt(groupId, "group id");
  await getGroupByIdOrThrowQuery(id, organizationId);
  await sequelize.query(`DELETE FROM groups WHERE id = :id AND organization_id = :organizationId`, {
    replacements: { id, organizationId },
    type: QueryTypes.DELETE,
  });
}

// ---------- Membership ----------

export async function listGroupMembersQuery(
  groupId: number,
  organizationId: number,
): Promise<{ user_id: number; name: string; surname: string; email: string }[]> {
  const id = assertPositiveInt(groupId, "group id");
  await getGroupByIdOrThrowQuery(id, organizationId);
  return sequelize.query(
    `SELECT u.id AS user_id, u.name, u.surname, u.email
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
      WHERE gm.organization_id = :organizationId AND gm.group_id = :id
      ORDER BY u.name ASC, u.surname ASC`,
    { replacements: { organizationId, id }, type: QueryTypes.SELECT },
  );
}

const tooManyMembers = (userIds: unknown) =>
  new ValidationException(
    `A group can have at most ${MAX_GROUP_MEMBERS} members`,
    "userIds",
    userIds,
  );

/**
 * Adds members to a group. The cap is on the group's total, not on one
 * request: existing members plus the new ones must stay within
 * MAX_GROUP_MEMBERS. The group row is locked so two concurrent adds cannot
 * both pass the check.
 */
export async function addGroupMembersQuery(
  groupId: number,
  organizationId: number,
  userIds: unknown,
): Promise<{ added: number }> {
  const id = assertPositiveInt(groupId, "group id");
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new ValidationException("userIds must be a non-empty array", "userIds", userIds);
  }
  const ids = [...new Set(userIds.map((u) => assertPositiveInt(u, "user id")))];
  if (ids.length > MAX_GROUP_MEMBERS) throw tooManyMembers(userIds);
  return sequelize.transaction(async (transaction) => {
    await getGroupByIdOrThrowQuery(id, organizationId, transaction, true);
    await assertOrgMembersQuery(ids, organizationId, transaction);
    const [{ others }] = await sequelize.query<{ others: number }>(
      `SELECT COUNT(*)::int AS others
         FROM group_members
        WHERE organization_id = :organizationId AND group_id = :id
          AND user_id NOT IN (:userIds)`,
      { replacements: { organizationId, id, userIds: ids }, type: QueryTypes.SELECT, transaction },
    );
    if (Number(others) + ids.length > MAX_GROUP_MEMBERS) throw tooManyMembers(userIds);
    const result = await sequelize.query(
      `INSERT INTO group_members (group_id, user_id, organization_id)
         SELECT :id, u.id, :organizationId
           FROM unnest(CAST(:userIds AS int[])) AS u(id)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      {
        replacements: { id, organizationId, userIds: `{${ids.join(",")}}` },
        type: QueryTypes.INSERT,
        transaction,
      },
    );
    // sequelize returns [_, affectedCount] for INSERT ... SELECT
    const added = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
    return { added };
  });
}

export async function removeGroupMemberQuery(
  groupId: number,
  organizationId: number,
  userId: unknown,
): Promise<void> {
  const id = assertPositiveInt(groupId, "group id");
  const uid = assertPositiveInt(userId, "user id");
  await getGroupByIdOrThrowQuery(id, organizationId);
  await sequelize.query(
    `DELETE FROM group_members
      WHERE group_id = :id AND user_id = :uid AND organization_id = :organizationId`,
    { replacements: { id, uid, organizationId }, type: QueryTypes.DELETE },
  );
}

/**
 * Replaces a group's members. Validation, delete and insert run in one
 * transaction, so a failed insert never leaves the group empty.
 */
export async function setGroupMembersQuery(
  groupId: number,
  organizationId: number,
  userIds: unknown,
): Promise<void> {
  const id = assertPositiveInt(groupId, "group id");
  if (!Array.isArray(userIds)) {
    throw new ValidationException("userIds must be an array", "userIds", userIds);
  }
  const ids = [...new Set(userIds.map((u) => assertPositiveInt(u, "user id")))];
  if (ids.length > MAX_GROUP_MEMBERS) throw tooManyMembers(userIds);
  await sequelize.transaction(async (transaction) => {
    await getGroupByIdOrThrowQuery(id, organizationId, transaction, true);
    await assertOrgMembersQuery(ids, organizationId, transaction);
    await sequelize.query(
      `DELETE FROM group_members WHERE group_id = :id AND organization_id = :organizationId`,
      { replacements: { id, organizationId }, type: QueryTypes.DELETE, transaction },
    );
    if (ids.length > 0) {
      await sequelize.query(
        `INSERT INTO group_members (group_id, user_id, organization_id)
           SELECT :id, u.id, :organizationId
             FROM unnest(CAST(:userIds AS int[])) AS u(id)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        {
          replacements: { id, organizationId, userIds: `{${ids.join(",")}}` },
          type: QueryTypes.INSERT,
          transaction,
        },
      );
    }
  });
}

// ---------- Project <-> Group membership ----------

export async function listProjectGroupsQuery(
  projectId: number,
  organizationId: number,
): Promise<IGroup[]> {
  const id = assertPositiveInt(projectId, "project id");
  return sequelize.query<IGroup>(
    `SELECT g.*, COUNT(gm.user_id)::int AS member_count
       FROM project_groups pg
       JOIN groups g
         ON g.id = pg.group_id AND g.organization_id = pg.organization_id
       LEFT JOIN group_members gm
         ON gm.group_id = g.id AND gm.organization_id = g.organization_id
      WHERE pg.organization_id = :organizationId AND pg.project_id = :id
      GROUP BY g.id
      ORDER BY g.name ASC`,
    { replacements: { organizationId, id }, type: QueryTypes.SELECT },
  );
}

/**
 * Replaces the groups attached to a use case. Validation, delete and insert
 * run in one transaction. Callers check the user may edit the use case.
 */
export async function setProjectGroupsQuery(
  projectId: number,
  organizationId: number,
  groupIds: unknown,
): Promise<void> {
  const id = assertPositiveInt(projectId, "project id");
  if (!Array.isArray(groupIds)) {
    throw new ValidationException("groupIds must be an array", "groupIds", groupIds);
  }
  const ids = [...new Set(groupIds.map((g) => assertPositiveInt(g, "group id")))];
  if (ids.length > MAX_PROJECT_GROUPS) {
    throw new ValidationException(
      `A use case can have at most ${MAX_PROJECT_GROUPS} groups`,
      "groupIds",
      groupIds,
    );
  }
  await sequelize.transaction(async (transaction) => {
    const projectRows = await sequelize.query<{ id: number }>(
      `SELECT id FROM projects WHERE id = :id AND organization_id = :organizationId FOR UPDATE`,
      { replacements: { id, organizationId }, type: QueryTypes.SELECT, transaction },
    );
    if (projectRows.length === 0) {
      throw new NotFoundException(`Use case ${id} not found`);
    }
    for (const groupId of ids) {
      await getGroupByIdOrThrowQuery(groupId, organizationId, transaction);
    }
    await sequelize.query(
      `DELETE FROM project_groups WHERE project_id = :id AND organization_id = :organizationId`,
      { replacements: { id, organizationId }, type: QueryTypes.DELETE, transaction },
    );
    if (ids.length > 0) {
      await sequelize.query(
        `INSERT INTO project_groups (project_id, group_id, organization_id)
           SELECT :id, g.id, :organizationId
             FROM unnest(CAST(:groupIds AS int[])) AS g(id)
         ON CONFLICT (project_id, group_id) DO NOTHING`,
        {
          replacements: { id, organizationId, groupIds: `{${ids.join(",")}}` },
          type: QueryTypes.INSERT,
          transaction,
        },
      );
    }
  });
}
