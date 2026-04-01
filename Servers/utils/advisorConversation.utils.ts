import { sequelize } from "../database/db";
import {
  IAdvisorConversation,
  IAdvisorMessage,
  MAX_MESSAGES_PER_CONVERSATION,
} from "../domain.layer/interfaces/i.advisorConversation";

/**
 * Get a conversation by user ID and domain
 */
export const getConversationQuery = async (
  organizationId: number,
  userId: number,
  domain: string
): Promise<IAdvisorConversation | null> => {
  const result = await sequelize.query(
    `SELECT id, user_id, domain, messages, created_at, updated_at
     FROM advisor_conversations
     WHERE organization_id = :organizationId AND user_id = :userId AND domain = :domain;`,
    {
      replacements: { organizationId, userId, domain },
    }
  );

  const rows = result[0] as IAdvisorConversation[];
  return rows.length > 0 ? rows[0] : null;
};

/**
 * Create or update a conversation with new messages
 * Uses UPSERT to handle both create and update cases
 * Automatically trims messages to MAX_MESSAGES_PER_CONVERSATION
 */
export const upsertConversationQuery = async (
  organizationId: number,
  userId: number,
  domain: string,
  messages: IAdvisorMessage[]
): Promise<IAdvisorConversation> => {
  // Trim messages to max limit (keep the most recent)
  const trimmedMessages = messages.slice(-MAX_MESSAGES_PER_CONVERSATION);

  const result = await sequelize.query(
    `INSERT INTO advisor_conversations (organization_id, user_id, domain, messages, created_at, updated_at)
     VALUES (:organizationId, :userId, :domain, :messages::jsonb, NOW(), NOW())
     ON CONFLICT (organization_id, user_id, domain)
     DO UPDATE SET
       messages = :messages::jsonb,
       updated_at = NOW()
     RETURNING id, user_id, domain, messages, created_at, updated_at;`,
    {
      replacements: {
        organizationId,
        userId,
        domain,
        messages: JSON.stringify(trimmedMessages),
      },
    }
  );

  const rows = result[0] as IAdvisorConversation[];
  return rows[0];
};

/**
 * Add a single message to a conversation
 * Creates the conversation if it doesn't exist
 * Automatically trims to MAX_MESSAGES_PER_CONVERSATION
 */
export const addMessageToConversationQuery = async (
  organizationId: number,
  userId: number,
  domain: string,
  message: IAdvisorMessage
): Promise<IAdvisorConversation> => {
  // First, try to get existing conversation
  const existing = await getConversationQuery(organizationId, userId, domain);

  let messages: IAdvisorMessage[];
  if (existing) {
    // Append to existing messages
    messages = [...existing.messages, message];
  } else {
    // Start fresh
    messages = [message];
  }

  // Upsert with the new messages array
  return upsertConversationQuery(organizationId, userId, domain, messages);
};

/**
 * Clear a conversation (delete all messages for a user/domain)
 */
export const clearConversationQuery = async (
  organizationId: number,
  userId: number,
  domain: string
): Promise<boolean> => {
  await sequelize.query(
    `DELETE FROM advisor_conversations
     WHERE organization_id = :organizationId AND user_id = :userId AND domain = :domain;`,
    {
      replacements: { organizationId, userId, domain },
    }
  );

  return true;
};

/**
 * Get all conversations for a user
 */
export const getAllConversationsForUserQuery = async (
  organizationId: number,
  userId: number
): Promise<IAdvisorConversation[]> => {
  const result = await sequelize.query(
    `SELECT id, user_id, domain, messages, created_at, updated_at
     FROM advisor_conversations
     WHERE organization_id = :organizationId AND user_id = :userId
     ORDER BY updated_at DESC;`,
    {
      replacements: { organizationId, userId },
    }
  );

  return result[0] as IAdvisorConversation[];
};
