import { useCallback } from "react";
import {
  canWithPermissions,
  isBuiltinRoleName,
  type UiPermissionKey,
} from "../constants/permissions";
import { useAuth } from "./useAuth";
import { useMyPermissions } from "./useMyPermissions";

/**
 * The checker behind useCan, for components that test several keys or need
 * one inside a callback or loop. UI only; the backend enforces authorization.
 */
export function useCanCheck(): (key: UiPermissionKey) => boolean {
  const { permissions } = useMyPermissions();
  const { userRoleName } = useAuth();
  return useCallback(
    (key: UiPermissionKey) => canWithPermissions(key, permissions, userRoleName),
    [permissions, userRoleName],
  );
}

/**
 * True when the current user holds the permission key the UI gates on (see
 * canWithPermissions for the loading rule). Use it instead of comparing the
 * role name, which a custom role can never match.
 */
export function useCan(key: UiPermissionKey): boolean {
  return useCanCheck()(key);
}

/**
 * False only while a custom role's permissions are still loading. A built-in
 * role is settled at once (its stand-in answer is exact). Check it before
 * redirecting away from, or refusing, a page the user may be allowed on.
 */
export function usePermissionsSettled(): boolean {
  const { permissions, error } = useMyPermissions();
  const { userRoleName } = useAuth();
  return permissions !== undefined || Boolean(error) || isBuiltinRoleName(userRoleName);
}
