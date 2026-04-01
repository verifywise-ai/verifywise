import {
  Box,
  Chip,
  Stack,
  Tooltip,
  Typography,
  Dialog,
  useTheme,
} from "@mui/material";
import { Question } from "../../../domain/types/Question";
import { Info as GreyCircleInfoIcon } from "lucide-react";
import {
  priorities,
  PriorityLevel,
} from "../../pages/Assessment/NewAssessment/priorities";
import RichTextEditor from "../RichTextEditor";
import { useCallback, useState, useEffect, Suspense } from "react";
import FileManagementDialog from "../Inputs/FileUpload/FileManagementDialog";
import Alert from "../Alert";
import { AlertProps } from "../../types/alert.types";
import { handleAlert } from "../../../application/tools/alertUtils";
import { FileData } from "../../../domain/types/File";
import { Button } from "../button";
import Select from "../Inputs/Select";
import allowedRoles from "../../../application/constants/permissions";
import { LinkedRisksPopup } from "../LinkedRisks";
import AuditRiskPopup from "../RiskPopup/AuditRiskPopup";
import { updateEUAIActAnswerById } from "../../../application/repository/question.repository";
import { useAuth } from "../../../application/hooks/useAuth";
import { IQuestionProps } from "../../../domain/interfaces/i.question";
import { border as borderPalette } from "../../themes/palette";

/**
 * QuestionFrame Component
 *
 * This component renders a question with its associated details, including the ability to edit the answer,
 * manage evidence files, and display priority levels. It also provides functionality to save updates
 * and handle file uploads or deletions.
 *
 * Props:
 * @param {QuestionProps} props - The props for the component.
 * @param {Question} props.question - The question object containing details such as the question text,
 * hint, priority level, and evidence files.
 *
 * Usage:
 * <QuestionFrame question={questionObject} />
 */
