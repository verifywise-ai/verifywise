import React, { useState, useRef } from "react";
import { Stack, useTheme, IconButton, Typography, Link, Box, Button } from "@mui/material";
import {
  X as CloseIcon,
  Trash2 as DeleteIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  FileText as FileIcon,
} from "lucide-react";
import DeleteFileModal from "./DeleteFileModal";
import getStyles from "./getStyles";
import { FileData } from "../../../../domain/types/File";
import { handleDownload } from "../../../../application/tools/fileDownload";

interface FileManagementDialogProps {
  /** Existing files already saved on server */
  files: FileData[];
  /** Callback when dialog is closed */
  onClose: () => void;
  /** Callback when a file should be deleted */
  onRemoveFile: (fileId: string) => void;
  /** New files pending upload (optional - for components that track pending separately) */
  pendingFiles?: FileData[];
  /** Callback when new files are added */
  onAddFiles?: (files: FileData[]) => void;
  /** Callback when a pending file is removed (before upload) */
  onRemovePendingFile?: (fileId: string) => void;
  /** Accepted file types for input */
  acceptedTypes?: string;
  /** Whether multiple files can be selected */
  multiple?: boolean;
  /** Whether file management is disabled */
  disabled?: boolean;
}

function FileListItem({
  file,
  onDeleteClick,
  onDownloadClick,
  styles,
  isPending = false,
}: {
  file: FileData;
  onDeleteClick: (fileId: string, fileName: string) => void;
  onDownloadClick?: (fileId: string, fileName: string) => void;
  styles: ReturnType<typeof getStyles>;
  isPending?: boolean;
}) {
  const theme = useTheme();
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      sx={{
        ...styles.fileItem,
        backgroundColor: isPending ? theme.palette.warning.light : "transparent",
        border: isPending ? `1px solid ${theme.palette.warning.main}` : undefined,
        borderRadius: isPending ? "4px" : undefined,
        padding: isPending ? "8px 12px" : styles.fileItem.padding,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1, minWidth: 0 }}>
        <FileIcon
          size={16}
          color={isPending ? theme.palette.warning.dark : theme.palette.text.disabled}
        />
        {!isPending && onDownloadClick ? (
          <Link
            component="button"
            onClick={() => onDownloadClick(file.id, file.fileName)}
            sx={styles.fileLink}
          >
            <Typography component="span" variant="body2" sx={styles.fileName}>
              {file.fileName}
            </Typography>
          </Link>
        ) : (
          <Typography
            component="span"
            variant="body2"
            sx={{
              ...styles.fileName,
              color: isPending ? theme.palette.warning.dark : undefined,
            }}
          >
            {file.fileName}
          </Typography>
        )}
        {isPending && (
          <Typography variant="caption" sx={{ color: theme.palette.warning.dark, ml: 1 }}>
            (pending)
          </Typography>
        )}
      </Stack>
      <Stack direction="row" spacing={1}>
        {!isPending && onDownloadClick && (
          <IconButton
            size="small"
            onClick={() => onDownloadClick(file.id, file.fileName)}
            aria-label="Download"
          >
            <DownloadIcon size={16} />
          </IconButton>
        )}
        <IconButton
          size="small"
          onClick={() => onDeleteClick(file.id, file.fileName)}
          aria-label={isPending ? "Remove" : "Delete"}
        >
          <DeleteIcon size={16} color={isPending ? theme.palette.warning.dark : undefined} />
        </IconButton>
      </Stack>
    </Stack>
  );
}

