/**
 * @fileoverview File Folder Mapping Model
 *
 * Defines the junction table entity for the many-to-many relationship
 * between files and virtual folders. This allows files to be assigned
 * to multiple folders (tag-like behavior).
 *
 * Database Schema:
 * - id: Auto-incrementing primary key
 * - file_id: Reference to file_manager table
 * - folder_id: Reference to virtual_folders table
 * - assigned_by: User ID who made the assignment
 * - assigned_at: Assignment timestamp
 *
 * Constraints:
 * - Unique constraint on (file_id, folder_id) to prevent duplicates
 * - CASCADE delete on both file and folder deletion
 *
 * @module domain.layer/models/virtualFolder
 */

import { Table, Column, DataType, Model, ForeignKey } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { FileManagerModel } from "../fileManager/fileManager.model";
import { VirtualFolderModel } from "./virtualFolder.model";
import { IFileFolderMapping } from "../../interfaces/i.virtualFolder";

@Table({
  tableName: "file_folder_mappings",
  timestamps: false,
  underscored: true,
})
export class FileFolderMappingModel
  extends Model<FileFolderMappingModel>
  implements IFileFolderMapping
{
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id!: number;

  @ForeignKey(() => FileManagerModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  file_id!: number;

  @ForeignKey(() => VirtualFolderModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  folder_id!: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  assigned_by!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  assigned_at?: Date;

  toJSON(): IFileFolderMapping {
    return {
      id: this.id,
      file_id: this.file_id,
      folder_id: this.folder_id,
      assigned_by: this.assigned_by,
      assigned_at: this.assigned_at,
    };
  }
}
