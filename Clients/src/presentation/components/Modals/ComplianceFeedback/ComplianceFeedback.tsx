import {
  Box,
  Typography,
  Button,
  useTheme,
  Dialog,
  Stack,
} from "@mui/material";
import React, { useState } from "react";
import RichTextEditor from "../../../components/RichTextEditor/index";
import FileManagementDialog from "../../Inputs/FileUpload/FileManagementDialog";
import Alert from "../../../components/Alert";
import { AlertProps } from "../../../types/alert.types";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { FileData } from "../../../../domain/types/File";
import { IAuditorFeedbackProps } from "../../../types/interfaces/i.editor";
import { text, background, border as borderPalette } from "../../../themes/palette";

const parseFileData = (file: FileData | string): FileData => {
  if (typeof file === "string") {
    try {
      const parsedFile = JSON.parse(file);
      return {
        ...parsedFile,
        data: undefined, // API files don't have data property
      } as FileData;
    } catch (error) {
      console.error("Failed to parse file data:", error);
      throw new Error("Invalid file data format");
    }
  }
  return file;
};

const AuditorFeedback: React.FC<IAuditorFeedbackProps> = ({
  activeSection,
  feedback,
  onChange,
  files,
  onFilesChange,
  deletedFilesIds,
  onDeletedFilesChange,
  uploadFiles = [],
  onUploadFilesChange = () => {},
  readOnly = false,
}) => {
  const theme = useTheme();
  const [isFileUploadOpen, setIsFileUploadOpen] = useState<boolean>(false);
  const [evidenceFiles, setEvidenceFiles] = useState<FileData[]>(() =>
    files.map(parseFileData)
  );
  const [alert, setAlert] = useState<AlertProps | null>(null);

  const handleContentChange = (content: string) => {
    onChange({
      target: {
        value:
          " " +
          content
            .replace(/^<p>/, "")
            .replace(/<\/p>$/, "")
            .trim(),
      },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  const handleAddFiles = (newFiles: FileData[]) => {
    onUploadFilesChange([...uploadFiles, ...newFiles]);
  };

  const handleRemoveFile = (fileId: string) => {
    const fileIdNumber = parseInt(fileId);
    if (isNaN(fileIdNumber)) {
      handleAlert({
        variant: "error",
        body: "Invalid file ID",
        setAlert,
      });
      return;
    }

    // Check if file is in evidenceFiles or uploadFiles
    const isEvidenceFile = evidenceFiles.some((file) => file.id === fileId);

    if (isEvidenceFile) {
      const newEvidenceFiles = evidenceFiles.filter(
        (file) => file.id !== fileId
      );
      setEvidenceFiles(newEvidenceFiles);
      onFilesChange?.(newEvidenceFiles);
      onDeletedFilesChange([...deletedFilesIds, fileIdNumber]);
    }
  };

  const handleRemovePendingFile = (fileId: string) => {
    const newUploadFiles = uploadFiles.filter((file) => file.id !== fileId);
    onUploadFilesChange(newUploadFiles);
  };

  const closeFileUploadModal = () => {
    setIsFileUploadOpen(false);
  };

  return (
    <Box sx={{ width: "100%", padding: 2 }}>
      {activeSection && (
        <>
          <Typography sx={{ mb: 2 }}>
            {activeSection === "Evidence" ? "Evidence:" : "Feedback:"}
          </Typography>

          <RichTextEditor
            toolbar="full"
            initialContent={feedback}
            onContentChange={handleContentChange}
            isEditable={!readOnly}
          />
        </>
      )}

      <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          sx={{
            mt: 2,
            borderRadius: 2,
            minWidth: 155, // minimum width
            height: 25,
            fontSize: 11,
            border: `1px solid ${borderPalette.dark}`,
            backgroundColor: "white",
            color: `${text.secondary}`,
            "&:hover": {
              backgroundColor: `${background.accent}`,
              border: `1px solid ${borderPalette.dark}`,
            },
          }}
          disableRipple={
            theme.components?.MuiButton?.defaultProps?.disableRipple
          }
          onClick={() => setIsFileUploadOpen(true)}
          disabled={readOnly}
        >
          Add, remove or download evidence
        </Button>
        <Stack direction="row" spacing={10}>
          <Typography
            sx={{
              fontSize: 11,
              color: `${text.secondary}`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              textAlign: "center",
              margin: "auto",
              textWrap: "wrap",
            }}
          >
            {`${evidenceFiles.length || 0} evidence files attached`}
          </Typography>
          {uploadFiles.length > 0 && (
            <Typography
              sx={{
                fontSize: 11,
                color: "text.secondary",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
                margin: "auto",
                textWrap: "wrap",
              }}
            >
              {`${uploadFiles.length} ${
                uploadFiles.length === 1 ? "file" : "files"
              } pending upload`}
            </Typography>
          )}
        </Stack>
      </Stack>
      <Dialog open={isFileUploadOpen} onClose={closeFileUploadModal} maxWidth="sm" fullWidth>
        <FileManagementDialog
          files={evidenceFiles}
          pendingFiles={uploadFiles}
          onClose={closeFileUploadModal}
          onRemoveFile={handleRemoveFile}
          onAddFiles={handleAddFiles}
          onRemovePendingFile={handleRemovePendingFile}
          disabled={readOnly}
        />
      </Dialog>
      {alert && (
        <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />
      )}
    </Box>
  );
};

export default AuditorFeedback;
