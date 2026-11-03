// Servers/services/shadowAiGovernance.ts
// The model risk that "Start governance" records when the form carries a risk
// assessment. Pure; startGovernance does the write in its transaction.
import type { IModelRisk } from "../domain.layer/interfaces/i.modelRisk";
import { ModelRiskCategory } from "../domain.layer/enums/model-risk-category.enum";
import { ModelRiskLevel } from "../domain.layer/enums/model-risk-level.enum";
import { ModelRiskStatus } from "../domain.layer/enums/model-risk-status.enum";

/** The risk is due this long after governance starts. */
export const GOVERNANCE_RISK_DEADLINE_DAYS = 90;

export const DATA_SENSITIVITIES = ["High", "Medium", "Low"] as const;
export type DataSensitivity = (typeof DATA_SENSITIVITIES)[number];

export const MAX_RISK_DESCRIPTION_LENGTH = 5000;

const LEVEL_FOR_SENSITIVITY: Record<DataSensitivity, ModelRiskLevel> = {
  High: ModelRiskLevel.HIGH,
  Medium: ModelRiskLevel.MEDIUM,
  Low: ModelRiskLevel.LOW,
};

export interface GovernanceRiskAssessment {
  data_sensitivity?: DataSensitivity;
  description?: string;
}

/**
 * The model risk for a governance request, or null when the form left the
 * risk assessment empty.
 */
export function buildGovernanceModelRisk(
  assessment: GovernanceRiskAssessment | undefined,
  ctx: { toolName: string; ownerId: number; modelId: number; startedAt: Date },
): Partial<IModelRisk> | null {
  const sensitivity = assessment?.data_sensitivity;
  const description = assessment?.description?.trim();
  if (!sensitivity && !description) return null;

  const due = new Date(ctx.startedAt.getTime());
  due.setUTCDate(due.getUTCDate() + GOVERNANCE_RISK_DEADLINE_DAYS);

  return {
    risk_name: `Use of ${ctx.toolName}`,
    risk_category: ModelRiskCategory.SECURITY,
    // Data sensitivity sets the level; a description alone is rated Medium.
    risk_level: sensitivity ? LEVEL_FOR_SENSITIVITY[sensitivity] : ModelRiskLevel.MEDIUM,
    status: ModelRiskStatus.OPEN,
    owner: String(ctx.ownerId),
    target_date: due.toISOString().slice(0, 10),
    description: description || `Recorded when governance started for ${ctx.toolName}.`,
    model_id: ctx.modelId,
  };
}
