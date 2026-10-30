import { Request, Response } from "express";
import fs from "fs";
import jwt from "jsonwebtoken";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { createOrganizationQuery } from "../utils/organization.utils";
import { invite } from "./vwmailer.ctrl";
import { OrganizationModel } from "../domain.layer/models/organization/organization.model";
import { getMonitoringConfig, upsertMonitoringConfig } from "../utils/monitoringConfig.utils";
import {
  createOrganizationWithUser,
  createUserInOrganization,
  deleteOrganization,
  removeUserById,
  removeUserFromOrganization,
  updateOrganization,
  updateUserDetails,
} from "../services/superAdmin.service";
import { getInvitationsByOrganizationQuery } from "../utils/invitation.utils";
import { sendInviteEmail } from "../utils/inviteEmail.utils";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import {
  countSuperAdmins,
  grantSuperAdmin as grantSuperAdminUtil,
  isUserSuperAdmin,
  listAllUsersQuery,
  organizationExists,
  listOrganizationUsersQuery,
  listOrganizationsQuery,
  listSuperAdmins as listSuperAdminsUtil,
  revokeSuperAdmin as revokeSuperAdminUtil,
} from "../utils/superAdmin.utils";

import { translateError } from "../utils/i18n.utils";
import { getUserOrganizationsQuery } from "../utils/organizationMember.utils";

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

/** A role id from a request body as a positive integer, or null if it is not one. */
const parseRoleId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * List all organizations
 */
export async function listOrganizations(_req: Request, res: Response) {
  try {
    return res.status(200).json(STATUS_CODE[200](await listOrganizationsQuery()));
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
 * Create an org and its first user (invite or direct) in a single transaction.
 * Either both persist or neither does — prevents orphan orgs when the user
 * step fails. For invite mode the email is sent after commit; delivery failure
 * still leaves the invitation record intact (206 partial-success response).
 */
export async function createOrgWithUser(req: Request, res: Response) {
  const { orgName, logo, mode, user } = req.body as {
    orgName?: string;
    logo?: string;
    mode?: "invite" | "direct";
    user?: {
      email?: string;
      name?: string;
      surname?: string;
      roleId?: number;
      password?: string;
    };
  };

  if (!orgName?.trim()) {
    return res
      .status(400)
      .json(STATUS_CODE[400]({ message: req.t!("Organization name is required") }));
  }
  if (mode !== "invite" && mode !== "direct") {
    return res
      .status(400)
      .json(STATUS_CODE[400]({ message: req.t!("mode must be invite or direct") }));
  }
  if (!user?.email || !user.name || !user.roleId) {
    return res
      .status(400)
      .json(STATUS_CODE[400]({ message: req.t!("user email, name, and roleId are required") }));
  }
  if (mode === "direct" && !user.surname) {
    return res
      .status(400)
      .json(STATUS_CODE[400]({ message: req.t!("surname is required for direct creation") }));
  }
  const roleId = parseRoleId(user.roleId);
  if (roleId === null) {
    return res
      .status(400)
      .json(STATUS_CODE[400]({ message: req.t!("Unknown role"), field: "roleId" }));
  }

  let orgId: number | undefined;
  // Invite mode stores this on the row and signs the emailed link for it.
  let invitationExpiresAt: Date;
  let existingAccount = false;

  try {
    const created = await createOrganizationWithUser({
      orgName,
      logo,
      mode,
      user: {
        email: user.email,
        name: user.name,
        surname: user.surname,
        roleId,
        password: user.password,
      },
      invitedBy: req.userId!,
      t: req.t!,
    });
    orgId = created.organizationId;
    invitationExpiresAt = created.invitationExpiresAt;
    existingAccount = created.existingAccount;
  } catch (error: any) {
    if (error instanceof ConflictException) {
      return res.status(409).json(STATUS_CODE[409](error.message));
    }
    if (error instanceof ValidationException) {
      return res
        .status(400)
        .json(STATUS_CODE[400]({ message: error.message, field: error.metadata?.field }));
    }
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }

  if (mode === "invite") {
    try {
      // The row is already stored; sign the link for the same expires_at so
      // the Team page's Pending/Expired matches the link that was sent.
      const { link, info } = await sendInviteEmail({
        email: user.email,
        name: user.name,
        surname: user.surname ?? "",
        roleId,
        organizationId: orgId,
        lang: req.lang,
        expiresAt: invitationExpiresAt,
      });
      if (info.error) {
        return res.status(206).json(
          STATUS_CODE[206]({
            organizationId: orgId,
            error: `${info.error.name}: ${info.error.message}`,
            link,
          }),
        );
      }
    } catch (emailErr: any) {
      return res.status(206).json(
        STATUS_CODE[206]({
          organizationId: orgId,
          error: emailErr?.message || "Failed to send invitation email",
        }),
      );
    }
  }

  return res.status(201).json(STATUS_CODE[201]({ organizationId: orgId, existingAccount }));
}

/**
 * Delete an organization and all its data (cascade)
 */
export async function deleteOrg(req: Request, res: Response) {
  try {
    const orgId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(orgId)) {
      return res.status(400).json(STATUS_CODE[400]({ message: req.t!("Invalid organization ID") }));
    }

    const { usersRemoved } = await deleteOrganization(orgId);
    return res.status(200).json(STATUS_CODE[200]({ deleted: true, usersRemoved }));
  } catch (error) {
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

    const updated = await updateOrganization(orgId, { name, logo }, req.t!);
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400]({ message: error.message }));
    }
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Get total user count: people in at least one organization (excludes pure
 * super-admins, who have no membership).
 */
