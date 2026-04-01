import { sequelize } from "../database/db";

interface InvitationRow {
  id: number;
  email: string;
  name: string;
  surname: string;
  role_id: number;
  status: string;
  invited_by: number;
  created_at: string;
  expires_at: string;
  updated_at: string;
  role_name?: string;
}

/**
 * Create or update an invitation record.
 * Uses ON CONFLICT with partial unique index (organization_id, email) WHERE status='pending'.
 */
export const createInvitationQuery = async (
  organizationId: number,
  email: string,
  name: string,
  surname: string,
  roleId: number,
  invitedBy: number,
  expiresAt: Date
): Promise<InvitationRow> => {
  const result = (await sequelize.query(
    `INSERT INTO invitations (organization_id, email, name, surname, role_id, status, invited_by, expires_at)
     VALUES (:organizationId, :email, :name, :surname, :roleId, 'pending', :invitedBy, :expiresAt)
     ON CONFLICT (organization_id, email) WHERE status = 'pending'
     DO UPDATE SET
       name = EXCLUDED.name,
       surname = EXCLUDED.surname,
       role_id = EXCLUDED.role_id,
       invited_by = EXCLUDED.invited_by,
       expires_at = EXCLUDED.expires_at,
       created_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    {
      replacements: {
        organizationId,
        email,
        name,
        surname,
        roleId,
        invitedBy,
        expiresAt: expiresAt.toISOString(),
      },
    }
  )) as [InvitationRow[], number];

  return result[0][0];
};

/**
 * Get all pending invitations for an organization, joined with role name.
 */
export const getInvitationsByOrganizationQuery = async (
  organizationId: number
): Promise<InvitationRow[]> => {
  const result = (await sequelize.query(
    `SELECT i.id, i.email, i.name, i.surname, i.role_id, i.status, i.invited_by,
            to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(i.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS expires_at,
            i.updated_at,
            r.name AS role_name
     FROM invitations i
     LEFT JOIN roles r ON r.id = i.role_id
     WHERE i.organization_id = :organizationId AND i.status = 'pending'
     ORDER BY i.created_at DESC`,
    { replacements: { organizationId } }
  )) as [InvitationRow[], number];

  return result[0];
};

/**
 * @deprecated Use getInvitationsByOrganizationQuery instead
 */
export const getInvitationsByTenantQuery = getInvitationsByOrganizationQuery;

/**
 * Get a single invitation by id.
 */
export const getInvitationByIdQuery = async (
  organizationId: number,
  id: number
): Promise<InvitationRow | null> => {
  const result = (await sequelize.query(
    `SELECT i.*, r.name AS role_name
     FROM invitations i
     LEFT JOIN roles r ON r.id = i.role_id
     WHERE i.organization_id = :organizationId AND i.id = :id AND i.status = 'pending'`,
    { replacements: { organizationId, id } }
  )) as [InvitationRow[], number];

  return result[0][0] || null;
};

/**
 * Revoke (delete) an invitation.
 */
export const revokeInvitationQuery = async (
  organizationId: number,
  id: number
): Promise<boolean> => {
  const result = (await sequelize.query(
    `DELETE FROM invitations
     WHERE organization_id = :organizationId AND id = :id AND status = 'pending'
     RETURNING id`,
    { replacements: { organizationId, id } }
  )) as [InvitationRow[], number];

  return result[0].length > 0;
};

/**
 * Mark invitation as accepted when user registers via invite link.
 */
export const markInvitationAcceptedQuery = async (
  organizationId: number,
  email: string
): Promise<void> => {
  await sequelize.query(
    `UPDATE invitations
     SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
     WHERE organization_id = :organizationId AND email = :email AND status = 'pending'`,
    { replacements: { organizationId, email } }
  );
};

/**
 * Update invitation expiry after resend.
 */
export const updateInvitationExpiryQuery = async (
  organizationId: number,
  id: number,
  expiresAt: Date
): Promise<void> => {
  await sequelize.query(
    `UPDATE invitations
     SET created_at = CURRENT_TIMESTAMP, expires_at = :expiresAt, updated_at = CURRENT_TIMESTAMP
     WHERE organization_id = :organizationId AND id = :id`,
    { replacements: { organizationId, id, expiresAt: expiresAt.toISOString() } }
  );
};

/**
 * Check if a pending invitation exists for the given email.
 * Used during registration to verify the invitation wasn't revoked.
 */
export const checkPendingInvitationQuery = async (
  organizationId: number,
  email: string
): Promise<boolean> => {
  const result = (await sequelize.query(
    `SELECT id FROM invitations
     WHERE organization_id = :organizationId AND email = :email AND status = 'pending'
     LIMIT 1`,
    { replacements: { organizationId, email } }
  )) as [InvitationRow[], number];

  return result[0].length > 0;
};
