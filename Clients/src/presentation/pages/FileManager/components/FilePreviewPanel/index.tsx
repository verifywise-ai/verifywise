/**
 * @fileoverview FilePreviewPanel Component
 *
 * A slide-out panel for quick preview of files.
 * Supports preview for PDFs, images, text files, and Office documents (DOCX/XLSX/PPTX).
 * Office files show their embedded thumbnail if available.
 *
 * @module presentation/pages/FileManager/components/FilePreviewPanel
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Drawer,
  IconButton,
  Typography,
  CircularProgress,
  Chip,
  Divider,
  Tooltip,
} from "@mui/material";
import { X, Download, Pencil, FileText, Image, FileType, FileSpreadsheet } from "lucide-react";
import { FileMetadata, downloadFileFromManager, getFilePreview } from "../../../../../application/repository/file.repository";
import StatusBadge from "../StatusBadge";
import {
  getOfficeThumbnail,
  isOfficeFile,
  getOfficeFileLabel,
} from "../../../../../application/utils/officePreview.utils";
import { useIsAdmin } from "../../../../../application/hooks/useIsAdmin";
import { status } from "../../../../themes/palette";

interface FilePreviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  file: FileMetadata | null;
  onEdit?: (file: FileMetadata) => void;
  onDownload?: (file: FileMetadata) => void;
}

type PreviewType = "pdf" | "image" | "text" | "office" | "unsupported";

const getPreviewType = (mimetype?: string): PreviewType => {
  if (!mimetype) return "unsupported";

  if (mimetype === "application/pdf") return "pdf";
  if (mimetype.startsWith("image/")) return "image";
  if (
    mimetype.startsWith("text/") ||
    mimetype === "application/json" ||
    mimetype === "application/xml"
  ) {
    return "text";
  }
  if (isOfficeFile(mimetype)) return "office";

  return "unsupported";
};

const getFileIcon = (mimetype?: string) => {
  const type = getPreviewType(mimetype);
  switch (type) {
    case "pdf":
      return <FileType size={48} color="#EF4444" />;
    case "image":
      return <Image size={48} color="#3B82F6" />;
    case "office":
      if (mimetype?.includes("spreadsheetml")) {
        return <FileSpreadsheet size={48} color="#217346" />;
      }
      return <FileText size={48} color="#2B579A" />;
    default:
      return <FileText size={48} color={status.default.text} />;
  }
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return "Unknown date";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/**
 * FilePreviewPanel Component
 */
