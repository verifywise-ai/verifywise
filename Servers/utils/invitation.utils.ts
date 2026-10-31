import { QueryTypes, Transaction } from "sequelize";
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
  /** expires_at as epoch ms, the form a link and the guarded writes compare. */
  expires_at_ms?: number;
}

/**
 * An invitation in the state a caller checked it: its id, role and expiry.
 * Every invite and resend writes a new expiry, so a write guarded by all
 * three applies only while nothing has changed the invitation since.
 */
export interface CheckedInvitation {
  id: number;
  roleId: number;
  expiresAtMs: number;
}

/** The guard: the invitation is still as it was checked. */
const UNCHANGED_SINCE_CHECK = `invitations.id = :checkedId
       AND invitations.role_id = :checkedRoleId
       AND ROUND(EXTRACT(EPOCH FROM invitations.expires_at) * 1000) = :checkedExpiresAtMs`;

const checkedReplacements = (checked: CheckedInvitation) => ({
  checkedId: checked.id,
  checkedRoleId: checked.roleId,
  checkedExpiresAtMs: checked.expiresAtMs,
});

/**
 * Create or update an invitation record.
 * Uses ON CONFLICT with partial unique index (organization_id, email) WHERE status='pending'.
 *
 * `replace` (when given) is the pending invitation the caller checked it
 * may replace, or null if it saw none: an existing pending invitation is then
 * rewritten only while it is unchanged since that check, and null is returned
 * when it is not (another invite or a resend changed it in between).
 */
export const createInvitationQuery = async (
  organizationId: number,
  email: string,
  name: string,
  surname: string,
  roleId: number,
  invitedBy: number,
  expiresAt: Date,
  options: { transaction?: Transaction; replace?: CheckedInvitation | null } = {},
): Promise<InvitationRow | null> => {
  const { replace } = options;
  const guard =
    replace === undefined
      ? ""
      : replace === null
        ? "WHERE FALSE"
        : `WHERE ${UNCHANGED_SINCE_CHECK}`;
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
     ${guard}
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
        ...(replace ? checkedReplacements(replace) : {}),
      },
      transaction: options.transaction,
    },
  )) as [InvitationRow[], number];

  return result[0][0] ?? null;
};

/**
 * Get all pending invitations for an organization, joined with role name.
 */
export const getInvitationsByOrganizationQuery = async (
  organizationId: number,
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
    { replacements: { organizationId } },
  )) as [InvitationRow[], number];

  return result[0];
};

/**
 * @deprecated Use getInvitationsByOrganizationQuery instead
 */
export const getInvitationsByTenantQuery = getInvitationsByOrganizationQuery;

/**
 * Get a single pending invitation by id, with its expiry as epoch ms.
 */
export const getInvitationByIdQuery = async (
  organizationId: number,
  id: number,
): Promise<InvitationRow | null> => {
  const result = (await sequelize.query(
    `SELECT i.*, r.name AS role_name,
            ROUND(EXTRACT(EPOCH FROM i.expires_at) * 1000) AS expires_at_ms
     FROM invitations i
     LEFT JOIN roles r ON r.id = i.role_id
     WHERE i.organization_id = :organizationId AND i.id = :id AND i.status = 'pending'`,
    { replacements: { organizationId, id } },
  )) as [InvitationRow[], number];

  const row = result[0][0];
  return row ? { ...row, expires_at_ms: Number(row.expires_at_ms) } : null;
};

/**
 * The state a caller checks an invitation in, from a row read by
 * getInvitationByIdQuery (the only reader that returns expires_at_ms).
 */
export const checkedInvitation = (row: InvitationRow): CheckedInvitation => {
  const expiresAtMs = Number(row.expires_at_ms);
  if (!Number.isFinite(expiresAtMs)) {
    throw new Error("checkedInvitation needs a row with expires_at_ms");
  }
  return { id: row.id, roleId: row.role_id, expiresAtMs };
};

