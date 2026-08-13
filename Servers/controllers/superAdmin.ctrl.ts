import { Request, Response } from "express";
import fs from "fs";
import jwt from "jsonwebtoken";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { createOrganizationQuery } from "../utils/organization.utils";
import { deleteUserByIdQuery } from "../utils/user.utils";
import { invite } from "./vwmailer.ctrl";
import { OrganizationModel } from "../domain.layer/models/organization/organization.model";
import { getMonitoringConfig, upsertMonitoringConfig } from "../utils/monitoringConfig.utils";
import {
  countSuperAdmins,
  grantSuperAdmin as grantSuperAdminUtil,
  isUserSuperAdmin,
  listSuperAdmins as listSuperAdminsUtil,
  revokeSuperAdmin as revokeSuperAdminUtil,
} from "../utils/superAdmin.utils";

import { translateError } from "../utils/i18n.utils";

/**
 * Strip the auth_header secret before returning config to the browser.
 * The UI only needs to know whether an auth header is set, not its value.
 */
function redactMonitoringConfig(config: Awaited<ReturnType<typeof getMonitoringConfig>>) {
  const { auth_header, ...rest } = config;
  return { ...rest, auth_header_set: Boolean(auth_header) };
}

/**
 * Load the RSA private key used to sign observability push tokens.
 *
 * Accepts either `OBSERVABILITY_PRIVATE_KEY_PATH` (path to a PEM file) or an
 * inline `OBSERVABILITY_PRIVATE_KEY` (PEM, with literal "\n" allowed so it fits
 * on one env line). Returns null when neither is configured.
 */
function loadObservabilityPrivateKey(): string | null {
  const keyPath = process.env.OBSERVABILITY_PRIVATE_KEY_PATH;
  if (keyPath) {
    try {
      return fs.readFileSync(keyPath, "utf8");
    } catch {
      return null;
    }
  }
  const inline = process.env.OBSERVABILITY_PRIVATE_KEY;
  return inline ? inline.replace(/\\n/g, "\n") : null;
}

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
      { type: "SELECT" as any },
    );
    return res.status(200).json(STATUS_CODE[200](organizations));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(_req, error)));
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
      return res
        .status(400)
        .json(STATUS_CODE[400]({ message: req.t!("Organization name is required") }));
    }

    const org = await OrganizationModel.createNewOrganization(name, logo || null);
    const created = await createOrganizationQuery(org, transaction);

    await transaction.commit();
    return res.status(201).json(STATUS_CODE[201](created));
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
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
      return res.status(400).json(STATUS_CODE[400]({ message: req.t!("Invalid organization ID") }));
    }

    // Delete all users in the org first (to clear FK references)
    const users: any[] = await sequelize.query(
      `SELECT id FROM users WHERE organization_id = :orgId`,
      { replacements: { orgId }, type: "SELECT" as any, transaction },
    );

    for (const user of users) {
      await deleteUserByIdQuery(user.id, orgId, transaction);
    }

    // Delete the organization (cascade will handle remaining references)
    await sequelize.query(`DELETE FROM organizations WHERE id = :orgId`, {
      replacements: { orgId },
      transaction,
    });

    await transaction.commit();
    return res.status(200).json(STATUS_CODE[200]({ deleted: true, usersRemoved: users.length }));
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
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
      updates.push("name = :name");
      replacements.name = name;
    }
    if (logo !== undefined) {
      updates.push("logo = :logo");
      replacements.logo = logo;
    }

    if (updates.length === 0) {
      return res.status(400).json(STATUS_CODE[400]({ message: req.t!("No fields to update") }));
    }

    await sequelize.query(
      `UPDATE organizations SET ${updates.join(", ")}, updated_at = NOW() WHERE id = :orgId`,
      { replacements },
    );

    const [updated] = await sequelize.query(`SELECT * FROM organizations WHERE id = :orgId`, {
      replacements: { orgId },
      type: "SELECT" as any,
    });

    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get total user count (excludes pure super-admins with no org/role).
 */
export async function getUserCount(_req: Request, res: Response) {
  try {
    const [result]: any[] = await sequelize.query(
      `SELECT COUNT(*) AS count FROM users WHERE organization_id IS NOT NULL`,
      { type: "SELECT" as any },
    );
    return res.status(200).json(STATUS_CODE[200]({ count: parseInt(result.count, 10) }));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(_req, error)));
  }
}

/**
 * List all users across all organizations (excludes pure super-admins).
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
       WHERE u.organization_id IS NOT NULL
       ORDER BY u.created_at DESC`,
      { type: "SELECT" as any },
    );
    return res.status(200).json(STATUS_CODE[200](users));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(_req, error)));
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
      { replacements: { orgId }, type: "SELECT" as any },
    );

    return res.status(200).json(STATUS_CODE[200](users));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Invite a user to an organization (reuses existing invite flow)
 */
