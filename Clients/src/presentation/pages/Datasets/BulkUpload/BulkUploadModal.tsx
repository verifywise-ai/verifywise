import { useState, useCallback } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import StepperModal from "../../../components/Modals/StepperModal";
import FileDropZone from "./FileDropZone";
import FilePreviewAndMetadata from "./FilePreviewAndMetadata";
import UploadProgress, { FileUploadResult } from "./UploadProgress";
import { useFileAnalysis } from "./useFileAnalysis";
import { useAuth } from "../../../../application/hooks/useAuth";
import { brand, text } from "../../../themes/palette";

interface BulkUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  apiServices?: {
    post: <T>(endpoint: string, data: any, config?: any) => Promise<{ data: T }>;
  };
}

const STEPS = ["Select Files", "Review Metadata", "Upload"];

export default function BulkUploadModal({
  open,
  onClose,
  onSuccess,
  apiServices,
}: BulkUploadModalProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadResults, setUploadResults] = useState<FileUploadResult[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const { userToken } = useAuth();
  const userName = userToken?.name || "";
  const {
    analyses,
    analyzing,
    error: analysisError,
    analyzeFiles,
    updateMetadata,
    toggleSkip,
    applyBatchDefaults,
    reset: resetAnalysis,
  } = useFileAnalysis();

  const handleFilesChange = useCallback((newFiles: File[]) => {
    setFiles(newFiles);
  }, []);

  const startUpload = useCallback(async () => {
    const filesToUpload = analyses.filter((a) => !a.skipped);
    if (filesToUpload.length === 0) return;

    setIsUploading(true);
    const results: FileUploadResult[] = filesToUpload.map((a) => ({
      fileName: a.fileName,
      status: "pending" as const,
    }));
    setUploadResults([...results]);

    for (let i = 0; i < filesToUpload.length; i++) {
      const analysis = filesToUpload[i];

      results[i] = { ...results[i], status: "uploading" };
      setUploadResults([...results]);

      try {
        const formData = new FormData();
        formData.append("file", analysis.file);
        formData.append("metadata", JSON.stringify(analysis.metadata));

        const response = await apiServices?.post<{
          data: { datasetId: number; fileId: number };
        }>("/dataset-bulk-upload/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        const responseData = (response?.data as any)?.data;
        results[i] = {
          ...results[i],
          status: "success",
          datasetId: responseData?.datasetId,
          fileId: responseData?.fileId,
        };
      } catch (err: any) {
        const errorMessage =
          err?.response?.data?.data?.message ||
          err?.response?.data?.message ||
          err?.message ||
          "Upload failed";
        results[i] = {
          ...results[i],
          status: "error",
          error: errorMessage,
        };
      }

      setUploadResults([...results]);
    }

    setIsUploading(false);
  }, [analyses, apiServices]);

  const handleNext = useCallback(async () => {
    if (activeStep === 0) {
      await analyzeFiles(files, userName || "");
      setActiveStep(1);
    } else if (activeStep === 1) {
      setActiveStep(2);
      await startUpload();
    }
  }, [activeStep, files, analyzeFiles, userName, startUpload]);

  const handleBack = useCallback(() => {
    setActiveStep((prev) => prev - 1);
  }, []);

  const handleClose = useCallback(() => {
    setActiveStep(0);
    setFiles([]);
    setUploadResults([]);
    setIsUploading(false);
    resetAnalysis();

    const hasSuccess = uploadResults.some((r) => r.status === "success");
    if (hasSuccess) {
      onSuccess?.();
    }
    onClose();
  }, [onClose, onSuccess, uploadResults, resetAnalysis]);

  const isNextDisabled =
    (activeStep === 0 && files.length === 0) ||
    (activeStep === 1 && analyses.filter((a) => !a.skipped).length === 0) ||
    analyzing;

  const isUploadComplete =
    activeStep === 2 && !isUploading && uploadResults.length > 0;

  const renderStepContent = () => {
    if (activeStep === 0) {
      return <FileDropZone files={files} onFilesChange={handleFilesChange} />;
    }

    if (activeStep === 1 && analyzing) {
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            py: 4,
          }}
        >
          <CircularProgress size={32} sx={{ color: `${brand.primary}` }} />
          <Typography sx={{ mt: 1, fontSize: 13, color: `${text.tertiary}` }}>
            Analyzing files...
          </Typography>
        </Box>
      );
    }

    if (activeStep === 1 && !analyzing && analysisError) {
      return (
        <Typography sx={{ fontSize: 13, color: "#F04438" }}>
          {analysisError}
        </Typography>
      );
    }

    if (activeStep === 1 && !analyzing && analyses.length > 0) {
      return (
        <FilePreviewAndMetadata
          analyses={analyses}
          onUpdateMetadata={updateMetadata}
          onToggleSkip={toggleSkip}
          onApplyBatchDefaults={applyBatchDefaults}
        />
      );
    }

    if (activeStep === 2) {
      return (
        <UploadProgress
          results={uploadResults}
          totalFiles={analyses.filter((a) => !a.skipped).length}
        />
      );
    }

    return null;
  };

  return (
    <StepperModal
      isOpen={open}
      onClose={isUploading ? () => {} : handleClose}
      title="Dataset Bulk Upload"
      steps={STEPS}
      activeStep={activeStep}
      onNext={handleNext}
      onBack={activeStep === 2 ? undefined : handleBack}
      onSubmit={handleClose}
      canProceed={activeStep === 2 ? isUploadComplete : !isNextDisabled}
      isSubmitting={isUploading}
      submitButtonText={activeStep === 2 ? "Done" : "Upload"}
      maxWidth="900px"
    >
      {renderStepContent()}
    </StepperModal>
  );
}
