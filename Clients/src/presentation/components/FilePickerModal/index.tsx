import type { FC } from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Checkbox,
  CircularProgress,
  Stack,
  Chip,
  InputAdornment,
  TextField,
  useTheme,
} from "@mui/material";
import { FileText as FileIcon, Image as ImageIcon, File as DefaultFileIcon, Search } from "lucide-react";
import StandardModal from "../Modals/StandardModal";
import { getFilesWithMetadata, FileMetadata } from "../../../application/repository/file.repository";
import { FileData } from "../../../domain/types/File";

interface FilePickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (files: FileData[]) => void;
  excludeFileIds?: string[];
  multiSelect?: boolean;
  title?: string;
}

const getFileIcon = (filename: string) => {
  const ext = filename?.split(".").pop()?.toLowerCase() || "";
  if (["pdf"].includes(ext)) return <FileIcon size={20} color="#E53935" />;
  if (["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(ext))
    return <ImageIcon size={20} color="#1E88E5" />;
  if (["doc", "docx", "txt", "rtf"].includes(ext))
    return <FileIcon size={20} color="#00ACC1" />;
  if (["xls", "xlsx", "csv"].includes(ext))
    return <FileIcon size={20} color="#43A047" />;
  return <DefaultFileIcon size={20} color="#757575" />;
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const FilePickerModal: FC<FilePickerModalProps> = ({
  open,
  onClose,
  onSelect,
  excludeFileIds = [],
  multiSelect = true,
  title = "Attach Existing Files",
}) => {
  const theme = useTheme();
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getFilesWithMetadata();
      setFiles(response.files || []);
    } catch (err) {
      console.error("Failed to fetch files:", err);
      setError("Failed to load files. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchFiles();
      setSelectedIds(new Set());
      setSearchTerm("");
    }
  }, [open, fetchFiles]);

  const filteredFiles = files.filter((file) => {
    if (excludeFileIds.includes(file.id)) return false;
    // Hide files that have approval workflow but are not yet approved
    if (file.approval_workflow_id && file.review_status !== "approved") return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      file.filename?.toLowerCase().includes(term) ||
      file.uploader_name?.toLowerCase().includes(term)
    );
  });

  const handleToggle = (fileId: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (multiSelect) {
        if (newSet.has(fileId)) {
          newSet.delete(fileId);
        } else {
          newSet.add(fileId);
        }
      } else {
        newSet.clear();
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const handleConfirm = () => {
    const selectedFiles: FileData[] = files
      .filter((f) => selectedIds.has(f.id))
      .map((f) => ({
        id: f.id,
        fileName: f.filename,
        size: f.size,
        type: f.mimetype,
        uploadDate: f.upload_date || "",
        uploader: f.uploader_name
          ? `${f.uploader_name} ${f.uploader_surname || ""}`.trim()
          : "Unknown",
      }));
    onSelect(selectedFiles);
    onClose();
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFiles.map((f) => f.id)));
    }
  };

  return (
    <StandardModal
      isOpen={open}
      onClose={onClose}
      title={title}
      description="Select files from your organization to attach as evidence"
      onSubmit={selectedIds.size > 0 ? handleConfirm : undefined}
      submitButtonText={`Attach${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
      maxWidth="720px"
      fitContent
    >
      <Stack spacing={2.5}>
        {/* Search with inline icon */}
        <TextField
          fullWidth
          size="small"
          placeholder="Search files..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} color={theme.palette.text.accent} />
              </InputAdornment>
            ),
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              backgroundColor: theme.palette.background.accent,
              borderRadius: "8px",
              fontSize: theme.typography.fontSize,
              "& fieldset": {
                borderColor: theme.palette.border.light,
              },
              "&:hover fieldset": {
                borderColor: theme.palette.border.dark,
              },
              "&.Mui-focused fieldset": {
                borderColor: "#4C7BF4",
                borderWidth: 1,
              },
            },
            "& .MuiInputBase-input::placeholder": {
              color: theme.palette.text.accent,
              opacity: 1,
            },
          }}
        />

        {/* Header row with select all and count */}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          {multiSelect && filteredFiles.length > 0 ? (
            <Typography
              onClick={handleSelectAll}
              sx={{
                fontSize: 12,
                fontWeight: 500,
                color: "#4C7BF4",
                cursor: "pointer",
                "&:hover": { color: "#3D62C3" },
              }}
            >
              {selectedIds.size === filteredFiles.length ? "Deselect all" : "Select all"}
            </Typography>
          ) : (
            <Box />
          )}
          <Stack direction="row" alignItems="center" spacing={1}>
            {selectedIds.size > 0 && (
              <Chip
                label={`${selectedIds.size} selected`}
                size="small"
                sx={{
                  backgroundColor: "#EEF4FF",
                  color: "#3B5BDB",
                  fontSize: 11,
                  fontWeight: 500,
                  height: 24,
                  "& .MuiChip-label": { px: 1.5 },
                }}
              />
            )}
            <Typography sx={{ fontSize: 12, color: theme.palette.other.icon }}>
              {filteredFiles.length} file{filteredFiles.length !== 1 ? "s" : ""}
            </Typography>
          </Stack>
        </Stack>

        {/* File List */}
        <Box
          sx={{
            maxHeight: "320px",
            overflowY: "auto",
            border: `1px solid ${theme.palette.border.light}`,
            borderRadius: "8px",
            backgroundColor: theme.palette.background.main,
          }}
        >
          {loading ? (
            <Box display="flex" justifyContent="center" alignItems="center" py={5}>
              <CircularProgress size={24} sx={{ color: "#4C7BF4" }} />
            </Box>
          ) : error ? (
            <Box display="flex" justifyContent="center" alignItems="center" py={4}>
              <Typography sx={{ fontSize: theme.typography.fontSize, color: theme.palette.status.error.text }}>{error}</Typography>
            </Box>
          ) : filteredFiles.length === 0 ? (
            <Box
              sx={{
                textAlign: "center",
                py: 4,
                px: 3,
              }}
            >
              <Typography sx={{ fontSize: theme.typography.fontSize, color: theme.palette.text.secondary, mb: 0.5 }}>
                {searchTerm ? "No files match your search" : "No files available"}
              </Typography>
              <Typography sx={{ fontSize: 12, color: theme.palette.text.accent }}>
                {!searchTerm && "Upload files to your organization first"}
              </Typography>
            </Box>
          ) : (
            <Stack divider={<Box sx={{ borderBottom: `1px solid ${theme.palette.background.fill}` }} />}>
              {filteredFiles.map((file) => (
                <Box
                  key={file.id}
                  onClick={() => handleToggle(file.id)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    px: 2,
                    py: 1.5,
                    cursor: "pointer",
                    backgroundColor: selectedIds.has(file.id) ? "#F0F7FF" : "transparent",
                    "&:hover": {
                      backgroundColor: selectedIds.has(file.id) ? "#E3EFFD" : theme.palette.background.accent,
                    },
                    transition: "background-color 0.12s ease",
                  }}
                >
                  <Checkbox
                    checked={selectedIds.has(file.id)}
                    size="small"
                    sx={{
                      p: 0.5,
                      color: theme.palette.border.dark,
                      "&.Mui-checked": { color: "#4C7BF4" },
                    }}
                  />

                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "6px",
                      backgroundColor: theme.palette.background.fill,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {getFileIcon(file.filename)}
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: theme.typography.fontSize,
                        fontWeight: 500,
                        color: theme.palette.text.primary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        lineHeight: 1.4,
                      }}
                      title={file.filename}
                    >
                      {file.filename}
                    </Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                      {file.size && (
                        <Typography sx={{ fontSize: 11, color: theme.palette.other.icon }}>
                          {formatFileSize(file.size)}
                        </Typography>
                      )}
                      {file.size && file.uploader_name && (
                        <Typography sx={{ fontSize: 11, color: theme.palette.border.dark }}>•</Typography>
                      )}
                      {file.uploader_name && (
                        <Typography sx={{ fontSize: 11, color: theme.palette.other.icon }}>
                          {file.uploader_name}
                        </Typography>
                      )}
                      {(file.size || file.uploader_name) && file.upload_date && (
                        <Typography sx={{ fontSize: 11, color: theme.palette.border.dark }}>•</Typography>
                      )}
                      {file.upload_date && (
                        <Typography sx={{ fontSize: 11, color: theme.palette.other.icon }}>
                          {formatDate(file.upload_date)}
                        </Typography>
                      )}
                    </Stack>
                  </Box>

                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </StandardModal>
  );
};
