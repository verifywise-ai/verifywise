import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { ProjectModel } from "../project/project.model";
import { OrganizationModel } from "../organization/organization.model";

export type FileSource =
  | "Assessment tracker group"
  | "Compliance tracker group"
  | "Management system clauses group"
  | "Reference controls group"
  | "Main clauses group"
  | "Annex controls group"
  | "Project risks report"
  | "Compliance tracker report"
  | "Assessment tracker report"
  | "Vendors and risks report"
  | "All reports"
  | "Clauses and annexes report"
  | "AI trust center group"
  | "ISO 27001 report"
  | "Models and risks report"
  | "Training registry report"
  | "Policy manager report"
  | "File Manager"
  | "policy_editor"
  | "Post-Market Monitoring report"
  | "dataset_bulk_upload";

export type ReviewStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "expired"
  | "superseded";

export interface File {
  filename: string;
  content: Buffer;
  project_id?: number;
  uploaded_by: number;
  uploaded_time: Date;
  size?: number;
  file_path?: string;
  org_id?: number;
  model_id?: number;
  source: FileSource;
  // New metadata fields
  tags?: string[];
  review_status?: ReviewStatus;
  version?: string;
  expiry_date?: Date;
  last_modified_by?: number;
  description?: string;
  // Approval workflow support
  approval_workflow_id?: number;
  approval_request_id?: number;
}

export interface FileType {
  id: string;
  fileName: string;
  project_id?: number;
  uploaded_by: number;
  uploaded_time: Date;
  type: string;
  size?: number;
  file_path?: string;
  org_id?: number;
  model_id?: number;
  source: FileSource;
  // New metadata fields
  tags?: string[];
  review_status?: ReviewStatus;
  version?: string;
  expiry_date?: Date;
  last_modified_by?: number;
  description?: string;
  // Approval workflow support
  approval_workflow_id?: number;
}

export interface FileList extends FileType {
  is_evidence?: boolean; // To separate feedback files from evidence files
  parent_id?: number; // Could be topic_id for assessment, control_id for control
  sub_id?: number; // Could be subtopic_id for assessment (intermediate ids)
  meta_id?: number; // Could be question_id for assessment, sub_control_id for control
  // For file manager views
  uploader_name?: string;
  last_modifier_name?: string;
  folder_ids?: number[];
}

@Table({
  tableName: "files",
  timestamps: true,
  underscored: true,
})
export class FileModel extends Model<File> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
  })
  filename!: string;

  @Column({
    type: DataType.BLOB,
  })
  content!: Buffer;

  @ForeignKey(() => ProjectModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  project_id?: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
  })
  uploaded_by!: number;

  @Column({
    type: DataType.DATE,
  })
  uploaded_time!: Date;

  @Column({
    type: DataType.BIGINT,
    allowNull: true,
  })
  size?: number;

  @Column({
    type: DataType.STRING(500),
    allowNull: true,
  })
  file_path?: string;

  @ForeignKey(() => OrganizationModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  org_id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  model_id?: number;

  @Column({
    type: DataType.ENUM(
      "Assessment tracker group",
      "Compliance tracker group",
      "Management system clauses group",
      "Reference controls group",
      "Main clauses group",
      "Annex controls group",
      "Project risks report",
      "Compliance tracker report",
      "Assessment tracker report",
      "Vendors and risks report",
      "All reports",
      "Clauses and annexes report",
      "AI trust center group",
      "ISO 27001 report",
      "Models and risks report",
      "Training registry report",
      "Policy manager report",
      "File Manager",
      "policy_editor",
    ),
  })
  source!: FileSource;

  @Column({
    type: DataType.STRING,
  })
  type!: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_demo?: boolean;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    defaultValue: [],
  })
  tags?: string[];

  @Column({
    type: DataType.STRING(20),
    allowNull: true,
    defaultValue: "draft",
  })
  review_status?: ReviewStatus;

  @Column({
    type: DataType.STRING(20),
    allowNull: true,
    defaultValue: "1.0",
  })
  version?: string;

  @Column({
    type: DataType.DATEONLY,
    allowNull: true,
  })
  expiry_date?: Date;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  last_modified_by?: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  approval_workflow_id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  approval_request_id?: number;

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
}
