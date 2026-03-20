/**
 * EU AI Act Question Drawer Dialog
 *
 * Tab-based drawer for managing EU AI Act assessment questions
 * Mirrors ISO27001/ISO42001/NIST AI RMF architecture for consistency
 *
 * Tabs:
 * - Details: Question, answer, status
 * - Evidence: File management (upload, download, delete)
 * - Cross mappings: Risk management
 * - Notes: Collaboration notes (lazy-loaded)
 */

import React, { useState, useEffect, Suspense, lazy, useRef } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  SelectChangeEvent,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { TabContext, TabPanel } from "@mui/lab";
import {
  X as CloseIcon,
  Save as SaveIcon,
  Trash2 as DeleteIcon,
  Download as DownloadIcon,
  FileText as FileIcon,
  Eye as ViewIcon,
} from "lucide-react";

// Inputs & UI Components
import RichTextEditor from "../../RichTextEditor";
import Select from "../../Inputs/Select";
import TabBar from "../../TabBar";
import { CustomizableButton } from "../../button/customizable-button";
import Alert from "../../Alert";
import StandardModal from "../../Modals/StandardModal";
import { text } from "../../../themes/palette";

// Lazy-loaded components
const LinkedRisksPopup = lazy(() => import("../../LinkedRisks").then(m => ({ default: m.LinkedRisksPopup })));
const NotesTab = lazy(() => import("../../Notes/NotesTab"));
const AddNewRiskForm = lazy(() => import("../../AddNewRiskForm"));

// Types & Constants
import {
  EUAIActQuestionDrawerProps,
  EUAIActFormData,
  EUAIACT_STATUS_OPTIONS,
} from "./types";
import { FileData } from "../../../../domain/types/File";
import { Question } from "../../../../domain/types/Question";
import { RiskFormValues } from "../../../../domain/types/riskForm.types";
import { AlertProps } from "../../../types/alert.types";
import { getPriorityColors } from "../../../pages/Assessment/1.0AssessmentTracker/euaiact.style";

// Hooks & Utilities
import { useAuth } from "../../../../application/hooks/useAuth";
import useUsers from "../../../../application/hooks/useUsers";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { updateEUAIActAnswerById } from "../../../../application/repository/question.repository";
import { getEntityById } from "../../../../application/repository/entity.repository";
import { getFileById, attachFilesToEntity, getEntityFiles } from "../../../../application/repository/file.repository";
import { getAssessmentTopicById } from "../../../../application/repository/assesment.repository";
import allowedRoles from "../../../../application/constants/permissions";
import { FilePickerModal } from "../../FilePickerModal";

// Type for risk objects
interface LinkedRisk {
  id: number;
  risk_name: string;
  risk_description?: string;
  risk_level?: string;
  mitigation_status?: string;
}

// Constants
export const inputStyles = {
  minWidth: 200,
  maxWidth: "100%",
  flexGrow: 1,
  height: 34,
};

const ACCEPTED_FILE_TYPES =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar";

/**
 * Darken a hex color by a percentage
 */
