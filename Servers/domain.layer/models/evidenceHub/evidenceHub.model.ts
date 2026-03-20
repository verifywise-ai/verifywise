import { Column, DataType, Model, Table } from "sequelize-typescript";
import { IEvidenceHub } from "../../interfaces/i.evidenceHub";

export interface FileResponse {
  id: string | number;
  filename: string;
  size: number | string;
  mimetype: string;
  uploaded_by: number;
  upload_date: string;
}

@Table({
  tableName: "evidence_hub",
  timestamps: true,
  underscored: true,
})
export class EvidenceHubModel extends Model<EvidenceHubModel> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id!: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  evidence_name!: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false,
  })
  evidence_type!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string | null;

  /**
   * Evidence files - now managed via file_entity_links table
   * This property is populated dynamically by the utils layer, not stored in database
   */
  evidence_files?: FileResponse[];

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  expiry_date?: Date;

  @Column({
    type: DataType.ARRAY(DataType.INTEGER),
    allowNull: true,
  })
  mapped_model_ids?: number[] | null;

  /** timestamps */
  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  updated_at?: Date;

  toSafeJSON(): any {
    return {
      id: this.id,
      evidence_name: this.evidence_name,
      evidence_type: this.evidence_type,
      description: this.description,
      evidence_files: this.evidence_files,
      expiry_date: this.expiry_date?.toISOString() || null,
      mapped_model_ids: this.mapped_model_ids,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }

  static fromJSON(json: any): EvidenceHubModel {
    return new EvidenceHubModel(json);
  }

  toJSON(): any {
    return {
      id: this.id,
      evidence_name: this.evidence_name,
      evidence_type: this.evidence_type,
      description: this.description,
      evidence_files: this.evidence_files,
      expiry_date: this.expiry_date?.toISOString() || null,
      mapped_model_ids: this.mapped_model_ids,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      updated_at: (this.updatedAt ?? this.updated_at)?.toISOString(),
    };
  }

  static updateEvidence(
    existingEvidence: EvidenceHubModel,
    data: Partial<IEvidenceHub>
  ): EvidenceHubModel {
    Object.assign(existingEvidence, {
      evidence_name: data.evidence_name ?? existingEvidence.evidence_name,
      evidence_type: data.evidence_type ?? existingEvidence.evidence_type,
      description: data.description ?? existingEvidence.description,
      evidence_files: data.evidence_files ?? existingEvidence.evidence_files,
      expiry_date: data.expiry_date ?? existingEvidence.expiry_date,
      mapped_model_ids:
        data.mapped_model_ids ?? existingEvidence.mapped_model_ids,
      updated_at: new Date(),
    });

    return existingEvidence;
  }
}
