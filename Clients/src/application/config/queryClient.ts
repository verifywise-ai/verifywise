import { QueryClient } from "@tanstack/react-query";
import {
  LLM_KEYS_QUERY_KEY,
  LLM_KEY_STATUS_QUERY_KEY,
  retryLLMKeyQuery,
} from "../constants/llmKeyQueries";

/** Retries for a query that failed with anything but a rate limit. */
const MAX_QUERY_RETRIES = 3;

/**
 * Default query retry: up to three times, but never after a 429. The rate
 * limit counts every request from the client's address, so a retry spends
 * the same budget again and keeps it exhausted for everyone behind that
 * address.
 */
export const retryQuery = (failureCount: number, error: unknown) => {
  const err = error as { status?: number; response?: { status?: number } } | null;
  const status = err?.status ?? err?.response?.status;
  if (status === 429) return false;
  return failureCount < MAX_QUERY_RETRIES;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 1000, // 2 seconds - data considered fresh for 2 seconds
      gcTime: 10 * 60 * 1000, // 10 minutes - cache kept in memory for 10 minutes
      retry: retryQuery, // Up to 3 retries, none after a 429
      refetchOnWindowFocus: false, // Don't refetch when window regains focus
      refetchOnMount: true, // Refetch when component mounts
      refetchOnReconnect: true, // Refetch when internet reconnects
    },
    mutations: {
      // Never retry. A failed mutation is usually an answer (400, 409) that
      // fails the same way twice, and on a lost response the first request may
      // already have been saved, so a retry can create or send things twice.
      retry: false,
    },
  },
});

// LLM key list and status: fail fast instead of the default three retries.
queryClient.setQueryDefaults(LLM_KEYS_QUERY_KEY, { retry: retryLLMKeyQuery });
queryClient.setQueryDefaults(LLM_KEY_STATUS_QUERY_KEY, { retry: retryLLMKeyQuery });

// Helper function to invalidate queries
export const invalidateQueries = (queryKeys: string[][]) => {
  queryKeys.forEach((queryKey) => {
    queryClient.invalidateQueries({ queryKey });
  });
};

// Helper function to reset query cache
export const resetQueryCache = () => {
  queryClient.clear();
};
