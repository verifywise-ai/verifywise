/**
 * @fileoverview Virtual Folder Interfaces
 *
 * Defines TypeScript interfaces for the virtual folder system that allows
 * users to organize files into hierarchical folder structures without
 * changing where files are linked from.
 *
 * Features:
 * - Hierarchical folder structure with parent-child relationships
 * - Multi-folder assignment (files can exist in multiple folders)
 * - Customizable folder appearance (color, icon)
 * - System folders for special views
 *
 * @module domain.layer/interfaces/i.virtualFolder
 */

/**
 * Base interface for a virtual folder
 */
export interface IVirtualFolder {
  id?: number;
  name: string;
  description?: string | null;
  parent_id?: number | null;
  color?: string | null;
  icon?: string | null;
  is_system?: boolean;
  created_by: number;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Input interface for creating a new folder
 */
export interface IVirtualFolderInput {
  name: string;
  description?: string | null;
  parent_id?: number | null;
  color?: string | null;
  icon?: string | null;
}

/**
 * Input interface for updating an existing folder
 */
export interface IVirtualFolderUpdate {
  name?: string;
  description?: string | null;
  parent_id?: number | null;
  color?: string | null;
  icon?: string | null;
}

/**
 * Interface for file-folder mapping (junction table)
 */
export interface IFileFolderMapping {
  id?: number;
  file_id: number;
  folder_id: number;
  assigned_by: number;
  assigned_at?: Date;
}

/**
 * Extended folder interface with computed fields for tree display
 */
export interface IFolderTreeNode extends IVirtualFolder {
  children: IFolderTreeNode[];
  file_count: number;
  path: string[];
}

/**
 * Interface for folder with file count (flat list view)
 */
export interface IFolderWithCount extends IVirtualFolder {
  file_count: number;
}

/**
 * Interface for assigning files to folders
 */
export interface IAssignFilesToFolderInput {
  file_ids: number[];
}

/**
 * Interface for bulk updating file folder assignments
 */
export interface IBulkUpdateFileFoldersInput {
  folder_ids: number[];
}

/**
 * Interface for file with its folder assignments
 */
export interface IFileWithFolders {
  id: number;
  filename: string;
  size: number;
  mimetype: string;
  upload_date: Date;
  uploaded_by: number;
  uploader_name?: string;
  uploader_surname?: string;
  project_id?: number;
  project_title?: string;
  source?: string;
  folders: IVirtualFolder[];
}

/**
 * Predefined folder icons that users can choose from
 */
export const FOLDER_ICONS = [
  "folder",
  "folder-open",
  "archive",
  "briefcase",
  "building",
  "calendar",
  "clipboard",
  "clock",
  "cog",
  "document",
  "file-text",
  "flag",
  "globe",
  "heart",
  "home",
  "inbox",
  "layers",
  "lock",
  "mail",
  "shield",
  "star",
  "tag",
  "users",
] as const;

export type FolderIcon = (typeof FOLDER_ICONS)[number];

/**
 * Predefined folder colors (matching design system)
 */
export const FOLDER_COLORS = [
  "#13715B", // Green (primary)
  "#3B82F6", // Blue
  "#EF4444", // Red
  "#F59E0B", // Amber
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#84CC16", // Lime
  "#6B7280", // Gray
] as const;

export type FolderColor = (typeof FOLDER_COLORS)[number];
