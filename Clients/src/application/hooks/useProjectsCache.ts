import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Project } from "../../domain/types/Project";
import { projectQueryKeys } from "./useProjects";

/**
 * Cache-write helpers replacing the legacy VerifyWiseContext `setProjects`.
 *
 * `setProjectsCache` supports the same updater semantics as React setState:
 * pass either the next array or `(prev) => next`. It writes directly into the
 * React Query cache for `projectQueryKeys.list()`, so every `useProjects()`
 * consumer sees the update immediately without a refetch.
 *
 * `refreshProjects` invalidates the list query to trigger a background refetch
 * (replaces the old "setProjects(getAllProjects())" refresh flows).
 */
export const useProjectsCache = () => {
  const queryClient = useQueryClient();

  const setProjectsCache = useCallback(
    (updater: Project[] | ((prev: Project[]) => Project[])) => {
      queryClient.setQueryData<Project[]>(projectQueryKeys.list(), (prev) => {
        const current = prev ?? [];
        return typeof updater === "function" ? updater(current) : updater;
      });
    },
    [queryClient],
  );

  const refreshProjects = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() });
  }, [queryClient]);

  return { setProjectsCache, refreshProjects };
};
