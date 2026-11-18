import { retryUpTo } from "../utils/queryRetry";

/** Prefix for every org's key list; see useLLMKeys. */
export const LLM_KEYS_QUERY_KEY = ["llmKeys"] as const;

/** Prefix for every org's has-a-key status; see useLLMKeyStatus. */
export const LLM_KEY_STATUS_QUERY_KEY = ["llmKeyStatus"] as const;

/**
 * Retry policy for both key queries: one retry for a server or network
 * failure or a request timeout (408); none for any other 4xx. The global default
 * (three retries with backoff) would keep a failed first load spinning ~7s,
 * and the key form waits for the refetch before it closes.
 */
export const retryLLMKeyQuery = retryUpTo(1);
