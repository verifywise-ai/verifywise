/**
 * @fileoverview Virtual Folder Model
 *
 * Defines the VirtualFolder entity for organizing files into a hierarchical
 * folder structure. This is a virtual/metadata-only organization system
 * that doesn't affect where files are stored or linked from.
 *
 * Database Schema:
 * - id: Auto-incrementing primary key
 * - name: Folder name (required, unique per parent)
 * - description: Optional folder description
 * - parent_id: Parent folder ID (null for root folders)
 * - color: Optional hex color code for folder appearance
 * - icon: Optional icon identifier
 * - is_system: Flag for system-managed folders
 * - created_by: User ID who created the folder
 * - created_at: Creation timestamp
 * - updated_at: Last update timestamp
 *
 * @module domain.layer/models/virtualFolder
 */

import { Table, Column, DataType, Model, ForeignKey } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { IVirtualFolder } from "../../interfaces/i.virtualFolder";

@Table({
  tableName: "virtual_folders",
  timestamps: true,
  underscored: true,
})
export class VirtualFolderModel extends Model<VirtualFolderModel> implements IVirtualFolder {
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
  name!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
  })
  description?: string | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  parent_id?: number | null;

  @Column({
    type: DataType.STRING(7),
    allowNull: true,
  })
  color?: string | null;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
  })
  icon?: string | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_system?: boolean;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  created_by!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  updated_at?: Date;

  toJSON(): IVirtualFolder {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      parent_id: this.parent_id,
      color: this.color,
      icon: this.icon,
      is_system: this.is_system,
      created_by: this.created_by,
      created_at: this.createdAt ?? this.created_at,
      updated_at: this.updatedAt ?? this.updated_at,
    };
  }
}
