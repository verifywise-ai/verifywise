/**
 * @fileoverview File Manager Model
 *
 * Defines the FileManager entity for organization-wide file storage and management.
 * This model handles uploaded files separate from project-specific files, allowing
 * organization-wide file sharing with proper access control.
 *
 * Database Schema:
 * - id: Auto-incrementing primary key
 * - filename: Original filename (sanitized)
 * - size: File size in bytes
 * - mimetype: MIME type of the file
 * - file_path: Storage path on server
 * - uploaded_by: User ID who uploaded the file
 * - upload_date: File upload timestamp
 * - org_id: Organization ID (for multi-tenancy)
 * - is_demo: Flag for demo/sandbox files
 *
 * Access Control:
 * - Upload: All roles except Auditor
 * - Download: All roles with logging
 * - Visibility: Organization-wide
 *
 * @module domain.layer/models/fileManager
 */

import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { OrganizationModel } from "../organization/organization.model";

export interface FileManager {
  id?: number;
  filename: string;
  size: number;
  mimetype: string;
  file_path: string;
  uploaded_by: number;
  upload_date: Date;
  org_id: number;
  is_demo?: boolean;
  model_id?: number;
}

export interface FileManagerMetadata {
  id: number;
  filename: string;
  size: number;
  mimetype: string;
  upload_date: Date;
  uploaded_by: number;
  uploader_name?: string;
  uploader_surname?: string;
}

@Table({
  tableName: "file_manager",
  timestamps: true,
  underscored: true,
})
export class FileManagerModel extends Model<FileManager> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  filename!: string;

  @Column({
    type: DataType.BIGINT,
    allowNull: false,
  })
  size!: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  mimetype!: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: false,
  })
  file_path!: string;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  uploaded_by!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  upload_date!: Date;

  @Column({
    type: DataType.INTEGER,
    allowNull: true, // nullable for now
  })
  model_id!: number;

  @ForeignKey(() => OrganizationModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  org_id!: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_demo?: boolean;

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
