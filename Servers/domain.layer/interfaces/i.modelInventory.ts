import { ModelInventoryStatus } from "../enums/model-inventory-status.enum";
import { MrmTier } from "../enums/mrm.enum";

export interface IModelInventory {
  id?: number;
  provider_model?: string; // Keep for backward compatibility during transition
  provider: string;
  model: string;
  version: string;
  approver?: number;
  capabilities: string;
  security_assessment: boolean;
  status: ModelInventoryStatus;
  status_date: Date;
  reference_link?: string;
  biases?: string;
  limitations?: string;
  hosting_provider?: string;
  security_assessment_data: Filedata[];
  is_demo?: boolean;
  // MRM (Model Risk Management) — manual tiering + external key (all nullable)
  external_key?: string;
  mrm_tier?: MrmTier;
  mrm_materiality_drivers?: string;
  mrm_tiered_at?: Date;
  mrm_tiered_by?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface Filedata {
  id: number;
  filename: string;
  size: number;
  mimetype: string;
  upload_date: string;
  uploaded_by: number;
}