/**
 * Revoke (delete) a pending invitation, only while it holds the role the
 * caller was checked against: a re-invite in between can change it. The
 * expiry is not compared, since a resend in between leaves the check valid.
 */
export const revokeInvitationQuery = async (
  organizationId: number,
  checked: CheckedInvitation,
): Promise<boolean> => {
  const result = (await sequelize.query(
    `DELETE FROM invitations
     WHERE organization_id = :organizationId AND status = 'pending'
       AND id = :id AND role_id = :roleId
     RETURNING id`,
    { replacements: { organizationId, id: checked.id, roleId: checked.roleId } },
  )) as [InvitationRow[], number];

  return result[0].length > 0;
};

/**
 * Mark the invitation a registration link was checked against as accepted,
 * only if it is still pending in the state that was checked: same role and
 * same expiry. A re-invite of a pending email rewrites the same row (same id),
 * so matching the id alone would let the old link use the new invitation.
 * Pass the user-creation transaction so the user and the used-up link commit
 * together. Returns 1 if accepted; 0 if it was revoked, used or rewritten.
 */
export const markInvitationAcceptedQuery = async (
  organizationId: number,
  checked: CheckedInvitation,
  transaction?: Transaction,
): Promise<number> => {
  const rows = await sequelize.query(
    `UPDATE invitations
     SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
     WHERE organization_id = :organizationId AND status = 'pending'
       AND ${UNCHANGED_SINCE_CHECK}
     RETURNING id`,
    {
      replacements: { organizationId, ...checkedReplacements(checked) },
      transaction,
      type: QueryTypes.SELECT,
    },
  );
  return rows.length;
};

/**
 * Update invitation expiry after resend. Only a pending invitation unchanged
 * since the caller was checked against it is extended, so one accepted,
 * revoked, resent or re-invited since it was read stays as it is (and its
 * newer link keeps working). Returns the row as updated (null when nothing
 * was), so the resent link is signed from the row itself.
 */
export const updateInvitationExpiryQuery = async (
  organizationId: number,
  checked: CheckedInvitation,
  expiresAt: Date,
): Promise<{ email: string; name: string; surname: string; role_id: number } | null> => {
  const rows = (await sequelize.query(
    `UPDATE invitations
     SET created_at = CURRENT_TIMESTAMP, expires_at = :expiresAt, updated_at = CURRENT_TIMESTAMP
     WHERE organization_id = :organizationId AND status = 'pending'
       AND ${UNCHANGED_SINCE_CHECK}
     RETURNING email, name, surname, role_id`,
    {
      replacements: {
        organizationId,
        ...checkedReplacements(checked),
        expiresAt: expiresAt.toISOString(),
      },
      type: QueryTypes.SELECT,
    },
  )) as { email: string; name: string; surname: string; role_id: number }[];
  return rows[0] ?? null;
};

/**
 * The pending invitation for an email, with its expiry as epoch ms. The
 * column is TIMESTAMP (no zone) holding UTC, which EXTRACT(EPOCH) reads as UTC.
 */
export const getPendingInvitationQuery = async (
  organizationId: number,
  email: string,
  transaction?: Transaction,
): Promise<{ id: number; role_id: number; expires_at_ms: number } | null> => {
  const result = (await sequelize.query(
    `SELECT id, role_id, ROUND(EXTRACT(EPOCH FROM expires_at) * 1000) AS expires_at_ms
     FROM invitations
     WHERE organization_id = :organizationId AND email = :email AND status = 'pending'
     ORDER BY id DESC
     LIMIT 1`,
    { replacements: { organizationId, email }, transaction },
  )) as [{ id: number; role_id: number; expires_at_ms: string | number }[], number];

  const row = result[0][0];
  return row
    ? { id: row.id, role_id: row.role_id, expires_at_ms: Number(row.expires_at_ms) }
    : null;
};
