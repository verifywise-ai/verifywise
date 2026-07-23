import { MrmModelRole } from "../enums/mrm.enum";

export interface IMrmModelRole {
  id?: number;
  organization_id: number;
  model_inventory_id: number;
  role: MrmModelRole;
  user_id?: number; // nullable — SET NULL on user delete
  created_at?: Date;
}
