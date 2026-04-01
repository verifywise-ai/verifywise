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
import { FileData } from "../../../../domain/types/File";
import {
  X as CloseIcon,
  Save as SaveIcon,
  Download as DownloadIcon,
  Trash2 as DeleteIcon,
  Eye as ViewIcon,
  FileText as FileIcon,
} from "lucide-react";
import Checkbox from "../../Inputs/Checkbox";
import Field from "../../Inputs/Field";
import RichTextEditor from "../../RichTextEditor";
import { inputStyles } from "../ClauseDrawerDialog";
import DatePicker from "../../Inputs/Datepicker";
import Select from "../../Inputs/Select";
import TabBar from "../../TabBar";
import StandardModal from "../../Modals/StandardModal";
import { useState, useEffect, lazy, Suspense, useRef } from "react";
import { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { CustomizableButton } from "../../button/customizable-button";
import { User } from "../../../../domain/types/User";
import {
  GetAnnexCategoriesById,
  UpdateAnnexCategoryById,
} from "../../../../application/repository/annexCategory_iso.repository";
import { AnnexCategoryISO } from "../../../../domain/types/AnnexCategoryISO";
import { STATUSES } from "../../../../domain/types/Status";
import Alert from "../../Alert";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { AlertProps } from "../../../types/alert.types";
import allowedRoles from "../../../../application/constants/permissions";
import useUsers from "../../../../application/hooks/useUsers";
import { useAuth } from "../../../../application/hooks/useAuth";
import { getFileById, attachFilesToEntity, getEntityFiles } from "../../../../application/repository/file.repository";
import { getEntityById } from "../../../../application/repository/entity.repository";
import { FilePickerModal } from "../../FilePickerModal";
import { RiskFormValues } from "../../../../domain/types/riskForm.types";

const AuditRiskPopup = lazy(() => import("../../RiskPopup/AuditRiskPopup"));
const LinkedRisksPopup = lazy(() => import("../../LinkedRisks").then(m => ({ default: m.LinkedRisksPopup })));
const NotesTab = lazy(() => import("../../Notes/NotesTab"));
const AddNewRiskForm = lazy(() => import("../../AddNewRiskForm"));

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

interface VWISO42001ClauseDrawerDialogProps {
  title: string;
  open: boolean;
  onClose: () => void;
  control: Control;
  annex: AnnexCategoryISO;
  evidenceFiles?: FileData[];
  uploadFiles?: FileData[];
  projectFrameworkId: number;
  project_id: number;
  onSaveSuccess?: (success: boolean, message?: string) => void;
}

const VWISO42001AnnexDrawerDialog = ({
  title,
  open,
  onClose,
  control,
  annex,
  projectFrameworkId,
  project_id,
  onSaveSuccess,
}: VWISO42001ClauseDrawerDialogProps) => {
  const [date, setDate] = useState<Dayjs | null>(null);
  const [fetchedAnnex, setFetchedAnnex] = useState<AnnexCategoryISO>();
  const [isLoading, setIsLoading] = useState(false);
  const [projectMembers, setProjectMembers] = useState<User[]>([]);
  const [isLinkedRisksModalOpen, setIsLinkedRisksModalOpen] =
    useState<boolean>(false);
  const [evidenceFiles, setEvidenceFiles] = useState<FileData[]>([]);
  const theme = useTheme();
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [deletedFilesIds, setDeletedFilesIds] = useState<number[]>([]);
  const [uploadFiles, setUploadFiles] = useState<FileData[]>([]);
  const [pendingAttachFiles, setPendingAttachFiles] = useState<FileData[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [selectedRisks, setSelectedRisks] = useState<number[]>([]);
  const [deletedRisks, setDeletedRisks] = useState<number[]>([]);
  const [auditedStatusModalOpen, setAuditedStatusModalOpen] =
    useState<boolean>(false);

  // Tab management state
  const [activeTab, setActiveTab] = useState("details");
  const [currentRisks, setCurrentRisks] = useState<number[]>([]);
  const [linkedRiskObjects, setLinkedRiskObjects] = useState<LinkedRisk[]>([]);
  const [isRiskDetailModalOpen, setIsRiskDetailModalOpen] = useState(false);
  const [selectedRiskForView, setSelectedRiskForView] = useState<LinkedRisk | null>(null);
  const [riskFormData, setRiskFormData] = useState<RiskFormValues | undefined>(undefined);
  const onRiskSubmitRef = useRef<(() => void) | null>(null);

  const { userId, userRoleName } = useAuth();
  const { users } = useUsers();

  const isEditingDisabled =
    !allowedRoles.frameworks.edit.includes(userRoleName);
  const isAuditingDisabled =
    !allowedRoles.frameworks.audit.includes(userRoleName);

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

  // Add state for all form fields
  const [formData, setFormData] = useState({
    guidance: "",
    is_applicable: false,
    justification_for_exclusion: "",
    implementation_description: "",
    status: "",
    owner: "",
    reviewer: "",
    approver: "",
    auditor_feedback: "",
    risks: [] as number[],
  });

  // Filter users to only show project members
  useEffect(() => {
    if (users?.length > 0) {
      // Since we don't have project data, use all users
      setProjectMembers(users);
    }
  }, [users]);

  // File management functions
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


  const handleDeleteFile = (fileId: number | string) => {
    const fileIdNumber = typeof fileId === "number" ? fileId : parseInt(fileId);

    if (evidenceFiles.some((file) => file.id === fileId)) {
      setEvidenceFiles(evidenceFiles.filter((file) => file.id !== fileId));
      setDeletedFilesIds([...deletedFilesIds, fileIdNumber]);
    } else {
      setUploadFiles(uploadFiles.filter((file) => file.id !== fileId));
    }
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

  // Risk management functions
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

  const fetchLinkedRisks = async () => {
    if (!fetchedAnnex?.id) return;

    try {
      const response = await getEntityById({
        routeUrl: `/iso-42001/annexCategories/${fetchedAnnex.id}/risks`,
      });

      if (response.data) {
        const riskIds = response.data.map((risk: { id: number }) => risk.id);
        setCurrentRisks(riskIds);
        setLinkedRiskObjects(response.data as LinkedRisk[]);
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching linked risks:", error);
      }
      setCurrentRisks([]);
      setLinkedRiskObjects([]);
    }
  };

  /**
   * Load evidence files from both sources:
   * 1. evidence_links from entity response (legacy)
   * 2. file_entity_links table (new framework-agnostic approach)
   * Merges and deduplicates by file ID
   */
  const loadEvidenceFiles = async (evidenceLinks: FileData[] | null | undefined, categoryId: number) => {
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
    if (categoryId) {
      try {
        const response = await getEntityFiles(
          "iso_42001",
          "annex_category",
          categoryId
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

  const handleUnlinkRisk = (riskId: number) => {
    if (!deletedRisks.includes(riskId)) {
      setDeletedRisks([...deletedRisks, riskId]);
    }
  };

  useEffect(() => {
    const fetchAnnexCategory = async () => {
      if (open && annex?.id) {
        setIsLoading(true);
        try {
          const response = await GetAnnexCategoriesById({
            routeUrl: `/iso-42001/annexCategory/byId/${control.id}?projectFrameworkId=${projectFrameworkId}`,
          }) as { data: AnnexCategoryISO & { evidence_links?: FileData[]; guidance?: string; risks?: number[] } };
          setFetchedAnnex(response.data);

          // Initialize form data with fetched values
          if (response.data) {
            setFormData({
              guidance: response.data.guidance || "",
              is_applicable: response.data.is_applicable ?? false,
              justification_for_exclusion:
                response.data.justification_for_exclusion || "",
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

          // On annex category fetch, set evidence files from both sources
          const allEvidenceFiles = await loadEvidenceFiles(
            response.data.evidence_links,
            control.id
          );
          setEvidenceFiles(allEvidenceFiles);
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("Error fetching annex category:", error);
          }
        } finally {
          setIsLoading(false);
        }
      }
    };
    fetchAnnexCategory();
  }, [open, annex?.id, projectFrameworkId]);

  // Fetch linked risks when drawer opens and annex is loaded
  useEffect(() => {
    if (open && fetchedAnnex?.id) {
      fetchLinkedRisks();
    }
  }, [open, fetchedAnnex?.id]);

  // Handle form field changes
  const handleFieldChange = (field: string, value: string | number | boolean | Dayjs | null) => {
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

  // Add handleSave function before the return statement
  const handleSave = async () => {
    setIsLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append("is_applicable", formData.is_applicable.toString());
      formDataToSend.append(
        "justification_for_exclusion",
        formData.justification_for_exclusion
      );
      formDataToSend.append(
        "implementation_description",
        formData.implementation_description
      );
      formDataToSend.append("status", formData.status);
      formDataToSend.append("owner", formData.owner);
      formDataToSend.append("reviewer", formData.reviewer);
      formDataToSend.append("approver", formData.approver);
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
              : new File([file.data!], file.fileName, {
                  type: file.type,
                });
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

      // Call the update API
      const response = await UpdateAnnexCategoryById({
        routeUrl: `/iso-42001/saveAnnexes/${fetchedAnnex.id}`,
        body: formDataToSend,
      });

      if (response.status === 200) {
        // Attach pending files after successful save
        if (pendingAttachFiles.length > 0 && control?.id) {
          try {
            const fileIds = pendingAttachFiles.map((f) => parseInt(f.id));
            await attachFilesToEntity({
              file_ids: fileIds,
              framework_type: "iso_42001",
              entity_type: "annex_category",
              entity_id: control.id,
              project_id: project_id,
              link_type: "evidence",
            });
          } catch (attachError) {
            console.error("Failed to attach files:", attachError);
          }
        }

        handleAlert({
          variant: "success",
          body: "Annex category saved successfully",
          setAlert,
        });
        onSaveSuccess?.(true, "Annex category saved successfully");

        // Reset pending states
        setPendingAttachFiles([]);
        setUploadFiles([]);
        setDeletedFilesIds([]);
        setSelectedRisks([]);
        setDeletedRisks([]);

        // Refresh linked risks after saving
        if (fetchedAnnex?.id) {
          await fetchLinkedRisks();
        }

        onClose();
      } else {
        throw new Error("Failed to save annex category");
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error saving annex category:", error);
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
          <Typography sx={{ mt: 2 }}>Loading annex category data...</Typography>
        </Stack>
      </Drawer>
    );
  }

  return (
    <Drawer
      id={`vw-iso-42001-annex-drawer-dialog-${annex?.id}`}
      className="vw-iso-42001-annex-drawer-dialog"
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
        className="vw-iso-42001-annex-drawer-dialog-content"
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
            {title}
          </Typography>
          <CloseIcon size={20} onClick={onClose} style={{ cursor: "pointer" }} />
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
            <Stack gap="15px">
              {/* Guidance Panel */}
              <Stack
                className="vw-iso-42001-annex-drawer-dialog-content-annex-guidance"
                sx={{
                  border: `1px solid #eee`,
                  padding: "10px",
                  backgroundColor: "background.accent",
                  borderRadius: "4px",
                }}
              >
                <Typography fontSize={13}>
                  <strong>Guidance:</strong> {formData.guidance}
                </Typography>
              </Stack>

              {/* Applicability Section */}
              <Stack
                className="vw-iso-42001-annex-drawer-dialog-applicability"
                sx={{
                  gap: "15px",
                }}
              >
                <Typography fontSize={13}>Applicability:</Typography>
                <Stack sx={{ display: "flex", flexDirection: "row", gap: 10 }}>
                  <Checkbox
                    id={`${control?.id}-iso-42001-applicable`}
                    label="Applicable"
                    isChecked={formData.is_applicable}
                    value={"Applicable"}
                    onChange={() =>
                      setFormData((prev) => ({
                        ...prev,
                        is_applicable: true,
                        justification_for_exclusion: "",
                      }))
                    }
                    size="small"
                    isDisabled={isEditingDisabled}
                  />
                  <Checkbox
                    id={`${control?.id}-iso-42001-not-applicable`}
                    label="Not applicable"
                    isChecked={!formData.is_applicable}
                    value={"Not Applicable"}
                    onChange={() =>
                      setFormData((prev) => ({
                        ...prev,
                        is_applicable: false,
                      }))
                    }
                    size="small"
                    isDisabled={isEditingDisabled}
                  />
                </Stack>
              </Stack>

              {/* Justification Field */}
              <Stack
                sx={{
                  opacity: formData.is_applicable ? 0.5 : 1,
                  pointerEvents: formData.is_applicable ? "none" : "auto",
                }}
              >
                <Typography fontSize={13} sx={{ marginBottom: "5px" }}>
                  {"Justification for Exclusion (if Not Applicable)"}:
                </Typography>
                <Field
                  type="description"
                  value={formData.justification_for_exclusion}
                  onChange={(e) =>
                    handleFieldChange("justification_for_exclusion", e.target.value)
                  }
                  disabled={formData.is_applicable || isEditingDisabled}
                  sx={{
                    cursor: formData.is_applicable ? "not-allowed" : "text",
                    "& .field field-decription field-input MuiInputBase-root MuiInputBase-input":
                      {
                        height: "73px",
                      },
                  }}
                  placeholder="Required if control is not applicable..."
                />
              </Stack>

              {/* Implementation Description */}
              <Stack
                sx={{
                  opacity: formData.is_applicable ? 1 : 0.5,
                  pointerEvents: formData.is_applicable ? "auto" : "none",
                }}
              >
                <Typography fontSize={13} sx={{ marginBottom: "5px" }}>
                  Implementation description:
                </Typography>
                <RichTextEditor
                  toolbar="full"
                  initialContent={formData.implementation_description}
                  onContentChange={(content) =>
                    handleFieldChange("implementation_description", content)
                  }
                  placeholder="Describe how this requirement is implemented..."
                  isEditable={formData.is_applicable && !isEditingDisabled}
                  height="120px"
                />
              </Stack>

              {/* Status & Assignments Section */}
              <Stack
                sx={{
                  opacity: formData.is_applicable ? 1 : 0.5,
                  pointerEvents: formData.is_applicable ? "auto" : "none",
                }}
                gap={"24px"}
              >
                <Select
                  id="status"
                  label="Status:"
                  value={formData.status}
                  onChange={handleSelectChange("status")}
                  items={STATUSES.map((status) => ({
                    _id: status,
                    name: status.charAt(0).toUpperCase() + status.slice(1),
                  }))}
                  disabled={!formData.is_applicable || isEditingDisabled}
                  sx={inputStyles}
                  placeholder={"Select status"}
                />

                <Select
                  id="Owner"
                  label="Owner:"
                  value={formData.owner ? parseInt(formData.owner) : ""}
                  onChange={handleSelectChange("owner")}
                  items={projectMembers.map((user) => ({
                    _id: user.id,
                    name: `${user.name}`,
                    email: user.email,
                    surname: user.surname,
                  }))}
                  disabled={!formData.is_applicable || isEditingDisabled}
                  sx={inputStyles}
                  placeholder={"Select owner"}
                />

                <Select
                  id="Reviewer"
                  label="Reviewer:"
                  value={formData.reviewer ? parseInt(formData.reviewer) : ""}
                  onChange={handleSelectChange("reviewer")}
                  items={projectMembers.map((user) => ({
                    _id: user.id,
                    name: `${user.name}`,
                    email: user.email,
                    surname: user.surname,
                  }))}
                  disabled={!formData.is_applicable || isEditingDisabled}
                  sx={inputStyles}
                  placeholder={"Select reviewer"}
                />

                <Select
                  id="Approver"
                  label="Approver:"
                  value={formData.approver ? parseInt(formData.approver) : ""}
                  onChange={handleSelectChange("approver")}
                  items={projectMembers.map((user) => ({
                    _id: user.id,
                    name: `${user.name}`,
                    email: user.email,
                    surname: user.surname,
                  }))}
                  disabled={!formData.is_applicable || isEditingDisabled}
                  sx={inputStyles}
                  placeholder={"Select approver"}
                />

                <DatePicker
                  label="Due date:"
                  sx={inputStyles}
                  date={date}
                  disabled={!formData.is_applicable || isEditingDisabled}
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
                    disabled={!formData.is_applicable || isAuditingDisabled}
                    sx={{
                      cursor: !formData.is_applicable ? "not-allowed" : "text",
                      "& .field field-decription field-input MuiInputBase-root MuiInputBase-input":
                        {
                          height: "73px",
                        },
                    }}
                    placeholder="Enter any feedback from the internal or external audits..."
                  />
                </Stack>
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
                Upload evidence files to document how this requirement is implemented.
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
                  {evidenceFiles.map((file) => (
                    <Box
                      key={file.id}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        border: `1px solid ${theme.palette.border.dark}`,
                        borderRadius: "4px",
                        padding: "8px 12px",
                        backgroundColor: "background.accent",
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <FileIcon size={18} color={theme.palette.text.tertiary} />
                        <Box>
                          <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
                            {file.fileName}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>
                            {((file.size || 0) / 1024).toFixed(1)} KB
                            {file.source ? ` • Source: ${file.source}` : ""}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <Tooltip title="Download file">
                          <IconButton
                            size="small"
                            onClick={() =>
                              handleDownloadFile(
                                typeof file.id === "number" ? file.id : parseInt(file.id.toString()),
                                file.fileName
                              )
                            }
                          >
                            <DownloadIcon size={16} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete file">
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteFile(file.id)}
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
                        border: `1px solid ${theme.palette.status.warning.border}`,
                        borderRadius: "4px",
                        padding: "8px 12px",
                        backgroundColor: "status.warning.bg",
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <FileIcon size={18} color="#92400E" />
                        <Box>
                          <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
                            {file.fileName}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>
                            {((file.size || 0) / 1024).toFixed(1)} KB
                          </Typography>
                        </Box>
                      </Box>
                      <Tooltip title="Remove">
                        <IconButton size="small" onClick={() => handleDeleteFile(file.id)}>
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
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#3B5BDB" }}>
                    Pending attach
                  </Typography>
                  {pendingAttachFiles.map((file) => (
                    <Box
                      key={file.id}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        border: "1px solid #A5D8FF",
                        borderRadius: "4px",
                        padding: "8px 12px",
                        backgroundColor: "#E7F5FF",
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <FileIcon size={18} color="#3B5BDB" />
                        <Box>
                          <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
                            {file.fileName}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: "status.default.text" }}>
                            {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ""}
                          </Typography>
                        </Box>
                      </Box>
                      <Tooltip title="Remove">
                        <IconButton size="small" onClick={() => handleRemovePendingAttach(file.id)}>
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
                    border: `2px dashed ${theme.palette.border.dark}`,
                    borderRadius: "4px",
                    padding: "20px",
                    textAlign: "center",
                    backgroundColor: "background.accent",
                  }}
                >
                  <Typography sx={{ color: "text.tertiary" }}>
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
                Link risks from your risk database to track which risks are addressed by this annex category.
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
                          border: `1px solid ${theme.palette.border.dark}`,
                          borderRadius: "4px",
                          padding: "12px",
                          backgroundColor: "background.accent",
                        }}
                      >
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
                            {risk.risk_name}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>
                            Risk level: {risk.risk_level}
                          </Typography>
                        </Box>
                        <Box sx={{ display: "flex", gap: 0.5 }}>
                          <Tooltip title="View details">
                            <IconButton
                              size="small"
                              onClick={() => handleViewRiskDetails(risk)}
                            >
                              <ViewIcon size={16} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Unlink risk">
                            <IconButton
                              size="small"
                              onClick={() => handleUnlinkRisk(risk.id)}
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

              {/* LinkedRisks Modal */}
              {isLinkedRisksModalOpen && (
                <Suspense fallback={"loading..."}>
                  <LinkedRisksPopup
                    onClose={() => setIsLinkedRisksModalOpen(false)}
                    currentRisks={currentRisks
                      .concat(selectedRisks)
                      .filter((risk) => !deletedRisks.includes(risk))}
                    setSelectecRisks={setSelectedRisks}
                    _setDeletedRisks={setDeletedRisks}
                    frameworkId={2}
                    isOrganizational={true}
                  />
                </Suspense>
              )}

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
                attachedTo="ISO_42001_ANNEX"
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
          className="vw-iso-42001-annex-drawer-dialog-footer"
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

export default VWISO42001AnnexDrawerDialog;
