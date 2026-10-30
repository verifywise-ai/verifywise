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
import {
  deleteUserAccountQuery,
  getUserByEmailQuery,
  getUserByIdQuery,
  removeUserFromOrganizationQuery,
} from "../utils/user.utils";
import {
  addOrganizationMemberQuery,
  getUserOrganizationsQuery,
  updateOrganizationMemberRoleQuery,
} from "../utils/organizationMember.utils";
import { inviteRoleRefusal } from "../utils/inviteRole.utils";
import {
  ConflictException,
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
  /** Direct mode added an existing account: its name and password are unchanged. */
  existingAccount: boolean;
}

/**
 * Create an organization and its first user in one transaction.
 *
 * Either both persist or neither does — prevents orphan orgs when the user
 * step fails. In invite mode the email is NOT sent here: the row is committed
 * first so a delivery failure still leaves a usable invitation behind, and the
 * caller decides how to report that.
 *
 * An email that already has an account is added to the new organization
 * (direct) or gets the join link (invite); a pure super admin is refused.
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

    // A pure super admin never joins an organization.
    const existing = await getUserByEmailQuery(input.user.email);
    if (existing && (await getUserOrganizationsQuery(existing.id!, transaction)).length === 0) {
      throw new ConflictException(t("A super admin cannot join an organization"));
    }

    if (input.mode === "direct" && existing) {
      await addOrganizationMemberQuery(
        organizationId,
        existing.id!,
        input.user.roleId,
        transaction,
      );
    } else if (input.mode === "direct") {
      if (!input.user.password) {
        throw new ValidationException(t("password is required for direct creation"), "password");
      }
      await createNewUserWrapper(
        {
          name: input.user.name,
          surname: input.user.surname!,
          email: input.user.email,
          password: input.user.password,
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
    return {
      organizationId,
      invitationExpiresAt,
      existingAccount: input.mode === "direct" && !!existing,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Delete an organization and remove everyone from it.
 *
 * Members are removed first so their FK references are cleared before the
 * organization row is removed; the rest is left to the cascade. A member of
 * another organization keeps their account; anyone else's account is deleted.
 */
