/**
 * Tells a risk's newly named approver they were assigned (ruling K5). Shared
 * by every risk writer that can name an approver: the REST create and update,
 * and the advisor's create and update actions.
 */

import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { IRisk } from "../domain.layer/interfaces/I.risk";
import { getProjectTitlesByRiskIdsQuery } from "../utils/risk.utils";
import { notifyUserAssigned } from "./inAppNotification.service";

/** A user's full name, or "Someone" when the user is not found. */
export async function getUserNameById(userId: number): Promise<string> {
  const result = await sequelize.query<{ name: string; surname: string }>(
    `SELECT name, surname FROM users WHERE id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  );
  if (result[0]) {
    return `${result[0].name} ${result[0].surname}`.trim();
  }
  return "Someone";
}

/**
 * Tell a risk's newly named approver they were assigned. Not sent when the
 * caller named themselves. Run it after commit and do not await it: a failed
 * notification must not fail the save.
 */
export async function notifyNewRiskApprover(
  organizationId: number,
  assignerUserId: number,
  risk: Pick<IRisk, "id" | "risk_name" | "risk_description"> & { risk_approval?: number | null },
): Promise<void> {
  const approverId = risk.risk_approval;
  if (!approverId || approverId === assignerUserId) return;
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const assignerName = await getUserNameById(assignerUserId);
  const projectTitles = await getProjectTitlesByRiskIdsQuery([risk.id!], organizationId);
  await notifyUserAssigned(
    organizationId,
    approverId,
    {
      entityType: "project_risk",
      entityId: risk.id!,
      entityName: risk.risk_name,
      roleType: "Risk Approver",
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
