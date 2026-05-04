/**
 * @fileoverview Virtual Folder Interfaces (Frontend)
 *
 * TypeScript interfaces for the virtual folder system used in the frontend.
 *
 * @module domain/interfaces/i.virtualFolder
 */

/**
 * Base interface for a virtual folder
 */
export interface IVirtualFolder {
  id: number;
  name: string;
  description?: string | null;
  parent_id?: number | null;
  color?: string | null;
  icon?: string | null;
  is_system?: boolean;
  created_by: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Folder with file count
 */
export interface IFolderWithCount extends IVirtualFolder {
  file_count: number;
}

/**
 * Extended folder interface with computed fields for tree display
 */
export interface IFolderTreeNode extends IFolderWithCount {
  children: IFolderTreeNode[];
  path: string[];
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
 * Interface for file-folder mapping
 */
export interface IFileFolderMapping {
  id: number;
  file_id: number;
  folder_id: number;
  assigned_by: number;
  assigned_at?: string;
}

/**
 * Interface for file with its folder assignments
 */
export interface IFileWithFolders {
  id: number;
  filename: string;
  size: number;
  mimetype: string;
  upload_date: string;
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

/**
 * Special folder view identifiers
 */
export type SpecialFolderView = "all" | "uncategorized";

/**
 * Selected folder state (can be a folder ID or special view)
 */
export type SelectedFolder = number | SpecialFolderView;
