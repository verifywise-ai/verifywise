/**
 * Fan-out helper for "role changed from Editor (3) to Admin (1)" notifications.
 *
 * Walks every project the affected user is a member of and dispatches one
 * notification per project. Each dispatch is fire-and-forget; failures are
 * logged via the supplied logger but never propagate.
 */

import { getUserProjects } from "../../utils/user.utils";
import { logFailure } from "../../utils/logger/logHelper";
import { sendMemberRoleChangedEditorToAdminNotification } from "./projectNotifications";

export interface RoleChangeNotificationInput {
  /** The user whose role changed */
  userId: number;
  /** Who performed the change */
  actorId: number;
  organizationId: number;
  /** Caller identification for logging */
  functionName: string;
  fileName: string;
  /** Optional caller-side audit logger id */
  loggerUserId: number;
}

/**
 * Send a per-project role-change notification to every project the affected
 * user belongs to. Errors fetching the project list or sending individual
 * notifications are logged but never thrown.
 */
export async function notifyRoleChangedEditorToAdmin(
  input: RoleChangeNotificationInput,
): Promise<void> {
  const { userId, actorId, organizationId, functionName, fileName, loggerUserId } = input;

  try {
    const userProjects = await getUserProjects(userId, organizationId);

    for (const project of userProjects) {
      sendMemberRoleChangedEditorToAdminNotification({
        projectId: project.id!,
        projectName: project.project_title,
        actorId,
        userId,
        organizationId,
      }).catch(async (emailError) => {
        await logFailure({
          eventType: "Update",
          description: `Failed to send role changed notification for project ${project.id} to user ${userId}`,
          functionName,
          fileName,
          error: emailError as Error,
          userId: loggerUserId,
          organizationId,
        });
      });
    }
  } catch (projectError) {
    await logFailure({
      eventType: "Update",
      description: `Failed to fetch user projects for role change notification: user ${userId}`,
      functionName,
      fileName,
      error: projectError as Error,
      userId: loggerUserId,
      organizationId,
    });
  }
}
