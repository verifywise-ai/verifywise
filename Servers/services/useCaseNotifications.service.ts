/**
 * The notices a use case create or update sends once its transaction has
 * committed. Shared by the console controller (controllers/project.ctrl.ts)
 * and the advisor's use case tools, so a use case written either way tells the
 * same people the same things.
 *
 * Every notice is best effort: a failure is logged and never fails the write,
 * which has already committed. Neither function throws.
 */

import { IProjectAttributes } from "../domain.layer/interfaces/i.project";
import { getUserByIdQuery } from "../utils/user.utils";
import { logFailure } from "../utils/logger/logHelper";
import {
  sendProjectCreatedNotification,
  sendUserAddedToProjectNotification,
  ProjectRole,
} from "./userNotification/projectNotifications";
import { sendSlackNotification } from "./slack/slackNotificationService";
import { SlackNotificationRoutingType } from "../domain.layer/enums/slack.enum";
import {
  createUseCaseApprovalRequest,
  notifyUseCaseApprovalRequested,
} from "./projects/approvalRequest.service";
import { notifyExternalOwnerAssigned } from "./externalOwnerNotification.service";
import { notifyUserAssigned, notifyApprovalAutoApproved } from "./inAppNotification.service";
import { ProjectModel } from "../domain.layer/models/project/project.model";

type UseCaseApprovalResult = Awaited<ReturnType<typeof createUseCaseApprovalRequest>>;

/** Where failures are logged from, so log searches keep matching the caller. */
export interface NoticeLogContext {
  functionName: string;
  fileName: string;
}

const baseUrl = () => process.env.FRONTEND_URL || "http://localhost:3000";

const PROJECT_ROLES: Record<number, ProjectRole> = {
  1: "admin",
  2: "reviewer",
  3: "editor",
  4: "auditor",
};

/** Tell the approvers, or the requester when it was auto-approved. */
export function notifyUseCaseApprovalOutcome(
  useCase: ProjectModel,
  approvalResult: UseCaseApprovalResult,
  actorId: number,
  organizationId: number,
  eventType: "Create" | "Update",
  log: NoticeLogContext,
): void {
  if (!approvalResult) return;
  if (approvalResult.autoApproved) {
    notifyApprovalAutoApproved(
      organizationId,
      actorId,
      { id: approvalResult.request.id!, name: approvalResult.request.request_name },
      approvalResult.riskLevel!,
      approvalResult.threshold!,
      baseUrl(),
    ).catch((error) => {
      console.error("Failed to send auto-approval notification:", error);
    });
    return;
  }
  // #4905: step-1 approvers are told a request awaits them.
  notifyUseCaseApprovalRequested(useCase, approvalResult, actorId, organizationId).catch(
    async (notifyError) => {
      await logFailure({
        eventType,
        description: "Failed to notify step 1 approvers of the use case approval request",
        ...log,
        error: notifyError as Error,
        userId: actorId,
        organizationId,
      });
    },
  );
}

/**
 * After a use case is created: the approval notice, the "use case created"
 * email to the owner, the Slack message, and the owner's assignment notice
 * (in-app for a user, email for an external owner).
 */
export async function notifyUseCaseCreated(
  useCase: ProjectModel,
  approvalResult: UseCaseApprovalResult,
  actorId: number,
  organizationId: number,
  log: NoticeLogContext,
): Promise<void> {
  try {
    notifyUseCaseApprovalOutcome(useCase, approvalResult, actorId, organizationId, "Create", log);

    // An external owner has no user id; they get the external notice below.
    if (useCase.owner) {
      sendProjectCreatedNotification({
        projectId: useCase.id!,
        projectName: useCase.project_title,
        adminId: useCase.owner,
        organizationId,
        userId: actorId,
      }).catch(async (emailError) => {
        await logFailure({
          eventType: "Create",
          description: "Failed to send project creation notification email",
          ...log,
          error: emailError as Error,
          userId: actorId,
          organizationId,
        });
      });
    }

    const actor = await getUserByIdQuery(actorId);
    sendSlackNotification(
      {
        organizationId,
        userId: actor.id!,
        routingType: SlackNotificationRoutingType.PROJECTS_AND_ORGANIZATIONS,
      },
      {
        title: `Project created`,
        message: `${actor.name} ${actor.surname} created Project ${useCase.project_title}.`,
      },
    ).catch(async (slackError) => {
      await logFailure({
        eventType: "Create",
        description: "Failed to send Slack notification for project creation",
        ...log,
        error: slackError as Error,
        userId: actorId,
        organizationId,
      });
    });

    if (useCase.owner) {
      notifyUserAssigned(
        organizationId,
        useCase.owner,
        {
          entityType: "project",
          entityId: useCase.id!,
          entityName: useCase.project_title,
          roleType: "Owner",
          entityUrl: `/project-view?projectId=${useCase.id}`,
        },
        `${actor.name} ${actor.surname}`.trim(),
        baseUrl(),
      ).catch((err) => console.error("Failed to send owner notification:", err));
    } else if (useCase.external_owner_email) {
      // Email only: an external owner has no in-app notifications. Awaited
      // for its lookups; it does not wait for the mail provider.
      await notifyExternalOwnerAssigned({
        organizationId,
        useCaseTitle: useCase.project_title,
        recipient: {
          name: useCase.external_owner_name || useCase.external_owner_email,
          email: useCase.external_owner_email,
        },
        assignedByUserId: actorId,
      }).catch((err) => console.error("Failed to notify external owner:", err));
    }
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to send the use case creation notices",
      ...log,
      error: error as Error,
      userId: actorId,
      organizationId,
    });
  }
}

