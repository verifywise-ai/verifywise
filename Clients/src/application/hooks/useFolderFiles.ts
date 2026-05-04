/**
 * @fileoverview Folder Files Hook
 *
 * React hook for managing files within virtual folders.
 *
 * @module application/hooks/useFolderFiles
 */

import { useState, useCallback, useEffect } from "react";
import {
  IFileWithFolders,
  IVirtualFolder,
  SelectedFolder,
} from "../../domain/interfaces/i.virtualFolder";
import {
  getFilesInFolder,
  getUncategorizedFiles,
  assignFilesToFolder,
  removeFileFromFolder,
  getFileFolders,
  updateFileFolders,
} from "../repository/virtualFolder.repository";
import { getUserFilesMetaData } from "../repository/file.repository";
import { transformFilesData } from "../utils/fileTransform.utils";

interface UseFolderFilesReturn {
  // Data
  files: IFileWithFolders[];
  allFiles: IFileWithFolders[];

  // Loading states
  loading: boolean;
  loadingOperation: boolean;

  // Error state
  error: string | null;

  // Actions
  refreshFiles: (folder: SelectedFolder) => Promise<void>;
  handleAssignFilesToFolder: (folderId: number, fileIds: number[]) => Promise<boolean>;
  handleRemoveFileFromFolder: (folderId: number, fileId: number) => Promise<boolean>;
  handleUpdateFileFolders: (
    fileId: number,
    folderIds: number[],
  ) => Promise<IVirtualFolder[] | null>;
  getFileCurrentFolders: (fileId: number) => Promise<IVirtualFolder[]>;
}

/**
 * Hook for managing files within virtual folders
 */
export function useFolderFiles(selectedFolder: SelectedFolder): UseFolderFilesReturn {
  const [files, setFiles] = useState<IFileWithFolders[]>([]);
  const [allFiles, setAllFiles] = useState<IFileWithFolders[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOperation, setLoadingOperation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Transform regular file data to IFileWithFolders format
   */
  const transformToFileWithFolders = useCallback(
    (fileData: ReturnType<typeof transformFilesData>): IFileWithFolders[] => {
      return fileData.map((file) => ({
        id: Number(file.id) || 0,
        filename: file.fileName || "",
        size: file.size || 0,
        mimetype: file.type || "application/octet-stream",
        upload_date: file.uploadDate?.toISOString() || new Date().toISOString(),
        uploaded_by: Number(file.uploader) || 0,
        uploader_name: file.uploaderName,
        uploader_surname: undefined,
        folders: [],
      }));
    },
    [],
  );

  /**
   * Fetch files based on selected folder
   */
  const refreshFiles = useCallback(
    async (folder: SelectedFolder) => {
      try {
        setLoading(true);
        setError(null);

        let filesData: IFileWithFolders[];

        if (folder === "all") {
          const rawFiles = await getUserFilesMetaData();
          const transformedFiles = transformFilesData(rawFiles);
          filesData = transformToFileWithFolders(transformedFiles);
          setAllFiles(filesData);
        } else if (folder === "uncategorized") {
          filesData = await getUncategorizedFiles();
        } else {
          filesData = await getFilesInFolder(folder);
        }

        setFiles(filesData);
      } catch (err) {
        console.error("Error fetching files:", err);
        setError("Failed to load files");
      } finally {
        setLoading(false);
      }
    },
    [transformToFileWithFolders],
  );

  /**
   * Assign files to a folder
   */
  const handleAssignFilesToFolder = useCallback(
    async (folderId: number, fileIds: number[]): Promise<boolean> => {
      try {
        setLoadingOperation(true);
        setError(null);

        await assignFilesToFolder(folderId, fileIds);
        await refreshFiles(selectedFolder);

        return true;
      } catch (err) {
        console.error("Error assigning files to folder:", err);
        const message = err instanceof Error ? err.message : "Failed to assign files";
        setError(message);
        return false;
      } finally {
        setLoadingOperation(false);
      }
    },
    [selectedFolder, refreshFiles],
  );

  /**
   * Remove a file from a folder
   */
  const handleRemoveFileFromFolder = useCallback(
    async (folderId: number, fileId: number): Promise<boolean> => {
      try {
        setLoadingOperation(true);
        setError(null);

        await removeFileFromFolder(folderId, fileId);
        await refreshFiles(selectedFolder);

        return true;
      } catch (err) {
        console.error("Error removing file from folder:", err);
        const message = err instanceof Error ? err.message : "Failed to remove file";
        setError(message);
        return false;
      } finally {
        setLoadingOperation(false);
      }
    },
    [selectedFolder, refreshFiles],
  );

  /**
   * Update all folder assignments for a file
   */
  const handleUpdateFileFolders = useCallback(
    async (fileId: number, folderIds: number[]): Promise<IVirtualFolder[] | null> => {
      try {
        setLoadingOperation(true);
        setError(null);

        const updatedFolders = await updateFileFolders(fileId, folderIds);
        await refreshFiles(selectedFolder);

        return updatedFolders;
      } catch (err) {
        console.error("Error updating file folders:", err);
        const message = err instanceof Error ? err.message : "Failed to update file folders";
        setError(message);
        return null;
      } finally {
        setLoadingOperation(false);
      }
    },
    [selectedFolder, refreshFiles],
  );

  /**
   * Get current folders for a file
   */
  const getFileCurrentFolders = useCallback(async (fileId: number): Promise<IVirtualFolder[]> => {
    try {
      return await getFileFolders(fileId);
    } catch (err) {
      console.error("Error fetching file folders:", err);
      return [];
    }
  }, []);

  // Load files when selected folder changes
  useEffect(() => {
    refreshFiles(selectedFolder);
  }, [selectedFolder]); // Don't include refreshFiles to avoid double-calls

  // Load all files for reference
  useEffect(() => {
    const loadAllFiles = async () => {
      try {
        const rawFiles = await getUserFilesMetaData();
        const transformedFiles = transformFilesData(rawFiles);
        setAllFiles(transformToFileWithFolders(transformedFiles));
      } catch (err) {
        console.error("Error loading all files:", err);
      }
    };

    loadAllFiles();
  }, [transformToFileWithFolders]);

  return {
    files,
    allFiles,
    loading,
    loadingOperation,
    error,
    refreshFiles,
    handleAssignFilesToFolder,
    handleRemoveFileFromFolder,
    handleUpdateFileFolders,
    getFileCurrentFolders,
  };
}

export default useFolderFiles;