const darkenColor = (hex: string, percent: number): string => {
  // Remove # if present
  const cleanHex = hex.replace("#", "");
  // Convert to RGB
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  // Darken each component
  const newR = Math.max(0, Math.floor(r * (1 - percent / 100)));
  const newG = Math.max(0, Math.floor(g * (1 - percent / 100)));
  const newB = Math.max(0, Math.floor(b * (1 - percent / 100)));
  // Convert back to hex
  return `#${newR.toString(16).padStart(2, "0")}${newG
    .toString(16)
    .padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
};

// ============================================================================
// COMPONENT
// ============================================================================

const EUAIActQuestionDrawerDialog: React.FC<EUAIActQuestionDrawerProps> = ({
  open,
  onClose,
  question: questionProp,
  subtopic,
  currentProjectId,
  projectFrameworkId,
  onSaveSuccess,
}) => {
  const theme = useTheme();
  const { userRoleName, userId } = useAuth();
  const { users } = useUsers();

  // ========================================================================
  // STATE - UI & LOADING
  // ========================================================================

  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [fetchedQuestion, setFetchedQuestion] = useState<Question | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  // ========================================================================
  // STATE - FORM DATA
  // ========================================================================

  const [formData, setFormData] = useState<EUAIActFormData>({
    answer: "",
    status: "notStarted",
  });

  // ========================================================================
  // STATE - EVIDENCE FILES
  // ========================================================================

  const [evidenceFiles, setEvidenceFiles] = useState<FileData[]>([]);
  const [uploadFiles, setUploadFiles] = useState<FileData[]>([]);
  const [pendingAttachFiles, setPendingAttachFiles] = useState<FileData[]>([]);
  const [deletedFiles, setDeletedFiles] = useState<number[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);

  // ========================================================================
  // STATE - RISKS
  // ========================================================================

  const [currentRisks, setCurrentRisks] = useState<number[]>([]);
  const [linkedRiskObjects, setLinkedRiskObjects] = useState<LinkedRisk[]>([]);
  const [selectedRisks, setSelectedRisks] = useState<number[]>([]);
  const [deletedRisks, setDeletedRisks] = useState<number[]>([]);
  const [isLinkedRisksModalOpen, setIsLinkedRisksModalOpen] = useState(false);

  // Risk detail modal state
  const [isRiskDetailModalOpen, setIsRiskDetailModalOpen] = useState(false);
  const [selectedRiskForView, setSelectedRiskForView] =
    useState<LinkedRisk | null>(null);
  const [riskFormData, setRiskFormData] = useState<RiskFormValues | undefined>(undefined);
  const onRiskSubmitRef = useRef<(() => void) | null>(null);

  // ========================================================================
  // PERMISSIONS
  // ========================================================================

  const isEditingDisabled =
    !allowedRoles.frameworks.edit.includes(userRoleName);

  // ========================================================================
  // TAB CONFIGURATION
  // ========================================================================

  const tabs = [
    {
      label: "Details",
      value: "details",
      icon: "FileText" as const,
    },
    {
      label: "Evidence",
      value: "evidence",
      icon: "FolderOpen" as const,
    },
    {
      label: "Cross mappings",
      value: "cross-mappings",
      icon: "Link" as const,
    },
    {
      label: "Notes",
      value: "notes",
      icon: "MessageSquare" as const,
    },
  ];

  // ========================================================================
  // STATUS MAPPING
  // ========================================================================

  const statusIdMap = new Map([
    ["Not started", "notStarted"],
    ["In progress", "inProgress"],
    ["Done", "done"],
  ]);

  const idStatusMap = new Map();
  for (const [status, id] of statusIdMap.entries()) {
    idStatusMap.set(id, status);
  }

  // ========================================================================
  // EFFECTS - INITIALIZATION
  // ========================================================================

  // Fetch question data when drawer opens
  useEffect(() => {
    if (
      open &&
      questionProp?.answer_id &&
      subtopic?.topic_id &&
      projectFrameworkId
    ) {
      fetchQuestionData();
      // Reset pending states
      resetPendingState();
    } else if (open && questionProp?.answer_id) {
      // Fallback: Use prop data if projectFrameworkId is not available
      const question = questionProp;
      setFetchedQuestion(question);

      const statusId =
        question.status === "Not started"
          ? "notStarted"
          : question.status === "In progress"
          ? "inProgress"
          : question.status === "Done"
          ? "done"
          : "notStarted";

      setFormData({
        answer: question.answer || "",
        status: statusId,
      });
      setEditorKey((prev) => prev + 1);

      // Initialize evidence files from both JSONB and file_entity_links
      loadEvidenceFiles(question.evidence_files).then((files) => {
        setEvidenceFiles(files);
      });

      if (question.risks) {
        setCurrentRisks(question.risks);
        fetchLinkedRisks(question.risks);
      } else {
        setCurrentRisks([]);
        setLinkedRiskObjects([]);
      }

      resetPendingState();
    }
  }, [open, questionProp?.answer_id, subtopic?.topic_id, projectFrameworkId]);

  // ========================================================================
  // DATA FETCHING
  // ========================================================================

  const fetchQuestionData = async () => {
    if (
      !questionProp?.answer_id ||
      !subtopic?.topic_id ||
      !projectFrameworkId
    ) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await getAssessmentTopicById({
        topicId: subtopic.topic_id,
        projectFrameworkId: projectFrameworkId,
      });

      if (response?.data) {
        // Find the specific question by answer_id in the topic structure
        let foundQuestion = null;
        for (const topicSubTopic of response.data.subTopics || []) {
          if (topicSubTopic.id === subtopic.id) {
            const question = (topicSubTopic.questions || []).find(
              (q: { answer_id: number }) => q.answer_id === questionProp.answer_id
            );
            if (question) {
              foundQuestion = question;
              break;
            }
          }
        }

        if (foundQuestion) {
          setFetchedQuestion(foundQuestion);

          // Initialize form data from fetched data
          const statusId =
            foundQuestion.status === "Not started"
              ? "notStarted"
              : foundQuestion.status === "In progress"
              ? "inProgress"
              : foundQuestion.status === "Done"
              ? "done"
              : "notStarted";

          setFormData({
            answer: foundQuestion.answer || "",
            status: statusId,
          });
          // Force RichTextEditor to remount with new content
          setEditorKey((prev) => prev + 1);

          // Initialize evidence files from both JSONB and file_entity_links
          const allEvidenceFiles = await loadEvidenceFiles(
            foundQuestion.evidence_files
          );
          setEvidenceFiles(allEvidenceFiles);

          // Initialize risks
          if (foundQuestion.risks && foundQuestion.risks.length > 0) {
            setCurrentRisks(foundQuestion.risks);
            await fetchLinkedRisks(foundQuestion.risks);
          } else {
            setCurrentRisks([]);
            setLinkedRiskObjects([]);
          }
        } else {
          // Fallback to prop data if question not found
          setFetchedQuestion(questionProp);
          setFormData({
            answer: questionProp.answer || "",
            status:
              questionProp.status === "Not started"
                ? "notStarted"
                : questionProp.status === "In progress"
                ? "inProgress"
                : questionProp.status === "Done"
                ? "done"
                : "notStarted",
          });
          setEditorKey((prev) => prev + 1);
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching question data:", error);
      }
      handleAlertCall({
        variant: "error",
        body: "Failed to load question data",
      });
      // Fallback to prop data on error
      setFetchedQuestion(questionProp);
      setFormData({
        answer: questionProp.answer || "",
        status:
          questionProp.status === "Not started"
            ? "notStarted"
            : questionProp.status === "In progress"
            ? "inProgress"
            : questionProp.status === "Done"
            ? "done"
            : "notStarted",
      });
      setEditorKey((prev) => prev + 1);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Load evidence files from both sources:
   * 1. JSONB evidence_files column (legacy)
   * 2. file_entity_links table (new framework-agnostic approach)
   * Merges and deduplicates by file ID
   */
  const loadEvidenceFiles = async (jsonbFiles: any) => {
    // Normalize JSONB files
    let files: any[] = [];
    if (Array.isArray(jsonbFiles)) {
      files = jsonbFiles;
    } else if (typeof jsonbFiles === "string") {
      try {
        files = JSON.parse(jsonbFiles);
      } catch {
        files = [];
      }
    } else if (jsonbFiles) {
      files = [jsonbFiles];
    }

    const normalizedJsonbFiles: FileData[] = files.map((file: any) => ({
      id: file.id?.toString() || file.fileId?.toString() || "",
      fileName: file.fileName || file.filename || file.file_name || "",
      size: file.size || 0,
      type: file.type || "",
      uploadDate:
        file.uploadDate || file.uploaded_time || new Date().toISOString(),
      uploader: file.uploader || file.uploaded_by?.toString() || "Unknown",
      data: file.data,
      source: file.source || "jsonb",
    }));

    // Fetch linked files from file_entity_links table
    let linkedFiles: FileData[] = [];
    if (questionProp?.answer_id) {
      try {
        const response = await getEntityFiles(
          "eu_ai_act",
          "assessment",
          questionProp.answer_id
        );
        if (response && Array.isArray(response)) {
          linkedFiles = response.map((file: any) => ({
            id: file.id?.toString() || file.file_id?.toString() || "",
            fileName: file.filename || file.fileName || file.file_name || "",
            size: file.size || 0,
            type: file.mimetype || file.type || "",
            uploadDate:
              file.upload_date ||
              file.uploadDate ||
              new Date().toISOString(),
            uploader: file.uploader_name
              ? `${file.uploader_name} ${file.uploader_surname || ""}`.trim()
              : file.uploader || "Unknown",
            source: file.source || "File Manager",
          }));
        }
      } catch (error) {
        console.error("Error fetching linked files:", error);
      }
    }

    // Merge and deduplicate by file ID
    const fileMap = new Map<string, FileData>();
    normalizedJsonbFiles.forEach((file) => {
      if (file.id) fileMap.set(file.id, file);
    });
    linkedFiles.forEach((file) => {
      if (file.id && !fileMap.has(file.id)) {
        fileMap.set(file.id, file);
      }
    });

    return Array.from(fileMap.values());
  };

  const fetchLinkedRisks = async (riskIds?: number[]) => {
    if (!questionProp?.answer_id) return;

    // Use provided riskIds or fall back to currentRisks
    const allRiskIds = riskIds || currentRisks;

    if (allRiskIds.length === 0) {
      setLinkedRiskObjects([]);
      return;
    }

    try {
      const riskPromises = allRiskIds.map((riskId: number) =>
        getEntityById({
          routeUrl: `/projectRisks/${riskId}`,
        })
          .then((response) => response.data)
          .catch(() => null)
      );

      const riskResults = await Promise.all(riskPromises);
      const validRisks = riskResults.filter((risk) => risk !== null);
      setLinkedRiskObjects(validRisks);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching linked risks:", error);
      }
      setLinkedRiskObjects([]);
    }
  };

  // ========================================================================
  // EVENT HANDLERS - FORM CHANGES
  // ========================================================================

  const handleFieldChange = (field: keyof EUAIActFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAnswerChange = (answer: string) => {
    const cleanedAnswer = answer?.replace(/^<p>|<\/p>$/g, "") || "";
    handleFieldChange("answer", cleanedAnswer || "");
  };

  const handleSelectChange = (field: keyof EUAIActFormData) => (event: SelectChangeEvent<string | number>) => {
    handleFieldChange(field, event.target.value.toString());
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  };

  // ========================================================================
  // EVENT HANDLERS - ALERTS
  // ========================================================================

  const handleAlertCall = ({
    variant,
    body,
  }: {
    variant: "success" | "error" | "warning" | "info";
    body: string;
  }) => {
    handleAlert({
      variant,
      body,
      setAlert,
    });
  };

  // ========================================================================
  // EVENT HANDLERS - FILE MANAGEMENT
  // ========================================================================

  const handleAddFiles = (files: File[]) => {
    const newFiles: FileData[] = files.map((file) => ({
      id: (Date.now() + Math.random()).toString(),
      fileName: file.name,
      size: file.size,
      type: file.type,
      data: file,
      uploadDate: new Date().toISOString(),
      uploader: "Current User",
    }));

    setUploadFiles((prev) => [...prev, ...newFiles]);
    handleAlertCall({
      variant: "info",
      body: `${files.length} file(s) added. Save to apply changes.`,
    });
  };

  const handleAttachExistingFiles = (selectedFiles: FileData[]) => {
    if (selectedFiles.length === 0) return;

    // Add to pending attach queue (will be attached on Save)
    setPendingAttachFiles((prev) => [...prev, ...selectedFiles]);
    handleAlertCall({
      variant: "info",
      body: `${selectedFiles.length} file(s) added to attach queue. Save to apply changes.`,
    });
  };

  const handleRemovePendingAttach = (fileId: string) => {
    setPendingAttachFiles((prev) => prev.filter((f) => f.id !== fileId));
    handleAlertCall({
      variant: "info",
      body: "File removed from attach queue.",
    });
  };

  const handleDeleteEvidenceFile = (fileId: string) => {
    const fileIdNumber = parseInt(fileId);
    if (isNaN(fileIdNumber)) {
      handleAlertCall({
        variant: "error",
        body: "Invalid file ID",
      });
      return;
    }
    setEvidenceFiles((prev) => prev.filter((f) => f.id.toString() !== fileId));
    setDeletedFiles((prev) => [...prev, fileIdNumber]);
    handleAlertCall({
      variant: "info",
      body: "File marked for deletion. Save to apply changes.",
    });
  };

  const handleDeleteUploadFile = (fileId: string) => {
    setUploadFiles((prev) => prev.filter((f) => f.id !== fileId));
    handleAlertCall({
      variant: "info",
      body: "File removed from upload queue.",
    });
  };

  const handleDownloadFile = async (fileId: string, fileName: string) => {
    try {
      const response = await getFileById({
        id: fileId,
        responseType: "arraybuffer",
      });

      const blob = new Blob([response], { type: "application/octet-stream" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      handleAlertCall({
        variant: "success",
        body: "File downloaded successfully",
      });
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error downloading file:", error);
      }
      handleAlertCall({
        variant: "error",
        body: "Failed to download file. Please try again.",
      });
    }
  };

  // ========================================================================
  // EVENT HANDLERS - RISK MANAGEMENT
  // ========================================================================

  const handleViewRiskDetails = async (risk: LinkedRisk) => {
    setSelectedRiskForView(risk);
    try {
      const response = await getEntityById({
        routeUrl: `/projectRisks/${risk.id}`,
      });
      if (response.data) {
        const riskData = response.data;
        setRiskFormData({
          riskName: riskData.risk_name || "",
          actionOwner: riskData.risk_owner || 0,
          aiLifecyclePhase: riskData.ai_lifecycle_phase || 0,
          riskDescription: riskData.risk_description || "",
          riskCategory: riskData.risk_category || [1],
          potentialImpact: riskData.impact || "",
          assessmentMapping: riskData.assessment_mapping || 0,
          controlsMapping: riskData.controls_mapping || 0,
          likelihood: riskData.likelihood_score || 1,
          riskSeverity: riskData.severity_score || 1,
          riskLevel: riskData.risk_level || 0,
          reviewNotes: riskData.review_notes || "",
          applicableProjects: riskData.applicable_projects || [],
          applicableFrameworks: riskData.applicable_frameworks || [],
        });
        setIsRiskDetailModalOpen(true);
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching risk details:", error);
      }
      handleAlertCall({
        variant: "error",
        body: "Failed to load risk details",
      });
    }
  };

  const handleRiskDetailModalClose = () => {
    setIsRiskDetailModalOpen(false);
    setSelectedRiskForView(null);
    setRiskFormData(undefined);
  };

  const handleRiskUpdateSuccess = () => {
    handleRiskDetailModalClose();
    handleAlertCall({
      variant: "success",
      body: "Risk updated successfully",
    });
    // Refresh linked risks after update
    if (questionProp?.answer_id) {
      fetchLinkedRisks();
    }
  };

  // ========================================================================
  // HELPERS
  // ========================================================================

  const refreshData = async () => {
    if (
      !questionProp?.answer_id ||
      !subtopic?.topic_id ||
      !projectFrameworkId
    ) {
      return;
    }
    try {
      // Refresh question data from API to get updated evidence files
      const response = await getAssessmentTopicById({
        topicId: subtopic.topic_id,
        projectFrameworkId: projectFrameworkId,
      });

      if (response?.data) {
        // Find the specific question by answer_id in the topic structure
        let foundQuestion = null;
        for (const topicSubTopic of response.data.subTopics || []) {
          if (topicSubTopic.id === subtopic.id) {
            const question = (topicSubTopic.questions || []).find(
              (q: { answer_id: number }) => q.answer_id === questionProp.answer_id
            );
            if (question) {
              foundQuestion = question;
              break;
            }
          }
        }

        if (foundQuestion) {
          // Update evidence files from both JSONB and file_entity_links
          const allEvidenceFiles = await loadEvidenceFiles(
            foundQuestion.evidence_files
          );
          setEvidenceFiles(allEvidenceFiles);

          // Update risks
          if (foundQuestion.risks && foundQuestion.risks.length > 0) {
            setCurrentRisks(foundQuestion.risks);
            await fetchLinkedRisks(foundQuestion.risks);
          } else {
            setCurrentRisks([]);
            setLinkedRiskObjects([]);
          }

          // Update fetched question (for display purposes)
          setFetchedQuestion(foundQuestion);
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error refreshing data:", error);
      }
    }
  };

  const resetPendingState = () => {
    setUploadFiles([]);
    setPendingAttachFiles([]);
    setDeletedFiles([]);
    setSelectedRisks([]);
    setDeletedRisks([]);
  };

  // ========================================================================
  // EVENT HANDLERS - SAVE
  // ========================================================================

  const handleSave = async () => {
    if (!questionProp?.answer_id) {
      handleAlertCall({
        variant: "error",
        body: "No question selected for update",
      });
      return;
    }

    setIsLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append("answer", formData.answer);
      formDataToSend.append(
        "status",
        idStatusMap.get(formData.status) || "Not started"
      );
      formDataToSend.append("user_id", userId?.toString() || "1");
      formDataToSend.append("project_id", currentProjectId.toString());
      formDataToSend.append("delete", JSON.stringify(deletedFiles));
      formDataToSend.append("risksDelete", JSON.stringify(deletedRisks));
      formDataToSend.append("risksMitigated", JSON.stringify(selectedRisks));

      // Add uploaded files
      uploadFiles.forEach((file) => {
        if (file.data instanceof Blob) {
          const fileToUpload =
            file.data instanceof File
              ? file.data
              : new File([file.data!], file.fileName, { type: file.type });
          formDataToSend.append("files", fileToUpload);
        }
      });

      const response = await updateEUAIActAnswerById({
        answerId: questionProp.answer_id,
        body: formDataToSend,
      });

      if (response.status === 202) {
        // Attach pending files after successful save
        if (pendingAttachFiles.length > 0 && questionProp?.answer_id) {
          try {
            const fileIds = pendingAttachFiles.map((f) => parseInt(f.id));
            await attachFilesToEntity({
              file_ids: fileIds,
              framework_type: "eu_ai_act",
              entity_type: "assessment",
              entity_id: questionProp.answer_id,
              project_id: currentProjectId,
              link_type: "evidence",
            });
          } catch (attachError) {
            console.error("Failed to attach files:", attachError);
          }
        }

        handleAlertCall({
          variant: "success",
          body: "Question updated successfully",
        });

        // Refresh data from API to get updated evidence files
        await refreshData();

        // Reset pending states
        resetPendingState();

        onSaveSuccess?.(
          true,
          "Question updated successfully",
          questionProp.question_id
        );
      } else {
        throw new Error(response.data?.message || "Failed to update question");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An error occurred";
      handleAlertCall({
        variant: "error",
        body: errorMessage,
      });
      onSaveSuccess?.(false, errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // ========================================================================
  // RENDER - LOADING STATE
  // ========================================================================

  const displayQuestion = fetchedQuestion || questionProp;

  if (isLoading && !displayQuestion) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        sx={{
          width: 850,
          margin: 0,
          "& .MuiDrawer-paper": {
            margin: 0,
            borderRadius: 0,
          },
        }}
        anchor="right"
      >
        <Stack
          sx={{
            width: 850,
            height: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Loading question data...</Typography>
        </Stack>
      </Drawer>
    );
  }

  // ========================================================================
  // RENDER - MAIN
  // ========================================================================

  return (
    <>
      <Drawer
        className="eu-ai-act-question-drawer-dialog"
        open={open}
        onClose={onClose}
        sx={{
          width: 850,
          margin: 0,
          "& .MuiDrawer-paper": {
            width: 850,
            margin: 0,
            borderRadius: 0,
            overflowX: "hidden",
          },
        }}
        anchor="right"
      >
        <Stack
          className="eu-ai-act-question-drawer-dialog-content"
          sx={{ width: 850, minHeight: "100vh" }}
        >
          {/* HEADER */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            padding="15px 20px"
          >
            <Typography fontSize={15} fontWeight={700}>
              {subtopic?.title}
            </Typography>
            <Button
              onClick={onClose}
              sx={{
                minWidth: "0",
                padding: "5px",
              }}
            >
              <CloseIcon size={20} color={theme.palette.other.icon} />
            </Button>
          </Stack>

          <Divider />

          {/* TAB NAVIGATION */}
          <TabContext value={activeTab}>
            <Box sx={{ padding: "0 20px" }}>
              <TabBar
                tabs={tabs}
                activeTab={activeTab}
                onChange={handleTabChange}
              />
            </Box>

            {/* ================================================================ */}
            {/* DETAILS TAB */}
            {/* ================================================================ */}

            <TabPanel
              value="details"
              sx={{ padding: "15px 20px", gap: "15px" }}
            >
              <Stack gap="15px">
                {/* Question Panel */}
                {displayQuestion?.question && (
                  <Stack
                    sx={{
                      border: "1px solid #eee",
                      padding: "12px",
                      backgroundColor: "background.accent",
                      borderRadius: "4px",
                    }}
                  >
                    <Typography fontSize={13} sx={{ marginBottom: "8px" }}>
                      <strong>Question:</strong>
                    </Typography>
                    <Typography fontSize={13} color="text.secondary">
                      {displayQuestion.question}
                    </Typography>
                  </Stack>
                )}

                {/* Hint Panel */}
                {displayQuestion?.hint && (
                  <Stack
                    sx={{
                      border: "1px solid #d5e8d5",
                      padding: "12px",
                      backgroundColor: "#f5fef5",
                      borderRadius: "4px",
                    }}
                  >
                    <Typography
                      fontSize={13}
                      sx={{ marginBottom: "8px", fontWeight: 600 }}
                    >
                      Hint:
                    </Typography>
                    <Typography fontSize={13} color="#666">
                      {displayQuestion.hint}
                    </Typography>
                  </Stack>
                )}

                {/* Priority & Required Badges */}
                <Stack direction="row" gap={1} alignItems="center">
                  {displayQuestion?.priority_level &&
                    (() => {
                      const priorityColors = getPriorityColors(
                        displayQuestion.priority_level
                      );
                      // Create gradient colors (very slightly darker at bottom)
                      const gradientTop = priorityColors.bg;
                      const gradientBottom = darkenColor(priorityColors.bg, 3);
                      // Create border color (very slightly darker than background)
                      const borderColor = darkenColor(priorityColors.bg, 6);

                      return (
                        <Box
                          key="priority-chip"
                          component="span"
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: 24,
                            padding: "4px 12px",
                            borderRadius: "4px",
                            background: `linear-gradient(180deg, ${gradientTop} 0%, ${gradientBottom} 100%)`,
                            border: `1px solid ${borderColor}`,
                            color: priorityColors.text,
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: "capitalize",
                            whiteSpace: "nowrap",
                            lineHeight: 1,
                            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                          }}
                        >
                          {displayQuestion.priority_level}
                        </Box>
                      );
                    })()}
                  {displayQuestion?.is_required && (
                    <Box
                      key="required-chip"
                      component="span"
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: 24,
                        padding: "4px 12px",
                        borderRadius: "4px",
                        background:
                          "linear-gradient(180deg, #E6F4EA 0%, #D4E8DB 100%)",
                        border: "1px solid #B8DCC5",
                        color: "primary.main",
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        lineHeight: 1,
                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                      }}
                    >
                      Required
                    </Box>
                  )}
                </Stack>

                {/* Answer Field */}
                <Stack>
                  <Typography fontSize={13} sx={{ marginBottom: "5px" }}>
                    Answer:
                  </Typography>
                  <RichTextEditor
                    toolbar="full"
                    key={`answer-editor-${displayQuestion?.answer_id}-${editorKey}`}
                    onContentChange={handleAnswerChange}
                    initialContent={formData.answer}
                    isEditable={!isEditingDisabled}
                    headerSx={{
                      borderRadius: "4px 4px 0 0",
                      borderTop: `1px solid ${theme.palette.border.dark}`,
                      borderColor: "border.dark",
                    }}
                    bodySx={{
                      borderColor: "border.dark",
                      borderRadius: "0 0 4px 4px",
                      "& .ProseMirror > p": {
                        margin: 0,
                      },
                    }}
                  />
                </Stack>
              </Stack>

              {/* Status */}
              <Stack gap="24px" sx={{ mt: "8px" }}>
                <Select
                  id="status"
                  label="Status:"
                  value={formData.status}
                  onChange={handleSelectChange("status")}
                  items={EUAIACT_STATUS_OPTIONS.map((option) => ({
                    _id: option.id,
                    name: option.name,
                  }))}
                  sx={inputStyles}
                  placeholder="Select status"
                  disabled={isEditingDisabled}
                  getOptionValue={(item) => String(item._id)}
                />
              </Stack>
            </TabPanel>

            {/* ================================================================ */}
            {/* EVIDENCE TAB */}
            {/* ================================================================ */}

            <TabPanel value="evidence" sx={{ padding: "15px 20px" }}>
              <Stack spacing={3}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Evidence files
                </Typography>
                <Typography variant="body2" color="text.tertiary">
                  Upload evidence files to document compliance with this
                  question.
                </Typography>

                {/* File Input Button */}
                <Box>
                  <input
                    type="file"
                    multiple
                    accept={ACCEPTED_FILE_TYPES}
                    style={{ display: "none" }}
                    id="evidence-file-input"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) {
                        handleAddFiles(files);
                      }
                      e.target.value = "";
                    }}
                  />
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Button
                      variant="contained"
                      component="label"
                      htmlFor="evidence-file-input"
                      disabled={isEditingDisabled}
                      sx={{
                        borderRadius: 2,
                        width: 155,
                        height: 25,
                        fontSize: 11,
                        border: `1px solid ${theme.palette.border.dark}`,
                        backgroundColor: "background.main",
                        color: "text.secondary",
                        "&:hover": {
                          backgroundColor: "background.accent",
                          border: `1px solid ${theme.palette.border.dark}`,
                        },
                      }}
                    >
                      Upload new files
                    </Button>
                    <Button
                      variant="contained"
                      onClick={() => setShowFilePicker(true)}
                      disabled={isEditingDisabled}
                      sx={{
                        borderRadius: 2,
                        width: 165,
                        height: 25,
                        fontSize: 11,
                        border: "1px solid #4C7BF4",
                        backgroundColor: "#4C7BF4",
                        color: "white",
                        "&:hover": {
                          backgroundColor: "#3D62C3",
                          border: "1px solid #3D62C3",
                        },
                      }}
                    >
                      Attach existing files
                    </Button>

                    <Stack direction="row" spacing={2}>
                      <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                        {`${evidenceFiles.length} files attached`}
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
                      {deletedFiles.length > 0 && (
                        <Typography sx={{ fontSize: 11, color: "status.error.main" }}>
                          {`-${deletedFiles.length} pending delete`}
                        </Typography>
                      )}
                    </Stack>
                  </Stack>
                </Box>

                {/* Existing Evidence Files */}
                {evidenceFiles.length > 0 && (
                  <Stack spacing={1}>
                    {evidenceFiles
                      .filter(
                        (file) =>
                          !deletedFiles.includes(parseInt(file.id.toString()))
                      )
                      .map((file) => (
                        <Box
                          key={file.id}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 12px",
                            border: `1px solid ${theme.palette.border.light}`,
                            borderRadius: "4px",
                            backgroundColor: "background.main",
                            "&:hover": {
                              backgroundColor: "background.accent",
                            },
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              gap: 1.5,
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
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
                              {file.source && (
                                <Typography
                                  sx={{
                                    fontSize: 11,
                                    color: "status.default.text",
                                    mt: 0.25,
                                  }}
                                >
                                  Source: {file.source}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                          <Box
                            sx={{
                              display: "flex",
                              gap: 0.5,
                              flexShrink: 0,
                              marginLeft: 1,
                            }}
                          >
                            <Tooltip title="Download file">
                              <IconButton
                                size="small"
                                onClick={() =>
                                  handleDownloadFile(
                                    file.id.toString(),
                                    file.fileName
                                  )
                                }
                                sx={{
                                  color: "text.tertiary",
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
                                onClick={() =>
                                  handleDeleteEvidenceFile(file.id.toString())
                                }
                                disabled={isEditingDisabled}
                                sx={{
                                  color: "text.tertiary",
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

                {/* Upload Queue Files */}
                {uploadFiles.length > 0 && (
                  <Stack spacing={1}>
                    <Typography
                      sx={{ fontSize: 12, fontWeight: 600, color: "#92400E" }}
                    >
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
                        <Box
                          sx={{
                            display: "flex",
                            gap: 1.5,
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
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
                          </Box>
                        </Box>
                        <Box
                          sx={{
                            flexShrink: 0,
                            marginLeft: 1,
                          }}
                        >
                          <Tooltip title="Remove from queue">
                            <IconButton
                              size="small"
                              onClick={() =>
                                handleDeleteUploadFile(file.id.toString())
                              }
                              sx={{
                                color: "#92400E",
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

                {/* Pending Attach Files */}
                {pendingAttachFiles.length > 0 && (
                  <Stack spacing={1}>
                    <Typography
                      sx={{ fontSize: 12, fontWeight: 600, color: "#4C7BF4" }}
                    >
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
                        <Box
                          sx={{
                            display: "flex",
                            gap: 1.5,
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
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
                        <Box
                          sx={{
                            flexShrink: 0,
                            marginLeft: 1,
                          }}
                        >
                          <Tooltip title="Remove from queue">
                            <IconButton
                              size="small"
                              onClick={() => handleRemovePendingAttach(file.id)}
                              sx={{
                                color: "#4C7BF4",
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
                      </Box>
                    ))}
                  </Stack>
                )}

                {/* Empty State */}
                {evidenceFiles.length === 0 && uploadFiles.length === 0 && pendingAttachFiles.length === 0 && (
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
                      Click "Add evidence files" to upload documentation for
                      this question
                    </Typography>
                  </Box>
                )}
              </Stack>
            </TabPanel>

            {/* ================================================================ */}
            {/* CROSS MAPPINGS TAB (RISKS) */}
            {/* ================================================================ */}

            <TabPanel value="cross-mappings" sx={{ padding: "15px 20px" }}>
              <Stack spacing={3}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Linked risks
                </Typography>
                <Typography variant="body2" color="text.tertiary">
                  Link risks from your risk database to track which risks are
                  addressed by this question.
                </Typography>

                {/* Add/Remove Button */}
                <Stack direction="row" spacing={2} alignItems="center">
                  <Button
                    variant="contained"
                    onClick={() => setIsLinkedRisksModalOpen(true)}
                    disabled={isEditingDisabled}
                    sx={{
                      borderRadius: 2,
                      width: 155,
                      height: 25,
                      fontSize: 11,
                      border: `1px solid ${theme.palette.border.dark}`,
                      backgroundColor: "background.main",
                      color: "text.secondary",
                      "&:hover": {
                        backgroundColor: "background.accent",
                        border: `1px solid ${theme.palette.border.dark}`,
                      },
                    }}
                  >
                    Add/remove risks
                  </Button>

                  <Stack direction="row" spacing={2}>
                    <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                      {`${currentRisks.length || 0} risks linked`}
                    </Typography>
                    {selectedRisks.length > 0 && (
                      <Typography sx={{ fontSize: 11, color: "primary.main" }}>
                        {`+${selectedRisks.length} pending save`}
                      </Typography>
                    )}
                    {deletedRisks.length > 0 && (
                      <Typography sx={{ fontSize: 11, color: "status.error.main" }}>
                        {`-${deletedRisks.length} pending delete`}
                      </Typography>
                    )}
                  </Stack>
                </Stack>

                {/* Linked Risks List */}
                {linkedRiskObjects.length > 0 && (
                  <Stack spacing={1}>
                    {linkedRiskObjects
                      .filter((risk) => !deletedRisks.includes(risk.id))
                      .map((risk) => (
                        <Box
                          key={risk.id}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 12px",
                            border: `1px solid ${theme.palette.border.light}`,
                            borderRadius: "4px",
                            backgroundColor: "background.main",
                            "&:hover": {
                              backgroundColor: "background.accent",
                            },
                          }}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
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
                              {risk.risk_name}
                            </Typography>
                            {risk.risk_level && (
                              <Typography
                                sx={{ fontSize: 11, color: "text.tertiary" }}
                              >
                                Risk level: {risk.risk_level}
                              </Typography>
                            )}
                          </Box>

                          <Box sx={{ display: "flex", gap: 0.5 }}>
                            <Tooltip title="View details">
                              <IconButton
                                size="small"
                                onClick={() => handleViewRiskDetails(risk)}
                                sx={{
                                  color: "text.tertiary",
                                  "&:hover": {
                                    color: "primary.main",
                                    backgroundColor: "rgba(19, 113, 91, 0.08)",
                                  },
                                }}
                              >
                                <ViewIcon size={16} />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title="Unlink risk">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setDeletedRisks((prev) => [...prev, risk.id]);
                                  handleAlertCall({
                                    variant: "info",
                                    body: "Risk marked for removal. Save to apply changes.",
                                  });
                                }}
                                disabled={isEditingDisabled}
                                sx={{
                                  color: "text.tertiary",
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

                {/* Empty State */}
                {currentRisks.length === 0 && selectedRisks.length === 0 && (
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
                      No risks linked yet
                    </Typography>
                    <Typography variant="caption" color={text.disabled}>
                      Click "Add/remove risks" to link risks from your risk
                      database
                    </Typography>
                  </Box>
                )}

                {/* LinkedRisks Modal */}
                {isLinkedRisksModalOpen && (
                  <Suspense fallback={"Loading..."}>
                    <LinkedRisksPopup
                      onClose={() => setIsLinkedRisksModalOpen(false)}
                      currentRisks={currentRisks
                        .concat(selectedRisks)
                        .filter((risk) => !deletedRisks.includes(risk))}
                      setSelectecRisks={setSelectedRisks}
                      _setDeletedRisks={setDeletedRisks}
                      frameworkId={1}
                    />
                  </Suspense>
                )}
              </Stack>
            </TabPanel>

            {/* ================================================================ */}
            {/* NOTES TAB (LAZY-LOADED) */}
            {/* ================================================================ */}

            <TabPanel value="notes" sx={{ padding: "15px 20px" }}>
              <Suspense fallback={<CircularProgress />}>
                {displayQuestion?.question_id && (
                  <NotesTab
                    key={`eu-ai-act-question-${displayQuestion.question_id}`}
                    attachedTo="EU_AI_ACT_QUESTION"
                    attachedToId={displayQuestion.question_id.toString()}
                  />
                )}
              </Suspense>
            </TabPanel>
          </TabContext>

          {/* FOOTER - SAVE BUTTON */}
          <Stack
            className="eu-ai-act-question-drawer-dialog-footer"
            sx={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "flex-end",
              padding: "15px 20px",
              marginTop: "auto",
            }}
          >
            <CustomizableButton
              variant="contained"
              text={isLoading ? "Saving..." : "Save"}
              sx={{
                backgroundColor: "primary.main",
                border: `1px solid ${theme.palette.primary.main}`,
                gap: 2,
                minWidth: "120px",
                height: "36px",
              }}
              onClick={handleSave}
              icon={<SaveIcon size={16} />}
              isDisabled={isEditingDisabled || isLoading}
            />
          </Stack>
        </Stack>
      </Drawer>

      {/* Risk Detail Modal */}
      <StandardModal
        isOpen={isRiskDetailModalOpen && !!riskFormData}
        onClose={handleRiskDetailModalClose}
        title={`Risk: ${selectedRiskForView?.risk_name || "Risk Details"}`}
        description="View and edit risk details"
        onSubmit={() => onRiskSubmitRef.current?.()}
        submitButtonText="Update"
        maxWidth="1039px"
      >
        <Suspense fallback={<CircularProgress />}>
          <AddNewRiskForm
            closePopup={handleRiskDetailModalClose}
            popupStatus="edit"
            initialRiskValues={riskFormData}
            onSuccess={handleRiskUpdateSuccess}
            onError={(error) => {
              handleAlertCall({
                variant: "error",
                body: error || "Failed to update risk",
              });
            }}
            users={users}
            onSubmitRef={onRiskSubmitRef}
          />
        </Suspense>
      </StandardModal>

      {/* ALERT */}
      {alert && (
        <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />
      )}

      {/* File Picker Modal for attaching existing files */}
      <FilePickerModal
        open={showFilePicker}
        onClose={() => setShowFilePicker(false)}
        onSelect={handleAttachExistingFiles}
        excludeFileIds={[...evidenceFiles.map((f) => f.id), ...pendingAttachFiles.map((f) => f.id)]}
        multiSelect={true}
        title="Attach Existing Files as Evidence"
      />
    </>
  );
};

export default EUAIActQuestionDrawerDialog;
