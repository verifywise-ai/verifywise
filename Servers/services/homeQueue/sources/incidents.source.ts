import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { AIIncidentManagementStatus } from "../../../domain.layer/enums/ai-incident-management.enum";
import { toIso } from "./dateOnly";
import type { HomeQueueItem, HomeQueueSource } from "../../../domain.layer/interfaces/i.homeQueue";

/**
 * Incidents assigned to me that are not Closed. Archived incidents are hidden
 * from the incident list, so they are left out too. Incidents are hard-deleted.
 * Exported so tests can pin the rule.
 */
export const INCIDENTS_SQL = `
  SELECT i.id, i.incident_id, i.ai_project, i.status, i.severity, i.created_at
  FROM ai_incident_managements i
  WHERE i.organization_id = :organizationId
    AND i.assignee_id = :userId
    AND i.status IS DISTINCT FROM :closed
    AND i.archived IS NOT TRUE`;

interface IncidentRow {
  id: number;
  incident_id: string | null;
  ai_project: string | null;
  status: string;
  severity: string;
  created_at: Date | string | null;
}

/** Opens the incident's view modal on the incidents page (`incidentId` param, the row id). */
export const incidentsSource: HomeQueueSource = {
  id: "incidents",
  part: "automate",
  isVisible: () => true,
  async load(ctx) {
    const rows = await sequelize.query<IncidentRow>(INCIDENTS_SQL, {
      replacements: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        closed: AIIncidentManagementStatus.CLOSED,
      },
      type: QueryTypes.SELECT,
    });

    return rows.map((i): HomeQueueItem => ({
      id: `incidents:${i.id}`,
      source: "incidents",
      part: "automate",
      entityType: "incident",
      entityId: i.id,
      // The list names an incident by its code ("INC-1"), then its project.
      name: i.incident_id || i.ai_project || "",
      url: `/ai-incident-managements?incidentId=${i.id}`,
      dueDate: null,
      waitingSince: toIso(i.created_at),
      overdue: false,
      meta: { status: i.status, severity: i.severity },
    }));
  },
};
