import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { MrmFindingStage } from "../../../domain.layer/enums/mrm.enum";
import { toIso, utcDateSql } from "./dateOnly";
import type { HomeQueueItem, HomeQueueSource } from "../../../domain.layer/interfaces/i.homeQueue";

const DONE_STAGES = [MrmFindingStage.RESOLVED, MrmFindingStage.CLOSED];

/**
 * MRM findings I own that are not resolved or closed. mrm_findings has no
 * soft-delete flag. Exported so tests can pin the rule.
 */
export const MRM_FINDINGS_SQL = `
  SELECT f.id, f.title, f.stage, f.severity, ${utcDateSql("f.due_date")} AS due_date, f.created_at
  FROM mrm_findings f
  WHERE f.organization_id = :organizationId
    AND f.owner_id = :userId
    AND f.stage NOT IN (:doneStages)`;

interface FindingRow {
  id: number;
  title: string;
  stage: string;
  severity: string;
  due_date: string | null;
  created_at: Date | string | null;
}

/**
 * Opens the MRM Findings tab. A finding has no deep link (the tab reads no
 * id from the URL), so the list is the closest page.
 */
export const mrmFindingsSource: HomeQueueSource = {
  id: "mrmFindings",
  part: "record",
  isVisible: () => true,
  async load(ctx) {
    const rows = await sequelize.query<FindingRow>(MRM_FINDINGS_SQL, {
      replacements: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        doneStages: DONE_STAGES,
      },
      type: QueryTypes.SELECT,
    });

    return rows.map((f): HomeQueueItem => ({
      id: `mrmFindings:${f.id}`,
      source: "mrmFindings",
      part: "record",
      entityType: "mrm_finding",
      entityId: f.id,
      name: f.title,
      url: "/model-inventory/model-risk-management/findings",
      dueDate: f.due_date,
      waitingSince: toIso(f.created_at),
      overdue: f.due_date !== null && f.due_date < ctx.today,
      meta: { stage: f.stage, severity: f.severity },
    }));
  },
};
