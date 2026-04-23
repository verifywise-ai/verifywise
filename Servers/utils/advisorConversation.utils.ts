import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import {
  IAdvisorConversation,
  IAdvisorConversationSummary,
  IAdvisorMessage,
  MAX_MESSAGES_PER_CONVERSATION,
} from "../domain.layer/interfaces/i.advisorConversation";

/**
 * Max length for the auto-derived conversation title. Matches the
 * `title VARCHAR(120)` column but we cap a bit shorter for display polish.
 */
const TITLE_MAX_LENGTH = 80;

/**
 * Pick a title from a messages array: the text of the first user message,
 * trimmed and truncated. Returns `null` if no user message has content yet
 * — the caller can leave the DB column null and let the backfill happen on
 * a later update.
 */
function deriveTitle(messages: IAdvisorMessage[]): string | null {
  const firstUser = messages.find(
    (m) => m.role === "user" && m.content && m.content.trim().length > 0,
  );
  if (!firstUser) return null;
  return firstUser.content.trim().slice(0, TITLE_MAX_LENGTH);
}

/**
 * List all conversations for a user in a given advisor domain, most recent
 * first. Returns a summary shape (no full messages) — the frontend pulls
 * the full messages for only the conversation it's about to open.
 *
 * Relies on the composite index `advisor_conversations_list_idx` so this
 * stays fast as users accumulate conversations.
 */
export const listConversationsQuery = async (
  organizationId: number,
  userId: number,
  domain: string,
): Promise<IAdvisorConversationSummary[]> => {
  const rows = (await sequelize.query(
    `SELECT
        id,
        title,
        last_message_at,
        jsonb_array_length(messages) AS message_count,
        created_at,
        updated_at
       FROM advisor_conversations
      WHERE organization_id = :organizationId
        AND user_id         = :userId
        AND domain          = :domain
      ORDER BY COALESCE(last_message_at, updated_at) DESC, id DESC;`,
    {
      replacements: { organizationId, userId, domain },
      type: QueryTypes.SELECT,
    },
  )) as Array<{
    id: number;
    title: string | null;
    last_message_at: Date | null;
    message_count: string | number;
    created_at: Date;
    updated_at: Date;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    last_message_at: r.last_message_at,
    message_count: Number(r.message_count),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
};

/**
 * Fetch a single conversation by id, scoped to the requesting user and
 * organization. Returns null when the row doesn't exist OR when it exists
 * but belongs to a different tenant/user — we never want to leak whether a
 * row exists in another tenant.
 */
export const getConversationByIdQuery = async (
  organizationId: number,
  userId: number,
  id: number,
): Promise<IAdvisorConversation | null> => {
  const rows = (await sequelize.query(
    `SELECT id, user_id, domain, title, messages, last_message_at, created_at, updated_at
       FROM advisor_conversations
      WHERE organization_id = :organizationId
        AND user_id         = :userId
        AND id              = :id;`,
    {
      replacements: { organizationId, userId, id },
      type: QueryTypes.SELECT,
    },
  )) as IAdvisorConversation[];

  return rows.length > 0 ? rows[0] : null;
};

/**
 * Create a new empty conversation in the given domain. Title and
 * last_message_at start as NULL — they get populated the first time the
 * user sends a message via `updateConversationMessagesQuery`.
 */
export const createConversationQuery = async (
  organizationId: number,
  userId: number,
  domain: string,
): Promise<IAdvisorConversation> => {
  const rows = (await sequelize.query(
    `INSERT INTO advisor_conversations
        (organization_id, user_id, domain, title, messages, last_message_at, created_at, updated_at)
      VALUES
        (:organizationId, :userId, :domain, NULL, '[]'::jsonb, NULL, NOW(), NOW())
      RETURNING id, user_id, domain, title, messages, last_message_at, created_at, updated_at;`,
    {
      replacements: { organizationId, userId, domain },
      type: QueryTypes.SELECT,
    },
  )) as IAdvisorConversation[];

  return rows[0];
};

/**
 * Replace the full messages array for a conversation and bump
 * `last_message_at`. If the row still has a null title, auto-derive it
 * from the first user message in the new payload.
 *
 * Returns null when the row doesn't exist under the caller's org/user
 * scope — the caller should treat that as a 404, never a silent no-op.
 */
export const updateConversationMessagesQuery = async (
  organizationId: number,
  userId: number,
  id: number,
  messages: IAdvisorMessage[],
): Promise<IAdvisorConversation | null> => {
  const trimmed = messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  const derivedTitle = deriveTitle(trimmed);

  const rows = (await sequelize.query(
    `UPDATE advisor_conversations
        SET messages        = :messages::jsonb,
            title           = COALESCE(title, :derivedTitle),
            last_message_at = NOW(),
            updated_at      = NOW()
      WHERE organization_id = :organizationId
        AND user_id         = :userId
        AND id              = :id
      RETURNING id, user_id, domain, title, messages, last_message_at, created_at, updated_at;`,
    {
      replacements: {
        organizationId,
        userId,
        id,
        messages: JSON.stringify(trimmed),
        derivedTitle,
      },
      type: QueryTypes.SELECT,
    },
  )) as IAdvisorConversation[];

  return rows.length > 0 ? rows[0] : null;
};

/**
 * Delete a conversation by id, scoped to the caller. Returns true when a
 * row was actually deleted (so the controller can send 404 otherwise).
 */
export const deleteConversationQuery = async (
  organizationId: number,
  userId: number,
  id: number,
): Promise<boolean> => {
  const [, metadata] = await sequelize.query(
    `DELETE FROM advisor_conversations
      WHERE organization_id = :organizationId
        AND user_id         = :userId
        AND id              = :id;`,
    {
      replacements: { organizationId, userId, id },
    },
  );

  // Sequelize's raw DELETE returns [results, metadata]. `metadata` is the
  // Postgres RowCount when the pg driver is in use — treat any positive
  // count as success.
  const rowCount =
    typeof metadata === "number"
      ? metadata
      : ((metadata as unknown as { rowCount?: number })?.rowCount ?? 0);
  return rowCount > 0;
};
