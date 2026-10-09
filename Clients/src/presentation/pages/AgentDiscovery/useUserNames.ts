import { useCallback, useMemo } from "react";
import useUsers from "../../../application/hooks/useUsers";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { buildUserNameMap, formatUserName, getAvatarName, UserNameMap } from "./agentLabels";

/**
 * The organization's users (from the shared, cached users query) with a name
 * map, one formatter for showing a user id (or a source-reported owner such as
 * an email) as a name, and the matching avatar initials. Used by the AI agents
 * detail page and drawers so they share one fetch and one fallback.
 */
export function useUserNames(): {
  users: ReturnType<typeof useUsers>["users"];
  usersMap: UserNameMap;
  formatUser: (userId: number | string) => string;
  avatarName: (userId: number | string) => { firstname: string; lastname: string };
} {
  const { users } = useUsers();
  const { t } = useTranslation();
  const usersMap = useMemo(() => buildUserNameMap(users), [users]);
  const formatUser = useCallback(
    (userId: number | string) => formatUserName(userId, usersMap, t),
    [usersMap, t],
  );
  const avatarName = useCallback(
    (userId: number | string) => getAvatarName(userId, usersMap),
    [usersMap],
  );
  return { users, usersMap, formatUser, avatarName };
}
