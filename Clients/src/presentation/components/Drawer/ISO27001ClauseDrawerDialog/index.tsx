import {
  Button,
  Divider,
  Drawer,
  Stack,
  Typography,
  CircularProgress,
  SelectChangeEvent,
  Dialog,
  useTheme,
  Box,
  IconButton,
  Tooltip,
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
import Field from "../../Inputs/Field";
import RichTextEditor from "../../RichTextEditor";
import { FileData } from "../../../../domain/types/File";
import Select from "../../Inputs/Select";
import DatePicker from "../../Inputs/Datepicker";
import { Dayjs } from "dayjs";
import { useState, useEffect, Suspense, lazy, useRef } from "react";
import { CustomizableButton } from "../../button/customizable-button";
import TabBar from "../../TabBar";
import { text } from "../../../themes/palette";
const NotesTab = lazy(() => import("../../Notes/NotesTab"));
const AddNewRiskForm = lazy(() => import("../../AddNewRiskForm"));
import { useAuth } from "../../../../application/hooks/useAuth";
import useUsers from "../../../../application/hooks/useUsers";
import { User } from "../../../../domain/types/User";
import Alert from "../../Alert";
import { AlertProps } from "../../../types/alert.types";
import {
  updateEntityById,
  getEntityById,
} from "../../../../application/repository/entity.repository";
import { getFileById, attachFilesToEntity, getEntityFiles } from "../../../../application/repository/file.repository";
import StandardModal from "../../Modals/StandardModal";
import allowedRoles from "../../../../application/constants/permissions";
import { FilePickerModal } from "../../FilePickerModal";
import AuditRiskPopup from "../../RiskPopup/AuditRiskPopup";
const LinkedRisksPopup = lazy(() => import("../../LinkedRisks").then(m => ({ default: m.LinkedRisksPopup })));
import { ISO27001GetSubClauseById } from "../../../../application/repository/subClause_iso.repository";
import { RiskFormValues } from "../../../../domain/types/riskForm.types";

export const inputStyles = {
  minWidth: 200,
  maxWidth: "100%",
  flexGrow: 1,
  height: 34,
};

interface ISO27001SubClauseData {
  id?: number;
  title?: string;
  status?: string;
  implementation_description?: string;
  owner?: number;
  reviewer?: number;
  approver?: number;
  due_date?: string;
  auditor_feedback?: string;
  evidence_links?: FileData[];
  risks?: number[];
  requirement_summary?: string;
  key_questions?: string[];
  evidence_examples?: string[];
}

interface ISO27001ClauseRef {
  id?: number;
  title?: string;
  order_no?: number;
  clause_no?: number;
}

interface LinkedRiskObject {
  id: number;
  risk_name: string;
  risk_level?: string;
}

interface VWISO27001ClauseDrawerDialogProps {
  open: boolean;
  onClose: (event?: React.SyntheticEvent | Record<string, never>, reason?: string) => void;
  subClause: ISO27001SubClauseData;
  clause: ISO27001ClauseRef;
  evidenceFiles?: FileData[];
  uploadFiles?: FileData[];
  projectFrameworkId: number;
  onSaveSuccess?: (success: boolean, message?: string) => void;
  index: number;
  project_id: number;
}

const VWISO27001ClauseDrawerDialog = ({
  open,
  onClose,
  subClause,
  clause,
  projectFrameworkId,
  onSaveSuccess,
  index,
  project_id,
}: VWISO27001ClauseDrawerDialogProps) => {
  const { userId, userRoleName } = useAuth();
  const { users } = useUsers();

  // ========================================================================
  // STATE - UI & LOADING
  // ========================================================================

  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [projectMembers, setProjectMembers] = useState<User[]>([]);
  const theme = useTheme();

  // ========================================================================
  // STATE - FORM DATA
  // ========================================================================

  const [fetchedSubClause, setFetchedSubClause] = useState<ISO27001SubClauseData | null>(null);
  const [formData, setFormData] = useState({
    implementation_description: "",
    status: "",
    owner: "",
    reviewer: "",
    approver: "",
    auditor_feedback: "",
    risks: [] as number[],
  });
  const [date, setDate] = useState<Dayjs | null>(null);

  // ========================================================================
  // STATE - EVIDENCE FILES
  // ========================================================================

  const [evidenceFiles, setEvidenceFiles] = useState<FileData[]>([]);
  const [uploadFiles, setUploadFiles] = useState<FileData[]>([]);
  const [pendingAttachFiles, setPendingAttachFiles] = useState<FileData[]>([]);
  const [deletedFilesIds, setDeletedFilesIds] = useState<number[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);

  // ========================================================================
  // STATE - RISKS
  // ========================================================================

  const [currentRisks, setCurrentRisks] = useState<number[]>([]);
  const [linkedRiskObjects, setLinkedRiskObjects] = useState<LinkedRiskObject[]>([]);
  const [selectedRisks, setSelectedRisks] = useState<number[]>([]);
  const [deletedRisks, setDeletedRisks] = useState<number[]>([]);
  const [isLinkedRisksModalOpen, setIsLinkedRisksModalOpen] = useState(false);

  // Risk detail modal state
  const [isRiskDetailModalOpen, setIsRiskDetailModalOpen] = useState(false);
  const [selectedRiskForView, setSelectedRiskForView] = useState<LinkedRiskObject | null>(
    null
  );
  const [riskFormData, setRiskFormData] = useState<RiskFormValues | undefined>(undefined);
  const onRiskSubmitRef = useRef<(() => void) | null>(null);

  // Audit status modal
  const [auditedStatusModalOpen, setAuditedStatusModalOpen] =
    useState<boolean>(false);

  // ========================================================================
  // PERMISSIONS
  // ========================================================================

  const isEditingDisabled =
    !allowedRoles.frameworks.edit.includes(userRoleName);
  const isAuditingDisabled =
    !allowedRoles.frameworks.audit.includes(userRoleName);

  // ========================================================================
  // TAB CONFIGURATION
  // ========================================================================

  const tabs = [
    { label: "Details", value: "details", icon: "FileText" as const },
    { label: "Evidence", value: "evidence", icon: "FolderOpen" as const },
    { label: "Cross mappings", value: "cross-mappings", icon: "Link" as const },
    { label: "Notes", value: "notes", icon: "MessageSquare" as const },
  ];

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  };

  // ========================================================================
  // STATUS MAPPING
  // ========================================================================

  const statusIdMap = new Map([
    ["Not started", "0"],
    ["Draft", "1"],
    ["In progress", "2"],
    ["Awaiting review", "3"],
    ["Awaiting approval", "4"],
    ["Implemented", "5"],
    ["Needs rework", "6"],
  ]);
  const idStatusMap = new Map();
  for (const [status, id] of statusIdMap.entries()) {
    idStatusMap.set(id, status);
  }

  // ========================================================================
  // EFFECTS - INITIALIZATION
  // ========================================================================

  useEffect(() => {
    if (users?.length > 0) {
      setProjectMembers(users);
    }
  }, [users]);

  // Fetch clause data when drawer opens
  useEffect(() => {
    if (open && subClause?.id) {
      fetchSubClauseData();
      fetchLinkedRisks();
    }
  }, [open, subClause?.id, projectFrameworkId]);

  // Initialize risk state from formData
  useEffect(() => {
    if (formData.risks && formData.risks.length > 0) {
      setCurrentRisks(formData.risks);
    } else {
      setCurrentRisks([]);
    }
  }, [formData.risks]);

  // Fetch linked risk objects when risks change
  useEffect(() => {
    if (open && fetchedSubClause?.id) {
      fetchLinkedRisks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fetchedSubClause?.id, formData.risks, selectedRisks, deletedRisks]);

  // ========================================================================
  // DATA FETCHING
  // ========================================================================

  const fetchSubClauseData = async () => {
    if (!subClause?.id) return;
    setIsLoading(true);
    try {
      const response = await ISO27001GetSubClauseById({
        routeUrl: `/iso-27001/subClause/byId/${subClause.id}?projectFrameworkId=${projectFrameworkId}`,
      });

      const subClauseData = response.data;
      setFetchedSubClause(subClauseData);

      if (subClauseData) {
        const statusId = statusIdMap.get(subClauseData.status) || "0";
        setFormData({
          implementation_description:
            subClauseData.implementation_description || "",
          status: statusId,
          owner: subClauseData.owner?.toString() || "",
          reviewer: subClauseData.reviewer?.toString() || "",
          approver: subClauseData.approver?.toString() || "",
          auditor_feedback: subClauseData.auditor_feedback || "",
          risks: subClauseData.risks || [],
        });

        if (subClauseData.due_date) {
          setDate(subClauseData.due_date);
        } else {
          setDate(null);
        }

        // Load evidence files from both sources
        const allEvidenceFiles = await loadEvidenceFiles(
          subClauseData.evidence_links,
          subClauseData.id
        );
        setEvidenceFiles(allEvidenceFiles);
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching subclause:", error);
      }
      handleAlert({
        variant: "error",
        body: "Failed to load clause data",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLinkedRisks = async (riskIds?: number[]) => {
    if (!fetchedSubClause?.id) return;

    // Use provided riskIds or fall back to formData.risks + selectedRisks
    const allRiskIds = riskIds
      ? riskIds
      : [...(formData.risks || []), ...selectedRisks].filter(
          (id) => !deletedRisks.includes(id)
        );

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

  /**
   * Load evidence files from both sources:
   * 1. evidence_links from entity response (legacy)
   * 2. file_entity_links table (new framework-agnostic approach)
   * Merges and deduplicates by file ID
   */
  const loadEvidenceFiles = async (evidenceLinks: FileData[] | null | undefined, subclauseId: number) => {
    // Normalize evidence_links files
    const normalizedLinks: FileData[] = Array.isArray(evidenceLinks)
      ? evidenceLinks.map((file: any) => ({
          id: file.id?.toString() || "",
          fileName: file.fileName || file.filename || file.file_name || "",
          size: file.size || 0,
          type: file.type || "",
          uploadDate: file.uploadDate || file.upload_date || new Date().toISOString(),
          uploader: file.uploader || "Unknown",
          source: file.source || "File Manager",
        }))
      : [];

    // Fetch linked files from file_entity_links table
    let linkedFiles: FileData[] = [];
    if (subclauseId) {
      try {
        const response = await getEntityFiles(
          "iso_27001",
          "subclause",
          subclauseId
        );
        if (response && Array.isArray(response)) {
          linkedFiles = response.map((file: any) => ({
            id: file.id?.toString() || file.file_id?.toString() || "",
            fileName: file.filename || file.fileName || file.file_name || "",
            size: file.size || 0,
            type: file.mimetype || file.type || "",
            uploadDate: file.upload_date || file.uploadDate || new Date().toISOString(),
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
    normalizedLinks.forEach((file) => {
      if (file.id) fileMap.set(file.id, file);
    });
    linkedFiles.forEach((file) => {
      if (file.id && !fileMap.has(file.id)) {
        fileMap.set(file.id, file);
      }
    });

    return Array.from(fileMap.values());
  };

  // ========================================================================
  // EVENT HANDLERS - FORM CHANGES
  // ========================================================================
  const handleFieldChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSelectChange =
    (field: string) => (event: SelectChangeEvent<string | number>) => {
      const value = event.target.value.toString();
      if (
        field === "status" &&
        value === "6" &&
        (selectedRisks.length > 0 ||
          formData.risks.length > 0 ||
          (formData.risks.length > 0 &&
            deletedRisks.length === formData.risks.length))
      ) {
        setAuditedStatusModalOpen(true);
      }
      handleFieldChange(field, value);
    };

  // ========================================================================
  // EVENT HANDLERS - ALERTS
  // ========================================================================

  const handleAlert = ({
    variant,
    body,
  }: {
    variant: "success" | "error" | "warning" | "info";
    body: string;
  }) => {
    setAlert({ variant, body });
    setTimeout(() => setAlert(null), 3000);
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
    handleAlert({
      variant: "info",
      body: `${files.length} file(s) added. Save to apply changes.`,
    });
  };

  const handleAttachExistingFiles = (selectedFiles: FileData[]) => {
    if (selectedFiles.length === 0) return;

    // Add to pending attach queue (will be attached on Save)
    setPendingAttachFiles((prev) => [...prev, ...selectedFiles]);
    handleAlert({
      variant: "info",
      body: `${selectedFiles.length} file(s) added to attach queue. Save to apply changes.`,
    });
  };

  const handleRemovePendingAttach = (fileId: string) => {
    setPendingAttachFiles((prev) => prev.filter((f) => f.id !== fileId));
    handleAlert({
      variant: "info",
      body: "File removed from attach queue.",
    });
  };

  const handleDeleteEvidenceFile = (fileId: string) => {
    const fileIdNumber = parseInt(fileId);
    if (isNaN(fileIdNumber)) {
      handleAlert({
        variant: "error",
        body: "Invalid file ID",
      });
      return;
    }
    setEvidenceFiles((prev) => prev.filter((f) => f.id.toString() !== fileId));
    setDeletedFilesIds((prev) => [...prev, fileIdNumber]);
    handleAlert({
      variant: "info",
      body: "File marked for deletion. Save to apply changes.",
    });
  };

  const handleDeleteUploadFile = (fileId: string) => {
    setUploadFiles((prev) => prev.filter((f) => f.id !== fileId));
    handleAlert({
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

      handleAlert({
        variant: "success",
        body: "File downloaded successfully",
      });
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error downloading file:", error);
      }
      handleAlert({
        variant: "error",
        body: "Failed to download file. Please try again.",
      });
    }
  };

  // ========================================================================
  // EVENT HANDLERS - RISK MANAGEMENT
  // ========================================================================

  const handleViewRiskDetails = async (risk: LinkedRiskObject) => {
    setSelectedRiskForView(risk);
    try {
      const response = await getEntityById({
        routeUrl: `/projectRisks/${risk.id}`,
      });
      if (response.data) {
        const riskData = response.data;
        setRiskFormData({
          riskName: riskData.risk_name || "",
          actionOwner: riskData.action_owner || 0,
          aiLifecyclePhase: riskData.ai_lifecycle_phase || 0,
          riskDescription: riskData.risk_description || "",
          riskCategory: riskData.risk_category || [1],
          potentialImpact: riskData.potential_impact || "",
          assessmentMapping: riskData.assessment_mapping || 0,
          controlsMapping: riskData.controls_mapping || 0,
          likelihood: riskData.likelihood || 1,
          riskSeverity: riskData.risk_severity || 1,
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
      handleAlert({
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
    handleAlert({
      variant: "success",
      body: "Risk updated successfully",
    });
    // Refresh linked risks after update
    if (fetchedSubClause?.id) {
      fetchLinkedRisks();
    }
  };

  // ========================================================================
  // HELPERS
  // ========================================================================

  const refreshData = async () => {
    if (!fetchedSubClause?.id) return;
    try {
      // Refresh full subclause data (including updated risks)
      const response = await ISO27001GetSubClauseById({
        routeUrl: `/iso-27001/subClause/byId/${fetchedSubClause.id}?projectFrameworkId=${projectFrameworkId}`,
      });

      if (response.data) {
        const subClauseData = response.data;
        const updatedRiskIds = subClauseData.risks || [];

        // Update evidence files from both sources
        const allEvidenceFiles = await loadEvidenceFiles(
          subClauseData.evidence_links,
          subClauseData.id
        );
        setEvidenceFiles(allEvidenceFiles);

        // Update formData with the latest risks from backend
        setFormData((prev) => ({
          ...prev,
          risks: updatedRiskIds,
        }));

        // Update fetchedSubClause with latest data
        setFetchedSubClause(subClauseData);

        // Update currentRisks to reflect the saved risks
        setCurrentRisks(updatedRiskIds);

        // Clear pending risk selections since they're now saved in formData.risks
        setSelectedRisks([]);
        setDeletedRisks([]);

        // Refresh linked risks using the updated risk IDs directly (avoid state timing issues)
        await fetchLinkedRisks(updatedRiskIds);
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
    setDeletedFilesIds([]);
    setSelectedRisks([]);
    setDeletedRisks([]);
  };

  // ========================================================================
  // EVENT HANDLERS - SAVE
  // ========================================================================

  const handleSave = async () => {
    if (!fetchedSubClause?.id) {
      handleAlert({
        variant: "error",
        body: "No clause selected for update",
      });
      return;
    }
    setIsLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append(
        "implementation_description",
        formData.implementation_description
      );
      formDataToSend.append(
        "status",
        idStatusMap.get(formData.status) || "Not started"
      );
      formDataToSend.append("owner", formData.owner);
      formDataToSend.append("reviewer", formData.reviewer);
      formDataToSend.append("approver", formData.approver);
      formDataToSend.append("auditor_feedback", formData.auditor_feedback);
      if (date) formDataToSend.append("due_date", date.toString());
      formDataToSend.append("user_id", userId?.toString() || "1");
      formDataToSend.append("delete", JSON.stringify(deletedFilesIds));
      formDataToSend.append("risksMitigated", JSON.stringify(selectedRisks));
      formDataToSend.append("risksDelete", JSON.stringify(deletedRisks));
      formDataToSend.append("project_id", project_id.toString());

      uploadFiles.forEach((file) => {
        if (file.data instanceof Blob) {
          const fileToUpload =
            file.data instanceof File
              ? file.data
              : new File([file.data!], file.fileName, {
                  type: file.type,
                });
          formDataToSend.append("files", fileToUpload);
        }
      });
      const response = await updateEntityById({
        routeUrl: `/iso-27001/saveClauses/${fetchedSubClause.id}`,
        body: formDataToSend,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.status === 200) {
        // Attach pending files after successful save
        if (pendingAttachFiles.length > 0 && subClause?.id) {
          try {
            const fileIds = pendingAttachFiles.map((f) => parseInt(f.id));
            await attachFilesToEntity({
              file_ids: fileIds,
              framework_type: "iso_27001",
              entity_type: "subclause",
              entity_id: subClause.id,
              project_id: project_id,
              link_type: "evidence",
            });
          } catch (attachError) {
            console.error("Failed to attach files:", attachError);
          }
        }

        handleAlert({
          variant: "success",
          body: "Clause updated successfully",
        });

        // Refresh data from API
        await refreshData();

        // Reset pending states
        resetPendingState();

        onSaveSuccess?.(true, "Clause saved successfully");
      } else {
        throw new Error(response.data?.message || "Failed to save clause");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An error occurred";
      handleAlert({
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

  const displayData = fetchedSubClause || subClause;
  if (isLoading) {
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
          <Typography sx={{ mt: 2 }}>Loading subclause data...</Typography>
        </Stack>
      </Drawer>
    );
  }

  return (
    <>
      <Drawer
        className="vw-iso-27001-clause-drawer-dialog"
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
          className="vw-iso-27001-clause-drawer-dialog-content"
          sx={{
            width: 850,
          }}
        >
          <Stack
            sx={{
              width: 850,
              padding: "15px 20px",
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography fontSize={15} fontWeight={700}>
              {clause?.order_no + "." + (index + 1)} {displayData?.title}
            </Typography>
            <CloseIcon
              size={20}
              onClick={onClose}
              style={{ cursor: "pointer" }}
            />
          </Stack>
          <Divider />
          <TabContext value={activeTab}>
            <Box sx={{ padding: "0 20px" }}>
              <TabBar
                tabs={tabs}
                activeTab={activeTab}
                onChange={handleTabChange}
              />
            </Box>

            <TabPanel
              value="details"
              sx={{ padding: "15px 20px", gap: "15px" }}
            >
              <Stack gap="15px">
                {/* Requirement Summary Panel */}
                {displayData?.requirement_summary && (
                  <Stack
                    sx={{
                      border: "1px solid #eee",
                      padding: "12px",
                      backgroundColor: "background.accent",
                      borderRadius: "4px",
                    }}
                  >
                    <Typography fontSize={13} sx={{ marginBottom: "8px" }}>
                      <strong>Requirement Summary:</strong>
                    </Typography>
                    <Typography fontSize={13} color="#666">
                      {displayData.requirement_summary}
                    </Typography>
                  </Stack>
                )}

                {/* Key Questions Panel */}
                {displayData?.key_questions &&
                  displayData.key_questions.length > 0 && (
                    <Stack
                      sx={{
                        border: "1px solid #e8d5d5",
                        padding: "12px",
                        backgroundColor: "#fef5f5",
                        borderRadius: "4px",
                      }}
                    >
                      <Typography
                        fontSize={13}
                        sx={{ marginBottom: "8px", fontWeight: 600 }}
                      >
                        Key Questions:
                      </Typography>
                      <Stack spacing={1}>
                        {displayData.key_questions.map(
                          (question: string, idx: number) => (
                            <Typography
                              key={idx}
                              fontSize={12}
                              color="#666"
                              sx={{ pl: 1, position: "relative" }}
                            >
                              • {question}
                            </Typography>
                          )
                        )}
                      </Stack>
                    </Stack>
                  )}

                {/* Evidence Examples Panel */}
                {displayData?.evidence_examples &&
                  displayData.evidence_examples.length > 0 && (
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
                        Evidence Examples:
                      </Typography>
                      <Stack spacing={1}>
                        {displayData.evidence_examples.map(
                          (example: string, idx: number) => (
                            <Typography
                              key={idx}
                              fontSize={12}
                              color="#666"
                              sx={{ pl: 1, position: "relative" }}
                            >
                              • {example}
                            </Typography>
                          )
                        )}
                      </Stack>
                    </Stack>
                  )}

                {/* Implementation Description */}
                <Stack>
                  <Typography fontSize={13} sx={{ marginBottom: "5px" }}>
                    Implementation description:
                  </Typography>
                  <RichTextEditor
                    toolbar="full"
                    initialContent={formData.implementation_description}
                    onContentChange={(content) =>
                      handleFieldChange(
                        "implementation_description",
                        content
                      )
                    }
                    placeholder="Describe how this requirement is implemented..."
                    isEditable={!isEditingDisabled}
                    height="120px"
                  />
                </Stack>
              </Stack>

              <Stack gap={"24px"}>
                <Select
                  id="status"
                  label="Status:"
                  value={formData.status}
                  onChange={handleSelectChange("status")}
                  items={[
                    { _id: "0", name: "Not started" },
                    { _id: "1", name: "Draft" },
                    { _id: "2", name: "In progress" },
                    { _id: "3", name: "Awaiting review" },
                    { _id: "4", name: "Awaiting approval" },
                    { _id: "5", name: "Implemented" },
                    // { _id: "6", name: "Audited" },
                    { _id: "6", name: "Needs rework" },
                  ]}
                  sx={inputStyles}
                  placeholder={"Select status"}
                  disabled={isEditingDisabled}
                />

                <Select
                  id="Owner"
                  label="Owner:"
                  value={formData.owner || ""}
                  onChange={handleSelectChange("owner")}
                  items={projectMembers.map((user) => ({
                    _id: user.id.toString(),
                    name: user.name,
                    email: user.email,
                    surname: user.surname,
                  }))}
                  sx={inputStyles}
                  placeholder={"Select owner"}
                  disabled={isEditingDisabled}
                  getOptionValue={(item) => item._id}
                />

                <Select
                  id="Reviewer"
                  label="Reviewer:"
                  value={formData.reviewer || ""}
                  onChange={handleSelectChange("reviewer")}
                  items={projectMembers.map((user) => ({
                    _id: user.id.toString(),
                    name: user.name,
                    email: user.email,
                    surname: user.surname,
                  }))}
                  sx={inputStyles}
                  placeholder={"Select reviewer"}
                  disabled={isEditingDisabled}
                  getOptionValue={(item) => item._id}
                />

                <Select
                  id="Approver"
                  label="Approver:"
                  value={formData.approver || ""}
                  onChange={handleSelectChange("approver")}
                  items={projectMembers.map((user) => ({
                    _id: user.id.toString(),
                    name: user.name,
                    email: user.email,
                    surname: user.surname,
                  }))}
                  sx={inputStyles}
                  placeholder={"Select approver"}
                  disabled={isEditingDisabled}
                  getOptionValue={(item) => item._id}
                />

                <DatePicker
                  label="Due date:"
                  sx={inputStyles}
                  date={date}
                  handleDateChange={(newDate) => {
                    setDate(newDate);
                  }}
                  disabled={isEditingDisabled}
                />

                <Stack>
                  <Typography fontSize={13} sx={{ marginBottom: "5px" }}>
                    Auditor Feedback:
                  </Typography>
                  <Field
                    type="description"
                    value={formData.auditor_feedback}
                    onChange={(e) =>
                      handleFieldChange("auditor_feedback", e.target.value)
                    }
                    sx={{
                      cursor: "text",
                      "& .field field-decription field-input MuiInputBase-root MuiInputBase-input":
                        {
                          height: "73px",
                        },
                    }}
                    placeholder="Enter any feedback from the internal or external audits..."
                    disabled={isAuditingDisabled}
                  />
                </Stack>
              </Stack>
            </TabPanel>

            {/* Tab 2: Evidence */}
            <TabPanel value="evidence" sx={{ padding: "15px 20px" }}>
              <Stack spacing={3}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Evidence files
                </Typography>
                <Typography variant="body2" color="text.tertiary">
                  Upload evidence files to document compliance with this
                  requirement.
                </Typography>

                {/* File Input */}
                <Box>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                    style={{ display: "none" }}
                    id="evidence-file-input"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) {
                        handleAddFiles(files);
                        e.target.value = "";
                      }
                    }}
                  />
                  <Stack spacing={2}>
                    <Stack direction="row" spacing={1}>
                      <Button
                        variant="contained"
                        onClick={() =>
                          document.getElementById("evidence-file-input")?.click()
                        }
                        disabled={isEditingDisabled}
                        sx={{
                          borderRadius: 2,
                          minWidth: 155,
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
                        disableRipple={
                          theme.components?.MuiButton?.defaultProps?.disableRipple
                        }
                      >
                        Upload new files
                      </Button>
                      <Button
                        variant="contained"
                        onClick={() => setShowFilePicker(true)}
                        disabled={isEditingDisabled}
                        sx={{
                          borderRadius: 2,
                          minWidth: 165,
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
                        disableRipple={
                          theme.components?.MuiButton?.defaultProps?.disableRipple
                        }
                      >
                        Attach existing files
                      </Button>
                    </Stack>

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
                      {deletedFilesIds.length > 0 && (
                        <Typography sx={{ fontSize: 11, color: "status.error.main" }}>
                          {`-${deletedFilesIds.length} pending delete`}
                        </Typography>
                      )}
                    </Stack>
                  </Stack>
                </Box>

                {/* Existing Files List */}
                {evidenceFiles.length > 0 && (
                  <Stack spacing={1}>
                    {evidenceFiles
                      .filter(
                        (file) =>
                          !deletedFilesIds.includes(
                            parseInt(file.id.toString())
                          )
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
                              <Typography
                                sx={{ fontSize: 11, color: "status.default.text" }}
                              >
                                {file.size ? `${((file.size || 0) / 1024).toFixed(1)} KB` : ""}
                                {file.size && file.source ? " • " : ""}
                                {file.source ? `Source: ${file.source}` : ""}
                              </Typography>
                            </Box>
                          </Box>
                          <Box sx={{ display: "flex", gap: 0.5 }}>
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

                {/* Pending Upload Files */}
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
                            {file.size && (
                              <Typography
                                sx={{ fontSize: 11, color: "#B45309" }}
                              >
                                {((file.size || 0) / 1024).toFixed(1)} KB
                              </Typography>
                            )}
                          </Box>
                        </Box>
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
                      this requirement
                    </Typography>
                  </Box>
                )}
              </Stack>
            </TabPanel>

            {/* Tab 3: Cross Mappings */}
            <TabPanel value="cross-mappings" sx={{ padding: "15px 20px" }}>
              <Stack spacing={3}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Linked risks
                </Typography>
                <Typography variant="body2" color="text.tertiary">
                  Link risks from your risk database to track which risks are
                  addressed by this requirement.
                </Typography>

                {/* Add/Remove Button */}
                <Stack direction="row" spacing={2} alignItems="center">
                  <Button
                    variant="contained"
                    onClick={() => setIsLinkedRisksModalOpen(true)}
                    disabled={isEditingDisabled}
                    sx={{
                      borderRadius: 2,
                      minWidth: 155,
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
                    disableRipple={
                      theme.components?.MuiButton?.defaultProps?.disableRipple
                    }
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
                                  handleAlert({
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
                      border: `2px dashed ${theme.palette.border.dark}`,
                      borderRadius: "4px",
                      padding: "20px",
                      textAlign: "center",
                      backgroundColor: "background.accent",
                    }}
                  >
                    <Typography sx={{ color: "text.tertiary" }}>
                      No risks linked yet
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
                      frameworkId={3}
                      isOrganizational={true}
                    />
                  </Suspense>
                )}
              </Stack>
            </TabPanel>

            {/* Tab 4: Notes */}
            <TabPanel value="notes" sx={{ padding: "15px 20px" }}>
              <Suspense fallback={<CircularProgress />}>
                {fetchedSubClause?.id && (
                  <NotesTab
                    key={`iso27001-clause-${fetchedSubClause.id}`}
                    attachedTo="ISO_27001_CLAUSE"
                    attachedToId={fetchedSubClause.id.toString()}
                  />
                )}
              </Suspense>
            </TabPanel>
          </TabContext>
          <Stack
            className="vw-iso-27001-clause-drawer-dialog-footer"
            sx={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "flex-end",
              padding: "15px 20px",
            }}
          >
            <CustomizableButton
              variant="contained"
              text="Save"
              sx={{
                backgroundColor: "primary.main",
                border: `1px solid ${theme.palette.primary.main}`,
                gap: 2,
              }}
              onClick={handleSave}
              icon={<SaveIcon size={16} />}
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
              handleAlert({
                variant: "error",
                body: error || "Failed to update risk",
              });
            }}
            users={users}
            onSubmitRef={onRiskSubmitRef}
          />
        </Suspense>
      </StandardModal>

      {/* Audit Risk Dialog */}
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
        <Suspense fallback={"Loading..."}>
          <AuditRiskPopup
            onClose={() => setAuditedStatusModalOpen(false)}
            risks={formData.risks.concat(selectedRisks)}
            _deletedRisks={deletedRisks}
            _setDeletedRisks={setDeletedRisks}
            _selectedRisks={selectedRisks}
            _setSelectedRisks={setSelectedRisks}
          />
        </Suspense>
      </Dialog>

      {/* Alert */}
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

export default VWISO27001ClauseDrawerDialog;
