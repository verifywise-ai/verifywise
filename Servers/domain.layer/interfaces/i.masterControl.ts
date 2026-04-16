/**
 * Master Control interface — represents a reusable, organization-owned
 * control that can be mapped to one or more framework requirements.
 *
 * See `domain.layer/models/masterControl/masterControl.model.ts` for the
 * Sequelize model and `services/masterControlPropagation.service.ts` for
 * the fan-out logic that keeps mapped framework rows in sync.
 */

export type MasterControlStatus =
  | "Waiting"
  | "In progress"
  | "Done";

export type MasterControlRiskReview =
  | "Acceptable risk"
  | "Residual risk"
  | "Unacceptable risk";

export interface IMasterControl {
  id?: number;

  title: string;
  description?: string | null;

  status?: MasterControlStatus;
  risk_review?: MasterControlRiskReview | null;

  owner?: number | null;
  reviewer?: number | null;
  approver?: number | null;

  due_date?: Date | string | null;
  implementation_details?: string | null;

  is_demo?: boolean;

  created_at?: Date;
  updated_at?: Date;
}
