import React, { useState, useRef, useCallback } from "react";
import {
  Stack,
  Typography,
  IconButton,
  Box,
  LinearProgress,
  useTheme,
  SxProps,
  Theme,
  Paper,
  Chip,
  Avatar,
  Fade,
  Modal,
  Button,
  Tooltip,
} from "@mui/material";
import { useIsAdmin } from "../../../application/hooks/useIsAdmin";
import {
  Upload as UploadIcon,
  Trash2 as DeleteIcon,
  Download as DownloadIcon,
  FileText,
  Eye as EyeIcon,
  Image as ImageIcon,
  File as DefaultFileIcon,
  CheckCircle as CheckIcon,
  AlertCircle as ErrorIcon,
  Clock as PendingIcon,
} from "lucide-react";
import { CustomizableButton } from "../button/customizable-button";
import singleTheme from "../../themes/v1SingleTheme";
import { text, status } from "../../themes/palette";

// Types
export interface UploadFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  url?: string;
  error?: string;
}

export interface UploaderProps {
  /** Acceptable file types (e.g., ['image/*', '.pdf', '.doc']) */
  acceptedTypes?: string[];
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSize?: number;
  /** Maximum number of files allowed */
  maxFiles?: number;
  /** Whether multiple files can be selected */
  multiple?: boolean;
  /** Callback when files are successfully uploaded */
  onUploadComplete?: (files: UploadFile[]) => void;
  /** Callback when file upload progresses */
  onUploadProgress?: (file: UploadFile, progress: number) => void;
  /** Callback when upload fails */
  onUploadError?: (file: UploadFile, error: string) => void;
  /** Custom styles */
  sx?: SxProps<Theme>;
  /** Whether to show file preview */
  showPreview?: boolean;
  /** Upload endpoint URL */
  uploadUrl?: string;
  /** Additional headers for upload request */
  uploadHeaders?: Record<string, string>;
  /** Custom upload handler function that returns a promise with the file URL */
  customUploadHandler?: (file: File, onProgress: (progress: number) => void) => Promise<string>;
}

// Default file type configurations
const DEFAULT_ACCEPTED_TYPES = [
  'image/*',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.zip',
  '.rar'
];

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Utility functions
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Delete modal button styles (matching uploader component patterns)
const BasicModalCancelButtonStyle = {
  textTransform: "none",
  fontSize: 13,
  borderRadius: "4px",
  color: `${text.secondary}`,
  "&:hover": {
    backgroundColor: "rgba(19, 113, 91, 0.04)",
  },
};

const BasicModalDeleteButtonStyle = {
  fontSize: 13,
  backgroundColor: "#DB504A",
  border: "1px solid #DB504A",
  boxShadow: "none",
  borderRadius: "4px",
  "&:hover": {
    boxShadow: "none",
  },
};

const generateFileId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

const isFileTypeAccepted = (file: File, acceptedTypes: string[]): boolean => {
  if (acceptedTypes.length === 0) return true;

  return acceptedTypes.some(type => {
    if (type.startsWith('.')) {
      return file.name.toLowerCase().endsWith(type.toLowerCase());
    }
    if (type.includes('/*')) {
      const mainType = type.split('/')[0];
      return file.type.startsWith(mainType + '/');
    }
    return file.type === type;
  });
};