const QuestionFrame = ({
  question,
  setRefreshKey,
  currentProjectId,
}: IQuestionProps) => {
  const theme = useTheme();
  const { userRoleName, userId } = useAuth();
  const [values, setValues] = useState<Question>({
    ...question,
    risks: question.risks || [],
  });
  const [isFileUploadOpen, setIsFileUploadOpen] = useState(false);

  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [isLinkedRisksModalOpen, setIsLinkedRisksModalOpen] =
    useState<boolean>(false);
  const [selectedRisks, setSelectedRisks] = useState<number[]>([]);
  const [deletedRisks, setDeletedRisks] = useState<number[]>([]);
  const [auditedStatusModalOpen, setAuditedStatusModalOpen] =
    useState<boolean>(false);
  
  // File management state
  const [pendingFiles, setPendingFiles] = useState<FileData[]>([]);
  const [deletedFileIds, setDeletedFileIds] = useState<number[]>([]);

  const isEditingDisabled = !(allowedRoles?.frameworks?.edit || []).includes(
    userRoleName || ""
  );

  const STATUS_OPTIONS = [
    { _id: "notStarted", name: "Not started" },
    { _id: "inProgress", name: "In progress" },
    { _id: "done", name: "Done" },
  ];

  const handleAddFiles = useCallback((files: FileData[]) => {
    setPendingFiles((prev) => [...prev, ...files]);
  }, []);

  const handleRemovePendingFile = useCallback((fileId: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const handleStatusChange = (field: string, statusValue: string | number) => {
    if (
      field === "status" &&
      statusValue === "Done" &&
      (selectedRisks.length > 0 ||
        (values.risks?.length || 0) > 0 ||
        ((values.risks?.length || 0) > 0 &&
          deletedRisks.length === (values.risks?.length || 0)))
    ) {
      setAuditedStatusModalOpen(true);
    }
    setValues((prevValues) => ({
      ...prevValues,
      [field]: statusValue,
    }));
  };

  useEffect(() => {
    setValues({
      ...question,
      risks: question.risks || [],
    });
    // Reset file management state when question changes
    setPendingFiles([]);
    setDeletedFileIds([]);
  }, [question, currentProjectId]);

  const handleSave = async () => {
    try {
      // Build FormData if we have files to upload
      const formDataToSend = new FormData();
      
      // Add basic fields
      formDataToSend.append("answer", values.answer || "");
      formDataToSend.append("status", values.status || "notStarted");
      formDataToSend.append("question_id", question.question_id?.toString() || "");
      formDataToSend.append("user_id", userId?.toString() || "");
      formDataToSend.append("project_id", currentProjectId?.toString() || "");
      
      // Add deleted file IDs
      formDataToSend.append("delete", JSON.stringify(deletedFileIds));
      formDataToSend.append("risksDelete", JSON.stringify(deletedRisks));
      formDataToSend.append("risksMitigated", JSON.stringify(selectedRisks));
      
      // Add pending files
      pendingFiles.forEach((file) => {
        if (file.data instanceof Blob) {
          const fileToUpload =
            file.data instanceof File
              ? file.data
              : new File([file.data], file.fileName, { type: file.type });
          formDataToSend.append("files", fileToUpload);
        }
      });

      const response = await updateEUAIActAnswerById({
        answerId: question.answer_id,
        body: formDataToSend,
      });
      
      if (response.status === 202) {
        setValues({
          ...response.data.data,
          risks: response.data.data.risks || [],
        });
        setSelectedRisks([]);
        setDeletedRisks([]);
        setPendingFiles([]);
        setDeletedFileIds([]);
        setRefreshKey();
        handleAlert({
          variant: "success",
          body: "Question updated successfully",
          setAlert,
        });
      } else {
        handleAlert({
          variant: "error",
          body: "Something went wrong, please try again",
          setAlert,
        });
      }
    } catch (error) {
      console.error("Error updating question:", error);
      handleAlert({
        variant: "error",
        body: "Something went wrong, please try again",
        setAlert,
      });
    }
  };

  const handleContentChange = (answer: string) => {
    // Remove <p> tags from the beginning and end of the answer
    const cleanedAnswer = answer?.replace(/^<p>|<\/p>$/g, "") || "";
    setValues({ ...values, answer: cleanedAnswer || "" });
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
    
    // Mark file for deletion (will be deleted on save)
    setDeletedFileIds((prev) => [...prev, fileIdNumber]);
    
    // Remove from local display
    const newEvidenceFiles = (values?.evidence_files || []).filter(
      (file) => file?.id !== fileId
    );
    setValues((prevValues) => ({
      ...prevValues,
      evidence_files: newEvidenceFiles,
    }));

    handleAlert({
      variant: "info",
      body: "File marked for deletion. Save to apply changes.",
      setAlert,
    });
  };

  return (
    <Box key={question.question_id || "default"} mt={10}>
      <Box
        sx={{
          display: "flex",
          padding: 5,
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "#FBFAFA",
          border: `1px solid ${borderPalette.dark}`,
          borderBottom: "none",
          borderRadius: `${theme.shape.borderRadius}px ${theme.shape.borderRadius}px 0 0`,
          gap: 4,
        }}
      >
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          {question.question || ""}
          {question.hint && (
            <Box component="span" ml={2}>
              <Tooltip
                title={question.hint || ""}
                slotProps={{
                  tooltip: {
                    sx: { fontSize: 12 },
                  },
                }}
              >
                <Box
                  component="span"
                  sx={{ display: "inline-flex", cursor: "pointer" }}
                >
                  <GreyCircleInfoIcon size={16} />
                </Box>
              </Tooltip>
            </Box>
          )}
        </Typography>
        <Stack direction="row" alignItems="center" gap={2}>
          <Select
            items={STATUS_OPTIONS}
            isHidden={false}
            id=""
            onChange={(e) => handleStatusChange("status", e.target.value)}
            value={values.status || "notStarted"}
            getOptionValue={(item) => item.name}
            sx={{
              width: 175,
              height: 24,
            }}
            disabled={isEditingDisabled}
          />
          <Chip
            label={question.priority_level || "low priority"}
            sx={{
              backgroundColor:
                priorities[
                  (question.priority_level || "low priority") as PriorityLevel
                ]?.color || "#666",
              color: "background.main",
              borderRadius: theme.shape.borderRadius,
            }}
            size="small"
          />
        </Stack>
      </Box>
      <RichTextEditor
        toolbar="full"
        key={question.question_id || "default"}
        onContentChange={handleContentChange}
        headerSx={{
          borderRadius: 0,
          borderTop: "none",
          borderColor: "border.dark",
        }}
        bodySx={{
          borderColor: "border.dark",
          borderRadius: `0 0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px`,
          "& .ProseMirror > p": {
            margin: 0,
          },
        }}
        initialContent={question.answer || ""}
        isEditable={!isEditingDisabled}
      />
      <Stack
        sx={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Stack
          sx={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Button
            variant="contained"
            disableRipple
            onClick={handleSave}
            disabled={isEditingDisabled}
          >
            Save
          </Button>
          <Button
            variant="contained"
            sx={{
              minWidth: 155, // minimum width
              border: "1px solid #d0d5dd",
              backgroundColor: "white",
              color: "text.secondary",
              flexShrink: 0, //  prevent shrinking in flex layouts
              "&:hover": {
                backgroundColor: "background.accent",
                border: "1px solid #d0d5dd",
              },
            }}
            disableRipple
            onClick={() => setIsFileUploadOpen(true)}
            disabled={isEditingDisabled}
          >
            Add, remove or download evidence
          </Button>
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
            {`${values?.evidence_files?.length || 0} evidence files attached`}
          </Typography>
          {pendingFiles.length > 0 && (
            <Typography
              sx={{
                fontSize: 11,
                color: "brand.primary",
                display: "flex",
                alignItems: "center",
              }}
            >
              {`+${pendingFiles.length} pending upload`}
            </Typography>
          )}
          {deletedFileIds.length > 0 && (
            <Typography
              sx={{
                fontSize: 11,
                color: "status.error.text",
                display: "flex",
                alignItems: "center",
              }}
            >
              {`-${deletedFileIds.length} pending delete`}
            </Typography>
          )}

          <Stack direction="row" spacing={2} sx={{ ml: "36px" }}>
            <Button
              variant="contained"
              sx={{
                mt: 2,
                borderRadius: 2,
                width: 155,
                height: 25,
                fontSize: 11,
                border: "1px solid #d0d5dd",
                backgroundColor: "white",
                color: "text.secondary",
                "&:hover": {
                  backgroundColor: "background.accent",
                  border: "1px solid #d0d5dd",
                },
              }}
              disableRipple
              onClick={() => setIsLinkedRisksModalOpen(true)}
              disabled={isEditingDisabled}
            >
              Add/remove risks
            </Button>
            <Stack direction="row" spacing={10}>
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
                {`${values.risks?.length || 0} risks linked`}
              </Typography>
              {selectedRisks.length > 0 && (
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
                  {`${selectedRisks.length} ${
                    selectedRisks.length === 1 ? "risk" : "risks"
                  } pending save`}
                </Typography>
              )}
              {deletedRisks.length > 0 && (
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
                  {`${deletedRisks.length} ${
                    deletedRisks.length === 1 ? "risk" : "risks"
                  } pending delete`}
                </Typography>
              )}
            </Stack>
          </Stack>
        </Stack>
        <Typography sx={{ fontSize: 11, color: "text.secondary", fontWeight: "300" }}>
          {question.is_required === true ? "required" : ""}
        </Typography>
      </Stack>
      <Dialog
        open={isFileUploadOpen}
        onClose={() => setIsFileUploadOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <FileManagementDialog
          files={values?.evidence_files || []}
          pendingFiles={pendingFiles}
          onClose={() => setIsFileUploadOpen(false)}
          onRemoveFile={handleRemoveFile}
          onAddFiles={handleAddFiles}
          onRemovePendingFile={handleRemovePendingFile}
          disabled={isEditingDisabled}
        />
      </Dialog>
      <Dialog
        open={isLinkedRisksModalOpen}
        onClose={() => setIsLinkedRisksModalOpen(false)}
        PaperProps={{
          sx: {
            width: "1500px",
            maxWidth: "1500px",
          },
        }}
      >
        <Suspense fallback={"loading..."}>
          <LinkedRisksPopup
            onClose={() => setIsLinkedRisksModalOpen(false)}
            currentRisks={(values.risks || [])
              .concat(selectedRisks)
              .filter((risk) => !deletedRisks.includes(risk))}
            setSelectecRisks={setSelectedRisks}
            _setDeletedRisks={setDeletedRisks}
            projectId={currentProjectId}
          />
        </Suspense>
      </Dialog>
      <Dialog
        open={auditedStatusModalOpen}
        onClose={() => setAuditedStatusModalOpen(false)}
        PaperProps={{
          sx: {
            width: "800px",
            maxWidth: "800px",
          },
        }}
      >
        <Suspense fallback={"loading..."}>
          <AuditRiskPopup
            onClose={() => setAuditedStatusModalOpen(false)}
            risks={(values.risks || []).concat(selectedRisks)}
            _deletedRisks={deletedRisks}
            _setDeletedRisks={setDeletedRisks}
            _selectedRisks={selectedRisks}
            _setSelectedRisks={setSelectedRisks}
          />
        </Suspense>
      </Dialog>
      {alert && (
        <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />
      )}
    </Box>
  );
};

export default QuestionFrame;