export async function inviteUserToOrg(req: Request, res: Response) {
  const orgId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { email, name, surname, roleId } = req.body;

  if (!email || !name || !roleId) {
    return res
      .status(400)
      .json(STATUS_CODE[400]({ message: req.t!("email, name, and roleId are required") }));
  }

  // Check if a user with this email already exists
  const existing: any[] = await sequelize.query(`SELECT id FROM users WHERE email = :email`, {
    replacements: { email },
    type: "SELECT" as any,
  });
  if (existing.length > 0) {
    return res.status(409).json(STATUS_CODE[409](req.t!("A user with this email already exists")));
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
 * Update a user's details (name, surname, email, role)
 */
export async function updateUser(req: Request, res: Response) {
  try {
    const userId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    const { name, surname, email, roleId } = req.body;

    const rows: any[] = await sequelize.query(
      `SELECT id, role_id, organization_id FROM users WHERE id = :userId`,
      { replacements: { userId }, type: "SELECT" as any },
    );

    if (rows.length === 0) {
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }

    // Pure SuperAdmin (no role, no org) cannot be edited through the
    // tenant user endpoint — they have no org role to change.
    if (rows[0].role_id == null && rows[0].organization_id == null) {
      return res.status(403).json(STATUS_CODE[403](req.t!("Super-admin user cannot be modified")));
    }

    const updates: string[] = [];
    const replacements: any = { userId };

    if (name !== undefined) {
      updates.push("name = :name");
      replacements.name = name;
    }
    if (surname !== undefined) {
      updates.push("surname = :surname");
      replacements.surname = surname;
    }
    if (email !== undefined) {
      updates.push("email = :email");
      replacements.email = email;
    }
    if (roleId !== undefined) {
      updates.push("role_id = :roleId");
      replacements.roleId = roleId;
    }

    if (updates.length === 0) {
      return res.status(400).json(STATUS_CODE[400]({ message: req.t!("No fields to update") }));
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
      { replacements, type: "SELECT" as any },
    );

    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
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
      { replacements: { userId }, type: "SELECT" as any, transaction },
    );
    const user = rows[0];

    if (!user) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }

    // Pure SuperAdmin (no role, no org) is not deletable through this
    // endpoint — the DB trigger would also block it since revoking their
    // super_admins row would orphan them.
    if (user.role_id == null && user.organization_id == null) {
      await transaction.rollback();
      return res.status(403).json(STATUS_CODE[403](req.t!("Super-admin user cannot be deleted")));
    }

    await deleteUserByIdQuery(userId, user.organization_id, transaction);
    await transaction.commit();

    return res.status(200).json(STATUS_CODE[200]({ deleted: true, userId }));
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get the instance-level observability/monitoring configuration.
 * The auth header secret is redacted; only its presence is reported.
 */
export async function getMonitoring(req: Request, res: Response) {
  try {
    const config = await getMonitoringConfig();
    return res.status(200).json(STATUS_CODE[200](redactMonitoringConfig(config)));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Update the instance-level observability/monitoring configuration.
 *
 * Changes take effect after services restart (exporters are configured at
 * startup). The push token in `auth_header` is not set here — it is minted by
 * `generateMonitoringToken` (Generate token button) and preserved across updates.
 */
export async function updateMonitoring(req: Request, res: Response) {
  try {
    const { enabled, otlp_endpoint, deployment_name } = req.body ?? {};

    if (enabled && (!otlp_endpoint || !deployment_name)) {
      return res.status(400).json(
        STATUS_CODE[400]({
          message: req.t!("Observability URL and deployment name are required when enabled"),
        }),
      );
    }

    if (otlp_endpoint) {
      try {
        const url = new URL(String(otlp_endpoint));
        if (!["http:", "https:"].includes(url.protocol)) {
          throw new Error("invalid protocol");
        }
      } catch {
        return res
          .status(400)
          .json(STATUS_CODE[400]({ message: req.t!("Observability URL is not a valid URL") }));
      }
    }

    const existing = await getMonitoringConfig();

    const updated = await upsertMonitoringConfig({
      enabled: Boolean(enabled),
      otlp_endpoint: otlp_endpoint ?? null,
      deployment_name: deployment_name ?? null,
      // Token is minted separately via generateMonitoringToken; preserve it here.
      auth_header: existing.auth_header,
      updated_by: req.userId ?? null,
    });

    return res.status(200).json(STATUS_CODE[200](redactMonitoringConfig(updated)));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * List all SuperAdmins.
 */
export async function listSuperAdmins(_req: Request, res: Response) {
  try {
    const rows = await listSuperAdminsUtil();
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(_req, error)));
  }
}

/**
 * Elect a user as SuperAdmin. Only existing SuperAdmins may call this
 * (enforced by superAdminOnly middleware). Target must be an existing user
 * that isn't already a SuperAdmin.
 */
export async function grantSuperAdmin(req: Request, res: Response) {
  try {
    const rawUserId = req.body?.user_id;
    const targetUserId = typeof rawUserId === "number" ? rawUserId : parseInt(rawUserId, 10);
    if (!targetUserId || isNaN(targetUserId)) {
      return res.status(400).json(STATUS_CODE[400]({ message: req.t!("user_id is required") }));
    }

    const rows: any[] = await sequelize.query(`SELECT id FROM users WHERE id = :userId LIMIT 1`, {
      replacements: { userId: targetUserId },
      type: "SELECT" as any,
    });
    if (!rows[0]) {
      return res.status(404).json(STATUS_CODE[404](req.t!("User not found")));
    }
    if (await isUserSuperAdmin(targetUserId)) {
      return res
        .status(409)
        .json(STATUS_CODE[409]({ message: req.t!("User is already a SuperAdmin") }));
    }

    await grantSuperAdminUtil(targetUserId);
    return res.status(201).json(STATUS_CODE[201]({ user_id: targetUserId }));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Revoke a user's SuperAdmin status. Blocks the request when the target is
 * the last remaining SuperAdmin — the only rule; prevents lockout.
 */
export async function revokeSuperAdmin(req: Request, res: Response) {
  try {
    const rawUserId = Array.isArray(req.params.user_id)
      ? req.params.user_id[0]
      : req.params.user_id;
    const targetUserId = parseInt(rawUserId, 10);
    if (!targetUserId || isNaN(targetUserId)) {
      return res.status(400).json(STATUS_CODE[400]({ message: req.t!("Invalid user id") }));
    }

    if (targetUserId === req.userId) {
      return res
        .status(400)
        .json(STATUS_CODE[400]({ message: req.t!("You cannot revoke your own Super Admin role") }));
    }
    if (!(await isUserSuperAdmin(targetUserId))) {
      return res
        .status(404)
        .json(STATUS_CODE[404]({ message: req.t!("User is not a SuperAdmin") }));
    }
    if ((await countSuperAdmins()) <= 1) {
      return res
        .status(400)
        .json(STATUS_CODE[400]({ message: req.t!("Cannot revoke the last SuperAdmin") }));
    }

    await revokeSuperAdminUtil(targetUserId);
    return res.status(200).json(STATUS_CODE[200]({ revoked: true, user_id: targetUserId }));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Generate a signed observability push token and store it on the config row.
 *
 * The token is an RS256 JWT signed with the backend's RSA private key
 * (OBSERVABILITY_PRIVATE_KEY[_PATH]), carrying `sub = deployment_name`. The
 * observability VM's nginx verifies it with the matching PUBLIC key — the VM
 * never holds a signing key. The raw token is never returned to the frontend;
 * the UI only sees `auth_header_set: true` on the next GET.
 */
export async function generateMonitoringToken(req: Request, res: Response) {
  try {
    const privateKey = loadObservabilityPrivateKey();
    if (!privateKey) {
      return res.status(500).json(
        STATUS_CODE[500]({
          message: req.t!("OBSERVABILITY_PRIVATE_KEY is not configured on the server"),
        }),
      );
    }

    const existing = await getMonitoringConfig();
    const deploymentName = existing.deployment_name?.trim();
    if (!deploymentName) {
      return res.status(400).json(
        STATUS_CODE[400]({
          message: req.t!("Set and save a deployment name before generating a token"),
        }),
      );
    }

    let token: string;
    try {
      token = jwt.sign({ sub: deploymentName }, privateKey, { algorithm: "RS256" });
    } catch {
      return res.status(500).json(
        STATUS_CODE[500]({
          message: req.t!(
            "Failed to sign token — check OBSERVABILITY_PRIVATE_KEY is a valid RSA private key",
          ),
        }),
      );
    }

    const updated = await upsertMonitoringConfig({
      enabled: existing.enabled,
      otlp_endpoint: existing.otlp_endpoint,
      deployment_name: existing.deployment_name,
      auth_header: `Authorization: Bearer ${token}`,
      updated_by: req.userId ?? null,
    });

    return res.status(200).json(STATUS_CODE[200](redactMonitoringConfig(updated)));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
