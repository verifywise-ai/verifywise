/**
 * Assignment notices for a single risk: its owner and its approver (ruling
 * K5). Shared by every risk writer that can name either: the REST create and
 * update, the advisor's create and update actions, and the MCP tools. The
 * bulk set_owner, which groups several risks per owner, keeps its own path
 * (notifyNewRiskOwners in risks.ctrl.ts); risk import groups its approvers
 * with notifyRiskApprovers.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { IRisk } from "../domain.layer/interfaces/I.risk";
import { getProjectTitlesByRiskIdsQuery } from "../utils/risk.utils";
import {
  AssignmentRoleType,
  notifyUserAssigned,
  notifyUserAssignedMany,
} from "./inAppNotification.service";
import logger from "../utils/logger/fileLogger";
import { frontendBaseUrl } from "../utils/frontendUrl.utils";

type NotifiedRisk = Pick<IRisk, "id" | "risk_name" | "risk_description">;

/**
 * A member's full name, or "Someone" when the user is not a member of the
 * organization (or does not exist). Scoped to the organization so a notice
 * never carries the name of a user from another tenant.
 */
export async function getUserNameById(userId: number, organizationId: number): Promise<string> {
  const result = await sequelize.query<{ name: string; surname: string }>(
    `SELECT u.name, u.surname
       FROM users u
       JOIN organization_members om
         ON om.user_id = u.id AND om.organization_id = :organizationId
      WHERE u.id = :userId`,
    { replacements: { userId, organizationId }, type: QueryTypes.SELECT },
  );
  if (result[0]) {
    return `${result[0].name} ${result[0].surname}`.trim();
  }
  return "Someone";
}

/**
 * Tell `assigneeId` they were made the risk's owner or approver, with the
 * first linked use case's title for context. Run it after commit and do not
 * await it: a failed notification must not fail the save.
 */
export async function notifyRiskAssignee(
  organizationId: number,
  assignerUserId: number,
  risk: NotifiedRisk,
  assigneeId: number,
  roleType: Extract<AssignmentRoleType, "Risk Owner" | "Risk Approver">,
): Promise<void> {
  const baseUrl = frontendBaseUrl();
  const assignerName = await getUserNameById(assignerUserId, organizationId);
  const projectTitles = await getProjectTitlesByRiskIdsQuery([risk.id!], organizationId);
  await notifyUserAssigned(
    organizationId,
    assigneeId,
    {
      entityType: "project_risk",
      entityId: risk.id!,
      entityName: risk.risk_name,
      roleType,
      entityUrl: `/risk-management?riskId=${risk.id}`,
    },
    assignerName,
    baseUrl,
    {
      projectName: projectTitles.get(risk.id!),
      description: risk.risk_description,
    },
  );
}

/**
 * Tell a risk's newly named approver they were assigned. Not sent when the
 * caller named themself (only an Admin can).
 */
export async function notifyNewRiskApprover(
  organizationId: number,
  assignerUserId: number,
  risk: NotifiedRisk & { risk_approval?: number | null },
): Promise<void> {
  const approverId = risk.risk_approval;
  if (!approverId || approverId === assignerUserId) return;
  await notifyRiskAssignee(organizationId, assignerUserId, risk, approverId, "Risk Approver");
}

/**
 * Tell each approver named on several new risks at once (risk import): one
 * notice per approver, listing their risks, never one per risk. An approver
 * with a single risk gets the usual single-risk notice. The assigner is
 * skipped (only an Admin can name themself). A failure for one approver is
 * logged and does not stop the others.
 */
export async function notifyRiskApprovers(
  organizationId: number,
  assignerUserId: number,
  risks: Array<NotifiedRisk & { risk_approval: number }>,
): Promise<void> {
  const byApprover = new Map<number, NotifiedRisk[]>();
  for (const risk of risks) {
    if (!risk.risk_approval || risk.risk_approval === assignerUserId) continue;
    const list = byApprover.get(risk.risk_approval) ?? [];
    list.push(risk);
    byApprover.set(risk.risk_approval, list);
  }
  if (byApprover.size === 0) return;

  const baseUrl = frontendBaseUrl();
  let assignerName: string | undefined;
  for (const [approverId, approverRisks] of byApprover) {
    try {
      if (approverRisks.length === 1) {
        await notifyRiskAssignee(
          organizationId,
          assignerUserId,
          approverRisks[0],
          approverId,
          "Risk Approver",
        );
        continue;
      }
      await notifyUserAssignedMany(
        organizationId,
        approverId,
        {
          entityType: "project_risk",
          items: approverRisks.map((risk) => ({ id: risk.id!, name: risk.risk_name })),
          roleType: "Risk Approver",
          entityUrl: "/risk-management",
          texts: {
            titleKey: "{count} risks were assigned to you",
            messageKey: "{assigner} assigned you as Risk Approver for {count} risks: {names}",
            messageMoreKey:
              "{assigner} assigned you as Risk Approver for {count} risks: {names} and {more} more",
            itemsLabel: "risks",
            roleDescription:
              "As the Risk Approver, you decide whether the treatment of these risks is approved or rejected.",
          },
        },
        (assignerName ??= await getUserNameById(assignerUserId, organizationId)),
        baseUrl,
      );
    } catch (err) {
      logger.error("Failed to send risk approver notification:", err);
    }
  }
}
