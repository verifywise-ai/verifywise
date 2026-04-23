/**
 * Interface for a single message in an advisor conversation
 */
export interface IAdvisorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string; // ISO timestamp
  chartData?: unknown; // Optional chart data for assistant messages
}

/**
 * Interface for an advisor conversation row.
 */
export interface IAdvisorConversation {
  id: number;
  user_id: number;
  domain: string;
  title: string | null;
  messages: IAdvisorMessage[];
  last_message_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Lightweight shape returned by the list endpoint — omits the full messages
 * payload so listing is cheap even for conversations with many turns.
 */
export interface IAdvisorConversationSummary {
  id: number;
  title: string | null;
  last_message_at: Date | null;
  message_count: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Valid advisor domains (matching frontend advisorConfig.ts)
 */
export type AdvisorDomain =
  | 'risk-management'
  | 'model-inventory'
  | 'model-risks'
  | 'vendors'
  | 'ai-incident-managements'
  | 'tasks'
  | 'policies'
  | 'use-cases'
  | 'datasets'
  | 'frameworks'
  | 'training'
  | 'evidence'
  | 'reporting'
  | 'ai-trust-center'
  | 'agent-discovery';

/**
 * Maximum number of messages to store per conversation
 */
export const MAX_MESSAGES_PER_CONVERSATION = 50;
