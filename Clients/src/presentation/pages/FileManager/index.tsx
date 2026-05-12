import React, { useState, useEffect, useMemo, useCallback, type JSX } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Stack, Box, Typography } from "@mui/material";
import { Upload as UploadIcon, FolderPlus as FolderPlusIcon } from "lucide-react";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import PageTour from "../../components/PageTour";
import useMultipleOnScreen from "../../../application/hooks/useMultipleOnScreen";
import FileSteps from "./FileSteps";
import CustomizableSkeleton from "../../components/Skeletons";
import { useUserFilesMetaData } from "../../../application/hooks/useUserFilesMetaData";
import FileTable from "../../components/Table/FileTable/FileTable";
import {
  getUserFilesMetaData,
  getFilesWithMetadata,
  getFileMetadata,
  updateFileMetadata,
  FileMetadata,
  UpdateFileMetadataInput,
} from "../../../application/repository/file.repository";
import { transformFilesData } from "../../../application/utils/fileTransform.utils";
import { filesTableFrame, filesTablePlaceholder } from "./styles";
import { FileModel } from "../../../domain/models/Common/file/file.model";
import { CustomizableButton } from "../../components/button/customizable-button";
import FileManagerUploadModal from "../../components/Modals/FileManagerUpload";
import { secureLogError } from "../../../application/utils/secureLogger.utils";
import { useAuth } from "../../../application/hooks/useAuth";
import { SearchBox } from "../../components/Search";
import { GroupBy } from "../../components/Table/GroupBy";
import { useTableGrouping, useGroupByState } from "../../../application/hooks/useTableGrouping";
import { GroupedTableView } from "../../components/Table/GroupedTableView";
import { FilterBy, FilterColumn } from "../../components/Table/FilterBy";
import { useFilterBy } from "../../../application/hooks/useFilterBy";

// Virtual folder imports
import { useVirtualFolders } from "../../../application/hooks/useVirtualFolders";
import { useFolderFiles } from "../../../application/hooks/useFolderFiles";
import {
  IFolderTreeNode,
  IVirtualFolderInput,
  IVirtualFolderUpdate,
  IVirtualFolder,
} from "../../../domain/interfaces/i.virtualFolder";
import { assignFilesToFolder } from "../../../application/repository/virtualFolder.repository";
import FolderTree from "./components/FolderTree";
import FolderBreadcrumb from "./components/FolderBreadcrumb";
import CreateFolderModal from "./components/CreateFolderModal";
import AssignToFolderModal from "./components/AssignToFolderModal";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import Alert from "../../components/Alert";
import { AlertProps } from "../../types/alert.types";

// File metadata enhancement imports
import { useFileColumnVisibility } from "../../../application/hooks/useFileColumnVisibility";
import { ColumnSelector } from "./components/ColumnSelector";
import { FilePreviewPanel } from "./components/FilePreviewPanel";
import { FileMetadataEditor } from "./components/FileMetadataEditor";
import { FileVersionHistoryDrawer } from "./components/FileVersionHistoryDrawer";

// Event subscription for cross-component communication
import { onFileApprovalChanged } from "../../../application/events/fileEvents";

// Constants
const FILE_MANAGER_CONTEXT = "FileManager";
const AUDITOR_ROLE = "Auditor";
const MANAGE_ROLES = ["Admin", "Editor"];

/**
 * Main component for managing files with virtual folder support.
 */
