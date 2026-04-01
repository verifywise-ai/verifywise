import {
  Button,
  Divider,
  Drawer,
  Stack,
  Typography,
  CircularProgress,
  Dialog,
  useTheme,
  Box,
  IconButton,
  Tooltip,
} from "@mui/material";
import { TabContext, TabPanel } from "@mui/lab";
import { FileData } from "../../../../domain/types/File";
import {
  X as CloseIcon,
  Trash2 as DeleteIcon,
  Download as DownloadIcon,
  FileText as FileIcon,
  Eye as ViewIcon,
} from "lucide-react";
import Field from "../../Inputs/Field";
import RichTextEditor from "../../RichTextEditor";
import { inputStyles } from "../ClauseDrawerDialog";
import DatePicker from "../../Inputs/Datepicker";
import Select from "../../Inputs/Select";
import { useState, useEffect, lazy, Suspense, useRef } from "react";
import TabBar from "../../TabBar";
import StandardModal from "../../Modals/StandardModal";
import { getFileById, attachFilesToEntity, getEntityFiles } from "../../../../application/repository/file.repository";
import { FilePickerModal } from "../../FilePickerModal";
import { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { CustomizableButton } from "../../button/customizable-button";
import { Save as SaveIcon } from "lucide-react";
import { User } from "../../../../domain/types/User";
import { STATUSES } from "../../../../domain/types/Status";
import { AlertProps } from "../../../types/alert.types";
import allowedRoles from "../../../../application/constants/permissions";
import useUsers from "../../../../application/hooks/useUsers";
import { useAuth } from "../../../../application/hooks/useAuth";
import {
  updateEntityById,
  getEntityById,
} from "../../../../application/repository/entity.repository";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { GetAnnexControlISO27001ById } from "../../../../application/repository/annex_struct_iso.repository";
import Alert from "../../Alert";
import { SelectChangeEvent } from "@mui/material";
import { RiskFormValues } from "../../AddNewRiskForm/interface";
import { text } from "../../../themes/palette";
const AuditRiskPopup = lazy(() => import("../../RiskPopup/AuditRiskPopup"));
const LinkedRisksPopup = lazy(() => import("../../LinkedRisks").then(m => ({ default: m.LinkedRisksPopup })));
const NotesTab = lazy(() => import("../../Notes/NotesTab"));
const AddNewRiskForm = lazy(() => import("../../AddNewRiskForm"));

interface AnnexControlData {
  id: number;
  title: string;
  requirement_summary: string;
  key_questions: string[];
  evidence_examples: string[];
  implementation_description: string;
  status: string;
  owner: number | null;
  reviewer: number | null;
  approver: number | null;
  auditor_feedback: string;
  risks: number[];
  due_date: string | null;
  evidence_links: FileData[];
}

interface AnnexControlResponse {
  data: AnnexControlData;
}

interface AnnexRef {
  id: number;
}

interface Control {
  id: number;
  control_no: number;
  control_subSection: number;
  title: string;
  shortDescription: string;
  guidance: string;
  status: string;
}

interface LinkedRisk {
  id: number;
  risk_name: string;
  risk_level: string;
  description?: string;
  [key: string]: string | number | boolean | null | undefined;
}

interface VWISO27001AnnexDrawerDialogProps {
  title: string;
  open: boolean;
  onClose: () => void;
  control: Control;
  annex: AnnexRef;
  evidenceFiles?: FileData[];
  uploadFiles?: FileData[];
  projectFrameworkId: number;
  project_id: number;
  onSaveSuccess?: (success: boolean, message?: string) => void;
}

const VWISO27001AnnexDrawerDialog = ({
  title,
  open,
  onClose,
  control,
  annex,
  projectFrameworkId,
  project_id,
  onSaveSuccess,
}: VWISO27001AnnexDrawerDialogProps) => {
  const [date, setDate] = useState<Dayjs | null>(null);
  const [fetchedAnnex, setFetchedAnnex] = useState<AnnexControlData>();
  const [isLoading, setIsLoading] = useState(false);
  const [projectMembers, setProjectMembers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState("details");
  const [isLinkedRisksModalOpen, setIsLinkedRisksModalOpen] =
    useState<boolean>(false);
  const [isRiskDetailModalOpen, setIsRiskDetailModalOpen] = useState(false);
  const [riskFormData, setRiskFormData] = useState<RiskFormValues | undefined>(undefined);
  const onRiskSubmitRef = useRef<(() => void) | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<FileData[]>([]);
  const theme = useTheme();
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [deletedFilesIds, setDeletedFilesIds] = useState<number[]>([]);
  const [uploadFiles, setUploadFiles] = useState<FileData[]>([]);
  const [pendingAttachFiles, setPendingAttachFiles] = useState<FileData[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [selectedRisks, setSelectedRisks] = useState<number[]>([]);
  const [deletedRisks, setDeletedRisks] = useState<number[]>([]);
  const [currentRisks, setCurrentRisks] = useState<number[]>([]);
  const [linkedRiskObjects, setLinkedRiskObjects] = useState<LinkedRisk[]>([]);
  const [selectedRiskForView, setSelectedRiskForView] =
    useState<LinkedRisk | null>(null);
  const [auditedStatusModalOpen, setAuditedStatusModalOpen] =
    useState<boolean>(false);

  const { userId, userRoleName } = useAuth();
  const { users } = useUsers();

  const isEditingDisabled =
    !allowedRoles.frameworks.edit.includes(userRoleName);
  const isAuditingDisabled =
    !allowedRoles.frameworks.audit.includes(userRoleName);

  // Add state for all form fields
  const [formData, setFormData] = useState({
    title: "",
    requirement_summary: "",
    key_questions: [] as string[],
    evidence_examples: [] as string[],
    implementation_description: "",
    status: "",
    owner: "",
    reviewer: "",
    approver: "",
    auditor_feedback: "",
    risks: [] as number[],
  });

  // Tab configuration
  const tabs = [
    { label: "Details", value: "details", icon: "FileText" as const },
    { label: "Evidence", value: "evidence", icon: "FolderOpen" as const },
    { label: "Cross mappings", value: "cross-mappings", icon: "Link" as const },
    { label: "Notes", value: "notes", icon: "MessageSquare" as const },
  ];

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  };

  // Filter users to only show project members
  useEffect(() => {
    if (users?.length > 0) {
      // Since we don't have project data, use all users
      setProjectMembers(users);
    }
  }, [users]);

  useEffect(() => {
    const fetchAnnexControl = async () => {
      if (open && annex?.id) {
        setIsLoading(true);
        try {
          const response = await GetAnnexControlISO27001ById({
            routeUrl: `/iso-27001/annexControl/byId/${control.id}?projectFrameworkId=${projectFrameworkId}`,
          }) as AnnexControlResponse;
          setFetchedAnnex(response.data);

          // Initialize form data with fetched values
          if (response.data) {
            setFormData({
              title: response.data.title || "",
              requirement_summary: response.data.requirement_summary || "",
              key_questions: response.data.key_questions || [],
              evidence_examples: response.data.evidence_examples || [],
              implementation_description:
                response.data.implementation_description || "",
              status: response.data.status || "",
              owner: response.data.owner?.toString() || "",
              reviewer: response.data.reviewer?.toString() || "",
              approver: response.data.approver?.toString() || "",
              auditor_feedback: response.data.auditor_feedback || "",
              risks: response.data.risks || [],
            });
            // Set the date if it exists in the fetched data
            if (response.data.due_date) {
              setDate(dayjs(response.data.due_date));
            }
          }

          // On annex control fetch, set evidence files from both sources
          const allEvidenceFiles = await loadEvidenceFiles(
            response.data.evidence_links,
            control.id
          );
          setEvidenceFiles(allEvidenceFiles);
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("Error fetching annex control:", error);
          }
        } finally {
          setIsLoading(false);
        }
      }
    };
    fetchAnnexControl();
  }, [open, annex?.id, projectFrameworkId]);

  // Initialize risk state from form data
  useEffect(() => {
    if (formData.risks && formData.risks.length > 0) {
      setCurrentRisks(formData.risks);
    } else {
      setCurrentRisks([]);
    }
  }, [formData.risks]);

  // Fetch linked risks when drawer opens and annex is loaded
  useEffect(() => {
    if (open && fetchedAnnex?.id) {
      fetchLinkedRisks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fetchedAnnex?.id, formData.risks, selectedRisks, deletedRisks]);

  // File management functions for inline Evidence tab
  const handleAddFiles = (files: File[]) => {
    const newFiles: FileData[] = files.map((file, index) => ({
      id: `upload-${Date.now()}-${index}`,
      fileName: file.name,
      size: file.size,
      type: file.type,
      data: file,
      uploadDate: new Date().toISOString(),
      uploader: userId?.toString() || "1",
    }));

    setUploadFiles([...uploadFiles, ...newFiles]);
    handleAlert({
      variant: "info",
      body: "Please save the changes to upload the files.",
      setAlert,
    });
  };

  const handleAttachExistingFiles = (selectedFiles: FileData[]) => {
    if (selectedFiles.length === 0) return;

    // Add to pending attach queue (will be attached on Save)
    setPendingAttachFiles((prev) => [...prev, ...selectedFiles]);
    handleAlert({
      variant: "info",
      body: `${selectedFiles.length} file(s) added to attach queue. Save to apply changes.`,
      setAlert,
    });
  };

  const handleRemovePendingAttach = (fileId: string) => {
    setPendingAttachFiles((prev) => prev.filter((f) => f.id !== fileId));
    handleAlert({
      variant: "info",
      body: "File removed from attach queue.",
      setAlert,
    });
  };

  const handleDeleteEvidenceFile = (fileId: string) => {
    const fileIdNumber = parseInt(fileId);
    if (isNaN(fileIdNumber)) {
      handleAlert({
        variant: "error",
        body: "Invalid file ID",
        setAlert,
      });
      return;
    }
    setEvidenceFiles((prev) => prev.filter((f) => f.id.toString() !== fileId));
    setDeletedFilesIds((prev) => [...prev, fileIdNumber]);
    handleAlert({
      variant: "info",
      body: "File marked for deletion. Save to apply changes.",
      setAlert,
    });
  };

  const handleDeleteUploadFile = (fileId: string) => {
    setUploadFiles((prev) => prev.filter((f) => f.id !== fileId));
    handleAlert({
      variant: "info",
      body: "File removed from upload queue.",
      setAlert,
    });
  };

  const handleDownloadFile = async (fileId: number, fileName: string) => {
    try {
      const response = await getFileById({
        id: fileId.toString(),
        responseType: "arraybuffer",
      });

      const blob = new Blob([response], { type: "application/octet-stream" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error downloading file:", error);
      }
      handleAlert({
        variant: "error",
        body: "Failed to download file",
        setAlert,
      });
    }
  };

  const handleFieldChange = (field: string, value: string | number | Dayjs | null) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSelectChange = (field: string) => (event: SelectChangeEvent<string | number>) => {
    const value = event.target.value.toString();
    if (
      field === "status" &&
      value === "Implemented" &&
      (selectedRisks.length > 0 ||
        formData.risks.length > 0 ||
        (formData.risks.length > 0 &&
          deletedRisks.length === formData.risks.length))
    ) {
      setAuditedStatusModalOpen(true);
    }
    handleFieldChange(field, value);
  };

  // Risk management functions
  const fetchLinkedRisks = async (riskIds?: number[]) => {
    if (!fetchedAnnex?.id) return;

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
  const loadEvidenceFiles = async (evidenceLinks: FileData[] | null | undefined, controlId: number) => {
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
    if (controlId) {
      try {
        const response = await getEntityFiles(
          "iso_27001",
          "annex_control",
          controlId
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
        setAlert,
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
    // Refresh linked risks
    if (fetchedAnnex?.id) {
      fetchLinkedRisks();
    }
    handleAlert({
      variant: "success",
      body: "Risk updated successfully",
      setAlert,
    });
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append(
        "implementation_description",
        formData.implementation_description
      );
      formDataToSend.append("status", formData.status);

      // Only append user fields if they have valid values
      if (formData.owner && formData.owner.trim() !== "") {
        formDataToSend.append("owner", formData.owner);
      }
      if (formData.reviewer && formData.reviewer.trim() !== "") {
        formDataToSend.append("reviewer", formData.reviewer);
      }
      if (formData.approver && formData.approver.trim() !== "") {
        formDataToSend.append("approver", formData.approver);
      }

      formDataToSend.append("auditor_feedback", formData.auditor_feedback);
      if (date) formDataToSend.append("due_date", date.toString());
      formDataToSend.append("user_id", userId?.toString() || "1");
      formDataToSend.append("project_id", project_id.toString());
      formDataToSend.append("delete", JSON.stringify(deletedFilesIds));
      formDataToSend.append("risksMitigated", JSON.stringify(selectedRisks));
      formDataToSend.append("risksDelete", JSON.stringify(deletedRisks));

      uploadFiles.forEach((file) => {
        if (file.data instanceof Blob) {
          const fileToUpload =
            file.data instanceof File
              ? file.data
              : new File([file.data!], file.fileName, { type: file.type });
          formDataToSend.append("files", fileToUpload);
        }
      });

      if (!fetchedAnnex) {
        if (process.env.NODE_ENV === "development") {
          console.error("Fetched annex is undefined");
        }
        handleAlert({
          variant: "error",
          body: "Error: Annex data not found",
          setAlert,
        });
        onSaveSuccess?.(false, "Error: Annex data not found");
        return;
      }

      try {
        const response = await updateEntityById({
          routeUrl: `/iso-27001/saveAnnexes/${fetchedAnnex.id}`,
          body: formDataToSend,
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });

        if (response && response.status === 200) {
          // Attach pending files after successful save
          if (pendingAttachFiles.length > 0 && fetchedAnnex?.id) {
            try {
              const fileIds = pendingAttachFiles.map((f) => parseInt(f.id));
              await attachFilesToEntity({
                file_ids: fileIds,
                framework_type: "iso_27001",
                entity_type: "annex_control",
                entity_id: fetchedAnnex.id,
                project_id: project_id,
                link_type: "evidence",
              });
            } catch (attachError) {
              console.error("Failed to attach files:", attachError);
            }
          }

          // Reset pending states
          setPendingAttachFiles([]);
          setUploadFiles([]);
          setDeletedFilesIds([]);
          setSelectedRisks([]);
          setDeletedRisks([]);

          handleAlert({
            variant: "success",
            body: "Annex control saved successfully",
            setAlert,
          });
          onSaveSuccess?.(true, "Annex control saved successfully");
          onClose();
        } else {
          throw new Error(
            `Failed to save annex control. Status: ${
              response?.status || "unknown"
            }`
          );
        }
      } catch (apiError) {
        if (process.env.NODE_ENV === "development") {
          console.error("API call failed:", apiError);
        }
        // If it's an axios error, extract the error message
        if (
          apiError &&
          typeof apiError === "object" &&
          "response" in apiError
        ) {
          const axiosError = apiError as { response?: { status: number; data?: { message?: string } }; message?: string };
          const errorMessage = String(
            axiosError.response?.data?.message ||
            axiosError.message ||
            "Failed to save annex control"
          );
          throw new Error(errorMessage);
        }
        throw apiError;
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error saving annex control:", error);
      }
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An error occurred while saving changes";
      handleAlert({
        variant: "error",
        body: errorMessage,
        setAlert,
      });
      onSaveSuccess?.(false, errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

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
          <Typography sx={{ mt: 2 }}>Loading annex control data...</Typography>
        </Stack>
      </Drawer>
    );
  }

  return (
    <Drawer
      id={`vw-iso-27001-annex-drawer-dialog-${annex?.id}`}
      className="vw-iso-27001-annex-drawer-dialog"
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
        className="vw-iso-27001-annex-drawer-dialog-content"
        sx={{ width: 850 }}
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
            {title}
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

          {/* Tab 1: Details */}
          <TabPanel value="details" sx={{ padding: "15px 20px" }}>
            <Stack sx={{ gap: "15px" }}>
              {/* Requirement Summary Panel - Gray Box */}
              {formData.requirement_summary && (
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
                    {formData.requirement_summary}
                  </Typography>
                </Stack>
              )}

              {/* Key Questions Panel - Red-Tinted Box */}
              {formData.key_questions && formData.key_questions.length > 0 && (
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
                    {formData.key_questions.map(
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

              {/* Evidence Examples Panel - Green-Tinted Box */}
              {formData.evidence_examples &&
                formData.evidence_examples.length > 0 && (
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
                      {formData.evidence_examples.map(
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

            <Stack gap={"24px"} sx={{ marginTop: "15px" }}>
              <Select
                id="status"
                label="Status:"
                value={formData.status}
                onChange={handleSelectChange("status")}
                items={STATUSES.map((status) => ({
                  _id: status,
                  name: status.charAt(0).toUpperCase() + status.slice(1),
                }))}
                disabled={isEditingDisabled}
                sx={inputStyles}
                placeholder={"Select status"}
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
                disabled={isEditingDisabled}
                sx={inputStyles}
                placeholder={"Select owner"}
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
                disabled={isEditingDisabled}
                sx={inputStyles}
                placeholder={"Select reviewer"}
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
                disabled={isEditingDisabled}
                sx={inputStyles}
                placeholder={"Select approver"}
                getOptionValue={(item) => item._id}
              />

              <DatePicker
                label="Due date:"
                sx={inputStyles}
                date={date}
                disabled={isEditingDisabled}
                handleDateChange={(newDate) => {
                  setDate(newDate);
                }}
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
                  disabled={isAuditingDisabled}
                  sx={{
                    cursor: "text",
                    "& .field field-decription field-input MuiInputBase-root MuiInputBase-input":
                      {
                        height: "73px",
                      },
                  }}
                  placeholder="Enter any feedback from the internal or external audits..."
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
                          typeof file.id === "number"
                            ? file.id
                            : parseInt(file.id.toString())
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
                                  typeof file.id === "number"
                                    ? file.id
                                    : parseInt(file.id.toString()),
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
                            <Typography sx={{ fontSize: 11, color: "#B45309" }}>
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
                              color: "status.warning.text",
                              backgroundColor: "rgba(217, 119, 6, 0.08)",
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

              <Stack direction="row" spacing={2} alignItems="center">
                <Button
                  variant="contained"
                  sx={{
                    borderRadius: 2,
                    width: 155,
                    height: 25,
                    fontSize: 11,
                    border: `1px solid ${theme.palette.border.dark}`,
                    backgroundColor: "background.main",
                    color: "text.secondary",
                  }}
                  onClick={() => setIsLinkedRisksModalOpen(true)}
                  disabled={isEditingDisabled}
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
                            <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>
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
                                  setAlert,
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

              {/* Audit Modal */}
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
                    risks={formData.risks.concat(selectedRisks)}
                    _deletedRisks={deletedRisks}
                    _setDeletedRisks={setDeletedRisks}
                    _selectedRisks={selectedRisks}
                    _setSelectedRisks={setSelectedRisks}
                  />
                </Suspense>
              </Dialog>

              {isLinkedRisksModalOpen && (
                <Suspense fallback={"loading..."}>
                  <LinkedRisksPopup
                    onClose={() => setIsLinkedRisksModalOpen(false)}
                    currentRisks={formData.risks
                      .concat(selectedRisks)
                      .filter((risk) => !deletedRisks.includes(risk))}
                    setSelectecRisks={setSelectedRisks}
                    _setDeletedRisks={setDeletedRisks}
                    frameworkId={3}
                    isOrganizational={true}
                  />
                </Suspense>
              )}

              {/* Risk Detail Modal */}
              <StandardModal
                isOpen={isRiskDetailModalOpen && !!riskFormData}
                onClose={handleRiskDetailModalClose}
                title={`Risk: ${
                  selectedRiskForView?.risk_name || "Risk Details"
                }`}
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
                        setAlert,
                      });
                    }}
                    users={users}
                    onSubmitRef={onRiskSubmitRef}
                  />
                </Suspense>
              </StandardModal>
            </Stack>
          </TabPanel>

          {/* Tab 4: Notes */}
          <TabPanel value="notes" sx={{ padding: "15px 20px" }}>
            <Suspense fallback={<CircularProgress />}>
              <NotesTab
                attachedTo="ISO_27001_ANNEX"
                attachedToId={fetchedAnnex?.id?.toString() || ""}
              />
            </Suspense>
          </TabPanel>
        </TabContext>

        {/* Alert */}
        {alert && (
          <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />
        )}

        <Stack
          className="vw-iso-27001-annex-drawer-dialog-footer"
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

      {/* File Picker Modal for attaching existing files */}
      <FilePickerModal
        open={showFilePicker}
        onClose={() => setShowFilePicker(false)}
        onSelect={handleAttachExistingFiles}
        excludeFileIds={[...evidenceFiles.map((f) => f.id), ...pendingAttachFiles.map((f) => f.id)]}
        multiSelect={true}
        title="Attach Existing Files as Evidence"
      />
    </Drawer>
  );
};

export default VWISO27001AnnexDrawerDialog;
