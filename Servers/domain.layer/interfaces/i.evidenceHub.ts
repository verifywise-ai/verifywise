export interface FileResponse {
  id: number;
  filename: string;
  size: number;
  mimetype: string;
  upload_date: string;
  uploaded_by: number;
}

export interface IEvidenceHub {
  id?: number;

  evidence_name: string;
  evidence_type: string;
  description?: string | null;

  /**
   * Array of uploaded files - now managed via file_entity_links table
   * This property is populated dynamically by the utils layer, not stored in database
   */
  evidence_files?: FileResponse[];

  expiry_date?: Date | string;

  /**
   * Retention period ("30_days" | "90_days" | "6_months" | "1_year" |
   * "3_years" | "5_years" | "7_years" | "indefinite"). Used to compute
   * expiry_date when no explicit expiry_date is given; "indefinite" and
   * null/undefined mean "no expiry".
   */
  retention_policy?: string | null;

  /** Set by the daily evidence_expiry_sweep job; null = not expired. */
  expired_at?: Date | null;

  /** Soft-archive marker set by the sweep when archival is opted in; never deleted. */
  archived_at?: Date | null;

  /** Multiple model IDs can be mapped (empty array or null allowed) */
  mapped_model_ids?: number[] | null;

  /** Multiple training IDs can be mapped (empty array or null allowed) */
  mapped_training_ids?: number[] | null;

  created_at?: Date;
  updated_at?: Date;
}
