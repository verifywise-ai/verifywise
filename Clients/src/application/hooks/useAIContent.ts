import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getBadges,
  reviewContent,
  getUnreviewed,
  getStats,
} from "../repository/aiContent.repository";

export const aiContentQueryKeys = {
  all: ["ai-content"] as const,
  badges: (entityType: string, entityId: number) =>
    [...aiContentQueryKeys.all, "badges", entityType, entityId] as const,
  unreviewed: (limit?: number, offset?: number) =>
    [...aiContentQueryKeys.all, "unreviewed", limit, offset] as const,
  stats: () => [...aiContentQueryKeys.all, "stats"] as const,
};

/** Fetch AI content badges for a specific entity */
export const useAIContentBadges = (
  entityType: string,
  entityId: number,
  options?: { enabled?: boolean },
) => {
  return useQuery({
    queryKey: aiContentQueryKeys.badges(entityType, entityId),
    queryFn: async () => {
      const res = await getBadges(entityType, entityId);
      return res?.data ?? [];
    },
    enabled: (options?.enabled ?? true) && !!entityType && !!entityId,
    staleTime: 5 * 60 * 1000,
  });
};

/** Fetch unreviewed AI content */
export const useUnreviewedContent = (limit?: number, offset?: number) => {
  return useQuery({
    queryKey: aiContentQueryKeys.unreviewed(limit, offset),
    queryFn: async () => {
      const res = await getUnreviewed(limit, offset);
      return res?.data ?? { items: [], total: 0 };
    },
    staleTime: 2 * 60 * 1000,
  });
};

/** Fetch AI content statistics */
export const useAIContentStats = () => {
  return useQuery({
    queryKey: aiContentQueryKeys.stats(),
    queryFn: async () => {
      const res = await getStats();
      return res?.data ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
};

/** Review AI content (approve/modify/reject) */
export const useReviewContent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, action, notes }: { id: number; action: string; notes?: string }) => {
      const res = await reviewContent(id, action, notes);
      return res?.data;
    },
    onSuccess: () => {
      // Invalidate all AI content queries
      queryClient.invalidateQueries({ queryKey: aiContentQueryKeys.all });
    },
  });
};
