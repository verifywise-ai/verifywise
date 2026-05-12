/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
  IconButton,
  Button,
  LinearProgress,
  Box,
  List,
  ListItem,
  ListItemText,
  useTheme,
  Collapse,
} from "@mui/material";
import { Upload as UploadIcon, X as CloseIcon, Trash2 as DeleteIcon, Info } from "lucide-react";
import { uploadFileToManager } from "../../../../application/repository/file.repository";
import { getApprovalWorkflowsByEntityType } from "../../../../application/repository/approvalWorkflow.repository";
import {
  SUPPORTED_FILE_TYPES_STRING,
  MAX_FILE_SIZE_MB,
  validateFile,
} from "../../../../application/constants/fileManager";
import { formatBytes } from "../../../../application/tools/fileUtil";
import { getFileErrorMessage } from "../../../../application/utils/fileErrorHandler.utils";
import { secureLogError } from "../../../../application/utils/secureLogger.utils"; // SECURITY: No PII
import SelectComponent from "../../Inputs/Select";

// Constants (DRY + Maintainability)
const UPLOAD_CONTEXT = "FileManagerUpload";

interface ApprovalWorkflow {
  id: number;
  workflow_title: string;
  entity_type: string;
}

interface FileManagerUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (uploadedFile: any) => void; // ✅ return uploaded file info
  modelId?: string | number | undefined; // save model Id
  /** When true, files are selected but not uploaded - onFileSelect is called instead */
  selectionOnly?: boolean;
  /** Called when files are selected (in selectionOnly mode) */
  onFileSelect?: (files: File[]) => void;
  /** Restrict to specific MIME types (e.g., ["application/pdf"]) */
  acceptedMimeTypes?: string[];
  /** Custom title for the modal */
  title?: string;
  /** Whether to allow multiple file selection (default: true) */
  multiple?: boolean;
  /** Whether to show the approval workflow selector (default: false) */
  showApprovalWorkflow?: boolean;
}

type UploadStatus = "pending" | "uploading" | "success" | "error";

interface UploadedFileInfo {
  file: File;
  model_id?: string | number | undefined;
  status: UploadStatus;
  progress: number;
  error?: string;
}

