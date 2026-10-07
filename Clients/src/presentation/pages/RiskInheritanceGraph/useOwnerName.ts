/**
 * Both report sections receive `risk_owner` as a bare user id, which is not
 * something anyone can read. `useUsers` already caches the org's users for
 * five minutes under one query key, so resolving the id here costs no extra
 * request and needs no backend change.
 */

import { useCallback, useMemo } from "react";
import useUsers from "../../../application/hooks/useUsers";

export const UNASSIGNED_OWNER = "Unassigned";

export function useOwnerName(): (ownerId: number | null | undefined) => string {
  const { users } = useUsers();

  const byId = useMemo(
    () => new Map(users.map((u) => [u.id, `${u.name ?? ""} ${u.surname ?? ""}`.trim()])),
    [users],
  );

  return useCallback(
    (ownerId: number | null | undefined): string => {
      if (ownerId === null || ownerId === undefined) return UNASSIGNED_OWNER;
      // The list can be stale or the user deactivated; the id is still honest.
      return byId.get(ownerId) || `User #${ownerId}`;
    },
    [byId],
  );
}