const Uploader: React.FC<UploaderProps> = ({
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  maxFiles = 10,
  multiple = true,
  onUploadComplete,
  onUploadProgress,
  onUploadError,
  sx,
  showPreview = true,
  uploadUrl = '/api/upload',
  uploadHeaders = {},
  customUploadHandler,
}) => {
  const theme = useTheme();
  const isAdmin = useIsAdmin();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragAreaRef = useRef<HTMLDivElement>(null);

  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    file: UploadFile | null;
  }>({ isOpen: false, file: null });

  // Handle drag and drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  }, [files, maxFiles]);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    handleFiles(selectedFiles);
    // Reset input value to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [files, maxFiles]);

  // Get file icon based on type
  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return ImageIcon;
    if (type.includes('pdf')) return FileText;
    return DefaultFileIcon;
  };

  // Get status chip props
  const getStatusChip = (file: UploadFile) => {
    switch (file.status) {
      case 'completed':
        return {
          label: 'Completed',
          icon: CheckIcon,
          backgroundColor: '#ECFDF3',
          color: '#027A48',
        };
      case 'uploading':
        return {
          label: `Uploading ${file.progress}%`,
          icon: PendingIcon,
          backgroundColor: '#F0F9FF',
          color: '#026AA2',
        };
      case 'error':
        return {
          label: file.error || 'Failed',
          icon: ErrorIcon,
          backgroundColor: '#FEF3F2',
          color: '#DC2626',
        };
      default:
        return {
          label: 'Pending',
          icon: PendingIcon,
          backgroundColor: 'background.accent',
          color: 'status.default.text',
        };
    }
  };

  // Process files
  const handleFiles = useCallback((newFiles: File[]) => {
    const validFiles: File[] = [];
    const errors: string[] = [];

    // Check file limits and validation
    newFiles.forEach(file => {
      // Check file count limit
      if (files.length + validFiles.length >= maxFiles) {
        errors.push(`Maximum ${maxFiles} files allowed`);
        return;
      }

      // Check file size
      if (file.size > maxFileSize) {
        errors.push(`${file.name} exceeds maximum size of ${formatFileSize(maxFileSize)}`);
        return;
      }

      // Check file type
      if (!isFileTypeAccepted(file, acceptedTypes)) {
        errors.push(`${file.name} is not a supported file type`);
        return;
      }

      // Check for duplicates
      const isDuplicate = files.some(existingFile =>
        existingFile.name === file.name && existingFile.size === file.size
      );

      if (isDuplicate) {
        errors.push(`${file.name} has already been added`);
        return;
      }

      validFiles.push(file);
    });

    // Show errors if any
    if (errors.length > 0) {
      console.error('File validation errors:', errors);
      // You could implement a toast/notification system here
    }

    // Add valid files
    if (validFiles.length > 0) {
      const uploadFiles: UploadFile[] = validFiles.map(file => ({
        id: generateFileId(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: 'uploading' as const,
      }));

      setFiles(prev => [...prev, ...uploadFiles]);

      // Start upload for each file
      uploadFiles.forEach(fileToUpload => {
        uploadFile(fileToUpload);
      });
    }
  }, [files, maxFiles, maxFileSize, acceptedTypes]);

  // Upload file simulation
  const uploadFile = useCallback(async (uploadFile: UploadFile) => {
    try {
      // Use custom upload handler if provided
      if (customUploadHandler) {
        const url = await customUploadHandler(uploadFile.file, (progress) => {
          setFiles(prev => prev.map(f =>
            f.id === uploadFile.id ? { ...f, progress } : f
          ));
          onUploadProgress?.(uploadFile, progress);
        });

        setFiles(prev => prev.map(f =>
          f.id === uploadFile.id
            ? { ...f, status: 'completed', progress: 100, url }
            : f
        ));

        onUploadComplete?.([{ ...uploadFile, status: 'completed', progress: 100, url }]);
        return;
      }

      // Default XHR upload
      const formData = new FormData();
      formData.append('file', uploadFile.file);

      // Create XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);

          setFiles(prev => prev.map(f =>
            f.id === uploadFile.id ? { ...f, progress } : f
          ));

          onUploadProgress?.(uploadFile, progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            const url = response.url || `${uploadUrl}/${uploadFile.id}`;

            setFiles(prev => prev.map(f =>
              f.id === uploadFile.id
                ? { ...f, status: 'completed', progress: 100, url }
                : f
            ));
          } catch {
            // If JSON parsing fails, still mark as completed
            setFiles(prev => prev.map(f =>
              f.id === uploadFile.id
                ? { ...f, status: 'completed', progress: 100, url: `${uploadUrl}/${uploadFile.id}` }
                : f
            ));
          }
        } else {
          throw new Error(`Upload failed with status ${xhr.status}`);
        }
      });

      xhr.addEventListener('error', () => {
        const error = 'Network error during upload';
        setFiles(prev => prev.map(f =>
          f.id === uploadFile.id
            ? { ...f, status: 'error', error }
            : f
        ));
        onUploadError?.(uploadFile, error);
      });

      // Configure and send request
      xhr.open('POST', uploadUrl, true);

      // Add headers
      Object.entries(uploadHeaders).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.send(formData);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setFiles(prev => prev.map(f =>
        f.id === uploadFile.id
          ? { ...f, status: 'error', error: errorMessage }
          : f
      ));
      onUploadError?.(uploadFile, errorMessage);
    }
  }, [uploadUrl, uploadHeaders, onUploadProgress, onUploadError, customUploadHandler, onUploadComplete]);

  // Handle file actions
  const handleDeleteFile = useCallback((file: UploadFile) => {
    setDeleteModal({ isOpen: true, file });
  }, []);

  const confirmDeleteFile = useCallback(() => {
    if (deleteModal.file) {
      setFiles(prev => prev.filter(f => f.id !== deleteModal.file!.id));
      setDeleteModal({ isOpen: false, file: null });
    }
  }, [deleteModal]);

  const handleDownloadFile = useCallback((file: UploadFile) => {
    if (file.url) {
      const link = document.createElement('a');
      link.href = file.url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Create object URL for local file
      const url = URL.createObjectURL(file.file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }, []);

  const handlePreviewFile = useCallback((file: UploadFile) => {
    if (file.url) {
      window.open(file.url, '_blank');
    } else if (file.file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file.file);
      window.open(url, '_blank');
      // Note: In a real app, you might want to revoke this URL after some time
    }
  }, []);

  // Save all uploaded files
  const handleSave = useCallback(() => {
    const completedFiles = files.filter(f => f.status === 'completed');
    if (completedFiles.length > 0) {
      onUploadComplete?.(completedFiles);
    }
  }, [files, onUploadComplete]);

  // Clear all files
  const handleClearAll = useCallback(() => {
    setFiles([]);
  }, []);

  // Check if all files are completed
  const allCompleted = files.length > 0 && files.every(f => f.status === 'completed');

  // Calculate overall progress
  const overallProgress = files.length > 0
    ? Math.round(files.reduce((sum, f) => sum + f.progress, 0) / files.length)
    : 0;

  // Modern drop zone styles
  const dropZoneStyles: SxProps<Theme> = {
    position: 'relative',
    borderRadius: '4px',
    background: isDragging
      ? 'linear-gradient(135deg, rgba(19, 113, 91, 0.05) 0%, rgba(19, 113, 91, 0.1) 100%)'
      : 'background.main',
    border: `2px dashed ${isDragging ? singleTheme.buttons.primary.contained.backgroundColor : '#d0d5dd'}`,
    boxShadow: 'none',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    overflow: 'hidden',
    minHeight: '200px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    p: 4,
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: isDragging
        ? 'linear-gradient(135deg, rgba(19, 113, 91, 0.03) 0%, rgba(19, 113, 91, 0.08) 100%)'
        : 'transparent',
      opacity: 0,
      transition: 'opacity 0.2s ease',
    },
    '&:hover': {
      borderColor: '#5FA896',
      backgroundColor: 'rgba(19, 113, 91, 0.02)',
      '&::before': { opacity: 1 },
    },
  };

  // Modern file card styles
  const fileCardStyles: SxProps<Theme> = {
    borderRadius: '4px',
    background: 'background.main',
    border: `1px solid #EAECF0`,
    boxShadow: 'none',
    transition: 'all 0.2s ease',
    overflow: 'hidden',
    mb: 2,
    '&:hover': {
      backgroundColor: 'rgba(19, 113, 91, 0.02)',
    },
  };

  return (
    <Fade in timeout={300}>
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 800,
          mx: 'auto',
          borderRadius: '8px',
          background: 'background.main',
          border: `1px solid #EAECF0`,
          boxShadow: 'none',
          overflow: 'hidden',
          ...sx,
        }}
      >
        {/* Header */}
        <Box sx={{ p: 3, borderBottom: `1px solid #EAECF0` }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar
              sx={{
                backgroundColor: `${singleTheme.buttons.primary.contained.backgroundColor}15`,
                color: singleTheme.buttons.primary.contained.backgroundColor,
                width: 40,
                height: 40,
              }}
            >
              <UploadIcon size={20} />
            </Avatar>
            <Box flex={1}>
              <Typography variant="body1" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 0.5, fontSize: '16px' }}>
                Modern File Uploader
              </Typography>
              <Typography variant="body2" color={text.secondary} sx={{ fontSize: '13px' }}>
                Drag & drop files or click to browse • Max {formatFileSize(maxFileSize)} per file
              </Typography>
            </Box>
            {files.length > 0 && (
              <Chip
                label={`${files.length} file${files.length !== 1 ? 's' : ''}`}
                sx={{
                  backgroundColor: `${singleTheme.buttons.primary.contained.backgroundColor}10`,
                  color: singleTheme.buttons.primary.contained.backgroundColor,
                  fontWeight: 500,
                  fontSize: '13px',
                  height: 28,
                }}
              />
            )}
          </Stack>
        </Box>

        {/* Upload Area */}
        <Box sx={{ p: 4 }}>
          <Box
            ref={dragAreaRef}
            sx={dropZoneStyles}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Fade in timeout={200}>
              <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                <Avatar
                  sx={{
                    backgroundColor: isDragging
                      ? `${singleTheme.buttons.primary.contained.backgroundColor}20`
                      : `${singleTheme.buttons.primary.contained.backgroundColor}10`,
                    color: isDragging
                      ? singleTheme.buttons.primary.contained.backgroundColor
                      : 'text.tertiary',
                    width: 48,
                    height: 48,
                    mb: 2,
                    mx: 'auto',
                  }}
                >
                  <UploadIcon size={24} />
                </Avatar>
                <Typography variant="body1" sx={{ fontWeight: 500, mb: 1, color: theme.palette.text.primary, fontSize: '16px' }}>
                  {isDragging ? 'Drop files here' : (
                    <>
                      <Typography component="span" color={singleTheme.buttons.primary.contained.backgroundColor} sx={{ fontWeight: 600 }}>
                        Click to upload
                      </Typography>
                      {' or drag and drop'}
                    </>
                  )}
                </Typography>
                <Typography variant="body2" color={text.tertiary} sx={{ mb: 2, fontSize: '13px' }}>
                  {multiple ? `Up to ${maxFiles} files` : 'Single file upload'}
                </Typography>
                <Typography variant="caption" color={status.default.text} sx={{ fontSize: '12px' }}>
                  Supported formats: {acceptedTypes.slice(0, 4).join(', ')}
                  {acceptedTypes.length > 4 && ` +${acceptedTypes.length - 4} more`}
                </Typography>
              </Box>
            </Fade>
            <input
              ref={fileInputRef}
              type="file"
              multiple={multiple}
              accept={acceptedTypes.join(',')}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </Box>
        </Box>

        {/* Overall Progress */}
        {files.length > 0 && (
          <Fade in timeout={300}>
            <Box sx={{ px: 3, pb: 2 }}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
                <Typography variant="body2" color={text.secondary} sx={{ fontWeight: 500, fontSize: '13px' }}>
                  Overall Progress
                </Typography>
                <Typography variant="body2" color={singleTheme.buttons.primary.contained.backgroundColor} sx={{ fontWeight: 600, fontSize: '13px' }}>
                  {overallProgress}%
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={overallProgress}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: 'background.hover',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: singleTheme.buttons.primary.contained.backgroundColor,
                    borderRadius: 3,
                    transition: 'all 0.2s ease',
                  },
                }}
              />
            </Box>
          </Fade>
        )}

        {/* File List */}
        {files.length > 0 && (
          <Fade in timeout={400}>
            <Box sx={{ px: 3, pb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2, color: theme.palette.text.primary, fontSize: '16px' }}>
                Files ({files.length})
              </Typography>
              <Stack spacing={2}>
                {files.map((file, index) => {
                  const FileIconComponent = getFileIcon(file.type);
                  const statusChip = getStatusChip(file);
                  const StatusIcon = statusChip.icon;

                  return (
                    <Fade key={file.id} in timeout={300 + index * 100}>
                      <Paper
                        variant="outlined"
                        sx={fileCardStyles}
                      >
                        <Box sx={{ p: 2 }}>
                          <Stack direction="row" alignItems="center" spacing={2}>
                            {/* File Icon */}
                            <Avatar
                              sx={{
                                backgroundColor: file.type.startsWith('image/')
                                  ? '#FEF3C7'
                                  : file.type.includes('pdf')
                                  ? '#DBEAFE'
                                  : 'background.hover',
                                color: file.type.startsWith('image/')
                                  ? '#D97706'
                                  : file.type.includes('pdf')
                                  ? '#2563EB'
                                  : 'status.default.text',
                                width: 40,
                                height: 40,
                                flexShrink: 0,
                              }}
                            >
                              <FileIconComponent size={20} />
                            </Avatar>

                            {/* File Info */}
                            <Box flex={1} minWidth={0}>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 500,
                                  color: theme.palette.text.primary,
                                  mb: 0.5,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontSize: '13px',
                                }}
                              >
                                {file.name}
                              </Typography>
                              <Stack direction="row" alignItems="center" spacing={1}>
                                <Typography variant="caption" color={text.tertiary} sx={{ fontSize: '12px' }}>
                                  {formatFileSize(file.size)}
                                </Typography>
                                <Typography variant="caption" color={text.tertiary} sx={{ fontSize: '12px' }}>
                                  •
                                </Typography>
                                <Chip
                                  label={statusChip.label}
                                  size="small"
                                  icon={
                                    <StatusIcon size={10} style={{ marginLeft: 2 }} />
                                  }
                                  sx={{
                                    backgroundColor: statusChip.backgroundColor,
                                    color: statusChip.color,
                                    fontWeight: 500,
                                    fontSize: '11px',
                                    height: 20,
                                    '& .MuiChip-icon': {
                                      fontSize: '10px',
                                    },
                                  }}
                                />
                              </Stack>

                              {/* Progress Bar for Uploading Files */}
                              {file.status === 'uploading' && (
                                <Box sx={{ mt: 1.5, width: '100%' }}>
                                  <LinearProgress
                                    variant="determinate"
                                    value={file.progress}
                                    sx={{
                                      height: 4,
                                      borderRadius: 2,
                                      backgroundColor: 'background.hover',
                                      '& .MuiLinearProgress-bar': {
                                        backgroundColor: singleTheme.buttons.primary.contained.backgroundColor,
                                        borderRadius: 2,
                                      },
                                    }}
                                  />
                                </Box>
                              )}
                            </Box>

                            {/* Action Buttons */}
                            <Stack direction="row" spacing={1}>
                              {showPreview && file.status === 'completed' && file.file.type.startsWith('image/') && (
                                <IconButton
                                  size="small"
                                  onClick={() => handlePreviewFile(file)}
                                  title="Preview"
                                  sx={{
                                    color: theme.palette.text.secondary,
                                    '&:hover': {
                                      backgroundColor: `${singleTheme.buttons.primary.contained.backgroundColor}10`,
                                      color: singleTheme.buttons.primary.contained.backgroundColor,
                                    },
                                  }}
                                >
                                  <EyeIcon size={18} />
                                </IconButton>
                              )}
                              {file.status === 'completed' && (
                                <Tooltip title={!isAdmin ? "Only admins can download files" : ""}>
                                  <span>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleDownloadFile(file)}
                                      disabled={!isAdmin}
                                      title="Download"
                                      sx={{
                                        color: !isAdmin ? theme.palette.action.disabled : theme.palette.text.secondary,
                                        '&:hover': {
                                          backgroundColor: isAdmin ? `${singleTheme.buttons.primary.contained.backgroundColor}10` : 'transparent',
                                          color: isAdmin ? singleTheme.buttons.primary.contained.backgroundColor : theme.palette.action.disabled,
                                        },
                                      }}
                                    >
                                      <DownloadIcon size={18} />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              )}
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteFile(file)}
                                title="Delete"
                                sx={{
                                  color: theme.palette.text.secondary,
                                  '&:hover': {
                                    backgroundColor: `${singleTheme.buttons.error}10`,
                                    color: singleTheme.buttons.error,
                                  },
                                }}
                              >
                                <DeleteIcon size={18} />
                              </IconButton>
                            </Stack>
                          </Stack>
                        </Box>
                      </Paper>
                    </Fade>
                  );
                })}
              </Stack>
            </Box>
          </Fade>
        )}

        {/* Action Buttons */}
        {files.length > 0 && (
          <Fade in timeout={500}>
            <Box sx={{ p: 3, borderTop: `1px solid #EAECF0` }}>
              <Stack direction="row" spacing={2} justifyContent="flex-end">
                <CustomizableButton
                  variant="text"
                  onClick={handleClearAll}
                  text="Clear all"
                  sx={{ color: "text.secondary" }}
                />
                <CustomizableButton
                  variant="contained"
                  color="primary"
                  onClick={handleSave}
                  isDisabled={!allCompleted}
                  loading={!allCompleted}
                  text="Save files"
                />
              </Stack>
            </Box>
          </Fade>
        )}

        {/* Delete Confirmation Modal */}
        <Modal
          open={deleteModal.isOpen}
          onClose={(_event, reason) => {
            if (reason !== "backdropClick") {
              setDeleteModal({ isOpen: false, file: null });
            }
          }}
          aria-labelledby="delete-modal-title"
          aria-describedby="delete-modal-description"
        >
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 450,
              bgcolor: '#FCFCFD',
              border: `1px solid #EAECF0`,
              borderRadius: '4px',
              boxShadow: 'none',
              outline: 'none',
              overflow: 'hidden',
            }}
          >
            {/* Content */}
            <Box sx={{ p: 3 }}>
              <Typography
                id="delete-modal-title"
                variant="body1"
                sx={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: theme.palette.text.primary,
                  mb: 2,
                }}
              >
                Delete this file?
              </Typography>

              <Typography
                id="delete-modal-description"
                variant="body2"
                sx={{
                  fontSize: '13px',
                  color: 'text.secondary',
                  mb: 2,
                  lineHeight: 1.5,
                }}
              >
                This action is non-recoverable and the file "{deleteModal.file?.name}" will be permanently removed.
              </Typography>
            </Box>

            {/* Actions */}
            <Box
              sx={{
                p: 3,
                pt: 0,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 2,
                borderTop: `1px solid #EAECF0`,
              }}
            >
              <Button
                variant="text"
                onClick={() => setDeleteModal({ isOpen: false, file: null })}
                sx={BasicModalCancelButtonStyle}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={confirmDeleteFile}
                sx={BasicModalDeleteButtonStyle}
              >
                Delete file
              </Button>
            </Box>
          </Box>
        </Modal>
      </Paper>
    </Fade>
  );
};

export default Uploader;