export const FilePreviewPanel: React.FC<FilePreviewPanelProps> = ({
  isOpen,
  onClose,
  file,
  onEdit,
  onDownload,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const isAdmin = useIsAdmin();

  const previewType = file ? getPreviewType(file.mimetype) : "unsupported";

  // Debug logging
  useEffect(() => {
    if (file) {
      console.log("[FilePreviewPanel] File data:", {
        id: file.id,
        filename: file.filename,
        mimetype: file.mimetype,
        previewType,
      });
    }
  }, [file, previewType]);

  // Load preview when file changes - uses the dedicated preview endpoint
  // which has XSS protections and MIME allowlisting
  useEffect(() => {
    if (!isOpen || !file || previewType === "unsupported") {
      setPreviewUrl(null);
      setPreviewText(null);
      setError(null);
      return;
    }

    let cancelled = false;

    const loadPreview = async () => {
      try {
        setLoading(true);
        setError(null);

        // Use the dedicated preview endpoint which has XSS protections,
        // MIME allowlisting, and a 5MB size check built in
        const blob = await getFilePreview({ id: file.id });

        if (cancelled) return;

        // Check if the blob is too large for preview (>10MB)
        if (blob.size > 10 * 1024 * 1024) {
          setError("File is too large for preview. Use download instead.");
          return;
        }

        if (previewType === "text") {
          const text = await blob.text();
          setPreviewText(text);
          setPreviewUrl(null);
        } else if (previewType === "office") {
          // Try to extract embedded thumbnail from Office files
          const result = await getOfficeThumbnail(blob);
          if (result.success && result.thumbnailUrl) {
            setPreviewUrl(result.thumbnailUrl);
            setPreviewText(null);
          } else {
            // No thumbnail embedded - show unsupported message
            setError("No preview available");
          }
        } else {
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          setPreviewText(null);
        }
      } catch (err: any) {
        if (cancelled) return;

        const status = err?.response?.status;
        if (status === 404) {
          setError("File not found or content not available");
        } else if (status === 403) {
          setError("You don't have permission to view this file");
        } else {
          setError("Failed to load preview");
        }
        console.error("Error loading preview:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [isOpen, file?.id, previewType]);

  const handleDownload = async () => {
    if (!file) return;

    if (onDownload) {
      onDownload(file);
      return;
    }

    // Default download behavior
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await downloadFileFromManager({ id: file.id });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Error downloading file:", err);
      const status = err?.status || err?.response?.status;
      const message = err?.message || "";
      if (status === 404 || message.includes("404")) {
        setDownloadError("File content not available. This file may need to be re-uploaded.");
      } else {
        setDownloadError("Failed to download file. Please try again.");
      }
      setTimeout(() => setDownloadError(null), 5000);
    } finally {
      setDownloading(false);
    }
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: 300,
          }}
        >
          <CircularProgress size={40} sx={{ color: "brand.primary" }} />
        </Box>
      );
    }

    if (error) {
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            height: 300,
            backgroundColor: "background.accent",
            borderRadius: "4px",
            border: "1px solid #E0E4E9",
          }}
        >
          {getFileIcon(file?.mimetype)}
          <Typography sx={{ mt: 2, color: "text.icon", fontSize: 13 }}>
            {error}
          </Typography>
        </Box>
      );
    }

    if (previewType === "unsupported") {
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            height: 300,
            backgroundColor: "background.accent",
            borderRadius: "4px",
            border: "1px solid #E0E4E9",
          }}
        >
          {getFileIcon(file?.mimetype)}
          <Typography sx={{ mt: 2, color: "text.icon", fontSize: 13 }}>
            Preview not available for this file type
          </Typography>
          <Typography sx={{ mt: 1, color: "text.muted", fontSize: 12 }}>
            Download the file to view its contents
          </Typography>
        </Box>
      );
    }

    if (previewType === "pdf" && previewUrl) {
      return (
        <Box
          component="iframe"
          src={previewUrl}
          sx={{
            width: "100%",
            height: 400,
            border: "1px solid #E0E4E9",
            borderRadius: "4px",
          }}
          title={file?.filename}
        />
      );
    }

    if (previewType === "image" && previewUrl) {
      return (
        <Box
          component="img"
          src={previewUrl}
          alt={file?.filename}
          sx={{
            width: "100%",
            maxHeight: 400,
            objectFit: "contain",
            border: "1px solid #E0E4E9",
            borderRadius: "4px",
            backgroundColor: "background.accent",
          }}
        />
      );
    }

    if (previewType === "text" && previewText) {
      return (
        <Box
          component="pre"
          sx={{
            width: "100%",
            maxHeight: 400,
            overflow: "auto",
            padding: 2,
            backgroundColor: "background.accent",
            border: "1px solid #E0E4E9",
            borderRadius: "4px",
            fontSize: 12,
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {previewText}
        </Box>
      );
    }

    if (previewType === "office" && previewUrl) {
      return (
        <Box>
          <Box
            component="img"
            src={previewUrl}
            alt={file?.filename}
            sx={{
              width: "100%",
              maxHeight: 400,
              objectFit: "contain",
              border: "1px solid #E0E4E9",
              borderRadius: "4px",
              backgroundColor: "background.accent",
            }}
          />
          <Typography
            sx={{
              mt: 1,
              fontSize: 11,
              color: "text.muted",
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            {getOfficeFileLabel(file?.mimetype)} preview
          </Typography>
        </Box>
      );
    }

    return null;
  };

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: 520 },
          maxWidth: "100%",
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid #E0E4E9",
        }}
      >
        <Typography
          sx={{
            fontSize: 16,
            fontWeight: 600,
            color: "#101828",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "70%",
          }}
        >
          {file?.filename || "File preview"}
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          {onEdit && file && (
            <IconButton
              onClick={() => onEdit(file)}
              size="small"
              sx={{ color: "text.icon" }}
            >
              <Pencil size={18} />
            </IconButton>
          )}
          <Tooltip title={!isAdmin ? "Only admins can download files" : ""}>
            <span>
              <IconButton
                onClick={handleDownload}
                size="small"
                disabled={downloading || !isAdmin}
                sx={{ color: !isAdmin ? "border.dark" : "text.icon" }}
              >
                {downloading ? (
                  <CircularProgress size={18} sx={{ color: "text.icon" }} />
                ) : (
                  <Download size={18} />
                )}
              </IconButton>
            </span>
          </Tooltip>
          <IconButton onClick={onClose} size="small" sx={{ color: "text.icon" }}>
            <X size={18} />
          </IconButton>
        </Box>
      </Box>

      {/* Download error message */}
      {downloadError && (
        <Box
          sx={{
            padding: "8px 20px",
            backgroundColor: "#FEF3F2",
            borderBottom: "1px solid #FECDCA",
          }}
        >
          <Typography sx={{ fontSize: 13, color: "#B42318" }}>
            {downloadError}
          </Typography>
        </Box>
      )}

      {/* Content */}
      {file && (
        <Box sx={{ padding: "20px", overflow: "auto" }}>
          {/* Preview */}
          <Box sx={{ mb: 3 }}>{renderPreview()}</Box>

          <Divider sx={{ my: 3 }} />

          {/* File details */}
          <Box>
            <Typography
              sx={{ fontSize: 14, fontWeight: 600, color: "text.secondary", mb: 2 }}
            >
              File details
            </Typography>

            {/* Two-column grid layout for details */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: "12px 16px",
                alignItems: "center",
              }}
            >
              {/* Size */}
              <Typography sx={{ fontSize: 13, color: "text.icon" }}>
                Size
              </Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                {formatFileSize(file.size)}
              </Typography>

              {/* Upload date */}
              <Typography sx={{ fontSize: 13, color: "text.icon" }}>
                Uploaded
              </Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                {formatDate(file.upload_date)}
              </Typography>

              {/* Uploader */}
              {file.uploader_name && (
                <>
                  <Typography sx={{ fontSize: 13, color: "text.icon" }}>
                    Uploaded by
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    {file.uploader_name} {file.uploader_surname}
                  </Typography>
                </>
              )}

              {/* Status */}
              {file.review_status && (
                <>
                  <Typography sx={{ fontSize: 13, color: "text.icon" }}>
                    Status
                  </Typography>
                  <Box>
                    <StatusBadge status={file.review_status} />
                  </Box>
                </>
              )}

              {/* Version */}
              {file.version && (
                <>
                  <Typography sx={{ fontSize: 13, color: "text.icon" }}>
                    Version
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    v{file.version}
                  </Typography>
                </>
              )}

              {/* Expiry Date */}
              {file.expiry_date && (
                <>
                  <Typography sx={{ fontSize: 13, color: "text.icon" }}>
                    Expiry date
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    {formatDate(file.expiry_date)}
                  </Typography>
                </>
              )}

              {/* Tags */}
              {file.tags && file.tags.length > 0 && (
                <>
                  <Typography sx={{ fontSize: 13, color: "text.icon", alignSelf: "start", pt: 0.5 }}>
                    Tags
                  </Typography>
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {file.tags.map((tag) => (
                      <Chip
                        key={tag}
                        label={tag}
                        size="small"
                        sx={{
                          backgroundColor: "#F2F4F7",
                          color: "text.secondary",
                          fontSize: "11px",
                          height: 22,
                        }}
                      />
                    ))}
                  </Box>
                </>
              )}

              {/* Description */}
              {file.description && (
                <>
                  <Typography sx={{ fontSize: 13, color: "text.icon", alignSelf: "start" }}>
                    Description
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                    {file.description}
                  </Typography>
                </>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </Drawer>
  );
};

export default FilePreviewPanel;
