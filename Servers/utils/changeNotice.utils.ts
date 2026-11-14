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

const OLD_STATE = `(user_preferences.preferences->'change_notices'->(:id))`;

/**
 * Counts one visit in ONE statement. The notice is merged from its own current
 * value inside the conflict update, so concurrent calls serialize on the row
 * lock and no count is lost, and the user's other keys (date_format,
 * parallel_agents, the other notices) are kept. first_seen_at is only ever set
 * here: COALESCE(old value, now), so a view after a dismiss-created null fills it.
 */
export const recordViewQuery = async (
  userId: number,
  id: string,
  nowIso: string,
): Promise<void> => {
  await sequelize.query(
    `INSERT INTO user_preferences (user_id, preferences)
     VALUES (:userId, jsonb_build_object('change_notices', jsonb_build_object(:id::text,
       jsonb_build_object('first_seen_at', :nowIso::text, 'views', 1, 'dismissed_at', NULL::text))))
     ON CONFLICT (user_id) DO UPDATE SET
       preferences = COALESCE(user_preferences.preferences, '{}'::jsonb)
         || jsonb_build_object('change_notices',
              COALESCE(user_preferences.preferences->'change_notices', '{}'::jsonb)
                || jsonb_build_object(:id::text,
                     COALESCE(${OLD_STATE}, '{}'::jsonb) || jsonb_build_object(
                       'first_seen_at', COALESCE(${OLD_STATE}->>'first_seen_at', :nowIso::text),
                       'views', COALESCE((${OLD_STATE}->>'views')::int, 0) + 1))),
       updated_at = NOW()`,
    { replacements: { userId, id, nowIso } },
  );
};

/**
 * Sets or clears dismissed_at, keeping the other fields, in ONE statement.
 * - dismissed: existing state gets dismissed_at set. An id with no state gets
 *   {first_seen_at: null, views: 0, dismissed_at} only while the user holds
 *   fewer than `maxKeys` notice keys; at or over the cap nothing is written.
 *   first_seen_at stays null (only a view sets it), so a dismiss never moves
 *   the organization anchor.
 * - not dismissed: only touches existing state; an id with no state is a no-op.
 * The cap and existence checks live in the statement's WHERE so they are
 * evaluated under the row lock.
 */
export const setDismissedQuery = async (
  userId: number,
  id: string,
  dismissed: boolean,
  nowIso: string,
  maxKeys: number,
): Promise<void> => {
  if (!dismissed) {
    await sequelize.query(
      `UPDATE user_preferences
          SET preferences = jsonb_set(preferences, ARRAY['change_notices', :id::text, 'dismissed_at'], 'null'::jsonb),
              updated_at = NOW()
        WHERE user_id = :userId
          AND preferences->'change_notices'->(:id) IS NOT NULL`,
      { replacements: { userId, id } },
    );
    return;
  }
  await sequelize.query(
    `INSERT INTO user_preferences (user_id, preferences)
     VALUES (:userId, jsonb_build_object('change_notices', jsonb_build_object(:id::text,
       jsonb_build_object('first_seen_at', NULL::text, 'views', 0, 'dismissed_at', :nowIso::text))))
     ON CONFLICT (user_id) DO UPDATE SET
       preferences = COALESCE(user_preferences.preferences, '{}'::jsonb)
         || jsonb_build_object('change_notices',
              COALESCE(user_preferences.preferences->'change_notices', '{}'::jsonb)
                || jsonb_build_object(:id::text,
                     COALESCE(${OLD_STATE}, jsonb_build_object('first_seen_at', NULL::text, 'views', 0))
                       || jsonb_build_object('dismissed_at', :nowIso::text))),
       updated_at = NOW()
     WHERE ${OLD_STATE} IS NOT NULL
        OR (SELECT COUNT(*) FROM jsonb_object_keys(COALESCE(user_preferences.preferences->'change_notices', '{}'::jsonb))) < :maxKeys`,
    { replacements: { userId, id, nowIso, maxKeys } },
  );
};