const FileManagerUploadModal: React.FC<FileManagerUploadModalProps> = ({
  open,
  onClose,
  onSuccess,
  modelId,
  selectionOnly = false,
  onFileSelect,
  acceptedMimeTypes,
  title = "Upload Files",
  multiple = true,
  showApprovalWorkflow = false,
}) => {
  const theme = useTheme();
  const [fileList, setFileList] = useState<UploadedFileInfo[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  // Approval workflow state
  const [approvalWorkflows, setApprovalWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | "">("");
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);

  //Store timeout IDs to prevent race conditions and memory leaks
  const removeSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  //Cleanup timeouts on unmount (KISS: simple cleanup pattern)
  useEffect(() => {
    return () => {
      // Clear any pending timeouts when component unmounts
      if (removeSuccessTimeoutRef.current) {
        clearTimeout(removeSuccessTimeoutRef.current);
        removeSuccessTimeoutRef.current = null;
      }
      if (autoCloseTimeoutRef.current) {
        clearTimeout(autoCloseTimeoutRef.current);
        autoCloseTimeoutRef.current = null;
      }
    };
  }, []);

  // Fetch approval workflows for files when modal opens
  useEffect(() => {
    if (open && showApprovalWorkflow) {
      setLoadingWorkflows(true);
      getApprovalWorkflowsByEntityType({ entityType: "file" })
        .then((workflows) => {
          setApprovalWorkflows(workflows);
        })
        .catch(() => {
          secureLogError("Failed to load approval workflows", UPLOAD_CONTEXT);
          setApprovalWorkflows([]);
        })
        .finally(() => {
          setLoadingWorkflows(false);
        });
    }
  }, [open, showApprovalWorkflow]);

  // Reset selected workflow when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedWorkflowId("");
    }
  }, [open]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      addFiles(Array.from(files));
    }
  };

  const addFiles = (files: File[]) => {
    // Validate each file and create entries with appropriate status (DRY: using shared validateFile)
    const newFiles = files.map((file) => {
      // First check custom MIME types if provided
      if (acceptedMimeTypes && acceptedMimeTypes.length > 0) {
        if (!acceptedMimeTypes.includes(file.type)) {
          const typeNames = acceptedMimeTypes
            .map((t) => {
              if (t === "application/pdf") return "PDF";
              if (t.startsWith("image/")) return "Image";
              return t;
            })
            .join(", ");
          return {
            file,
            status: "error" as const,
            progress: 0,
            error: `Only ${typeNames} files are allowed`,
          };
        }
      }

      const validation = validateFile(file);

      if (!validation.valid) {
        // File failed validation - mark as error with validation message
        return {
          file,
          status: "error" as const,
          progress: 0,
          error: validation.error,
        };
      }

      // File passed validation - mark as pending for upload
      return {
        file,
        status: "pending" as const,
        progress: 0,
      };
    });

    setFileList((prev) => [...prev, ...newFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setFileList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    // Only upload files with "pending" status (i.e., valid files)
    const validFilesCount = fileList.filter((f) => f.status === "pending").length;
    if (validFilesCount === 0) return;

    setIsUploading(true);
    let successCount = 0;

    const uploadedFiles: any[] = []; // to collect all successful uploads

    for (let i = 0; i < fileList.length; i++) {
      // Skip files that failed client-side validation or already uploaded
      if (fileList[i].status !== "pending") continue;

      try {
        // Update status to uploading
        setFileList((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: "uploading" as const, progress: 50 } : item,
          ),
        );

        fileList[i] = { ...fileList[i], model_id: modelId };

        // Upload the file and validate response
        const response = await uploadFileToManager({
          file: fileList[i].file,
          model_id: fileList[i].model_id,
          approval_workflow_id: selectedWorkflowId ? selectedWorkflowId : undefined,
        });

        uploadedFiles.push(response.data);

        // Validate server response structure
        // Backend returns: { message: "Created", data: { id, filename, ... } }
        if (!response || !response.data) {
          throw new Error("Server failed to store the file. Please try again.");
        }

        // Verify the uploaded file has an ID (successfully stored in database)
        if (!response.data.id) {
          throw new Error("File uploaded but not stored properly. Please contact support.");
        }

        // Update status to success
        setFileList((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: "success" as const, progress: 100 } : item,
          ),
        );

        successCount++;
      } catch (error: unknown) {
        // Use centralized error handler (DRY principle)
        const errorMessage = getFileErrorMessage(error, "upload");

        // SECURITY FIX: Use secure logger (no PII leak) instead of logEngine
        // logEngine includes user ID/email/name which violates GDPR/compliance
        secureLogError("File upload failed", UPLOAD_CONTEXT);

        // Update status to error with user-facing message
        setFileList((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: "error" as const,
                  progress: 0,
                  error: errorMessage,
                }
              : item,
          ),
        );
      }
    }

    setIsUploading(false);

    // Trigger refresh once after all uploads complete (avoid multiple refetches)
    if (successCount > 0 && onSuccess) {
      onSuccess(uploadedFiles);
    }

    // DEFENSIVE: Clear any existing timeouts before scheduling new ones
    if (removeSuccessTimeoutRef.current) {
      clearTimeout(removeSuccessTimeoutRef.current);
    }
    if (autoCloseTimeoutRef.current) {
      clearTimeout(autoCloseTimeoutRef.current);
    }

    // Remove successfully uploaded files after a short delay
    removeSuccessTimeoutRef.current = setTimeout(() => {
      setFileList((prev) => {
        const filtered = prev.filter((item) => item.status !== "success");

        // If no files remain (all were successful), close the modal
        if (filtered.length === 0 && successCount > 0) {
          // DEFENSIVE: Store nested timeout ID to prevent race condition
          autoCloseTimeoutRef.current = setTimeout(() => handleClose(), 300);
        }

        return filtered;
      });
    }, 500); // Show a success state for 500 ms before removing
  };

  const handleClose = () => {
    if (!isUploading) {
      setFileList([]);
      onClose();
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      addFiles(Array.from(files));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return theme.palette.success.main;
      case "error":
        return theme.palette.error.main;
      case "uploading":
        return theme.palette.info.main;
      default:
        return theme.palette.text.secondary;
    }
  };

  // Check if there are any valid files to upload/select
  const hasValidFiles = fileList.some((f) => f.status === "pending");

  // Handle selection-only mode - just return the files without uploading
  const handleSelectFiles = () => {
    const validFiles = fileList.filter((f) => f.status === "pending").map((f) => f.file);

    if (validFiles.length > 0 && onFileSelect) {
      onFileSelect(validFiles);
    }
    handleClose();
  };

  // Get the accept attribute for file input based on acceptedMimeTypes
  const getAcceptAttribute = () => {
    if (acceptedMimeTypes && acceptedMimeTypes.length > 0) {
      return acceptedMimeTypes.join(",");
    }
    return undefined; // Accept all supported types
  };

  // Get display text for supported file types
  const getSupportedTypesText = () => {
    if (acceptedMimeTypes && acceptedMimeTypes.length > 0) {
      return acceptedMimeTypes
        .map((t) => {
          if (t === "application/pdf") return "PDF";
          if (t === "image/jpeg") return "JPEG";
          if (t === "image/png") return "PNG";
          if (t.startsWith("image/")) return "Images";
          return t;
        })
        .join(", ");
    }
    return SUPPORTED_FILE_TYPES_STRING;
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" fontWeight={600}>
            {title}
          </Typography>
          <IconButton onClick={handleClose} disabled={isUploading} size="small">
            <CloseIcon size={20} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          {/* Drag and Drop Area */}
          <Box
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            sx={{
              border: `2px dashed ${isDragging ? theme.palette.primary.main : theme.palette.grey[300]}`,
              borderRadius: "8px",
              padding: "32px",
              textAlign: "center",
              backgroundColor: isDragging ? theme.palette.primary.light : theme.palette.grey[50],
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
            onClick={handleBrowseClick}
          >
            <Stack spacing={2} alignItems="center">
              <UploadIcon
                size={48}
                color={isDragging ? theme.palette.primary.main : theme.palette.text.disabled}
              />
              <Typography variant="body1" fontWeight={500}>
                Drag and drop files here
              </Typography>
              <Typography variant="body2" color="text.secondary">
                or click to browse
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Supports: {getSupportedTypesText()}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Maximum file size: {MAX_FILE_SIZE_MB}MB
              </Typography>
            </Stack>
            <input
              ref={fileInputRef}
              type="file"
              multiple={multiple}
              accept={getAcceptAttribute()}
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
          </Box>

          {/* Approval Workflow Selector */}
          <Collapse in={showApprovalWorkflow}>
            {loadingWorkflows ? (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
                Loading approval workflows...
              </Typography>
            ) : approvalWorkflows.length > 0 ? (
              <Stack spacing={1}>
                <SelectComponent
                  id="approval-workflow-select"
                  label="Approval Workflow (Optional)"
                  placeholder="No approval required"
                  value={selectedWorkflowId}
                  items={[
                    { _id: "", name: "No approval required" },
                    ...approvalWorkflows.map((workflow) => ({
                      _id: workflow.id,
                      name: workflow.workflow_title,
                    })),
                  ]}
                  onChange={(e: any) => setSelectedWorkflowId(e.target.value as number | "")}
                  disabled={isUploading}
                  sx={{ width: "100%" }}
                />
                {selectedWorkflowId && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      fontSize: 12,
                      color: theme.palette.text.secondary,
                      backgroundColor: theme.palette.background.accent,
                      padding: "8px 12px",
                      borderRadius: "4px",
                    }}
                  >
                    <Info size={14} color={theme.palette.primary.main} />
                    <span>Files will be marked as "Pending Review" until approved</span>
                  </Box>
                )}
              </Stack>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1.5,
                  fontSize: 13,
                  color: theme.palette.text.secondary,
                  backgroundColor: theme.palette.background.fill,
                  padding: "12px 16px",
                  borderRadius: "4px",
                  border: `1px solid ${theme.palette.border.light}`,
                }}
              >
                <Info
                  size={16}
                  color={theme.palette.text.tertiary}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <span>
                  No file approval workflows configured. Create one in{" "}
                  <strong>Settings → Approval Workflows</strong> with "File / Evidence" entity type.
                </span>
              </Box>
            )}
          </Collapse>

          {/* File List */}
          {fileList.length > 0 && (
            <Box>
              <Typography variant="subtitle2" fontWeight={600} mb={1}>
                Selected Files ({fileList.length})
              </Typography>
              <List sx={{ maxHeight: "300px", overflow: "auto" }}>
                {fileList.map((item, index) => (
                  <ListItem
                    key={index}
                    sx={{
                      border: `1px solid ${theme.palette.grey[300]}`,
                      borderRadius: "4px",
                      mb: 1,
                      backgroundColor: theme.palette.grey[50],
                    }}
                    secondaryAction={
                      item.status !== "uploading" && (
                        <IconButton
                          edge="end"
                          onClick={() => handleRemoveFile(index)}
                          disabled={isUploading}
                          size="small"
                        >
                          <DeleteIcon size={16} />
                        </IconButton>
                      )
                    }
                  >
                    <ListItemText
                      primary={
                        <Typography variant="body2" fontWeight={500}>
                          {item.file.name}
                        </Typography>
                      }
                      secondary={
                        <Stack spacing={0.5}>
                          <Typography variant="caption" color="text.secondary">
                            {formatBytes(item.file.size)}
                          </Typography>
                          {item.status === "uploading" && (
                            <LinearProgress variant="indeterminate" sx={{ mt: 0.5 }} />
                          )}
                          {item.status === "success" && (
                            <Typography
                              variant="caption"
                              sx={{ color: theme.palette.success.main }}
                            >
                              Uploaded successfully
                            </Typography>
                          )}
                          {item.status === "error" && (
                            <Typography variant="caption" sx={{ color: theme.palette.error.main }}>
                              {item.error || "Upload failed"}
                            </Typography>
                          )}
                        </Stack>
                      }
                      secondaryTypographyProps={{ component: "div" }}
                    />
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: getStatusColor(item.status),
                        ml: 1,
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {/* Action Buttons */}
          <Stack direction="row" spacing={2} justifyContent="flex-end">
            <Button variant="outlined" onClick={handleClose} disabled={isUploading}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={selectionOnly ? handleSelectFiles : handleUpload}
              disabled={!hasValidFiles || isUploading}
              sx={{
                "backgroundColor": theme.palette.primary.main,
                "&:hover": {
                  backgroundColor: theme.palette.primary.dark,
                },
              }}
            >
              {selectionOnly ? "Select" : isUploading ? "Uploading..." : "Upload"}
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

export default FileManagerUploadModal;