export async function getUserCount(_req: Request, res: Response) {
  try {
    const [result]: any[] = await sequelize.query(
      `SELECT COUNT(DISTINCT user_id) AS count FROM organization_members`,
      { type: "SELECT" as any },
    );
    return res.status(200).json(STATUS_CODE[200]({ count: parseInt(result.count, 10) }));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(_req, error)));
  }
}

/**
 * List every organization membership across all organizations (excludes pure
 * super-admins). A user in several organizations has one row per organization.
 */
export async function listAllUsers(_req: Request, res: Response) {
  try {
    return res.status(200).json(STATUS_CODE[200](await listAllUsersQuery()));
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

    return res.status(200).json(STATUS_CODE[200](await listOrganizationUsersQuery(orgId)));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Remove a user from one organization; the account is deleted only when it
 * was their last one.
 */
export async function removeOrgUser(req: Request, res: Response) {
  try {
    const orgId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    const userId = parseInt(
      Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId,
      10,
    );
    if (isNaN(orgId)) {
      return res.status(400).json(STATUS_CODE[400]({ message: req.t!("Invalid organization ID") }));
    }
    if (isNaN(userId)) {
      return res.status(400).json(STATUS_CODE[400]({ message: req.t!("Invalid user ID") }));
    }
    return res
      .status(200)
      .json(STATUS_CODE[200](await removeUserFromOrganization(orgId, userId, req.t!)));
  } catch (error) {
    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404](error.message));
    }
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * List pending invitations for an organization.
 */
export async function listOrgInvitations(req: Request, res: Response) {
  try {
    const orgId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    if (isNaN(orgId)) {
      return res.status(400).json(STATUS_CODE[400]({ message: req.t!("Invalid organization ID") }));
    }
    const invitations = await getInvitationsByOrganizationQuery(orgId);
    return res.status(200).json(STATUS_CODE[200](invitations));
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

  // The organization is passed to invite() as trusted, so it must be real.
  if (!Number.isInteger(orgId) || orgId <= 0) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid organization ID")));
  }
  try {
    if (!(await organizationExists(orgId))) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Organization not found")));
    }
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }

  // The organization comes from the route, passed as trusted: invite()
  // ignores an organization in the body.
  return invite(req, res, { to: email, name, surname, roleId }, { organizationId: orgId });
}

/**
 * Check whether a user with the given email already exists.
 * Used by SuperAdmin flows to pre-validate before creating an org + user pair,
 * so we don't leave an orphan org when the user step would 409.
 */
export async function emailExists(req: Request, res: Response) {
  const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
  if (!email) {
    return res.status(400).json(STATUS_CODE[400]({ message: req.t!("email is required") }));
  }
  try {
    const rows: any[] = await sequelize.query(
      `SELECT 1 FROM users WHERE LOWER(email) = LOWER(:email) LIMIT 1`,
      { replacements: { email }, type: "SELECT" as any },
    );
    return res.status(200).json(STATUS_CODE[200]({ exists: rows.length > 0 }));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Create a user directly inside an organization (no invitation email).
 * Password is set by the SuperAdmin; user is active immediately.
 */
export async function createUserInOrg(req: Request, res: Response) {
  const orgId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(orgId)) {
    return res.status(400).json(STATUS_CODE[400]({ message: req.t!("Invalid organization ID") }));
  }

  // The password is checked by the service: only a new account needs one.
  const { email, name, surname, password } = req.body;
  if (!email || !name || !surname || !req.body.roleId) {
    return res.status(400).json(
      STATUS_CODE[400]({
        message: req.t!("email, name, surname, and roleId are required"),
      }),
    );
  }
  const roleId = parseRoleId(req.body.roleId);
  if (roleId === null) {
    return res
      .status(400)
      .json(STATUS_CODE[400]({ message: req.t!("Unknown role"), field: "roleId" }));
  }

  try {
    const safeUser = await createUserInOrganization({
      organizationId: orgId,
      email,
      name,
      surname,
      password,
      roleId,
      t: req.t!,
    });
    return res.status(201).json(STATUS_CODE[201](safeUser));
  } catch (error: any) {
    if (error instanceof ConflictException) {
      return res.status(409).json(STATUS_CODE[409](error.message));
    }
    if (error instanceof ValidationException) {
      return res
        .status(400)
        .json(STATUS_CODE[400]({ message: error.message, field: error.metadata?.field }));
    }
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Update a user's details (name, surname, email), and their role in the
 * organization named by organizationId.
 */
export async function updateUser(req: Request, res: Response) {
  try {
    const userId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    const { name, surname, email, roleId, organizationId } = req.body;

    const updated = await updateUserDetails(
      userId,
      { name, surname, email, roleId, organizationId },
      req.t!,
    );
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404](error.message));
    }
    if (error instanceof ForbiddenException) {
      return res.status(403).json(STATUS_CODE[403](error.message));
    }
    if (error instanceof ValidationException) {
      return res
        .status(400)
        .json(STATUS_CODE[400]({ message: error.message, field: error.metadata?.field }));
    }
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Delete a user's account, from every organization they belong to
 */
export async function removeUser(req: Request, res: Response) {
  try {
    const userId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    return res.status(200).json(STATUS_CODE[200](await removeUserById(userId, req.t!)));
  } catch (error) {
    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404](error.message));
    }
    if (error instanceof ForbiddenException) {
      return res.status(403).json(STATUS_CODE[403](error.message));
    }
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
    // A pure super admin (no organization) is one only through super_admins:
    // revoking would leave an account that belongs nowhere.
    if ((await getUserOrganizationsQuery(targetUserId)).length === 0) {
      return res.status(400).json(
        STATUS_CODE[400]({
          message: req.t!("A super admin with no organization cannot be revoked"),
        }),
      );
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
