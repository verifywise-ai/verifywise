import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import type { NoticeState } from "../services/changeNotice/rules";

export type NoticeContext = {
  state: NoticeState | undefined;
  accountCreatedAt: Date;
  orgFirstSeenAt: Date | null;
  keyCount: number;
};

type ContextRow = {
  state: NoticeState | null;
  account_created_at: Date;
  org_first_seen_at: Date | null;
  key_count: string | number;
};

/**
 * Everything the show rules need, in one read: this user's state for the
 * notice, when their account was created, the earliest first view of the
 * notice across the organization's members, and how many notice keys they hold.
 * Null when the user does not exist.
 */
export const getNoticeContextQuery = async (
  userId: number,
  organizationId: number,
  id: string,
): Promise<NoticeContext | null> => {
  const [row] = await sequelize.query<ContextRow>(
    `SELECT
       -- users.created_at is timestamp WITHOUT time zone: read it in the session zone it was written in.
       u.created_at::timestamptz AS account_created_at,
       up.preferences->'change_notices'->(:id) AS state,
       (SELECT COUNT(*) FROM jsonb_object_keys(COALESCE(up.preferences->'change_notices', '{}'::jsonb))) AS key_count,
       (SELECT MIN((mp.preferences->'change_notices'->(:id)->>'first_seen_at')::timestamptz)
          FROM organization_members om
          JOIN user_preferences mp ON mp.user_id = om.user_id
         WHERE om.organization_id = :organizationId) AS org_first_seen_at
     FROM users u
     LEFT JOIN user_preferences up ON up.user_id = u.id
     WHERE u.id = :userId`,
    { replacements: { userId, organizationId, id }, type: QueryTypes.SELECT },
  );
  if (!row) return null;
  return {
    state: row.state ?? undefined,
    accountCreatedAt: new Date(row.account_created_at),
    orgFirstSeenAt: row.org_first_seen_at ? new Date(row.org_first_seen_at) : null,
    keyCount: Number(row.key_count),
  };
};

/**
 * Upserts this notice's state into user_preferences.preferences.change_notices
 * in ONE statement. The row is merged from its own current value inside the
 * conflict update, so concurrent calls serialize on the row lock and no count
 * is lost, and the user's other keys (date_format, parallel_agents, the other
 * notices) are kept. `extraPairs` are jsonb_build_object arguments applied on
 * top of the merged notice; the insert side starts from the same defaults.
 */
const upsertNotice = async (
  userId: number,
  id: string,
  nowIso: string,
  viewIncrement: 0 | 1,
  extraPairs: string,
  extraReplacements: Record<string, unknown>,
): Promise<void> => {
  const old = `(user_preferences.preferences->'change_notices'->(:id))`;
  const merged = `COALESCE(${old}, '{}'::jsonb) || jsonb_build_object(
      'first_seen_at', COALESCE(${old}->>'first_seen_at', :nowIso::text),
      'views', COALESCE((${old}->>'views')::int, 0) + ${viewIncrement}${extraPairs ? `, ${extraPairs}` : ""})`;
  const fresh = `jsonb_build_object(
      'first_seen_at', :nowIso::text,
      'views', ${viewIncrement}${extraPairs ? `, ${extraPairs}` : ""})`;
  // A fresh notice has no "dismissed_at" unless the caller sets it.
  const freshWithDefault = extraPairs.includes("dismissed_at")
    ? fresh
    : `${fresh} || jsonb_build_object('dismissed_at', NULL::text)`;

  await sequelize.query(
    `INSERT INTO user_preferences (user_id, preferences)
     VALUES (:userId, jsonb_build_object('change_notices', jsonb_build_object(:id::text, ${freshWithDefault})))
     ON CONFLICT (user_id) DO UPDATE SET
       preferences = COALESCE(user_preferences.preferences, '{}'::jsonb)
         || jsonb_build_object('change_notices',
              COALESCE(user_preferences.preferences->'change_notices', '{}'::jsonb)
                || jsonb_build_object(:id::text, ${merged})),
       updated_at = NOW()`,
    { replacements: { userId, id, nowIso, ...extraReplacements } },
  );
};

/** Counts one visit; sets first_seen_at the first time. */
export const recordViewQuery = (userId: number, id: string, nowIso: string): Promise<void> =>
  upsertNotice(userId, id, nowIso, 1, "", {});

/** Sets or clears dismissed_at, keeping the other fields. */
export const setDismissedQuery = (
  userId: number,
  id: string,
  dismissed: boolean,
  nowIso: string,
): Promise<void> =>
  upsertNotice(userId, id, nowIso, 0, `'dismissed_at', :dismissedAt::text`, {
    dismissedAt: dismissed ? nowIso : null,
  });
