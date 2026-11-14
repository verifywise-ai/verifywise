import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { utcDateSql, toIso } from "./dateOnly";
import type { HomeQueueItem, HomeQueueSource } from "../../../domain.layer/interfaces/i.homeQueue";

/** `mitigation_status` has no default, so NULL is read as Not Started. */
const NOT_STARTED = "Not Started";
const NEEDS_ATTENTION = [NOT_STARTED, "Requires review"];
/** A past deadline no longer matters once the risk is finished with. */
const FINISHED = ["Completed", "Canceled"];

const STATUS = `COALESCE(r.mitigation_status::text, '${NOT_STARTED}')`;
const DEADLINE = utcDateSql("r.deadline");

/**
 * Risks I own, not deleted, that either have not been picked up (Not Started,
 * Requires review, NULL) or are past their deadline and not Completed/Canceled.
 * Exported so tests can pin the rule.
 */
export const RISKS_SQL = `
  SELECT r.id, r.risk_name, r.current_risk_level, ${STATUS} AS mitigation_status,
         ${DEADLINE} AS deadline, r.created_at
  FROM project_risks r
  WHERE r.organization_id = :organizationId
    AND r.risk_owner = :userId
    AND r.is_deleted = false
    AND (
      ${STATUS} IN (:needsAttention)
      OR (${DEADLINE} < :today AND ${STATUS} NOT IN (:finished))
    )`;

interface RiskRow {
  id: number;
  risk_name: string;
  current_risk_level: string | null;
  mitigation_status: string;
  deadline: string | null;
  created_at: Date | string | null;
}

/** Opens the risk's edit modal on the risk register (RiskManagement `riskId` param). */
export const risksSource: HomeQueueSource = {
  id: "risks",
  part: "track",
  isVisible: () => true,
  async load(ctx) {
    const rows = await sequelize.query<RiskRow>(RISKS_SQL, {
      replacements: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        today: ctx.today,
        needsAttention: NEEDS_ATTENTION,
        finished: FINISHED,
      },
      type: QueryTypes.SELECT,
    });

    return rows.map((r): HomeQueueItem => ({
      id: `risks:${r.id}`,
      source: "risks",
      part: "track",
      entityType: "risk",
      entityId: r.id,
      name: r.risk_name,
      url: `/risk-management?riskId=${r.id}`,
      dueDate: r.deadline,
      waitingSince: toIso(r.created_at),
      overdue: r.deadline !== null && r.deadline < ctx.today,
      meta: { mitigationStatus: r.mitigation_status, riskLevel: r.current_risk_level },
    }));
  },
};
