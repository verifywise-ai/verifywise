import { useCallback, useState } from "react";
import {
  getFileById,
  getEntityFiles,
} from "../../../../application/repository/file.repository";
import { FileData, OnAlert } from "./types";

interface UseEvidenceFilesParams {
  frameworkType: string;
  entityType: string;
  onAlert: OnAlert;
}

/**
 * State + handlers for the Evidence tab. The hook owns the four file
 * arrays (existing / pending upload / pending attach / pending delete) and
 * exposes them so the parent drawer can serialize them into its save
 * request. `loadFiles(entityId, legacyEvidenceLinks)` merges rows from the
 * legacy JSONB column with rows from file_entity_links and dedupes by id.
 */
export function useEvidenceFiles({
  frameworkType,
  entityType,
  onAlert,
}: UseEvidenceFilesParams) {
  const [evidenceFiles, setEvidenceFiles] = useState<FileData[]>([]);
  const [uploadFiles, setUploadFiles] = useState<FileData[]>([]);
  const [pendingAttachFiles, setPendingAttachFiles] = useState<FileData[]>([]);
  const [deletedFileIds, setDeletedFileIds] = useState<number[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);

  const loadFiles = useCallback(
    async (entityId: number, legacyEvidenceLinks?: FileData[] | null) => {
      const normalizedLegacy: FileData[] = Array.isArray(legacyEvidenceLinks)
        ? legacyEvidenceLinks.map((file: any) => ({
            id: file.id?.toString() || "",
            fileName: file.fileName || file.filename || file.file_name || "",
            size: file.size || 0,
            type: file.type || "",
            uploadDate: file.uploadDate || file.upload_date || new Date().toISOString(),
            uploader: file.uploader || "Unknown",
            source: file.source || "File Manager",
          }))
        : [];

      let linkedFiles: FileData[] = [];
      try {
        const response = await getEntityFiles(frameworkType, entityType, entityId);
        const responseFiles = response?.files ?? [];
        if (responseFiles.length > 0) {
          linkedFiles = responseFiles.map((file: any) => ({
            id: file.id?.toString() || file.file_id?.toString() || "",
            fileName: file.filename || file.fileName || file.file_name || "",
            size: file.size || 0,
            type: file.mimetype || file.type || "",
            uploadDate: file.upload_date || file.uploadDate || new Date().toISOString(),
            uploader: file.uploader_name
              ? `${file.uploader_name} ${file.uploader_surname || ""}`.trim()
              : file.uploader || "Unknown",
            source: file.source || "File Manager",
          }));
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("Error fetching linked files:", error);
        }
      }

      const fileMap = new Map<string, FileData>();
      normalizedLegacy.forEach((file) => {
        if (file.id) fileMap.set(String(file.id), file);
      });
      linkedFiles.forEach((file) => {
        if (file.id && !fileMap.has(String(file.id))) {
          fileMap.set(String(file.id), file);
        }
      });

      setEvidenceFiles(Array.from(fileMap.values()));
    },
    [frameworkType, entityType],
  );

  const handleAddFiles = (files: File[]) => {
    const newFiles: FileData[] = files.map((file) => ({
      id: (Date.now() + Math.random()).toString(),
      fileName: file.name,
      size: file.size,
      type: file.type,
      data: file,
      uploadDate: new Date().toISOString(),
      uploader: "Current User",
    }));
    setUploadFiles((prev) => [...prev, ...newFiles]);
    onAlert({
      variant: "info",
      body: `${files.length} file(s) added. Save to apply changes.`,
    });
  };

  const handleAttachExistingFiles = (selectedFiles: FileData[]) => {
    if (selectedFiles.length === 0) return;
    setPendingAttachFiles((prev) => [...prev, ...selectedFiles]);
    onAlert({
      variant: "info",
      body: `${selectedFiles.length} file(s) added to attach queue. Save to apply changes.`,
    });
  };

  const handleRemovePendingAttach = (fileId: string) => {
    setPendingAttachFiles((prev) => prev.filter((f) => f.id !== fileId));
    onAlert({ variant: "info", body: "File removed from attach queue." });
  };

  const handleDeleteEvidenceFile = (fileId: string) => {
    const parsed = parseInt(fileId);
    if (isNaN(parsed)) {
      onAlert({ variant: "error", body: "Invalid file ID" });
      return;
    }
    setEvidenceFiles((prev) => prev.filter((f) => f.id.toString() !== fileId));
    setDeletedFileIds((prev) => [...prev, parsed]);
    onAlert({
      variant: "info",
      body: "File marked for deletion. Save to apply changes.",
    });
  };

  const handleDeleteUploadFile = (fileId: string) => {
    setUploadFiles((prev) => prev.filter((f) => f.id !== fileId));
    onAlert({ variant: "info", body: "File removed from upload queue." });
  };

  const handleDownloadFile = async (fileId: string, fileName: string) => {
    try {
      const response = await getFileById({ id: fileId, responseType: "arraybuffer" });
      const blob = new Blob([response], { type: "application/octet-stream" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onAlert({ variant: "success", body: "File downloaded successfully" });
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error downloading file:", error);
      }
      onAlert({
        variant: "error",
        body: "Failed to download file. Please try again.",
      });
    }
  };

  const resetPending = () => {
    setUploadFiles([]);
    setPendingAttachFiles([]);
    setDeletedFileIds([]);
  };

  return {
    evidenceFiles,
    uploadFiles,
    pendingAttachFiles,
    deletedFileIds,
    showFilePicker,
    setShowFilePicker,
    loadFiles,
    handleAddFiles,
    handleAttachExistingFiles,
    handleRemovePendingAttach,
    handleDeleteEvidenceFile,
    handleDeleteUploadFile,
    handleDownloadFile,
    resetPending,
    setEvidenceFiles,
  };
}

export type UseEvidenceFilesReturn = ReturnType<typeof useEvidenceFiles>;
