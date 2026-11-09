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
 * `project_groups`, following the customField.utils.ts slice. Group-to-member
 * resolution is cached with the same 60s TTL idiom as
 * rolePermissions.utils.ts and invalidated on every membership write.
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

// ---------- Group -> member resolution cache (60s TTL) ----------

const GROUP_MEMBERS_TTL_MS = 60_000;

interface CachedMemberSet {
  expiresAt: number;
  userIds: ReadonlySet<number>;
}

const groupMembersCache = new Map<string, CachedMemberSet>();

const cacheKey = (organizationId: number, groupId: number) => `${organizationId}:${groupId}`;

/**
 * Invalidate the cached member list for one group, or every group in one
 * org, or (no args) the whole cache. Called after any membership write.
 */
export function invalidateGroupMembersCache(organizationId?: number, groupId?: number): void {
  if (organizationId === undefined) {
    groupMembersCache.clear();
    return;
  }
  if (groupId === undefined) {
    const prefix = `${organizationId}:`;
    for (const key of groupMembersCache.keys()) {
      if (key.startsWith(prefix)) groupMembersCache.delete(key);
    }
    return;
  }
  groupMembersCache.delete(cacheKey(organizationId, groupId));
}

/**
 * Resolved (uncached read) member ids of a group. Validates the group
 * belongs to the organization and throws NotFoundException otherwise.
 */
