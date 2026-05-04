import { ModelInventoryStatus } from "../../../enums/modelInventory.enum";

export class ModelInventoryModel {
  id?: number;
  provider_model?: string;
  provider!: string;
  model!: string;
  version!: string;
  approver?: string;
  capabilities!: string;
  security_assessment!: boolean;
  status!: ModelInventoryStatus;
  status_date!: Date;
  is_demo?: boolean;
  created_at?: Date;
  updated_at?: Date;

  constructor(data: ModelInventoryModel) {
    this.id = data.id;
    this.provider_model = data.provider_model;
    this.provider = data.provider;
    this.model = data.model;
    this.version = data.version;
    this.approver = data.approver;
    this.capabilities = data.capabilities;
    this.security_assessment = data.security_assessment;
    this.status = data.status;
    this.status_date = data.status_date;
    this.is_demo = data.is_demo;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  static createNewModelInventory(data: ModelInventoryModel): ModelInventoryModel {
    return new ModelInventoryModel(data);
  }
}