const FileManager: React.FC = (): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [runFileTour, setRunFileTour] = useState(false);

  // Folder sidebar collapse state (persisted in localStorage)
  const [folderSidebarCollapsed, setFolderSidebarCollapsed] = useState(
    () => localStorage.getItem("verifywise:folder-sidebar-collapsed") === "true",
  );

  const handleToggleFolderSidebar = useCallback(() => {
    setFolderSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("verifywise:folder-sidebar-collapsed", String(next));
      return next;
    });
  }, []);
  const { allVisible } = useMultipleOnScreen<HTMLDivElement>({
    countToTrigger: 1,
  });

  // Use hook for initial data load
  const {
    filesData: initialFilesData,
    loading: initialLoading,
    error: initialError,
  } = useUserFilesMetaData();

  // Local state to manage files
  const [filesData, setFilesData] = useState<FileModel[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(initialLoading);
  const [filesError, setFilesError] = useState<Error | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Virtual folder hooks
  const {
    folderTree,
    selectedFolder,
    breadcrumb,
    loading: loadingFolders,
    loadingBreadcrumb,
    setSelectedFolder,
    refreshFolders,
    handleCreateFolder,
    handleUpdateFolder,
    handleDeleteFolder,
  } = useVirtualFolders();

  const {
    files: folderFiles,
    loading: loadingFolderFiles,
    refreshFiles,
    getFileCurrentFolders,
    handleUpdateFileFolders,
  } = useFolderFiles(selectedFolder);

  // Folder modal states
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [parentFolderForCreate, setParentFolderForCreate] = useState<IFolderTreeNode | null>(null);
  const [editingFolder, setEditingFolder] = useState<IFolderTreeNode | null>(null);
  const [isSubmittingFolder, setIsSubmittingFolder] = useState(false);

  // Assign to folder modal states
  const [isAssignFolderModalOpen, setIsAssignFolderModalOpen] = useState(false);
  const [selectedFileForAssign, setSelectedFileForAssign] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [currentFileFolders, setCurrentFileFolders] = useState<IVirtualFolder[]>([]);
  const [isSubmittingAssignment, setIsSubmittingAssignment] = useState(false);

  // Delete folder confirmation modal states
  const [isDeleteFolderModalOpen, setIsDeleteFolderModalOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<IFolderTreeNode | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);

  // Calculate existing sibling folder names for duplicate checking
  const existingSiblingNames = useMemo(() => {
    if (editingFolder) {
      // When editing, find siblings (folders with same parent_id)
      const findSiblings = (folders: IFolderTreeNode[], parentId: number | null): string[] => {
        if (parentId === null) {
          // Root level siblings
          return folders.map((f) => f.name);
        }
        // Find parent folder and return its children's names
        const findInChildren = (nodes: IFolderTreeNode[]): string[] => {
          for (const node of nodes) {
            if (node.id === parentId) {
              return node.children.map((c) => c.name);
            }
            const found = findInChildren(node.children);
            if (found.length > 0) return found;
          }
          return [];
        };
        return findInChildren(folders);
      };
      return findSiblings(folderTree, editingFolder.parent_id ?? null);
    } else if (parentFolderForCreate) {
      // Creating subfolder - siblings are the parent's children
      return parentFolderForCreate.children.map((c) => c.name);
    } else {
      // Creating at root level - siblings are all root folders
      return folderTree.map((f) => f.name);
    }
  }, [folderTree, parentFolderForCreate, editingFolder]);

  // Toast alert state
  const [alert, setAlert] = useState<AlertProps | null>(null);

  // File metadata enhancement hooks
  const {
    visibleColumns,
    availableColumns,
    toggleColumn,
    resetToDefaults: resetColumnsToDefaults,
    getTableColumns,
    visibleColumnKeys,
  } = useFileColumnVisibility();

  // Files with metadata for enhanced view
  const [filesWithMetadata, setFilesWithMetadata] = useState<FileMetadata[]>([]);
  const [, setLoadingMetadata] = useState(false);

  // Preview panel state
  const [previewFile, setPreviewFile] = useState<FileMetadata | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Metadata editor state
  const [editingFile, setEditingFile] = useState<FileMetadata | null>(null);
  const [isMetadataEditorOpen, setIsMetadataEditorOpen] = useState(false);
  const [isSubmittingMetadata, setIsSubmittingMetadata] = useState(false);

  // Version history drawer state
  const [versionHistoryFileId, setVersionHistoryFileId] = useState<string | number | null>(null);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);

  // Auto-dismiss alerts
  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  // Sync initial data from hook to local state ONLY on initial load
  // After that, optimistic updates manage the state independently
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (hasInitialized) return;

    // Still loading - reflect that
    if (initialLoading) {
      setLoadingFiles(true);
      return;
    }

    // Loading finished (success or error) - sync state and mark initialized
    setFilesData(initialFilesData);
    setFilesError(initialError);
    setLoadingFiles(false);
    setHasInitialized(true);
  }, [initialFilesData, initialLoading, initialError, hasInitialized]);

  // RBAC: Get user role for permission checks
  const { userRoleName } = useAuth();

  // GroupBy state
  const { groupBy, groupSortOrder, handleGroupChange } = useGroupByState();

  // Permission checks
  const isUploadAllowed = Boolean(userRoleName) && userRoleName !== AUDITOR_ROLE;
  const canManageFolders = Boolean(userRoleName) && MANAGE_ROLES.includes(userRoleName);

  // Manual refetch function - only used for initial load or explicit refresh
  const refetch = useCallback(async () => {
    try {
      setLoadingFiles(true);
      setFilesError(null);
      const response = await getUserFilesMetaData();
      setFilesData(transformFilesData(response));
    } catch (error) {
      secureLogError("Error refetching files", FILE_MANAGER_CONTEXT);
      setFilesError(error instanceof Error ? error : new Error("Failed to load files"));
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  // Fetch files with enhanced metadata
  const fetchFilesWithMetadata = useCallback(async () => {
    try {
      setLoadingMetadata(true);
      const response = await getFilesWithMetadata();
      setFilesWithMetadata(response.files);
      if (response.files.length === 0) {
        console.warn(
          "[FileManager] Metadata endpoint returned 0 files — preview and edit metadata will use fallback fetch",
        );
      }
    } catch (error) {
      console.warn(
        "[FileManager] Failed to fetch files with metadata — preview and edit metadata will use fallback fetch:",
        error,
      );
      secureLogError("Error fetching files with metadata", FILE_MANAGER_CONTEXT);
      setFilesWithMetadata([]);
    } finally {
      setLoadingMetadata(false);
    }
  }, []);

  // Load files with metadata on mount
  useEffect(() => {
    fetchFilesWithMetadata();
  }, [fetchFilesWithMetadata]);

  // Listen for file approval status changes (from approval modal)
  useEffect(() => {
    const unsubscribe = onFileApprovalChanged(() => {
      // Refresh both file lists and metadata when approval status changes
      refetch();
      fetchFilesWithMetadata();
    });
    return unsubscribe;
  }, [refetch, fetchFilesWithMetadata]);

  // Handle upload button click
  const handleUploadClick = useCallback(() => {
    if (!isUploadAllowed) {
      console.warn("[FileManager] Upload attempt by unauthorized role:", userRoleName);
      return;
    }
    setIsUploadModalOpen(true);
  }, [isUploadAllowed, userRoleName]);

  // Handle upload success - optimistically add files to state
  const handleUploadSuccess = useCallback(
    async (
      uploadedFiles?: Array<{
        id: number;
        filename: string;
        size: number;
        mimetype: string;
        upload_date: string;
        uploaded_by: number;
        review_status?: string;
        approval_workflow_id?: number;
        approval_request_id?: number;
      }>,
    ) => {
      if (!uploadedFiles?.length) return;

      // If viewing a specific folder, auto-assign uploaded files to it
      if (typeof selectedFolder === "number") {
        try {
          const fileIds = uploadedFiles.map((f) => f.id).filter(Boolean);
          if (fileIds.length > 0) {
            await assignFilesToFolder(selectedFolder, fileIds);
          }
        } catch (err) {
          console.error("Failed to assign uploaded files to folder:", err);
        }
      }

      // Optimistically add uploaded files to local state
      const newFiles = uploadedFiles.map((file) =>
        FileModel.createNewFile({
          id: String(file.id),
          fileName: file.filename,
          size: file.size,
          uploadDate: new Date(file.upload_date),
          uploaderName: "You", // Current user uploaded it
          uploader: "You",
          source: "File Manager",
          reviewStatus: file.review_status || "draft",
        }),
      );

      setFilesData((prev) => [...newFiles, ...prev]);

      // Refresh metadata to get the complete file info including review_status
      fetchFilesWithMetadata();

      // If viewing a specific folder, refresh folder files so the upload appears immediately
      if (typeof selectedFolder === "number") {
        refreshFiles(selectedFolder);
      }
    },
    [selectedFolder, fetchFilesWithMetadata, refreshFiles],
  );

  // Handle file deleted - optimistically remove from state
  const handleFileDeleted = useCallback((fileId: string) => {
    setFilesData((prev) => prev.filter((file) => String(file.id) !== fileId));
  }, []);

  // Preview panel handlers
  const handleOpenPreview = useCallback(
    async (fileId: number | string) => {
      const idStr = String(fileId);
      const file = filesWithMetadata.find((f) => String(f.id) === idStr);
      if (file) {
        setPreviewFile(file);
        setIsPreviewOpen(true);
      } else {
        // Fallback: fetch metadata directly from server
        console.warn(
          `[FileManager] Preview: file ID ${idStr} not found in cached metadata, fetching directly...`,
        );
        try {
          const metadata = await getFileMetadata({ id: idStr });
          setPreviewFile(metadata);
          setIsPreviewOpen(true);
        } catch (error) {
          console.error(
            `[FileManager] Preview: failed to fetch metadata for file ID ${idStr}:`,
            error,
          );
          setAlert({
            variant: "error",
            body: "Unable to preview file. Metadata not available.",
            isToast: true,
          });
        }
      }
    },
    [filesWithMetadata],
  );

  const handleClosePreview = useCallback(() => {
    setIsPreviewOpen(false);
    setPreviewFile(null);
  }, []);

  // Open preview automatically when navigated from Wise Search.
  useEffect(() => {
    const state = location.state as { previewFileId?: number | string } | null;
    if (state?.previewFileId) {
      handleOpenPreview(state.previewFileId);
      navigate(location.pathname + location.search, { replace: true, state: {} });
    }
  }, [location, handleOpenPreview, navigate]);

  // Metadata editor handlers
  const handleOpenMetadataEditor = useCallback(
    async (fileId: number | string) => {
      const idStr = String(fileId);
      const file = filesWithMetadata.find((f) => String(f.id) === idStr);
      if (file) {
        setEditingFile(file);
        setIsMetadataEditorOpen(true);
      } else {
        // Fallback: fetch metadata directly from server
        console.warn(
          `[FileManager] Edit metadata: file ID ${idStr} not found in cached metadata, fetching directly...`,
        );
        try {
          const metadata = await getFileMetadata({ id: idStr });
          setEditingFile(metadata);
          setIsMetadataEditorOpen(true);
        } catch (error) {
          console.error(
            `[FileManager] Edit metadata: failed to fetch metadata for file ID ${idStr}:`,
            error,
          );
          setAlert({
            variant: "error",
            body: "Unable to edit metadata. File data not available.",
            isToast: true,
          });
        }
      }
    },
    [filesWithMetadata],
  );

  const handleCloseMetadataEditor = useCallback(() => {
    setIsMetadataEditorOpen(false);
    setEditingFile(null);
  }, []);

  const handleSubmitMetadata = useCallback(
    async (updates: UpdateFileMetadataInput) => {
      if (!editingFile) return;

      setIsSubmittingMetadata(true);
      try {
        await updateFileMetadata({ id: editingFile.id, updates });
        await fetchFilesWithMetadata();
        handleCloseMetadataEditor();
        setAlert({ variant: "success", body: "File metadata updated successfully", isToast: true });
      } catch (error) {
        console.error("Error updating file metadata:", error);
        const message = error instanceof Error ? error.message : "Failed to update file metadata";
        setAlert({ variant: "error", body: message, isToast: true });
      } finally {
        setIsSubmittingMetadata(false);
      }
    },
    [editingFile, fetchFilesWithMetadata, handleCloseMetadataEditor],
  );

  // Version history handlers
  const handleOpenVersionHistory = useCallback((fileId: number | string) => {
    setVersionHistoryFileId(fileId);
    setIsVersionHistoryOpen(true);
  }, []);

  const handleCloseVersionHistory = useCallback(() => {
    setIsVersionHistoryOpen(false);
    setVersionHistoryFileId(null);
  }, []);

  // Folder management handlers
  const handleOpenCreateFolder = useCallback(
    (parentId: number | null) => {
      if (parentId) {
        // Find the parent folder in the tree
        const findFolder = (folders: IFolderTreeNode[], id: number): IFolderTreeNode | null => {
          for (const folder of folders) {
            if (folder.id === id) return folder;
            const found = findFolder(folder.children, id);
            if (found) return found;
          }
          return null;
        };
        setParentFolderForCreate(findFolder(folderTree, parentId));
      } else {
        setParentFolderForCreate(null);
      }
      setEditingFolder(null);
      setIsCreateFolderModalOpen(true);
    },
    [folderTree],
  );

  const handleOpenEditFolder = useCallback((folder: IFolderTreeNode) => {
    setEditingFolder(folder);
    setParentFolderForCreate(null);
    setIsCreateFolderModalOpen(true);
  }, []);

  const handleCloseCreateFolder = useCallback(() => {
    setIsCreateFolderModalOpen(false);
    setParentFolderForCreate(null);
    setEditingFolder(null);
  }, []);

  const handleSubmitFolder = useCallback(
    async (input: IVirtualFolderInput) => {
      setIsSubmittingFolder(true);
      try {
        if (editingFolder) {
          const update: IVirtualFolderUpdate = {
            name: input.name,
            description: input.description,
            color: input.color,
          };
          await handleUpdateFolder(editingFolder.id, update);
          setAlert({
            variant: "success",
            body: `Folder "${input.name}" updated successfully`,
            isToast: true,
          });
        } else {
          await handleCreateFolder(input);
          setAlert({
            variant: "success",
            body: `Folder "${input.name}" created successfully`,
            isToast: true,
          });
        }
        handleCloseCreateFolder();
      } catch (error) {
        console.error("Error saving folder:", error);
        const message = error instanceof Error ? error.message : "Failed to save folder";
        setAlert({ variant: "error", body: message, isToast: true });
      } finally {
        setIsSubmittingFolder(false);
      }
    },
    [editingFolder, handleCreateFolder, handleUpdateFolder, handleCloseCreateFolder],
  );

  const handleOpenDeleteFolder = useCallback((folder: IFolderTreeNode) => {
    setFolderToDelete(folder);
    setIsDeleteFolderModalOpen(true);
  }, []);

  const handleCloseDeleteFolder = useCallback(() => {
    setIsDeleteFolderModalOpen(false);
    setFolderToDelete(null);
  }, []);

  const handleConfirmDeleteFolder = useCallback(async () => {
    if (folderToDelete) {
      setIsDeletingFolder(true);
      const folderName = folderToDelete.name;
      try {
        await handleDeleteFolder(folderToDelete.id);
        // If viewing the deleted folder, reset to "all"
        if (typeof selectedFolder === "number" && selectedFolder === folderToDelete.id) {
          setSelectedFolder("all");
        }
        handleCloseDeleteFolder();
        setAlert({
          variant: "success",
          body: `Folder "${folderName}" deleted successfully`,
          isToast: true,
        });
      } catch (error) {
        console.error("Error deleting folder:", error);
        const message = error instanceof Error ? error.message : "Failed to delete folder";
        setAlert({ variant: "error", body: message, isToast: true });
      } finally {
        setIsDeletingFolder(false);
      }
    }
  }, [
    folderToDelete,
    handleDeleteFolder,
    handleCloseDeleteFolder,
    selectedFolder,
    setSelectedFolder,
  ]);

  // Build a metadata lookup map for O(1) access
  const metadataMap = useMemo(() => {
    const map = new Map<string, FileMetadata>();
    for (const meta of filesWithMetadata) {
      map.set(String(meta.id), meta);
    }
    return map;
  }, [filesWithMetadata]);

  // Get active files based on selected folder, enriched with metadata
  const activeFilesData = useMemo(() => {
    // Helper to enrich a FileModel with metadata
    const enrichWithMetadata = (file: FileModel): FileModel => {
      const meta = metadataMap.get(String(file.id));
      if (meta) {
        file.version = meta.version;
        file.reviewStatus = meta.review_status;
        file.fileGroupId = meta.file_group_id;
        file.tags = meta.tags ?? [];
      }
      return file;
    };

    // When viewing "all", use the original filesData
    // When viewing a folder or "uncategorized", use folderFiles converted to FileModel format
    if (selectedFolder === "all") {
      return filesData.map(enrichWithMetadata);
    }

    // Convert folder files to FileModel instances for compatibility with existing table
    return folderFiles.map((file) => {
      const uploaderName =
        file.uploader_name && file.uploader_surname
          ? `${file.uploader_name} ${file.uploader_surname}`
          : file.uploader_name || file.uploader_surname || "Unknown";
      const fileModel = FileModel.createNewFile({
        id: file.id.toString(),
        fileName: file.filename,
        size: file.size,
        uploadDate: new Date(file.upload_date),
        uploaderName,
        uploader: uploaderName,
        projectId: file.project_id?.toString(),
        projectTitle: file.project_title,
        source: file.source || "File Manager",
        tags: (file as any).tags ?? [],
      });
      return enrichWithMetadata(fileModel);
    });
  }, [selectedFolder, filesData, folderFiles, loadingFolderFiles, metadataMap]);

  // Assign to folder modal handlers
  const handleOpenAssignFolder = useCallback(
    async (fileId: number) => {
      // Find the file name from active files
      const file = activeFilesData.find((f) => Number(f.id) === fileId);
      if (!file) return;

      setSelectedFileForAssign({ id: fileId, name: file.fileName || "" });

      // Fetch current folder assignments
      try {
        const folders = await getFileCurrentFolders(fileId);
        setCurrentFileFolders(folders);
      } catch (err) {
        console.error("Error fetching file folders:", err);
        setCurrentFileFolders([]);
      }

      setIsAssignFolderModalOpen(true);
    },
    [activeFilesData, getFileCurrentFolders],
  );

  const handleCloseAssignFolder = useCallback(() => {
    setIsAssignFolderModalOpen(false);
    setSelectedFileForAssign(null);
    setCurrentFileFolders([]);
  }, []);

  const handleSubmitAssignFolder = useCallback(
    async (folderIds: number[]) => {
      if (!selectedFileForAssign) return;

      setIsSubmittingAssignment(true);
      try {
        await handleUpdateFileFolders(selectedFileForAssign.id, folderIds);
        handleCloseAssignFolder();
        // Refresh folders to update file counts
        refreshFolders();
        refreshFiles(selectedFolder);
        setAlert({ variant: "success", body: "File folder assignments updated", isToast: true });
      } catch (error) {
        console.error("Error assigning file to folders:", error);
        const message =
          error instanceof Error ? error.message : "Failed to update folder assignments";
        setAlert({ variant: "error", body: message, isToast: true });
      } finally {
        setIsSubmittingAssignment(false);
      }
    },
    [
      selectedFileForAssign,
      handleUpdateFileFolders,
      handleCloseAssignFolder,
      refreshFolders,
      refreshFiles,
      selectedFolder,
    ],
  );

  // FilterBy - Dynamic options generators
  const getUniqueUploaders = useCallback(() => {
    const uploaders = new Set<string>();
    activeFilesData.forEach((file) => {
      if (file.uploaderName || file.uploader) {
        uploaders.add(file.uploaderName || file.uploader || "");
      }
    });
    return Array.from(uploaders)
      .filter(Boolean)
      .sort()
      .map((uploader) => ({
        value: uploader,
        label: uploader,
      }));
  }, [activeFilesData]);

  // FilterBy configuration
  const fileFilterColumns: FilterColumn[] = useMemo(
    () => [
      { id: "fileName", label: "File name", type: "text" as const },
      { id: "uploader", label: "Uploader", type: "select" as const, options: getUniqueUploaders() },
      { id: "uploadDate", label: "Upload date", type: "date" as const },
    ],
    [getUniqueUploaders],
  );

  const getFileFieldValue = useCallback(
    (item: FileModel, fieldId: string): string | number | Date | null | undefined => {
      switch (fieldId) {
        case "fileName":
          return item.fileName;
        case "projectId":
          return item.projectId?.toString();
        case "uploader":
          return item.uploaderName || item.uploader;
        case "uploadDate":
          return item.uploadDate;
        default:
          return null;
      }
    },
    [],
  );

  const { filterData: filterFileData, handleFilterChange: handleFileFilterChange } =
    useFilterBy<FileModel>(getFileFieldValue);

  // Filter files
  const filteredFiles = useMemo(() => {
    let result = filterFileData(activeFilesData);
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      result = result.filter((file) => file.fileName?.toLowerCase().includes(query));
    }
    return result;
  }, [filterFileData, activeFilesData, searchTerm]);

  // Grouping
  const getFileGroupKey = useCallback((file: FileModel, field: string): string => {
    switch (field) {
      case "uploader":
        return file.uploaderName || file.uploader || "Unknown";
      default:
        return "Other";
    }
  }, []);

  const groupedFiles = useTableGrouping({
    data: filteredFiles,
    groupByField: groupBy,
    sortOrder: groupSortOrder,
    getGroupKey: getFileGroupKey,
  });

  // Always show loading when folder files are loading (covers both folder and uncategorized views)
  const isLoading = loadingFiles || loadingFolderFiles;

  const boxStyles = useMemo(
    () => ({
      ...filesTableFrame,
      alignItems: filteredFiles.length === 0 ? "center" : "stretch",
      pointerEvents: isLoading ? "none" : "auto",
      opacity: isLoading ? 0.5 : 1,
    }),
    [filteredFiles.length, isLoading],
  );

  useEffect(() => {
    if (allVisible) {
      setRunFileTour(true);
    }
  }, [allVisible]);

  return (
    <PageHeaderExtended
      title="Evidence & documents"
      description="Organize and manage all files uploaded to the system."
      helpArticlePath="ai-governance/evidence-collection"
      tipBoxEntity="file-manager"
    >
      <PageTour
        steps={FileSteps}
        run={runFileTour}
        onFinish={() => {
          localStorage.setItem("file-tour", "true");
          setRunFileTour(false);
        }}
        tourKey="file-tour"
      />

      {/* Main content area with folder sidebar */}
      <Box
        sx={{
          display: "flex",
          gap: 0,
          border: "1px solid #E0E4E9",
          borderRadius: "8px",
          overflow: "hidden",
          minHeight: "600px",
        }}
      >
        {/* Folder sidebar */}
        <FolderTree
          folders={folderTree}
          selectedFolder={selectedFolder}
          onSelectFolder={setSelectedFolder}
          onCreateFolder={handleOpenCreateFolder}
          onEditFolder={handleOpenEditFolder}
          onDeleteFolder={handleOpenDeleteFolder}
          loading={loadingFolders}
          canManage={canManageFolders}
          collapsed={folderSidebarCollapsed}
          onToggleCollapse={handleToggleFolderSidebar}
        />

        {/* File content area */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            backgroundColor: "background.main",
          }}
        >
          {/* Breadcrumb and actions */}
          <Box
            sx={{
              padding: "12px 16px",
              borderBottom: "1px solid #E0E4E9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
              <FolderBreadcrumb
                selectedFolder={selectedFolder}
                breadcrumb={breadcrumb}
                onSelectFolder={setSelectedFolder}
                loading={loadingBreadcrumb}
              />
            </Box>
            <Stack direction="row" gap="8px" sx={{ flexShrink: 0 }}>
              {canManageFolders && (
                <CustomizableButton
                  variant="outlined"
                  text="New folder"
                  onClick={() => handleOpenCreateFolder(null)}
                  sx={{ height: "34px" }}
                  icon={<FolderPlusIcon size={16} />}
                />
              )}
              {isUploadAllowed && (
                <CustomizableButton
                  variant="contained"
                  text="Upload file"
                  onClick={handleUploadClick}
                  sx={{ height: "34px" }}
                  icon={<UploadIcon size={16} />}
                />
              )}
            </Stack>
          </Box>

          {/* Filters and search */}
          <Box
            sx={{
              padding: "12px 16px",
              borderBottom: "1px solid #E0E4E9",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <FilterBy columns={fileFilterColumns} onFilterChange={handleFileFilterChange} />
            <GroupBy
              options={[{ id: "uploader", label: "Uploader" }]}
              onGroupChange={handleGroupChange}
            />
            <ColumnSelector
              columns={availableColumns}
              visibleColumns={visibleColumns}
              onToggleColumn={toggleColumn}
              onResetToDefaults={resetColumnsToDefaults}
            />
            <Box sx={{ flex: 1 }} />
            <SearchBox
              placeholder="Search files..."
              value={searchTerm}
              onChange={setSearchTerm}
              inputProps={{ "aria-label": "Search files" }}
              sx={{ width: "200px" }}
            />
          </Box>

          {/* File table */}
          <Box
            sx={{
              flex: 1,
              overflow: "auto",
              padding: "16px",
            }}
          >
            {isLoading ? (
              <Box sx={{ padding: "24px", textAlign: "center" }}>
                <Typography sx={{ color: "text.icon" }}>Loading files...</Typography>
                <CustomizableSkeleton
                  variant="rectangular"
                  sx={{ ...filesTablePlaceholder, marginTop: 2 }}
                />
              </Box>
            ) : filesError ? (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "48px 24px",
                  textAlign: "center",
                }}
              >
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    backgroundColor: "#FEE2E2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 2,
                  }}
                >
                  <Typography sx={{ fontSize: 24 }}>!</Typography>
                </Box>
                <Typography
                  sx={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#DC2626",
                    marginBottom: 1,
                  }}
                >
                  Unable to load files
                </Typography>
                <Typography
                  sx={{
                    fontSize: 13,
                    color: "text.icon",
                    maxWidth: 400,
                    marginBottom: 2,
                  }}
                >
                  {filesError.message}
                </Typography>
                <CustomizableButton
                  variant="outlined"
                  text="Try again"
                  onClick={refetch}
                  sx={{ height: "34px" }}
                />
              </Box>
            ) : (
              <Box sx={boxStyles}>
                <GroupedTableView
                  groupedData={groupedFiles}
                  ungroupedData={filteredFiles}
                  renderTable={(data, options) => (
                    <FileTable
                      cols={getTableColumns()}
                      files={data}
                      onFileDeleted={handleFileDeleted}
                      hidePagination={options?.hidePagination}
                      onAssignToFolder={canManageFolders ? handleOpenAssignFolder : undefined}
                      onPreview={handleOpenPreview}
                      onEditMetadata={canManageFolders ? handleOpenMetadataEditor : undefined}
                      onViewHistory={handleOpenVersionHistory}
                      visibleColumnKeys={visibleColumnKeys}
                      canRunBulkActions={canManageFolders}
                      onBulkActionSuccess={() => {
                        refetch();
                      }}
                    />
                  )}
                />
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <FileManagerUploadModal
          open={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={handleUploadSuccess}
          showApprovalWorkflow={true}
        />
      )}

      {/* Create/Edit Folder Modal */}
      <CreateFolderModal
        isOpen={isCreateFolderModalOpen}
        onClose={handleCloseCreateFolder}
        onSubmit={handleSubmitFolder}
        parentFolder={parentFolderForCreate}
        editFolder={editingFolder}
        isSubmitting={isSubmittingFolder}
        existingSiblingNames={existingSiblingNames}
      />

      {/* Assign to Folder Modal */}
      <AssignToFolderModal
        isOpen={isAssignFolderModalOpen}
        onClose={handleCloseAssignFolder}
        onSubmit={handleSubmitAssignFolder}
        folders={folderTree}
        currentFolders={currentFileFolders}
        fileName={selectedFileForAssign?.name}
        isSubmitting={isSubmittingAssignment}
      />

      {/* Delete Folder Confirmation Modal */}
      {isDeleteFolderModalOpen && folderToDelete && (
        <ConfirmationModal
          title="Delete folder"
          body={
            <Typography sx={{ color: "text.secondary", fontSize: 14 }}>
              Are you sure you want to delete "{folderToDelete.name}"?
              {folderToDelete.children.length > 0 && " This will also delete all subfolders."} Files
              in this folder will not be deleted.
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Delete"
          onCancel={handleCloseDeleteFolder}
          onProceed={handleConfirmDeleteFolder}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          isOpen={isDeleteFolderModalOpen}
          isLoading={isDeletingFolder}
        />
      )}

      {/* File Preview Panel */}
      <FilePreviewPanel
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
        file={previewFile}
        onEdit={(file) => {
          handleClosePreview();
          handleOpenMetadataEditor(file.id);
        }}
      />

      {/* File Metadata Editor */}
      <FileMetadataEditor
        isOpen={isMetadataEditorOpen}
        onClose={handleCloseMetadataEditor}
        onSubmit={handleSubmitMetadata}
        file={editingFile}
        isSubmitting={isSubmittingMetadata}
      />

      {/* File Version History Drawer */}
      <FileVersionHistoryDrawer
        isOpen={isVersionHistoryOpen}
        onClose={handleCloseVersionHistory}
        fileId={versionHistoryFileId}
      />

      {/* Toast Alert */}
      {alert && (
        <Alert
          variant={alert.variant}
          body={alert.body}
          isToast={true}
          onClick={() => setAlert(null)}
        />
      )}
    </PageHeaderExtended>
  );
};

export default FileManager;
