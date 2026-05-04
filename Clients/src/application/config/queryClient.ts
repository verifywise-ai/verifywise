import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 1000, // 2 seconds - data considered fresh for 2 seconds
      gcTime: 10 * 60 * 1000, // 10 minutes - cache kept in memory for 10 minutes
      retry: 3, // Retry failed requests 3 times
      refetchOnWindowFocus: false, // Don't refetch when window regains focus
      refetchOnMount: true, // Refetch when component mounts
      refetchOnReconnect: true, // Refetch when internet reconnects
    },
    mutations: {
      retry: 1, // Retry failed mutations only once
    },
  },
});

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