/**
 * After a use case is updated: a new owner's assignment notice (in-app for a
 * user, email for an external owner) and the "you were added" email to each
 * member who was not on the use case before.
 */
export async function notifyUseCaseUpdated(
  before: Pick<IProjectAttributes, "owner" | "external_owner_email">,
  after: IProjectAttributes & { members?: number[] },
  /** The members before the update, as updateUseCaseService returns them. */
  previousMembers: number[],
  actorId: number,
  organizationId: number,
  log: NoticeLogContext,
): Promise<void> {
  const useCaseId = after.id!;
  try {
    const newOwner = after.owner;
    if (newOwner && newOwner !== before.owner && newOwner !== actorId) {
      const assigner = await getUserByIdQuery(actorId);
      const assignerName = assigner ? `${assigner.name} ${assigner.surname}`.trim() : "Someone";
      notifyUserAssigned(
        organizationId,
        newOwner,
        {
          entityType: "project",
          entityId: useCaseId,
          entityName: after.project_title,
          roleType: "Owner",
          entityUrl: `/project-view?projectId=${useCaseId}`,
        },
        assignerName,
        baseUrl(),
      ).catch((err) => console.error("Failed to send owner notification:", err));
    }

    // Same notice for an external owner, by email only. Naming the same
    // person again (a name fix, a case change) does not re-send it.
    const newExternalEmail = after.external_owner_email;
    if (newExternalEmail && newExternalEmail !== before.external_owner_email) {
      await notifyExternalOwnerAssigned({
        organizationId,
        useCaseTitle: after.project_title,
        recipient: { name: after.external_owner_name || newExternalEmail, email: newExternalEmail },
        assignedByUserId: actorId,
      }).catch((err) => console.error("Failed to notify external owner:", err));
    }

    const addedMembers = (after.members || []).filter((m) => !previousMembers.includes(m));
    for (const memberId of addedMembers) {
      await notifyMemberAdded(after, memberId, actorId, organizationId, log);
    }
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "Failed to send the use case update notices",
      ...log,
      error: error as Error,
      userId: actorId,
      organizationId,
    });
  }
}

/** The "you were added as <role>" email, by the member's role in the organization. */
async function notifyMemberAdded(
  useCase: IProjectAttributes,
  memberId: number,
  actorId: number,
  organizationId: number,
  log: NoticeLogContext,
): Promise<void> {
  const useCaseId = useCase.id!;
  try {
    const memberUser = await getUserByIdQuery(memberId, null, organizationId);
    if (!memberUser) return;

    if (typeof memberUser.role_id !== "number" || !Number.isInteger(memberUser.role_id)) {
      await logFailure({
        eventType: "Update",
        description: `Invalid role_id type for member ${memberId}: expected number, got ${typeof memberUser.role_id} (${memberUser.role_id})`,
        ...log,
        error: new Error(`Invalid role_id type: ${typeof memberUser.role_id}`),
        userId: actorId,
        organizationId,
      });
      return;
    }

    const role = PROJECT_ROLES[memberUser.role_id];
    if (!role) {
      await logFailure({
        eventType: "Update",
        description: `Unmapped role_id ${memberUser.role_id} for member ${memberId} in project ${useCaseId} (${useCase.project_title}) - notification skipped`,
        ...log,
        error: new Error(`Unmapped role_id: ${memberUser.role_id}`),
        userId: actorId,
        organizationId,
      });
      return;
    }

    sendUserAddedToProjectNotification({
      projectId: useCaseId,
      projectName: useCase.project_title,
      adminId: actorId,
      userId: memberId,
      role,
      organizationId,
    }).catch(async (emailError) => {
      await logFailure({
        eventType: "Update",
        description: `Failed to send user added as ${role} notification email to user ${memberId}`,
        ...log,
        error: emailError as Error,
        userId: actorId,
        organizationId,
      });
    });
  } catch (userLookupError) {
    await logFailure({
      eventType: "Update",
      description: `Failed to lookup user role for member ${memberId}`,
      ...log,
      error: userLookupError as Error,
      userId: actorId,
      organizationId,
    });
  }
}
