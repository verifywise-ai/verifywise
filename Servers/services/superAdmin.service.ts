/**
 * Shared super-admin business logic.
 *
 * Called by both the REST controllers (super-admin console) and the MCP tools,
 * so each operation has one implementation regardless of how it was reached.
 *
 * Deliberately excluded: request-shape validation, i18n, HTTP status mapping,
 * and invitation email delivery. Those belong to whichever transport is in
 * front — the controller validates request bodies and maps errors to status
 * codes; the MCP tools validate via their zod schemas. What lives here is the
 * part that touches the database.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { OrganizationModel } from "../domain.layer/models/organization/organization.model";
import { createOrganizationQuery } from "../utils/organization.utils";
import { createNewUserWrapper } from "../controllers/user.ctrl";
import { createInvitationQuery } from "../utils/invitation.utils";
import { deleteUserByIdQuery } from "../utils/user.utils";
import { inviteRoleRefusal } from "../utils/inviteRole.utils";
import {
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { INVITATION_LIFETIME_MS } from "../utils/jwt.utils";
import type { OrganizationRow } from "../utils/superAdmin.utils";

/** Identity translator, so a caller without an i18n context (MCP) can omit one. */
const identity = (message: string) => message;

export interface CreateOrgWithUserInput {
  orgName: string;
  logo?: string;
  mode: "invite" | "direct";
  user: {
    email: string;
    name: string;
    surname?: string;
    roleId: number;
    password?: string;
  };
  /** User id recorded as the inviter; only read in invite mode. */
  invitedBy: number;
  /** Translator for the one user-facing message this can raise. */
  t?: (message: string) => string;
}

export interface CreateOrgWithUserResult {
  organizationId: number;
  /** Stored on the invitation row; the emailed link must be signed for the same instant. */
  invitationExpiresAt: Date;
}

/**
 * Create an organization and its first user in one transaction.
 *
 * Either both persist or neither does — prevents orphan orgs when the user
 * step fails. In invite mode the email is NOT sent here: the row is committed
 * first so a delivery failure still leaves a usable invitation behind, and the
 * caller decides how to report that.
 */
