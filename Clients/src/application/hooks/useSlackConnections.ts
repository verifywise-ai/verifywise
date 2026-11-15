import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  connectSlackWorkspace,
  deleteSlackConnection,
  deleteUnlinkedSlackConnection,
  getSlackConnections,
  getUnlinkedSlackConnections,
  updateSlackConnection,
  type SlackConnection,
  type UnlinkedSlackConnection,
} from "../repository/slack.repository";
import { useAuth } from "./useAuth";

/**
 * Query keys for the Slack extension. The organization's connections and the
 * caller's own unlinked connections are separate lists with separate keys, so
 * a write refetches only the list it changed. Each key carries the
 * organization or user it belongs to, since the query cache outlives a logout.
 */
export const slackQueryKeys = {
  all: ["slack"] as const,
  connectionLists: () => [...slackQueryKeys.all, "connections"] as const,
  connections: (organizationId: number | null) =>
    [...slackQueryKeys.connectionLists(), organizationId] as const,
  unlinkedLists: () => [...slackQueryKeys.all, "unlinked"] as const,
  unlinked: (userId: number | null) => [...slackQueryKeys.unlinkedLists(), userId] as const,
};

/** Stable empty lists, so callers' memos do not re-run while loading. */
const NO_CONNECTIONS: SlackConnection[] = [];
const NO_UNLINKED: UnlinkedSlackConnection[] = [];

/**
 * The organization's Slack connections. `loading` is true only on the first
 * load (no list yet); a refetch after a write keeps the current list on
 * screen. `error` is set only when there is no list to show.
 */
export function useSlackConnections() {
  const { organizationId } = useAuth();
  const enabled = organizationId != null;
  const query = useQuery({
    queryKey: slackQueryKeys.connections(organizationId),
    queryFn: getSlackConnections,
    enabled,
  });
  return {
    connections: query.data ?? NO_CONNECTIONS,
    loading: enabled && query.isPending,
    error: query.data === undefined && query.isError ? query.error : null,
  };
}

/**
 * The caller's own connections with no organization. The list is only a
 * cleanup aid, so a failed load reads as an empty list.
 */
export function useUnlinkedSlackConnections() {
  const { userId } = useAuth();
  const enabled = userId != null;
  const query = useQuery({
    queryKey: slackQueryKeys.unlinked(userId),
    queryFn: getUnlinkedSlackConnections,
    enabled,
  });
  return {
    unlinked: query.data ?? NO_UNLINKED,
    loading: enabled && query.isPending,
  };
}

/**
 * Refetches a list after a successful write. A fetch already in flight (e.g.
 * the page's first load, started before the write) is cancelled first: an
 * invalidation alone would reuse it while the list has no data yet, and its
 * older answer would drop the change. The returned promise settles once the
 * new list is in, so a caller awaiting the mutation sees it.
 */
function useRefetchAfterWrite(queryKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.cancelQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey });
  };
}

function useInvalidateConnections() {
  return useRefetchAfterWrite(slackQueryKeys.connectionLists());
}

/** Exchanges the OAuth code Slack returned for a new connection. */
export function useConnectSlackWorkspace() {
  const invalidate = useInvalidateConnections();
  return useMutation({
    mutationFn: (code: string) => connectSlackWorkspace(code),
    onSuccess: invalidate,
  });
}

/** Changes one connection's routing and/or whether it is active. */
export function useUpdateSlackConnection() {
  const invalidate = useInvalidateConnections();
  return useMutation({
    mutationFn: ({
      id,
      changes,
    }: {
      id: number;
      changes: { routing_type?: string[]; is_active?: boolean };
    }) => updateSlackConnection(id, changes),
    onSuccess: invalidate,
  });
}

/** Removes one of the organization's connections. */
export function useRemoveSlackConnection() {
  const invalidate = useInvalidateConnections();
  return useMutation({
    mutationFn: (id: number) => deleteSlackConnection(id),
    onSuccess: invalidate,
  });
}

/** Removes one of the caller's unlinked connections. */
export function useRemoveUnlinkedSlackConnection() {
  const refetch = useRefetchAfterWrite(slackQueryKeys.unlinkedLists());
  return useMutation({
    mutationFn: (id: number) => deleteUnlinkedSlackConnection(id),
    onSuccess: refetch,
  });
}