export async function resolveGroupMemberIdsQuery(
  groupId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<number[]> {
  const rows = await sequelize.query<{ user_id: number }>(
    `SELECT gm.user_id
       FROM group_members gm
       JOIN groups g ON g.id = gm.group_id
      WHERE gm.organization_id = :organizationId
        AND gm.group_id = :groupId
        AND g.organization_id = :organizationId
      ORDER BY gm.user_id ASC`,
    {
      replacements: { organizationId, groupId },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  return rows.map((r) => r.user_id);
}

/**
 * Cached group -> member ids resolution (60s TTL), mirroring the
 * rolePermissions.utils.ts caching pattern. Unknown groups resolve to [].
 */
export async function getGroupMemberIdsQuery(
  groupId: number,
  organizationId: number,
): Promise<ReadonlySet<number>> {
  const key = cacheKey(organizationId, groupId);
  const cached = groupMembersCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.userIds;
  }
  const ids = await resolveGroupMemberIdsQuery(groupId, organizationId);
  const userIds: ReadonlySet<number> = new Set(ids);
  groupMembersCache.set(key, {
    expiresAt: now + GROUP_MEMBERS_TTL_MS,
    userIds,
  });
  return userIds;
}

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

/** True when the user is an active member of the organization. */
export async function isOrgMemberQuery(
  userId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<boolean> {
  const rows = await sequelize.query<{ ok: number }>(
    `SELECT 1 AS ok
       FROM organization_members
      WHERE user_id = :userId AND organization_id = :organizationId
      LIMIT 1`,
    {
      replacements: { userId, organizationId },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  return rows.length > 0;
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
): Promise<IGroup> {
  const id = assertPositiveInt(groupId, "group id");
  const rows = await sequelize.query<IGroup>(
    `SELECT * FROM groups WHERE id = :id AND organization_id = :organizationId`,
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
  if (patch.name !== undefined) {
    sets.push("name = :name");
    replacements.name = assertGroupName(patch.name);
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
        `A group named "${replacements.name}" already exists`,
        "name",
        replacements.name,
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
  invalidateGroupMembersCache(organizationId, id);
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

export async function addGroupMembersQuery(
  groupId: number,
  organizationId: number,
  userIds: unknown,
): Promise<{ added: number }> {
  const id = assertPositiveInt(groupId, "group id");
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new ValidationException("userIds must be a non-empty array", "userIds", userIds);
  }
  if (userIds.length > MAX_GROUP_MEMBERS) {
    throw new ValidationException(
      `A group can have at most ${MAX_GROUP_MEMBERS} members`,
      "userIds",
      userIds,
    );
  }
  const ids = [...new Set(userIds.map((u) => assertPositiveInt(u, "user id")))];
  await getGroupByIdOrThrowQuery(id, organizationId);
  for (const userId of ids) {
    if (!(await isOrgMemberQuery(userId, organizationId))) {
      throw new ValidationException(
        `User ${userId} is not a member of this organization`,
        "userIds",
        userIds,
      );
    }
  }
  const result = await sequelize.query(
    `INSERT INTO group_members (group_id, user_id, organization_id)
       SELECT :id, u.id, :organizationId
         FROM unnest(CAST(:userIds AS int[])) AS u(id)
     ON CONFLICT (group_id, user_id) DO NOTHING`,
    {
      replacements: { id, organizationId, userIds: `{${ids.join(",")}}` },
      type: QueryTypes.INSERT,
    },
  );
  invalidateGroupMembersCache(organizationId, id);
  // sequelize returns [_, affectedCount] for INSERT ... SELECT
  const added = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
  return { added };
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
  invalidateGroupMembersCache(organizationId, id);
}

export async function setGroupMembersQuery(
  groupId: number,
  organizationId: number,
  userIds: unknown,
): Promise<void> {
  const id = assertPositiveInt(groupId, "group id");
  if (!Array.isArray(userIds)) {
    throw new ValidationException("userIds must be an array", "userIds", userIds);
  }
  if (userIds.length > MAX_GROUP_MEMBERS) {
    throw new ValidationException(
      `A group can have at most ${MAX_GROUP_MEMBERS} members`,
      "userIds",
      userIds,
    );
  }
  const ids = [...new Set(userIds.map((u) => assertPositiveInt(u, "user id")))];
  await getGroupByIdOrThrowQuery(id, organizationId);
  for (const userId of ids) {
    if (!(await isOrgMemberQuery(userId, organizationId))) {
      throw new ValidationException(
        `User ${userId} is not a member of this organization`,
        "userIds",
        userIds,
      );
    }
  }
  await sequelize.query(
    `DELETE FROM group_members WHERE group_id = :id AND organization_id = :organizationId`,
    { replacements: { id, organizationId }, type: QueryTypes.DELETE },
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
      },
    );
  }
  invalidateGroupMembersCache(organizationId, id);
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

export async function setProjectGroupsQuery(
  projectId: number,
  organizationId: number,
  groupIds: unknown,
): Promise<void> {
  const id = assertPositiveInt(projectId, "project id");
  if (!Array.isArray(groupIds)) {
    throw new ValidationException("groupIds must be an array", "groupIds", groupIds);
  }
  if (groupIds.length > MAX_PROJECT_GROUPS) {
    throw new ValidationException(
      `A use case can have at most ${MAX_PROJECT_GROUPS} groups`,
      "groupIds",
      groupIds,
    );
  }
  const ids = [...new Set(groupIds.map((g) => assertPositiveInt(g, "group id")))];
  const projectRows = await sequelize.query<{ id: number }>(
    `SELECT id FROM projects WHERE id = :id AND organization_id = :organizationId`,
    { replacements: { id, organizationId }, type: QueryTypes.SELECT },
  );
  if (projectRows.length === 0) {
    throw new NotFoundException(`Use case ${id} not found`);
  }
  for (const groupId of ids) {
    await getGroupByIdOrThrowQuery(groupId, organizationId);
  }
  await sequelize.query(
    `DELETE FROM project_groups WHERE project_id = :id AND organization_id = :organizationId`,
    { replacements: { id, organizationId }, type: QueryTypes.DELETE },
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
      },
    );
  }
}

/**
 * Effective member ids of a use case: direct members plus every member of
 * every group attached to the use case. Resolved at check time (option a of
 * issue #5253), the same pattern rolePermissions.utils.ts uses for roles.
 */
export async function getEffectiveProjectMemberIdsQuery(
  projectId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<number[]> {
  const id = assertPositiveInt(projectId, "project id");
  const rows = await sequelize.query<{ user_id: number }>(
    `SELECT user_id FROM projects_members
      WHERE organization_id = :organizationId AND project_id = :id
     UNION
     SELECT gm.user_id
       FROM project_groups pg
       JOIN group_members gm
         ON gm.group_id = pg.group_id AND gm.organization_id = pg.organization_id
      WHERE pg.organization_id = :organizationId AND pg.project_id = :id
     ORDER BY user_id ASC`,
    {
      replacements: { organizationId, id },
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  return rows.map((r) => r.user_id);
}
