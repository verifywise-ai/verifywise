/**
 * @fileoverview File Access Log Model
 *
 * Defines the FileAccessLog entity for tracking file downloads and access.
 * This model provides audit trail for file access within the file manager system.
 *
 * Database Schema:
 * - id: Auto-incrementing primary key
 * - file_id: Reference to file_manager table
 * - accessed_by: User ID who accessed the file
 * - access_date: Timestamp of file access
 * - action: Type of access (download, view)
 * - org_id: Organization ID (for multi-tenancy)
 *
 * Use Cases:
 * - Audit trails for compliance
 * - Usage analytics
 * - Security monitoring
 *
 * @module domain.layer/models/fileManager
 */

import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { FileModel } from "../file/file.model";
import { OrganizationModel } from "../organization/organization.model";

export interface FileAccessLog {
  id?: number;
  file_id: number;
  accessed_by: number;
  access_date: Date;
  action: "download" | "view";
  org_id: number;
}

@Table({
  tableName: "file_access_logs",
  timestamps: true,
  underscored: true,
})
export class FileAccessLogModel extends Model<FileAccessLog> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @ForeignKey(() => FileModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  file_id!: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  accessed_by!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  access_date!: Date;

  @Column({
    type: DataType.ENUM("download", "view"),
    allowNull: false,
  })
  action!: "download" | "view";

  @ForeignKey(() => OrganizationModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  org_id!: number;

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
