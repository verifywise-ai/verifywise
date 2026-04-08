import { useState, useEffect, useCallback } from "react";
import { Box, Typography, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Paperclip, X, Upload } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { FilePickerModal } from "../../../components/FilePickerModal";
import FileUploadModal from "../../../components/Modals/FileUpload";
import { friaRepository } from "../../../../application/repository/fria.repository";

interface FriaEvidenceButtonProps {
  friaId: number;
  entityType: string;
  label?: string;
}

interface EvidenceFile {
  id: number;
  link_id: number;
  file_name: string;
  file_type?: string;
}

const FriaEvidenceButton = ({
  friaId,
  entityType,
  label = "Attach evidence",
}: FriaEvidenceButtonProps) => {
  const theme = useTheme();
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchEvidence = useCallback(async () => {
    if (!friaId) return;
    try {
      const data = await friaRepository.getEvidence(friaId, entityType);
      setFiles(Array.isArray(data) ? data : []);
    } catch {
      setFiles([]);
    }
  }, [friaId, entityType]);

  useEffect(() => {
    fetchEvidence();
  }, [fetchEvidence]);

  const handleSelect = async (selectedFiles: Array<{ id: string; fileName: string }>) => {
    setIsLoading(true);
    try {
      for (const file of selectedFiles) {
        await friaRepository.linkEvidence(friaId, parseInt(file.id), entityType);
      }
      await fetchEvidence();
    } catch {
      // silently reset picker; fetch failure is non-critical
    } finally {
      setIsLoading(false);
      setPickerOpen(false);
    }
  };

  const handleUploadSuccess = async (fileResponse: { data?: { id?: number }; id?: number }) => {
    setUploadOpen(false);
    const fileId = fileResponse?.data?.id ?? fileResponse?.id;
    if (!fileId) return;
    setIsLoading(true);
    try {
      await friaRepository.linkEvidence(friaId, fileId, entityType);
      await fetchEvidence();
    } catch {
      // silently reset; fetch failure is non-critical
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (linkId: number) => {
    try {
      await friaRepository.unlinkEvidence(friaId, linkId);
      setFiles((prev) => prev.filter((f) => f.link_id !== linkId));
    } catch {
      // silently ignore; UI state remains consistent on re-fetch
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <CustomizableButton
          text={label}
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
                key={file.link_id}
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
                <Typography sx={{ fontSize: 11, color: theme.palette.text.primary }}>
                  {file.file_name}
                </Typography>
                <Box
                  component="span"
                  onClick={() => handleRemove(file.link_id)}
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
        excludeFileIds={files.map((f) => String(f.id))}
        multiSelect
        title={`Attach evidence to ${entityType.replace(/_/g, " ")}`}
      />

      <FileUploadModal
        uploadProps={{
          open: uploadOpen,
          onClose: () => setUploadOpen(false),
          onSuccess: handleUploadSuccess,
          uploadEndpoint: "/file-manager",
          allowedFileTypes: [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "image/png",
            "image/jpeg",
            "text/plain",
            "text/csv",
          ],
        }}
      />
    </Box>
  );
};

export default FriaEvidenceButton;
