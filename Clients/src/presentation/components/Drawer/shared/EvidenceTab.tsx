import React from "react";
import { Box, IconButton, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import {
  Download as DownloadIcon,
  Trash2 as DeleteIcon,
  FileText as FileIcon,
  UploadIcon,
  PaperclipIcon,
} from "lucide-react";
import { CustomizableButton } from "../../button/customizable-button";
import { FilePickerModal } from "../../FilePickerModal";
import { text } from "../../../themes/palette";
import { UseEvidenceFilesReturn } from "./useEvidenceFiles";

interface EvidenceTabProps {
  evidence: UseEvidenceFilesReturn;
  isEditingDisabled?: boolean;
  acceptedFileTypes?: string;
  bodyText?: string;
  fileInputId?: string;
}

const DEFAULT_ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt";

const EvidenceTab: React.FC<EvidenceTabProps> = ({
  evidence,
  isEditingDisabled,
  acceptedFileTypes = DEFAULT_ACCEPT,
  bodyText = "Upload evidence files to document how this requirement is implemented.",
  fileInputId = "evidence-file-input",
}) => {
  const theme = useTheme();
  const {
    evidenceFiles,
    uploadFiles,
    pendingAttachFiles,
    deletedFileIds,
    showFilePicker,
    setShowFilePicker,
    handleAddFiles,
    handleAttachExistingFiles,
    handleRemovePendingAttach,
    handleDeleteEvidenceFile,
    handleDeleteUploadFile,
    handleDownloadFile,
  } = evidence;

  return (
    <Stack spacing={3}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Evidence files
      </Typography>

      <Typography
        variant="body2"
        sx={{
          color: "text.tertiary",
        }}
      >
        {bodyText}
      </Typography>

      <Box>
        <input
          type="file"
          multiple
          accept={acceptedFileTypes}
          style={{ display: "none" }}
          id={fileInputId}
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) {
              handleAddFiles(files);
            }
            e.target.value = "";
          }}
        />

        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems: "center",
          }}
        >
          <CustomizableButton
            variant="outlined"
            onClick={() => document.getElementById(fileInputId)?.click()}
            isDisabled={isEditingDisabled}
            text="Upload new files"
            size="small"
            icon={<UploadIcon size={14} />}
          />
          <CustomizableButton
            variant="outlined"
            onClick={() => setShowFilePicker(true)}
            isDisabled={isEditingDisabled}
            text="Attach existing files"
            size="small"
            icon={<PaperclipIcon size={14} />}
          />

          <Stack direction="row" spacing={2}>
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
              {`${evidenceFiles.length || 0} files attached`}
            </Typography>
            {uploadFiles.length > 0 && (
              <Typography sx={{ fontSize: 11, color: "primary.main" }}>
                {`+${uploadFiles.length} pending upload`}
              </Typography>
            )}
            {pendingAttachFiles.length > 0 && (
              <Typography sx={{ fontSize: 11, color: "#4C7BF4" }}>
                {`+${pendingAttachFiles.length} pending attach`}
              </Typography>
            )}
            {deletedFileIds.length > 0 && (
              <Typography sx={{ fontSize: 11, color: "status.error.main" }}>
                {`-${deletedFileIds.length} pending delete`}
              </Typography>
            )}
          </Stack>
        </Stack>
      </Box>

      {evidenceFiles.length > 0 && (
        <Stack spacing={1}>
          {evidenceFiles.map((file) => (
            <Box
              key={file.id}
              sx={{
                "display": "flex",
                "alignItems": "center",
                "justifyContent": "space-between",
                "padding": "10px 12px",
                "border": `1px solid ${theme.palette.border.light}`,
                "borderRadius": "4px",
                "backgroundColor": "background.main",
                "&:hover": {
                  backgroundColor: "background.accent",
                },
              }}
            >
              <Box sx={{ display: "flex", gap: 1.5, flex: 1, minWidth: 0 }}>
                <FileIcon size={18} color={theme.palette.text.tertiary} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#1F2937",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {file.fileName}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: "status.default.text" }}>
                    {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ""}
                    {file.size && file.source ? " • " : ""}
                    {file.source ? `Source: ${file.source}` : ""}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Tooltip title="Download file">
                  <IconButton
                    size="small"
                    onClick={() => handleDownloadFile(file.id.toString(), file.fileName)}
                    sx={{
                      "color": "text.tertiary",
                      "&:hover": {
                        color: "primary.main",
                        backgroundColor: "rgba(19, 113, 91, 0.08)",
                      },
                    }}
                  >
                    <DownloadIcon size={16} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete file">
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteEvidenceFile(file.id.toString())}
                    disabled={isEditingDisabled}
                    sx={{
                      "color": "text.tertiary",
                      "&:hover": {
                        color: "status.error.main",
                        backgroundColor: "rgba(211, 47, 47, 0.08)",
                      },
                    }}
                  >
                    <DeleteIcon size={16} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          ))}
        </Stack>
      )}

      {uploadFiles.length > 0 && (
        <Stack spacing={1}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#92400E" }}>
            Pending upload
          </Typography>
          {uploadFiles.map((file) => (
            <Box
              key={file.id}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                border: `1px solid ${theme.palette.status.warning.border}`,
                borderRadius: "4px",
                backgroundColor: "status.warning.bg",
              }}
            >
              <Box sx={{ display: "flex", gap: 1.5, flex: 1, minWidth: 0 }}>
                <FileIcon size={18} color={theme.palette.status.warning.text} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#92400E",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {file.fileName}
                  </Typography>
                  {file.size && (
                    <Typography sx={{ fontSize: 11, color: "#B45309" }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </Typography>
                  )}
                </Box>
              </Box>
              <Tooltip title="Remove from queue">
                <IconButton
                  size="small"
                  onClick={() => handleDeleteUploadFile(file.id.toString())}
                  sx={{
                    "color": "#92400E",
                    "&:hover": {
                      color: "status.error.main",
                      backgroundColor: "rgba(211, 47, 47, 0.08)",
                    },
                  }}
                >
                  <DeleteIcon size={16} />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Stack>
      )}

      {pendingAttachFiles.length > 0 && (
        <Stack spacing={1}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#4C7BF4" }}>
            Pending attach
          </Typography>
          {pendingAttachFiles.map((file) => (
            <Box
              key={file.id}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                border: "1px solid #DBEAFE",
                borderRadius: "4px",
                backgroundColor: "#EFF6FF",
              }}
            >
              <Box sx={{ display: "flex", gap: 1.5, flex: 1, minWidth: 0 }}>
                <FileIcon size={18} color="#4C7BF4" />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "#1E40AF",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {file.fileName}
                  </Typography>
                </Box>
              </Box>
              <Tooltip title="Remove from queue">
                <IconButton
                  size="small"
                  onClick={() => handleRemovePendingAttach(file.id.toString())}
                  sx={{
                    "color": "#4C7BF4",
                    "&:hover": {
                      color: "status.error.text",
                      backgroundColor: "rgba(211, 47, 47, 0.08)",
                    },
                  }}
                >
                  <DeleteIcon size={16} />
                </IconButton>
              </Tooltip>
            </Box>
          ))}
        </Stack>
      )}

      {evidenceFiles.length === 0 &&
        uploadFiles.length === 0 &&
        pendingAttachFiles.length === 0 && (
          <Box
            sx={{
              textAlign: "center",
              py: 4,
              color: "text.tertiary",
              border: `2px dashed ${theme.palette.border.dark}`,
              borderRadius: 1,
              backgroundColor: "background.accent",
            }}
          >
            <Typography variant="body2" sx={{ mb: 1 }}>
              No evidence files uploaded yet
            </Typography>
            <Typography variant="caption" color={text.disabled}>
              Click "Add evidence files" to upload documentation for this requirement
            </Typography>
          </Box>
        )}

      <FilePickerModal
        open={showFilePicker}
        onClose={() => setShowFilePicker(false)}
        onSelect={handleAttachExistingFiles}
        excludeFileIds={[
          ...evidenceFiles.map((f) => String(f.id)),
          ...pendingAttachFiles.map((f) => String(f.id)),
        ]}
        multiSelect={true}
        title="Attach Existing Files as Evidence"
      />
    </Stack>
  );
};

export default EvidenceTab;
