/**
 * @fileoverview Virtual Folder Repository
 *
 * API client functions for virtual folder operations.
 *
 * @module application/repository/virtualFolder.repository
 */

import { apiServices } from "../../infrastructure/api/networkServices";
import { APIError } from "../tools/error";
import {
  IVirtualFolder,
  IFolderWithCount,
  IFolderTreeNode,
  IVirtualFolderInput,
  IVirtualFolderUpdate,
  IFileWithFolders,
} from "../../domain/interfaces/i.virtualFolder";

interface ApiResponse<T> {
  message: string;
  data: T;
}

function extractData<T>(response: { data: ApiResponse<T> }): T {
  return response.data.data;
}

// ============================================================================
// FOLDER OPERATIONS
// ============================================================================

/**
 * Get all folders (flat list with file counts)
 */
export async function getAllFolders(): Promise<IFolderWithCount[]> {
  try {
    const response = await apiServices.get<ApiResponse<IFolderWithCount[]>>("/virtual-folders");
    return extractData(response);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    throw new APIError("Failed to fetch folders", err?.response?.status, error);
  }
}

/**
 * Get folder tree (hierarchical structure)
 */
export async function getFolderTree(): Promise<IFolderTreeNode[]> {
  try {
    const response = await apiServices.get<ApiResponse<IFolderTreeNode[]>>("/virtual-folders/tree");
    return extractData(response);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    throw new APIError("Failed to fetch folder tree", err?.response?.status, error);
  }
}

/**
 * Get folder by ID
 */
export async function getFolderById(id: number): Promise<IFolderWithCount> {
  try {
    const response = await apiServices.get<ApiResponse<IFolderWithCount>>(`/virtual-folders/${id}`);
    return extractData(response);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    throw new APIError(`Failed to fetch folder with ID ${id}`, err?.response?.status, error);
  }
}

/**
 * Get folder path (breadcrumb from root to folder)
 */
export async function getFolderPath(id: number): Promise<IVirtualFolder[]> {
  try {
    const response = await apiServices.get<ApiResponse<IVirtualFolder[]>>(
      `/virtual-folders/${id}/path`,
    );
    return extractData(response);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    throw new APIError(`Failed to fetch folder path for ID ${id}`, err?.response?.status, error);
  }
}

/**
 * Create a new folder
 */
export async function createFolder(input: IVirtualFolderInput): Promise<IVirtualFolder> {
  try {
    const response = await apiServices.post<ApiResponse<IVirtualFolder>>("/virtual-folders", input);
    return extractData(response);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    throw new APIError("Failed to create folder", err?.response?.status, error);
  }
}

/**
 * Update an existing folder
 */
export async function updateFolder(
  id: number,
  input: IVirtualFolderUpdate,
): Promise<IVirtualFolder> {
  try {
    const response = await apiServices.patch<ApiResponse<IVirtualFolder>>(
      `/virtual-folders/${id}`,
      input,
    );
    return extractData(response);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    throw new APIError(`Failed to update folder with ID ${id}`, err?.response?.status, error);
  }
}

/**
 * Delete a folder
 */
export async function deleteFolder(id: number): Promise<void> {
  try {
    await apiServices.delete(`/virtual-folders/${id}`);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    throw new APIError(`Failed to delete folder with ID ${id}`, err?.response?.status, error);
  }
}

// ============================================================================
// FILE-FOLDER MAPPING OPERATIONS
// ============================================================================

/**
 * Get files in a folder
 */
export async function getFilesInFolder(folderId: number): Promise<IFileWithFolders[]> {
  try {
    const response = await apiServices.get<ApiResponse<IFileWithFolders[]>>(
      `/virtual-folders/${folderId}/files`,
    );
    return extractData(response);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    throw new APIError(`Failed to fetch files in folder ${folderId}`, err?.response?.status, error);
  }
}

/**
 * Get uncategorized files (not assigned to any folder)
 */
export async function getUncategorizedFiles(): Promise<IFileWithFolders[]> {
  try {
    const response = await apiServices.get<ApiResponse<IFileWithFolders[]>>(
      "/virtual-folders/uncategorized",
    );
    return extractData(response);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    throw new APIError("Failed to fetch uncategorized files", err?.response?.status, error);
  }
}

/**
 * Assign files to a folder
 */
export async function assignFilesToFolder(
  folderId: number,
  fileIds: number[],
): Promise<{ assigned: number }> {
  try {
    const response = await apiServices.post<ApiResponse<{ assigned: number }>>(
      `/virtual-folders/${folderId}/files`,
      { file_ids: fileIds },
    );
    return extractData(response);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    throw new APIError(
      `Failed to assign files to folder ${folderId}`,
      err?.response?.status,
      error,
    );
  }
}

/**
 * Remove a file from a folder
 */
export async function removeFileFromFolder(
  folderId: number,
  fileId: number,
): Promise<{ removed: boolean }> {
  try {
    const response = await apiServices.delete<ApiResponse<{ removed: boolean }>>(
      `/virtual-folders/${folderId}/files/${fileId}`,
    );
    return extractData(response);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    throw new APIError(
      `Failed to remove file ${fileId} from folder ${folderId}`,
      err?.response?.status,
      error,
    );
  }
}

/**
 * Get all folders a file belongs to
 */
export async function getFileFolders(fileId: number): Promise<IVirtualFolder[]> {
  try {
    const response = await apiServices.get<ApiResponse<IVirtualFolder[]>>(
      `/files/${fileId}/folders`,
    );
    return extractData(response);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    throw new APIError(`Failed to fetch folders for file ${fileId}`, err?.response?.status, error);
  }
}

/**
 * Bulk update file folder assignments
 */
export async function updateFileFolders(
  fileId: number,
  folderIds: number[],
): Promise<IVirtualFolder[]> {
  try {
    const response = await apiServices.patch<ApiResponse<IVirtualFolder[]>>(
      `/files/${fileId}/folders`,
      { folder_ids: folderIds },
    );
    return extractData(response);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number } };
    throw new APIError(`Failed to update folders for file ${fileId}`, err?.response?.status, error);
  }
}
