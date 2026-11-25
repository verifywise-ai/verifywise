import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Project } from "../../domain/types/Project";
import { projectQueryKeys } from "./useProjects";

/**
 * Cache-write helpers replacing the legacy VerifyWiseContext `setProjects`.
 *
 * `setProjectsCache` supports the same updater semantics as React setState:
 * pass either the next array or `(prev) => next`. It writes into the React
 * Query cache for `projectQueryKeys.list()`, so every `useProjects()` consumer
 * sees the change at once, then invalidates the list so the server's full rows
 * replace it (a mutation answer can lack fields the list query joins in, such
 * as `framework`). While the list has not loaded yet it writes nothing: an
 * update applied to an empty list would leave a partial list marked fresh.
 *
 * `refreshProjects` refetches the list through React Query and resolves when it
 * is done. React Query cancels an older refetch still in flight, so the newest
 * answer always wins.
 */
export const useProjectsCache = () => {
  const queryClient = useQueryClient();

  const setProjectsCache = useCallback(
    (updater: Project[] | ((prev: Project[]) => Project[])) => {
      queryClient.setQueryData<Project[]>(projectQueryKeys.list(), (prev) => {
        // Returning undefined leaves the cache as it is.
        if (prev === undefined) return undefined;
        return typeof updater === "function" ? updater(prev) : updater;
      });
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.list() });
    },
    [queryClient],
  );

  const refreshProjects = useCallback(
    () => queryClient.refetchQueries({ queryKey: projectQueryKeys.list(), type: "all" }),
    [queryClient],
  );

  return { setProjectsCache, refreshProjects };
};
