import { MrmFindingSeverity, MrmFindingStage } from "../enums/mrm.enum";

export interface IMrmFinding {
  id?: number;
  organization_id: number;
  model_inventory_id: number;
  validation_id?: number;
  title: string;
  severity: MrmFindingSeverity;
  stage: MrmFindingStage;
  owner_id?: number;
  remediation_plan?: string;
  due_date?: Date;
  closed_at?: Date;
  closed_verified: boolean;
  created_at?: Date;
  updated_at?: Date;
}
