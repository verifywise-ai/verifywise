import { useCallback, useMemo } from "react";
import useUsers from "../../../application/hooks/useUsers";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { buildUserNameMap, formatUserName, UserNameMap } from "./agentLabels";

/**
 * The organization's users (from the shared, cached users query) with a name
 * map and one formatter for showing a user id as a name. Used by the AI agents
 * detail page and drawers so they share one fetch and one fallback.
 */
export function useUserNames(): {
  users: ReturnType<typeof useUsers>["users"];
  usersMap: UserNameMap;
  formatUser: (userId: number | string) => string;
} {
  const { users } = useUsers();
  const { t } = useTranslation();
  const usersMap = useMemo(() => buildUserNameMap(users), [users]);
  const formatUser = useCallback(
    (userId: number | string) => formatUserName(userId, usersMap, t),
    [usersMap, t],
  );
  return { users, usersMap, formatUser };
}