export async function deleteOrganization(
  organizationId: number,
): Promise<{ usersRemoved: number }> {
  const transaction = await sequelize.transaction();
  try {
    const users = await sequelize.query<{ id: number }>(
      `SELECT user_id AS id FROM organization_members WHERE organization_id = :organizationId`,
      { replacements: { organizationId }, type: QueryTypes.SELECT, transaction },
    );

    for (const user of users) {
      await removeUserFromOrganizationQuery(user.id, organizationId, transaction);
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
  /** Required for a new account; an existing account keeps its own. */
  password?: string;
  roleId: number;
  t?: (message: string) => string;
}

/**
 * Create an active user inside an existing organization. No invitation email —
 * the password is set here and the account works immediately.
 *
 * An email that already has an account adds that account to the organization
 * instead; its name and password are left as they are. A pure super admin
 * (no membership) never joins an organization, and a member is refused.
 */
export async function createUserInOrganization(input: CreateUserInOrgInput): Promise<any> {
  const t = input.t ?? identity;
  const transaction = await sequelize.transaction();
  try {
    // The same role check as an invite into this organization.
    if (await inviteRoleRefusal(input.organizationId, null, input.roleId)) {
      throw new ValidationException(t("Unknown role"), "roleId");
    }

    const existing = await getUserByEmailQuery(input.email);
    if (existing) {
      const organizations = await getUserOrganizationsQuery(existing.id!, transaction);
      if (organizations.length === 0) {
        throw new ConflictException(t("A super admin cannot join an organization"));
      }
      if (organizations.some((o) => o.organization_id === input.organizationId)) {
        throw new ConflictException(t("User is already a member of this organization"));
      }
      await addOrganizationMemberQuery(
        input.organizationId,
        existing.id!,
        input.roleId,
        transaction,
      );
      await transaction.commit();
      const { password_hash, ...safeUser } = existing as any;
      return { ...safeUser, role_id: input.roleId, existing_account: true };
    }

    if (!input.password) {
      throw new ValidationException(t("password is required for a new account"), "password");
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
  /** Undefined leaves the role alone. A role is per organization: needs organizationId. */
  roleId?: number;
  /** The membership whose role roleId sets. */
  organizationId?: number;
}

/**
 * Update a user's details, and their role in one organization.
 *
 * Throws NotFoundException for an unknown id or a missing membership, and
 * ForbiddenException for a pure super admin (no membership), who has no
 * organization role to change.
 */
export async function updateUserDetails(
  userId: number,
  input: UpdateUserInput,
  t: (message: string) => string = identity,
): Promise<any> {
  const user = await getUserByIdQuery(userId);
  if (!user) {
    throw new NotFoundException(t("User not found"), "user", userId);
  }
  const organizations = await getUserOrganizationsQuery(userId);
  if (organizations.length === 0) {
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

  // The edit form sends the current role back; only a change is checked and saved.
  let roleChange: { organizationId: number; roleId: number } | null = null;
  if (input.roleId !== undefined) {
    const membership = organizations.find((o) => o.organization_id === input.organizationId);
    if (!membership) {
      throw new NotFoundException(
        t("User is not a member of this organization"),
        "organization",
        input.organizationId,
      );
    }
    const checkedRoleId = Number(input.roleId);
    if (checkedRoleId !== membership.role_id) {
      // The same role check as an invite into that organization.
      if (
        !Number.isInteger(checkedRoleId) ||
        checkedRoleId <= 0 ||
        (await inviteRoleRefusal(membership.organization_id, null, checkedRoleId))
      ) {
        throw new ValidationException(t("Unknown role"), "roleId");
      }
      roleChange = { organizationId: membership.organization_id, roleId: checkedRoleId };
    }
  }

  if (updates.length === 0 && !roleChange) {
    throw new ValidationException(t("No fields to update"), "name");
  }

  const transaction = await sequelize.transaction();
  try {
    if (updates.length > 0) {
      await sequelize.query(
        `UPDATE users SET ${updates.join(", ")}, updated_at = NOW() WHERE id = :userId`,
        { replacements, transaction },
      );
    }
    if (roleChange) {
      await updateOrganizationMemberRoleQuery(
        roleChange.organizationId,
        userId,
        roleChange.roleId,
        transaction,
      );
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const [updated] = await sequelize.query(
    `SELECT u.id, u.name, u.surname, u.email, u.created_at, u.last_login
     FROM users u
     WHERE u.id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  );

  return { ...(updated as object), organizations: await getUserOrganizationsQuery(userId) };
}

/**
 * Remove a user from one organization. The account is deleted only when it
 * was the user's last organization.
 */
export async function removeUserFromOrganization(
  organizationId: number,
  userId: number,
  t: (message: string) => string = identity,
): Promise<{ removed: true; userId: number; accountDeleted: boolean }> {
  const transaction = await sequelize.transaction();
  try {
    const { removed, accountDeleted } = await removeUserFromOrganizationQuery(
      userId,
      organizationId,
      transaction,
    );
    if (!removed) {
      throw new NotFoundException(t("User is not a member of this organization"), "user", userId);
    }
    await transaction.commit();
    return { removed: true, userId, accountDeleted };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Delete a user's account, from every organization they belong to.
 *
 * A pure super admin (no membership) is refused, which keeps at least one
 * super admin on the deployment: they can neither be deleted nor join an
 * organization.
 */
export async function removeUserById(
  userId: number,
  t: (message: string) => string = identity,
): Promise<{ deleted: true; userId: number }> {
  const transaction = await sequelize.transaction();
  try {
    const user = await getUserByIdQuery(userId, transaction);
    if (!user) {
      throw new NotFoundException(t("User not found"), "user", userId);
    }
    if ((await getUserOrganizationsQuery(userId, transaction)).length === 0) {
      throw new ForbiddenException(t("Super-admin user cannot be deleted"));
    }

    await deleteUserAccountQuery(userId, transaction);
    await transaction.commit();
    return { deleted: true, userId };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