export async function createOrganizationWithUser(
  input: CreateOrgWithUserInput,
): Promise<CreateOrgWithUserResult> {
  const t = input.t ?? identity;
  const transaction = await sequelize.transaction();
  const invitationExpiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);

  try {
    const orgModel = await OrganizationModel.createNewOrganization(
      input.orgName.trim(),
      input.logo,
    );
    const createdOrg = await createOrganizationQuery(orgModel, transaction);
    const organizationId = createdOrg.id!;

    // The same role check as an invite, for either mode: the new organization
    // has no custom roles yet, so only a built-in role other than SuperAdmin
    // passes.
    if (await inviteRoleRefusal(organizationId, null, input.user.roleId)) {
      throw new ValidationException(t("Unknown role"), "roleId");
    }

    if (input.mode === "direct") {
      await createNewUserWrapper(
        {
          name: input.user.name,
          surname: input.user.surname!,
          email: input.user.email,
          password: input.user.password!,
          roleId: input.user.roleId,
          organizationId,
        },
        transaction,
      );
    } else {
      await createInvitationQuery(
        organizationId,
        input.user.email,
        input.user.name,
        input.user.surname ?? "",
        input.user.roleId,
        input.invitedBy,
        invitationExpiresAt,
        { transaction },
      );
    }

    await transaction.commit();
    return { organizationId, invitationExpiresAt };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Delete an organization and everyone in it.
 *
 * Users go first so their FK references are cleared before the organization
 * row is removed; the rest is left to the cascade.
 */
export async function deleteOrganization(
  organizationId: number,
): Promise<{ usersRemoved: number }> {
  const transaction = await sequelize.transaction();
  try {
    const users = await sequelize.query<{ id: number }>(
      `SELECT id FROM users WHERE organization_id = :organizationId`,
      { replacements: { organizationId }, type: QueryTypes.SELECT, transaction },
    );

    for (const user of users) {
      await deleteUserByIdQuery(user.id, organizationId, transaction);
    }

    await sequelize.query(`DELETE FROM organizations WHERE id = :organizationId`, {
      replacements: { organizationId },
      transaction,
    });

    await transaction.commit();
    return { usersRemoved: users.length };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export interface UpdateOrganizationInput {
  name?: string;
  logo?: string;
}

/**
 * Rename an organization or change its logo.
 *
 * Throws when neither field is supplied: an UPDATE with no assignments is a
 * caller error, not a no-op worth reporting as success.
 */
export async function updateOrganization(
  organizationId: number,
  input: UpdateOrganizationInput,
  t: (message: string) => string = identity,
): Promise<OrganizationRow | undefined> {
  const updates: string[] = [];
  const replacements: Record<string, unknown> = { organizationId };

  if (input.name !== undefined) {
    updates.push("name = :name");
    replacements.name = input.name;
  }
  if (input.logo !== undefined) {
    updates.push("logo = :logo");
    replacements.logo = input.logo;
  }

  if (updates.length === 0) {
    throw new ValidationException(t("No fields to update"), "name");
  }

  await sequelize.query(
    `UPDATE organizations SET ${updates.join(", ")}, updated_at = NOW() WHERE id = :organizationId`,
    { replacements },
  );

  const [updated] = await sequelize.query<OrganizationRow>(
    `SELECT * FROM organizations WHERE id = :organizationId`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  );

  return updated;
}

export interface CreateUserInOrgInput {
  organizationId: number;
  email: string;
  name: string;
  surname: string;
  password: string;
  roleId: number;
  t?: (message: string) => string;
}

/**
 * Create an active user inside an existing organization. No invitation email —
 * the password is set here and the account works immediately.
 */
export async function createUserInOrganization(input: CreateUserInOrgInput): Promise<any> {
  const t = input.t ?? identity;
  const transaction = await sequelize.transaction();
  try {
    // The same role check as an invite into this organization.
    if (await inviteRoleRefusal(input.organizationId, null, input.roleId)) {
      throw new ValidationException(t("Unknown role"), "roleId");
    }
    const user = await createNewUserWrapper(
      {
        name: input.name,
        surname: input.surname,
        email: input.email,
        password: input.password,
        roleId: input.roleId,
        organizationId: input.organizationId,
      },
      transaction,
    );
    await transaction.commit();
    const { password_hash, ...safeUser } = user.toJSON() as any;
    return safeUser;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export interface UpdateUserInput {
  name?: string;
  surname?: string;
  email?: string;
  /** Undefined leaves the role alone; null is only meaningful for a cleared role. */
  roleId?: number | null;
}

/**
 * Update a user's details.
 *
 * Throws NotFoundException for an unknown id and ForbiddenException for a pure
 * super admin (no role, no organization), who has no org role to change.
 */
export async function updateUserDetails(
  userId: number,
  input: UpdateUserInput,
  t: (message: string) => string = identity,
): Promise<any> {
  const rows = await sequelize.query<{
    id: number;
    role_id: number | null;
    organization_id: number | null;
  }>(`SELECT id, role_id, organization_id FROM users WHERE id = :userId`, {
    replacements: { userId },
    type: QueryTypes.SELECT,
  });

  if (rows.length === 0) {
    throw new NotFoundException(t("User not found"), "user", userId);
  }
  if (rows[0].role_id == null && rows[0].organization_id == null) {
    throw new ForbiddenException(t("Super-admin user cannot be modified"));
  }

  const updates: string[] = [];
  const replacements: Record<string, unknown> = { userId };

  if (input.name !== undefined) {
    updates.push("name = :name");
    replacements.name = input.name;
  }
  if (input.surname !== undefined) {
    updates.push("surname = :surname");
    replacements.surname = input.surname;
  }
  if (input.email !== undefined) {
    updates.push("email = :email");
    replacements.email = input.email;
  }

  // The edit form sends the current role back, null included (users whose
  // former SuperAdmin role was cleared); only a change is checked and saved.
  const currentRoleId = rows[0].role_id ?? null;
  const roleChanged =
    input.roleId !== undefined &&
    (input.roleId === null ? currentRoleId !== null : Number(input.roleId) !== currentRoleId);
  if (roleChanged) {
    // The same role check as an invite into the user's organization.
    const checkedRoleId = Number(input.roleId);
    if (
      !Number.isInteger(checkedRoleId) ||
      checkedRoleId <= 0 ||
      rows[0].organization_id == null ||
      (await inviteRoleRefusal(rows[0].organization_id, null, checkedRoleId))
    ) {
      throw new ValidationException(t("Unknown role"), "roleId");
    }
    updates.push("role_id = :roleId");
    replacements.roleId = checkedRoleId;
  }

  if (updates.length === 0) {
    throw new ValidationException(t("No fields to update"), "name");
  }

  const [updated] = await sequelize.query(
    `WITH updated AS (
      UPDATE users SET ${updates.join(", ")}, updated_at = NOW() WHERE id = :userId
      RETURNING *
    )
    SELECT u.id, u.name, u.surname, u.email, u.role_id, r.name as role_name,
           u.organization_id, o.name as organization_name,
           u.created_at, u.last_login
    FROM updated u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN organizations o ON u.organization_id = o.id`,
    { replacements, type: QueryTypes.SELECT },
  );

  return updated;
}

/**
 * Remove a user from their organization.
 *
 * A pure super admin is refused: the database trigger would block it anyway,
 * since revoking their super_admins row would orphan them.
 */
export async function removeUserById(
  userId: number,
  t: (message: string) => string = identity,
): Promise<{ deleted: true; userId: number }> {
  const transaction = await sequelize.transaction();
  try {
    const rows = await sequelize.query<{
      id: number;
      organization_id: number | null;
      role_id: number | null;
    }>(`SELECT id, organization_id, role_id FROM users WHERE id = :userId`, {
      replacements: { userId },
      type: QueryTypes.SELECT,
      transaction,
    });
    const user = rows[0];

    if (!user) {
      throw new NotFoundException(t("User not found"), "user", userId);
    }
    if (user.role_id == null && user.organization_id == null) {
      throw new ForbiddenException(t("Super-admin user cannot be deleted"));
    }

    // Cast, not assertion: a user with a role but no organization still reaches
    // here and is passed through exactly as the controller did before.
    await deleteUserByIdQuery(userId, user.organization_id as number, transaction);
    await transaction.commit();
    return { deleted: true, userId };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
