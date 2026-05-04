/**
 * @fileoverview Virtual Folders Hook
 *
 * React hook for managing virtual folder data and operations.
 *
 * @module application/hooks/useVirtualFolders
 */

import { useState, useCallback, useEffect } from "react";
import {
  IFolderTreeNode,
  IFolderWithCount,
  IVirtualFolder,
  IVirtualFolderInput,
  IVirtualFolderUpdate,
  SelectedFolder,
} from "../../domain/interfaces/i.virtualFolder";
import {
  getFolderTree,
  getAllFolders,
  getFolderPath,
  createFolder,
  updateFolder,
  deleteFolder,
} from "../repository/virtualFolder.repository";

interface UseVirtualFoldersReturn {
  // Data
  folderTree: IFolderTreeNode[];
  folders: IFolderWithCount[];
  selectedFolder: SelectedFolder;
  breadcrumb: IVirtualFolder[];

  // Loading states
  loading: boolean;
  loadingBreadcrumb: boolean;

  // Error state
  error: string | null;

  // Actions
  setSelectedFolder: (folder: SelectedFolder) => void;
  refreshFolders: () => Promise<void>;
  handleCreateFolder: (input: IVirtualFolderInput) => Promise<IVirtualFolder | null>;
  handleUpdateFolder: (id: number, input: IVirtualFolderUpdate) => Promise<IVirtualFolder | null>;
  handleDeleteFolder: (id: number) => Promise<boolean>;
}

/**
 * Hook for managing virtual folders
 */
export function useVirtualFolders(): UseVirtualFoldersReturn {
  const [folderTree, setFolderTree] = useState<IFolderTreeNode[]>([]);
  const [folders, setFolders] = useState<IFolderWithCount[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<SelectedFolder>("all");
  const [breadcrumb, setBreadcrumb] = useState<IVirtualFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBreadcrumb, setLoadingBreadcrumb] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch folder tree and flat list
   */
  const refreshFolders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [treeData, flatData] = await Promise.all([getFolderTree(), getAllFolders()]);

      setFolderTree(treeData);
      setFolders(flatData);
    } catch (err) {
      console.error("Error fetching folders:", err);
      setError("Failed to load folders");
      setFolderTree([]);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load folder breadcrumb when folder selection changes
   */
  const loadBreadcrumb = useCallback(async (folderId: number) => {
    try {
      setLoadingBreadcrumb(true);
      const path = await getFolderPath(folderId);
      setBreadcrumb(path);
    } catch (err) {
      console.error("Error fetching folder path:", err);
      setBreadcrumb([]);
    } finally {
      setLoadingBreadcrumb(false);
    }
  }, []);

  /**
   * Handle folder selection change
   */
  const handleSetSelectedFolder = useCallback(
    (folder: SelectedFolder) => {
      setSelectedFolder(folder);

      if (typeof folder === "number") {
        // Keep old breadcrumb visible while loading new one to prevent flash
        setLoadingBreadcrumb(true);
        loadBreadcrumb(folder);
      } else {
        // Only clear breadcrumb when going to "all" or "uncategorized"
        setBreadcrumb([]);
      }
    },
    [loadBreadcrumb],
  );

  /**
   * Create a new folder
   */
  const handleCreateFolder = useCallback(
    async (input: IVirtualFolderInput): Promise<IVirtualFolder | null> => {
      try {
        setError(null);
        const newFolder = await createFolder(input);
        await refreshFolders();
        return newFolder;
      } catch (err) {
        console.error("Error creating folder:", err);
        const message = err instanceof Error ? err.message : "Failed to create folder";
        setError(message);
        return null;
      }
    },
    [refreshFolders],
  );

  /**
   * Update an existing folder
   */
  const handleUpdateFolder = useCallback(
    async (id: number, input: IVirtualFolderUpdate): Promise<IVirtualFolder | null> => {
      try {
        setError(null);
        const updatedFolder = await updateFolder(id, input);
        await refreshFolders();

        // Reload breadcrumb if the updated folder is in the path
        if (typeof selectedFolder === "number") {
          await loadBreadcrumb(selectedFolder);
        }

        return updatedFolder;
      } catch (err) {
        console.error("Error updating folder:", err);
        const message = err instanceof Error ? err.message : "Failed to update folder";
        setError(message);
        return null;
      }
    },
    [refreshFolders, selectedFolder, loadBreadcrumb],
  );

  /**
   * Delete a folder
   */
  const handleDeleteFolder = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        setError(null);
        await deleteFolder(id);
        await refreshFolders();

        // Reset to all files if deleted folder was selected
        if (selectedFolder === id) {
          setSelectedFolder("all");
          setBreadcrumb([]);
        }

        return true;
      } catch (err) {
        console.error("Error deleting folder:", err);
        const message = err instanceof Error ? err.message : "Failed to delete folder";
        setError(message);
        return false;
      }
    },
    [refreshFolders, selectedFolder],
  );

  // Initial data load
  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  return {
    folderTree,
    folders,
    selectedFolder,
    breadcrumb,
    loading,
    loadingBreadcrumb,
    error,
    setSelectedFolder: handleSetSelectedFolder,
    refreshFolders,
    handleCreateFolder,
    handleUpdateFolder,
    handleDeleteFolder,
  };
}

export default useVirtualFolders;
