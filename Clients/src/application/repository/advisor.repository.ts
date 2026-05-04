import { apiServices } from "../../infrastructure/api/networkServices";
import { ApiResponse } from "../../domain/types/User";

/**
 * Message structure for advisor conversations
 */
export interface AdvisorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  chartData?: unknown;
}

/**
 * Lightweight shape used in the conversation list (no full messages).
 */
export interface ConversationSummary {
  id: number;
  title: string | null;
  last_message_at: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Full conversation shape (id + messages). The backend wraps this under a
 * `conversation` field alongside the domain — see `ConversationEnvelope`.
 */
export interface Conversation {
  id: number;
  title: string | null;
  messages: AdvisorMessage[];
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Response envelope for the list endpoint.
 */
export interface ListConversationsResponse {
  domain: string;
  conversations: ConversationSummary[];
}

/**
 * Response envelope for any endpoint that returns a single conversation.
 */
export interface ConversationEnvelope {
  domain: string;
  conversation: Conversation;
}

/**
 * Shared axios error normalization. We re-throw with status + data
 * promoted onto the top-level error so React Query / catch blocks can
 * read them without digging into `error.response`.
 */
function rethrow(error: unknown): never {
  const axiosError = error as { response?: { status: number; data: unknown } };
  if (axiosError.response) {
    throw {
      ...axiosError,
      status: axiosError.response.status,
      data: axiosError.response.data,
    };
  }
  throw error;
}

/**
 * List all conversations the current user has in a given advisor domain.
 * Returns most-recently-active first.
 */
export const listConversationsAPI = async (
  domain: string,
): Promise<ApiResponse<ListConversationsResponse>> => {
  try {
    const response = await apiServices.get(`/advisor/conversations/${domain}`);
    return response as ApiResponse<ListConversationsResponse>;
  } catch (error) {
    rethrow(error);
  }
};

/**
 * Fetch a single conversation (with its full messages array) by id.
 */
export const getConversationByIdAPI = async (
  domain: string,
  id: number,
): Promise<ApiResponse<ConversationEnvelope>> => {
  try {
    const response = await apiServices.get(`/advisor/conversations/${domain}/${id}`);
    return response as ApiResponse<ConversationEnvelope>;
  } catch (error) {
    rethrow(error);
  }
};

/**
 * Create a new empty conversation in the given domain. Returns the fresh
 * row (id, null title, empty messages).
 */
export const createConversationAPI = async (
  domain: string,
): Promise<ApiResponse<ConversationEnvelope>> => {
  try {
    const response = await apiServices.post(`/advisor/conversations/${domain}`, {});
    return response as ApiResponse<ConversationEnvelope>;
  } catch (error) {
    rethrow(error);
  }
};

/**
 * Replace the messages array of an existing conversation. Used on every
 * turn to persist the latest state.
 */
export const updateConversationAPI = async (
  domain: string,
  id: number,
  messages: AdvisorMessage[],
): Promise<ApiResponse<ConversationEnvelope>> => {
  try {
    const response = await apiServices.put(`/advisor/conversations/${domain}/${id}`, { messages });
    return response as ApiResponse<ConversationEnvelope>;
  } catch (error) {
    rethrow(error);
  }
};

/**
 * Delete a conversation by id. Backend returns 204 No Content on success.
 */
export const deleteConversationAPI = async (
  domain: string,
  id: number,
): Promise<ApiResponse<void>> => {
  try {
    const response = await apiServices.delete(`/advisor/conversations/${domain}/${id}`);
    return response as ApiResponse<void>;
  } catch (error) {
    rethrow(error);
  }
};
