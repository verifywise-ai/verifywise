import { useAuth } from "./useAuth";
import { useMyPermissions } from "./useMyPermissions";

/** Built-in roles holding aiApp.edit; only stands in until permissions load. */
const AI_APP_EDIT_ROLES = ["Admin", "Editor"];

/** Whether the current user holds aiApp.admin. For the UI only; the server enforces it. */
export function useCanAdminAiApps(): boolean {
  const { userRoleName } = useAuth();
  const { permissions } = useMyPermissions();
  return permissions ? permissions.includes("aiApp.admin") : userRoleName === "Admin";
}

/** Whether the current user holds aiApp.edit. For the UI only; the server enforces it. */
export function useCanEditAiApps(): boolean {
  const { userRoleName } = useAuth();
  const { permissions } = useMyPermissions();
  return permissions
    ? permissions.includes("aiApp.edit")
    : AI_APP_EDIT_ROLES.includes(userRoleName);
}
