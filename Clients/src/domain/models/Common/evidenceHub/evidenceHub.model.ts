export interface FileResponse {
  id: string | number;
  filename: string;
  size: number | string;
  mimetype: string;
  uploaded_by: number;
  upload_date: string;
}

export class EvidenceHubModel {
  id?: number;
  evidence_name!: string;
  evidence_type!: string;
  description?: string | null;
  // Lifecycle (expiry_date, retention_policy) lives on each linked file, not on
  // the evidence record.
  evidence_files: FileResponse[] = [];
  mapped_model_ids?: number[] | null;
  mapped_training_ids?: number[] | null;
  tags?: string[];
  framework_ids?: string[];
  reviewer_id?: number | null;
  created_at?: Date;
  updated_at?: Date;

  constructor(data: Partial<EvidenceHubModel>) {
    this.id = data.id;
    this.evidence_name = data.evidence_name || "";
    this.evidence_type = data.evidence_type || "";
    this.description = data.description ?? null;
    this.evidence_files = data.evidence_files ?? [];
    this.mapped_model_ids = data.mapped_model_ids ?? null;
    this.mapped_training_ids = data.mapped_training_ids ?? null;
    this.tags = data.tags ?? [];
    this.framework_ids = data.framework_ids ?? [];
    this.reviewer_id = data.reviewer_id ?? null;
    this.created_at = data.created_at ?? new Date();
    this.updated_at = data.updated_at ?? new Date();
  }

  /**
   * Static helper to create a new EvidenceHubModel
   */
  static createNewEvidence(data: Partial<EvidenceHubModel>): EvidenceHubModel {
    return new EvidenceHubModel(data);
  }
}