function FileManagementDialog({
  files,
  onClose,
  onRemoveFile,
  pendingFiles = [],
  onAddFiles,
  onRemovePendingFile,
  acceptedTypes = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv",
  multiple = true,
  disabled = false,
}: FileManagementDialogProps) {
  const theme = useTheme();
  const styles = getStyles(theme);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteFileModal, setDeleteFileModal] = useState({
    isOpen: false,
    fileId: "",
    fileName: "",
    isPending: false,
  });

  const handleOpenDeleteFileModal = (
    fileId: string,
    fileName: string,
    isPending: boolean = false,
  ) => {
    setDeleteFileModal({ isOpen: true, fileId, fileName, isPending });
  };

  const handleCloseDeleteFileModal = () => {
    setDeleteFileModal({ isOpen: false, fileId: "", fileName: "", isPending: false });
  };

  const handleDeleteFile = () => {
    if (deleteFileModal.isPending && onRemovePendingFile) {
      onRemovePendingFile(deleteFileModal.fileId);
    } else {
      onRemoveFile(deleteFileModal.fileId);
    }
    handleCloseDeleteFileModal();
  };

  const handleDownloadFile = (fileId: string, fileName: string) => {
    handleDownload(fileId, fileName);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0 && onAddFiles) {
      const newFiles: FileData[] = selectedFiles.map((file) => ({
        id: `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        fileName: file.name,
        size: file.size,
        type: file.type,
        data: file,
        uploadDate: new Date().toISOString(),
        uploader: "Current User",
      }));
      onAddFiles(newFiles);
    }
    // Reset input value to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const totalFiles = files.length + pendingFiles.length;

  return (
    <Stack sx={styles.container}>
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ width: "100%", mb: 2 }}
      >
        <Typography variant="h6" sx={{ fontSize: 16, fontWeight: 600 }}>
          Manage Evidence Files
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon size={20} />
        </IconButton>
      </Stack>

      {/* Add Files Section */}
      {onAddFiles && (
        <Box sx={{ mb: 3, width: "100%" }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple={multiple}
            accept={acceptedTypes}
            style={{ display: "none" }}
            onChange={handleFileInputChange}
            disabled={disabled}
          />
          <Button
            variant="outlined"
            startIcon={<UploadIcon size={16} />}
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            sx={{
              "borderRadius": 1,
              "border": `1px solid ${theme.palette.divider}`,
              "color": theme.palette.text.primary,
              "textTransform": "none",
              "&:hover": {
                backgroundColor: theme.palette.action.hover,
                border: `1px solid ${theme.palette.divider}`,
              },
            }}
          >
            Add files
          </Button>
          <Typography
            variant="caption"
            sx={{ display: "block", mt: 1, color: theme.palette.text.disabled }}
          >
            Supported formats: PDF, DOC, DOCX, XLS, XLSX, Images
          </Typography>
        </Box>
      )}

      {/* Pending Files Section */}
      {pendingFiles.length > 0 && (
        <Box sx={{ width: "100%", mb: 2 }}>
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 600,
              color: theme.palette.warning.dark,
              mb: 1,
            }}
          >
            Pending upload ({pendingFiles.length})
          </Typography>
          <Stack spacing={1}>
            {pendingFiles.map((file) => (
              <FileListItem
                key={file.id}
                file={file}
                onDeleteClick={(id, name) => handleOpenDeleteFileModal(id, name, true)}
                styles={styles}
                isPending
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* Attached Files Section */}
      {files.length > 0 && (
        <Box sx={{ width: "100%", mb: 2 }}>
          <Typography
            sx={{
              fontSize: 12,
              fontWeight: 600,
              color: theme.palette.text.primary,
              mb: 1,
            }}
          >
            Attached files ({files.length})
          </Typography>
          <Stack sx={styles.fileList}>
            {files.map((file) => (
              <FileListItem
                key={file.id}
                file={file}
                onDeleteClick={(id, name) => handleOpenDeleteFileModal(id, name, false)}
                onDownloadClick={handleDownloadFile}
                styles={styles}
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* Empty State */}
      {totalFiles === 0 && (
        <Box
          sx={{
            textAlign: "center",
            py: 4,
            color: theme.palette.text.disabled,
            border: `2px dashed ${theme.palette.divider}`,
            borderRadius: 1,
            backgroundColor: theme.palette.action.hover,
            width: "100%",
            mb: 2,
          }}
        >
          <Typography variant="body2" sx={{ mb: 1 }}>
            No evidence files attached yet
          </Typography>
          <Typography variant="caption" color={theme.palette.text.secondary}>
            Click "Add files" to upload documentation
          </Typography>
        </Box>
      )}

      {/* Done Button */}
      <Button
        variant="contained"
        onClick={onClose}
        sx={{
          mt: 2,
          alignSelf: "flex-end",
        }}
      >
        Done
      </Button>

      {/* Delete Confirmation Modal */}
      <DeleteFileModal
        isOpen={deleteFileModal.isOpen}
        fileName={deleteFileModal.fileName}
        onClose={handleCloseDeleteFileModal}
        onDelete={handleDeleteFile}
      />
    </Stack>
  );
}

export default FileManagementDialog;
