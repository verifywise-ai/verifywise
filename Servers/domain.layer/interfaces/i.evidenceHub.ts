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

    /** Multiple model IDs can be mapped (empty array or null allowed) */
    mapped_model_ids?: number[] | null;

    created_at?: Date;
    updated_at?: Date;
  }
  