import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { createOrganizationQuery } from "../utils/organization.utils";
import { deleteUserByIdQuery } from "../utils/user.utils";
import { invite } from "./vwmailer.ctrl";
import { OrganizationModel } from "../domain.layer/models/organization/organization.model";

/**
 * List all organizations
 */
export async function listOrganizations(_req: Request, res: Response) {
  try {
    const organizations = await sequelize.query(
      `SELECT o.id, o.name, o.logo, o.created_at, o.onboarding_status,
              (SELECT COUNT(*) FROM users u WHERE u.organization_id = o.id) AS user_count
       FROM organizations o
       ORDER BY o.created_at DESC`,
      { type: 'SELECT' as any }
    );
    return res.status(200).json(STATUS_CODE[200](organizations));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Create a new organization (name + logo only, no admin user)
 */
export async function createOrg(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  try {
    const { name, logo } = req.body;
    if (!name) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]({ message: "Organization name is required" }));
    }

    const org = await OrganizationModel.createNewOrganization(name, logo || null);
    const created = await createOrganizationQuery(org, transaction);

    await transaction.commit();
    return res.status(201).json(STATUS_CODE[201](created));
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Delete an organization and all its data (cascade)
 */
export async function deleteOrg(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  try {
    const orgId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(orgId)) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]({ message: "Invalid organization ID" }));
    }

    // Delete all users in the org first (to clear FK references)
    const users: any[] = await sequelize.query(
      `SELECT id FROM users WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: 'SELECT' as any, transaction }
    );

    for (const user of users) {
      await deleteUserByIdQuery(user.id, orgId, transaction);
    }

    // Delete the organization (cascade will handle remaining references)
    await sequelize.query(
      `DELETE FROM organizations WHERE id = :orgId`,
      { replacements: { orgId }, transaction }
    );

    await transaction.commit();
    return res.status(200).json(STATUS_CODE[200]({ deleted: true, usersRemoved: users.length }));
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Update organization name/settings
 */
export async function updateOrg(req: Request, res: Response) {
  try {
    const orgId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    const { name, logo } = req.body;

    const updates: string[] = [];
    const replacements: any = { orgId };

    if (name !== undefined) {
      updates.push('name = :name');
      replacements.name = name;
    }
    if (logo !== undefined) {
      updates.push('logo = :logo');
      replacements.logo = logo;
    }

    if (updates.length === 0) {
      return res.status(400).json(STATUS_CODE[400]({ message: "No fields to update" }));
    }

    await sequelize.query(
      `UPDATE organizations SET ${updates.join(', ')}, updated_at = NOW() WHERE id = :orgId`,
      { replacements }
    );

    const [updated] = await sequelize.query(
      `SELECT * FROM organizations WHERE id = :orgId`,
      { replacements: { orgId }, type: 'SELECT' as any }
    );

    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * List all users across all organizations
 */
export async function listAllUsers(_req: Request, res: Response) {
  try {
    const users = await sequelize.query(
      `SELECT u.id, u.name, u.surname, u.email, u.role_id, r.name as role_name,
              u.organization_id, o.name as organization_name,
              u.created_at, u.last_login
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN organizations o ON u.organization_id = o.id
       WHERE u.role_id != 5
       ORDER BY u.created_at DESC`,
      { type: 'SELECT' as any }
    );
    return res.status(200).json(STATUS_CODE[200](users));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * List users in an organization
 */
export async function listOrgUsers(req: Request, res: Response) {
  try {
    const orgId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

    const users = await sequelize.query(
      `SELECT u.id, u.name, u.surname, u.email, u.role_id, r.name as role_name,
              u.created_at, u.last_login
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.organization_id = :orgId
       ORDER BY u.created_at ASC`,
      { replacements: { orgId }, type: 'SELECT' as any }
    );

    return res.status(200).json(STATUS_CODE[200](users));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Invite a user to an organization (reuses existing invite flow)
 */
export async function inviteUserToOrg(req: Request, res: Response) {
  const orgId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { email, name, surname, roleId } = req.body;

  if (!email || !name || !roleId) {
    return res.status(400).json(STATUS_CODE[400]({ message: "email, name, and roleId are required" }));
  }

  // Prevent creating super-admin users via invite
  if (roleId === 5) {
    return res.status(403).json(STATUS_CODE[403]("Cannot invite users with SuperAdmin role"));
  }

  // Check if a user with this email already exists
  const existing: any[] = await sequelize.query(
    `SELECT id FROM users WHERE email = :email`,
    { replacements: { email }, type: 'SELECT' as any }
  );
  if (existing.length > 0) {
    return res.status(409).json(STATUS_CODE[409]("A user with this email already exists"));
  }

  return invite(req, res, {
    to: email,
    name,
    surname,
    roleId,
    organizationId: orgId,
  });
}

/**
 * Remove a user from their organization
 */
export async function removeUser(req: Request, res: Response) {
  const transaction = await sequelize.transaction();
  try {
    const userId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

    const rows: any[] = await sequelize.query(
      `SELECT id, organization_id, role_id FROM users WHERE id = :userId`,
      { replacements: { userId }, type: 'SELECT' as any, transaction }
    );
    const user = rows[0];

    if (!user) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]("User not found"));
    }

    // Prevent deletion of super-admin
    if (user.role_id === 5) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403]("Super-admin user cannot be deleted"));
    }

    await deleteUserByIdQuery(userId, user.organization_id, transaction);
    await transaction.commit();

    return res.status(200).json(STATUS_CODE[200]({ deleted: true, userId }));
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
