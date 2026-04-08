import { useState, useEffect, useCallback } from "react";
import { Box, Typography, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Paperclip, X, Upload } from "lucide-react";
import { CustomizableButton } from "../button/customizable-button";
import { FilePickerModal } from "../FilePickerModal";
import FileUploadModal from "../Modals/FileUpload";
import {
  attachFileToEntity,
  detachFileFromEntity,
  getEntityFiles,
  FileMetadata,
} from "../../../application/repository/file.repository";
import { FileData } from "../../../domain/types/File";

interface PolicyAttachmentsProps {
  policyId: number;
}

const FRAMEWORK_TYPE = "policy_manager";
const ENTITY_TYPE = "policy";
const LINK_TYPE = "attachment";

const PolicyAttachments = ({ policyId }: PolicyAttachmentsProps) => {
  const theme = useTheme();
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAttachments = useCallback(async () => {
    if (!policyId) return;
    try {
      const data = await getEntityFiles(FRAMEWORK_TYPE, ENTITY_TYPE, policyId);
      setFiles(Array.isArray(data) ? data : []);
    } catch {
      setFiles([]);
    }
  }, [policyId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const handleSelect = async (
    selectedFiles: FileData[]
  ) => {
    setIsLoading(true);
    try {
      for (const file of selectedFiles) {
        await attachFileToEntity({
          file_id: parseInt(file.id),
          framework_type: FRAMEWORK_TYPE,
          entity_type: ENTITY_TYPE,
          entity_id: policyId,
          link_type: LINK_TYPE,
        });
      }
      await fetchAttachments();
    } finally {
      setIsLoading(false);
      setPickerOpen(false);
    }
  };

  const handleUploadSuccess = async (fileResponse: {
    data?: { id?: number };
    id?: number;
  }) => {
    setUploadOpen(false);
    const fileId = fileResponse?.data?.id ?? fileResponse?.id;
    if (!fileId) return;
    setIsLoading(true);
    try {
      await attachFileToEntity({
        file_id: fileId,
        framework_type: FRAMEWORK_TYPE,
        entity_type: ENTITY_TYPE,
        entity_id: policyId,
        link_type: LINK_TYPE,
      });
      await fetchAttachments();
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (file: FileMetadata) => {
    try {
      await detachFileFromEntity({
        file_id: parseInt(file.id),
        framework_type: FRAMEWORK_TYPE,
        entity_type: ENTITY_TYPE,
        entity_id: policyId,
      });
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch {
      // UI state remains consistent on next fetch
    }
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <CustomizableButton
          text="Attach PDF"
          variant="text"
          onClick={() => setPickerOpen(true)}
          disabled={isLoading}
          startIcon={<Paperclip size={13} />}
          sx={{
            height: 28,
            fontSize: 12,
            color: theme.palette.text.secondary,
            textTransform: "none",
            padding: "4px 8px",
          }}
        />
        <CustomizableButton
          text="Upload new"
          variant="text"
          onClick={() => setUploadOpen(true)}
          disabled={isLoading}
          startIcon={<Upload size={13} />}
          sx={{
            height: 28,
            fontSize: 12,
            color: theme.palette.text.secondary,
            textTransform: "none",
            padding: "4px 8px",
          }}
        />
        {files.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {files.map((file) => (
              <Box
                key={file.id}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  border: `1px solid ${theme.palette.divider}`,
                  backgroundColor: theme.palette.background.default,
                }}
              >
                <Paperclip size={11} color={theme.palette.text.secondary} />
                <Typography
                  sx={{ fontSize: 11, color: theme.palette.text.primary }}
                >
                  {file.filename}
                </Typography>
                <Box
                  component="span"
                  onClick={() => handleRemove(file)}
                  sx={{
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    "&:hover": { opacity: 0.7 },
                  }}
                >
                  <X size={11} color={theme.palette.text.secondary} />
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      <FilePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelect}
        excludeFileIds={files.map((f) => f.id)}
        multiSelect
        title="Attach PDF to policy"
      />

      <FileUploadModal
        uploadProps={{
          open: uploadOpen,
          onClose: () => setUploadOpen(false),
          onSuccess: handleUploadSuccess,
          uploadEndpoint: "/file-manager",
          allowedFileTypes: ["application/pdf"],
        }}
      />
    </Box>
  );
};

export default PolicyAttachments;
