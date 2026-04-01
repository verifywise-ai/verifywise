import {
  Box,
  Button,
  Stack,
  Typography,
  Drawer,
  CircularProgress,
  SelectChangeEvent,
  IconButton,
  Tooltip,
} from "@mui/material";
import { TabContext, TabPanel } from "@mui/lab";
import {
  X as CloseIcon,
  Save as SaveIcon,
  Download as DownloadIcon,
  Trash2 as DeleteIcon,
  FileText as FileIcon,
  Eye as ViewIcon,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useState, useEffect, Suspense, lazy, useRef } from "react";
import dayjs, { Dayjs } from "dayjs";
import Select from "../../Inputs/Select";
import DatePicker from "../../Inputs/Datepicker";
import { Control } from "../../../../domain/types/Control";
import { FileData } from "../../../../domain/types/File";
import Alert from "../../Alert";
import CustomizableToast from "../../Toast";
import TabBar from "../../TabBar";
import { CustomizableButton } from "../../button/customizable-button";
import RichTextEditor from "../../RichTextEditor";
import StandardModal from "../../Modals/StandardModal";
import { FilePickerModal } from "../../FilePickerModal";
import { text, status } from "../../../themes/palette";

const NotesTab = lazy(() => import("../../Notes/NotesTab"));
const LinkedRisksPopup = lazy(() => import("../../LinkedRisks").then(m => ({ default: m.LinkedRisksPopup })));
const AddNewRiskForm = lazy(() => import("../../AddNewRiskForm"));

import {
  AlertBox,
  styles,
} from "../../../pages/ComplianceTracker/1.0ComplianceTracker/styles";
import { handleAlert } from "../../../../application/tools/alertUtils";
import { AlertProps } from "../../../types/alert.types";
import allowedRoles from "../../../../application/constants/permissions";
import { updateControl } from "../../../../application/repository/control_eu_act.repository";
import { useAuth } from "../../../../application/hooks/useAuth";
import useUsers from "../../../../application/hooks/useUsers";
import { User } from "../../../../domain/types/User";
import { useSearchParams } from "react-router-dom";
import { getFileById } from "../../../../application/repository/file.repository";
import { getEntityById } from "../../../../application/repository/entity.repository";

// Input styles matching other drawers
export const inputStyles = {
  minWidth: 200,
  maxWidth: "100%",
  flexGrow: 1,
  height: 34,
};

interface SubcontrolFormData {
  id?: number;
  title?: string;
  description?: string;
  order_no?: number;
  control_id?: number;
  // Details tab fields
  status: string;
  owner: string;
  reviewer: string;
  approver: string;
  due_date: Dayjs | null;
  implementation_details: string;
  risk_review: string;
  // Evidence tab fields
  evidence_description: string;
  evidence_files: FileData[];
  uploadEvidenceFiles: FileData[];
  deletedEvidenceFileIds: number[];
  pendingAttachEvidenceFiles: FileData[]; // Files from File Manager to attach
  feedback_description: string;
  feedback_files: FileData[];
  uploadFeedbackFiles: FileData[];
  deletedFeedbackFileIds: number[];
  pendingAttachFeedbackFiles: FileData[]; // Files from File Manager to attach
  // Cross Mappings tab fields
  risks: number[];
  selectedRisks: number[];
  deletedRisks: number[];
  linkedRiskObjects: any[];
}

const NewControlPane = ({
  data,
  isOpen,
  handleClose,
  controlCategoryId,
  OnSave,
  OnError,
  onComplianceUpdate,
  projectId,
}: {
  data: Control;
  isOpen: boolean;
  handleClose: () => void;
  controlCategoryId?: string;
  OnSave?: (state: Control) => void;
  OnError?: () => void;
  onComplianceUpdate?: () => void;
  projectId: number;
}) => {
  const { userRoleName, userId } = useAuth();
  const { users } = useUsers();

  // ========================================================================
  // STATE - UI & LOADING
  // ========================================================================

  const [selectedSubcontrolIndex, setSelectedSubcontrolIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("details");
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projectMembers, setProjectMembers] = useState<User[]>([]);
  const [searchParams] = useSearchParams();

  // File input refs
  const evidenceFileInputRef = useRef<HTMLInputElement>(null);
  const feedbackFileInputRef = useRef<HTMLInputElement>(null);
  const subcontrolTabsContainerRef = useRef<HTMLDivElement>(null);

  // Risk linking state
  const [showLinkedRisksPopup, setShowLinkedRisksPopup] = useState(false);
  const [isRiskDetailModalOpen, setIsRiskDetailModalOpen] = useState(false);
  const [selectedRiskForView, setSelectedRiskForView] = useState<any>(null);
  const [riskFormData, setRiskFormData] = useState<any>(null);
  const onRiskSubmitRef = useRef<(() => void) | null>(null);

  // File picker modal state
  const [showEvidenceFilePicker, setShowEvidenceFilePicker] = useState(false);
  const [showFeedbackFilePicker, setShowFeedbackFilePicker] = useState(false);

  // ========================================================================
  // PERMISSIONS
  // ========================================================================

  const isEditingDisabled =
    !allowedRoles.frameworks.edit.includes(userRoleName);
  const isAuditingDisabled =
    !allowedRoles.frameworks.audit.includes(userRoleName);

  // ========================================================================
  // STATE - FORM DATA (Per-subcontrol map)
  // ========================================================================

  const [subcontrolFormData, setSubcontrolFormData] = useState<
    Record<number, SubcontrolFormData>
  >({});

  const [controlData, setControlData] = useState<Control>(data);

  // ========================================================================
  // UTILITY FUNCTIONS
  // ========================================================================

  const sanitizeField = (value: string | undefined | null): string => {
    if (!value || value === "undefined") {
      return "";
    }
    return value;
  };

  const normalizeFiles = (files: any[]): FileData[] => {
    if (!Array.isArray(files)) return [];
    return files.map((file: any) => ({
      id: file.id?.toString() || file.fileId?.toString() || "",
      fileName: file.fileName || file.filename || file.file_name || "",
      size: file.size || 0,
      type: file.type || "",
      uploadDate:
        file.uploadDate || file.uploaded_time || new Date().toISOString(),
      uploader: file.uploader || file.uploaded_by?.toString() || "Unknown",
      data: file.data,
      source: file.source,
    }));
  };

  const initializeSubcontrolFormData = () => {
    const newFormData: Record<number, SubcontrolFormData> = {};
    controlData.subControls?.forEach((sc) => {
      if (sc.id) {
        // Normalize evidence files
        let evidenceFiles: FileData[] = [];
        if (sc.evidence_files) {
          if (Array.isArray(sc.evidence_files)) {
            evidenceFiles = normalizeFiles(sc.evidence_files);
          } else if (typeof sc.evidence_files === "string") {
            try {
              const parsed = JSON.parse(sc.evidence_files);
              evidenceFiles = normalizeFiles(
                Array.isArray(parsed) ? parsed : [parsed]
              );
            } catch {
              evidenceFiles = [];
            }
          }
        }

        // Normalize feedback files
        let feedbackFiles: FileData[] = [];
        if (sc.feedback_files) {
          if (Array.isArray(sc.feedback_files)) {
            feedbackFiles = normalizeFiles(sc.feedback_files);
          } else if (typeof sc.feedback_files === "string") {
            try {
              const parsed = JSON.parse(sc.feedback_files);
              feedbackFiles = normalizeFiles(
                Array.isArray(parsed) ? parsed : [parsed]
              );
            } catch {
              feedbackFiles = [];
            }
          }
        }

        // Initialize risks from backend data
        const risks = Array.isArray(sc.risks) ? sc.risks : [];

        newFormData[sc.id] = {
          id: sc.id,
          title: sc.title,
          description: sc.description,
          order_no: sc.order_no,
          control_id: sc.control_id,
          status: sc.status || "",
          owner: sc.owner?.toString() || "",
          reviewer: sc.reviewer?.toString() || "",
          approver: sc.approver?.toString() || "",
          due_date: sc.due_date ? dayjs(sc.due_date) : null,
          implementation_details: sanitizeField(sc.implementation_details),
          risk_review: sc.risk_review || "",
          evidence_description: sanitizeField(sc.evidence_description),
          evidence_files: evidenceFiles,
          uploadEvidenceFiles: [],
          deletedEvidenceFileIds: [],
          pendingAttachEvidenceFiles: [],
          feedback_description: sanitizeField(sc.feedback_description),
          feedback_files: feedbackFiles,
          uploadFeedbackFiles: [],
          deletedFeedbackFileIds: [],
          pendingAttachFeedbackFiles: [],
          risks: risks,
          selectedRisks: [],
          deletedRisks: [],
          linkedRiskObjects: [],
        };
      }
    });
    return newFormData;
  };

  // ========================================================================
  // INITIALIZATION & EFFECTS
  // ========================================================================

  // Fetch linked risks for a subcontrol
  const fetchLinkedRisksForSubcontrol = async (
    subcontrolId: number,
    riskIds: number[]
  ) => {
    if (riskIds.length === 0) {
      return;
    }

    try {
      const riskPromises = riskIds.map((riskId: number) =>
        getEntityById({
          routeUrl: `/projectRisks/${riskId}`,
        })
          .then((response: any) => response.data)
          .catch(() => null)
      );

      const riskResults = await Promise.all(riskPromises);
      const validRisks = riskResults.filter((risk: any) => risk !== null);

      // Update the linkedRiskObjects for this subcontrol
      setSubcontrolFormData((prev) => {
        if (!prev[subcontrolId]) return prev;
        return {
          ...prev,
          [subcontrolId]: {
            ...prev[subcontrolId],
            linkedRiskObjects: validRisks,
          },
        };
      });
    } catch (error) {
      console.error("Error fetching linked risks:", error);
    }
  };

  useEffect(() => {
    setControlData(data);
    const formData = initializeSubcontrolFormData();
    setSubcontrolFormData(formData);

    // Fetch linked risks for each subcontrol
    Object.keys(formData).forEach((subcontrolIdStr) => {
      const subcontrolId = parseInt(subcontrolIdStr);
      const subcontrolData = formData[subcontrolId];
      if (
        subcontrolData &&
        subcontrolData.risks &&
        subcontrolData.risks.length > 0
      ) {
        fetchLinkedRisksForSubcontrol(subcontrolId, subcontrolData.risks);
      }
    });

    // Filter project members
    if (users && users.length > 0) {
      setProjectMembers(
        users.filter((user) => user.id && user.name && user.surname)
      );
    }

    // Handle URL parameters
    const subControlId = searchParams.get("subControlId");
    const isEvidence = searchParams.get("isEvidence");

    if (subControlId && data.subControls && data.subControls.length > 0) {
      const subControl = data.subControls.find(
        (sc) => sc.id === Number(subControlId)
      );
      if (subControl) {
        const sorted = (data.subControls || [])
          .slice()
          .sort((a, b) => (a.order_no ?? 0) - (b.order_no ?? 0));
        const idx = sorted.findIndex((sc) => sc.id === subControl.id);
        setSelectedSubcontrolIndex(idx >= 0 ? idx : 0);

        if (isEvidence === "true") {
          setActiveTab("evidences");
        } else if (isEvidence === "false") {
          setActiveTab("evidences"); // Keep on evidences tab but can add scroll to section logic
        } else {
          setActiveTab("details");
        }
      }
    }
  }, [data, users, searchParams]);

  // ========================================================================
  // HANDLERS - TAB NAVIGATION
  // ========================================================================

  const handleSubcontrolTabChange = (
    _: React.SyntheticEvent,
    newIndex: number
  ) => {
    setSelectedSubcontrolIndex(newIndex);
  };

  // Scroll active tab into view when it changes
  useEffect(() => {
    if (subcontrolTabsContainerRef.current) {
      const container = subcontrolTabsContainerRef.current;
      const activeTabElement = container.querySelector(
        `[role="tab"][aria-selected="true"]`
      ) as HTMLElement;

      if (activeTabElement) {
        const containerRect = container.getBoundingClientRect();
        const tabRect = activeTabElement.getBoundingClientRect();
        const scrollLeft = container.scrollLeft;
        const tabLeft = tabRect.left - containerRect.left + scrollLeft;
        const containerWidth = container.clientWidth;

        // Calculate scroll position to center the tab
        const targetScrollLeft =
          tabLeft - containerWidth / 2 + tabRect.width / 2;

        // Smooth scroll to center the active tab
        container.scrollTo({
          left: Math.max(0, targetScrollLeft),
          behavior: "smooth",
        });
      }
    }
  }, [selectedSubcontrolIndex]);

  const handleSectionTabChange = (
    _: React.SyntheticEvent,
    newValue: string
  ) => {
    setActiveTab(newValue);
  };

  // ========================================================================
  // HANDLERS - FORM FIELD CHANGES
  // ========================================================================

  const updateSubcontrolField = (
    subcontrolId: number,
    field: keyof SubcontrolFormData,
    value: any
  ) => {
    setSubcontrolFormData((prev) => ({
      ...prev,
      [subcontrolId]: {
        ...prev[subcontrolId],
        [field]: value,
      },
    }));
  };

  // ========================================================================
  // HANDLERS - FILE OPERATIONS
  // ========================================================================

  const handleEvidenceFileInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files) return;

    const currentSubcontrol = controlData.subControls![selectedSubcontrolIndex];
    if (!currentSubcontrol.id) return;

    const newFiles: FileData[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newFiles.push({
        id: (Date.now() + Math.random()).toString(),
        fileName: file.name,
        size: file.size,
        type: file.type,
        data: file,
        uploadDate: new Date().toISOString(),
        uploader: "Current User",
      });
    }

    if (!currentSubcontrol.id) return;

    const subcontrolId = currentSubcontrol.id;
    setSubcontrolFormData((prev) => ({
      ...prev,
      [subcontrolId]: {
        ...prev[subcontrolId],
        uploadEvidenceFiles: [
          ...prev[subcontrolId].uploadEvidenceFiles,
          ...newFiles,
        ],
      },
    }));

    handleAlert({
      variant: "info",
      body: "Please save the changes to save the file changes.",
      setAlert,
    });

    // Reset the input
    if (evidenceFileInputRef.current) {
      evidenceFileInputRef.current.value = "";
    }
  };

  const handleDeleteEvidenceFile = (fileId: string) => {
    const currentSubcontrol = controlData.subControls![selectedSubcontrolIndex];
    if (!currentSubcontrol.id) return;

    const fileIdNumber = parseInt(fileId);
    if (isNaN(fileIdNumber)) {
      handleAlert({
        variant: "error",
        body: "Invalid file ID",
        setAlert,
      });
      return;
    }

    if (!currentSubcontrol.id) return;

    const subcontrolId = currentSubcontrol.id;
    setSubcontrolFormData((prev) => ({
      ...prev,
      [subcontrolId]: {
        ...prev[subcontrolId],
        evidence_files: prev[subcontrolId].evidence_files.filter(
          (f: FileData) => f.id.toString() !== fileId
        ),
        deletedEvidenceFileIds: [
          ...prev[subcontrolId].deletedEvidenceFileIds,
          fileIdNumber,
        ],
      },
    }));

    handleAlert({
      variant: "info",
      body: "Please save the changes to save the file changes.",
      setAlert,
    });
  };

  const handleFeedbackFileInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files) return;

    const currentSubcontrol = controlData.subControls![selectedSubcontrolIndex];
    if (!currentSubcontrol.id) return;

    const newFiles: FileData[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newFiles.push({
        id: (Date.now() + Math.random()).toString(),
        fileName: file.name,
        size: file.size,
        type: file.type,
        data: file,
        uploadDate: new Date().toISOString(),
        uploader: "Current User",
      });
    }

    if (!currentSubcontrol.id) return;

    const subcontrolId = currentSubcontrol.id;
    setSubcontrolFormData((prev) => ({
      ...prev,
      [subcontrolId]: {
        ...prev[subcontrolId],
        uploadFeedbackFiles: [
          ...prev[subcontrolId].uploadFeedbackFiles,
          ...newFiles,
        ],
      },
    }));

    handleAlert({
      variant: "info",
      body: "Please save the changes to save the file changes.",
      setAlert,
    });

    // Reset the input
    if (feedbackFileInputRef.current) {
      feedbackFileInputRef.current.value = "";
    }
  };

  const handleDeleteFeedbackFile = (fileId: string) => {
    const currentSubcontrol = controlData.subControls![selectedSubcontrolIndex];
    if (!currentSubcontrol.id) return;

    const fileIdNumber = parseInt(fileId);
    if (isNaN(fileIdNumber)) {
      handleAlert({
        variant: "error",
        body: "Invalid file ID",
        setAlert,
      });
      return;
    }

    if (!currentSubcontrol.id) return;

    const subcontrolId = currentSubcontrol.id;
    setSubcontrolFormData((prev) => ({
      ...prev,
      [subcontrolId]: {
        ...prev[subcontrolId],
        feedback_files: prev[subcontrolId].feedback_files.filter(
          (f: FileData) => f.id.toString() !== fileId
        ),
        deletedFeedbackFileIds: [
          ...prev[subcontrolId].deletedFeedbackFileIds,
          fileIdNumber,
        ],
      },
    }));

    handleAlert({
      variant: "info",
      body: "Please save the changes to save the file changes.",
      setAlert,
    });
  };

  const handleAttachExistingEvidenceFiles = (selectedFiles: FileData[]) => {
    if (selectedFiles.length === 0) return;

    const currentSubcontrol = controlData.subControls![selectedSubcontrolIndex];
    if (!currentSubcontrol.id) return;

    const subcontrolId = currentSubcontrol.id;
    setSubcontrolFormData((prev) => ({
      ...prev,
      [subcontrolId]: {
        ...prev[subcontrolId],
        pendingAttachEvidenceFiles: [
          ...prev[subcontrolId].pendingAttachEvidenceFiles,
          ...selectedFiles,
        ],
      },
    }));

    handleAlert({
      variant: "info",
      body: "Please save the changes to attach the selected files.",
      setAlert,
    });
  };

  const handleAttachExistingFeedbackFiles = (selectedFiles: FileData[]) => {
    if (selectedFiles.length === 0) return;

    const currentSubcontrol = controlData.subControls![selectedSubcontrolIndex];
    if (!currentSubcontrol.id) return;

    const subcontrolId = currentSubcontrol.id;
    setSubcontrolFormData((prev) => ({
      ...prev,
      [subcontrolId]: {
        ...prev[subcontrolId],
        pendingAttachFeedbackFiles: [
          ...prev[subcontrolId].pendingAttachFeedbackFiles,
          ...selectedFiles,
        ],
      },
    }));

    handleAlert({
      variant: "info",
      body: "Please save the changes to attach the selected files.",
      setAlert,
    });
  };

  const handleDownloadFile = async (fileId: string, fileName: string) => {
    try {
      // Validate fileId
      const fileIdNumber = parseInt(fileId);
      if (isNaN(fileIdNumber) || fileIdNumber <= 0) {
        handleAlert({
          variant: "error",
          body: "Invalid file ID",
          setAlert,
        });
        return;
      }

      // The backend expects the file ID as a string, but it must be a valid numeric ID
      const response = await getFileById({
        id: fileId,
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

      handleAlert({
        variant: "success",
        body: "File downloaded successfully",
        setAlert,
      });
    } catch (error: any) {
      console.error("Error downloading file:", error);
      console.error("File ID attempted:", fileId);
      handleAlert({
        variant: "error",
        body:
          error?.response?.status === 404
            ? "File not found. It may have been deleted."
            : "Failed to download file. Please try again.",
        setAlert,
      });
    }
  };

  // ========================================================================
  // HANDLERS - RISK LINKING
  // ========================================================================

  const handleUnlinkRisk = (riskId: number) => {
    const currentSubcontrol = controlData.subControls![selectedSubcontrolIndex];
    if (!currentSubcontrol.id) return;

    if (!currentSubcontrol.id) return;

    const subcontrolId = currentSubcontrol.id;
    setSubcontrolFormData((prev) => ({
      ...prev,
      [subcontrolId]: {
        ...prev[subcontrolId],
        selectedRisks: prev[subcontrolId].selectedRisks.filter(
          (id: number) => id !== riskId
        ),
        deletedRisks: prev[subcontrolId].risks.includes(riskId)
          ? [...prev[subcontrolId].deletedRisks, riskId]
          : prev[subcontrolId].deletedRisks,
      },
    }));

    handleAlert({
      variant: "info",
      body: "Please save the changes to save the risk changes.",
      setAlert,
    });
  };

  const handleViewRiskDetail = async (risk: any) => {
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
      console.error("Error fetching risk details:", error);
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
    setRiskFormData(null);
  };

  const handleRiskUpdateSuccess = () => {
    handleRiskDetailModalClose();
    handleAlert({
      variant: "success",
      body: "Risk updated successfully",
      setAlert,
    });
    // Refresh linked risks after update
    if (currentSubcontrol?.id) {
      const subcontrolData = subcontrolFormData[currentSubcontrol.id];
      if (
        subcontrolData &&
        subcontrolData.risks &&
        subcontrolData.risks.length > 0
      ) {
        fetchLinkedRisksForSubcontrol(
          currentSubcontrol.id,
          subcontrolData.risks
        );
      }
    }
  };

  // ========================================================================
  // HANDLER - SAVE
  // ========================================================================

  const confirmSave = async () => {
    setIsSubmitting(true);

    try {
      const formData = new FormData();

      // Add control level fields
      formData.append("title", controlData.title || "");
      formData.append("description", controlData.description || "");
      formData.append("order_no", controlData.order_no?.toString() || "");

      // Add subcontrols as a JSON string
      const subControlsForJson = controlData.subControls?.map((sc) => {
        const formDataForSC = subcontrolFormData[sc.id!] || {};
        return {
          id: sc.id,
          title: sc.title,
          description: sc.description,
          order_no: sc.order_no,
          status: formDataForSC.status || "",
          approver: formDataForSC.approver
            ? Number(formDataForSC.approver)
            : null,
          risk_review: formDataForSC.risk_review || null,
          owner: formDataForSC.owner ? Number(formDataForSC.owner) : null,
          reviewer: formDataForSC.reviewer
            ? Number(formDataForSC.reviewer)
            : null,
          due_date: formDataForSC.due_date
            ? formDataForSC.due_date.format("YYYY-MM-DD")
            : null,
          implementation_details: formDataForSC.implementation_details || "",
          evidence_description: formDataForSC.evidence_description || "",
          feedback_description: formDataForSC.feedback_description || "",
          risksDelete: JSON.stringify(formDataForSC.deletedRisks || []),
          risksMitigated: JSON.stringify(formDataForSC.selectedRisks || []),
        };
      });
      formData.append("subControls", JSON.stringify(subControlsForJson));

      // Add files for each subcontrol
      controlData.subControls?.forEach((sc) => {
        if (!sc.id) return;
        const formDataForSC = subcontrolFormData[sc.id];

        // Evidence files
        formDataForSC?.uploadEvidenceFiles.forEach((fileData) => {
          if (fileData.data instanceof Blob) {
            const fileToUpload =
              fileData.data instanceof File
                ? fileData.data
                : new File([fileData.data], fileData.fileName, {
                    type: fileData.type,
                  });
            formData.append(`evidence_files_${sc.id}`, fileToUpload);
          }
        });

        // Feedback files
        formDataForSC?.uploadFeedbackFiles.forEach((fileData) => {
          if (fileData.data instanceof Blob) {
            const fileToUpload =
              fileData.data instanceof File
                ? fileData.data
                : new File([fileData.data], fileData.fileName, {
                    type: fileData.type,
                  });
            formData.append(`feedback_files_${sc.id}`, fileToUpload);
          }
        });
      });

      // Add deleted files
      const allDeletedFileIds = Object.values(subcontrolFormData).flatMap(
        (data) => [
          ...data.deletedEvidenceFileIds,
          ...data.deletedFeedbackFileIds,
        ]
      );

      // Collect attached file IDs (files from File Manager to link)
      const attachedEvidenceFiles: Record<number, number[]> = {};
      const attachedFeedbackFiles: Record<number, number[]> = {};

      controlData.subControls?.forEach((sc) => {
        if (!sc.id) return;
        const formDataForSC = subcontrolFormData[sc.id];
        if (formDataForSC?.pendingAttachEvidenceFiles.length > 0) {
          attachedEvidenceFiles[sc.id] = formDataForSC.pendingAttachEvidenceFiles.map(
            (f) => parseInt(f.id)
          );
        }
        if (formDataForSC?.pendingAttachFeedbackFiles.length > 0) {
          attachedFeedbackFiles[sc.id] = formDataForSC.pendingAttachFeedbackFiles.map(
            (f) => parseInt(f.id)
          );
        }
      });

      // Debug logging
      console.log("Files to upload:", {
        evidence: Object.values(subcontrolFormData).map(
          (d) => d.uploadEvidenceFiles.length
        ),
        feedback: Object.values(subcontrolFormData).map(
          (d) => d.uploadFeedbackFiles.length
        ),
      });
      console.log("Files to attach:", {
        evidence: attachedEvidenceFiles,
        feedback: attachedFeedbackFiles,
      });
      console.log("Files to delete:", allDeletedFileIds);

      formData.append("delete", JSON.stringify(allDeletedFileIds));

      // Add attached file IDs (for linking existing files from File Manager)
      if (Object.keys(attachedEvidenceFiles).length > 0) {
        formData.append("attach_evidence_files", JSON.stringify(attachedEvidenceFiles));
      }
      if (Object.keys(attachedFeedbackFiles).length > 0) {
        formData.append("attach_feedback_files", JSON.stringify(attachedFeedbackFiles));
      }

      // Add user and project info
      formData.append("user_id", userId?.toString() || "1");
      formData.append("project_id", projectId.toString());

      const response = await updateControl({
        controlId: controlData.id,
        body: formData,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.status === 200) {
        setIsSubmitting(false);

        // Extract the actual response data from the STATUS_CODE wrapper
        // Response structure: { message: "OK", data: { response: { control, subControls } } }
        const responseData =
          response.data?.data?.response ||
          response.data?.response ||
          response.data;

        // Update controlData with the response if available
        if (responseData?.subControls) {
          const updatedControl = {
            ...controlData,
            subControls: responseData.subControls,
          };
          setControlData(updatedControl);

          // Re-initialize form data from updated controlData
          const newFormData = initializeSubcontrolFormData();
          setSubcontrolFormData(newFormData);
        }

        // Notify parent components to refresh data
        OnSave?.(controlData);
        onComplianceUpdate?.();

        handleAlert({
          variant: "success",
          body: "Control saved successfully",
          setAlert,
        });

        // Close the drawer
        handleClose();
      } else {
        console.error("Failed to save control changes. Please try again.");
        setIsSubmitting(false);
        OnError?.();
        handleClose();
      }
    } catch (error) {
      console.error("Failed to save control changes. Please try again.", error);
      setIsSubmitting(false);
      OnError?.();
      handleClose();
    }
  };

  // ========================================================================
  // HELPER - GET CURRENT SUBCONTROL
  // ========================================================================

  const currentSubcontrol = controlData.subControls?.[selectedSubcontrolIndex];
  const currentFormData = currentSubcontrol?.id
    ? subcontrolFormData[currentSubcontrol.id]
    : null;

  const innerTabs = [
    {
      label: "Details",
      value: "details",
      icon: "FileText" as keyof typeof LucideIcons,
    },
    {
      label: "Evidence",
      value: "evidences",
      icon: "FolderOpen" as keyof typeof LucideIcons,
    },
    {
      label: "Cross mappings",
      value: "cross-mappings",
      icon: "Link" as keyof typeof LucideIcons,
    },
    {
      label: "Notes",
      value: "notes",
      icon: "MessageSquare" as keyof typeof LucideIcons,
    },
  ];

  // ========================================================================
  // RENDER
  // ========================================================================

  // Create outer tabs from subControls
  const outerTabs =
    controlData.subControls?.map((_, index) => ({
      label: `Subcontrol ${index + 1}`,
      value: index.toString(),
    })) || [];

  return (
    <>
      {alert && (
        <AlertBox>
          <Alert
            variant={alert.variant}
            body={alert.body}
            isToast={true}
            onClick={() => setAlert(null)}
            sx={styles.alert}
          />
        </AlertBox>
      )}

      {isSubmitting && (
        <CustomizableToast title="Saving control. Please wait..." />
      )}

      <Drawer
        anchor="right"
        open={isOpen}
        onClose={handleClose}
        sx={{
          width: 850,
          margin: 0,
          "& .MuiDrawer-paper": {
            width: 850,
            margin: 0,
            borderRadius: 0,
            overflowX: "hidden",
            backgroundColor: "#FCFCFD",
            height: "100vh",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {/* DRAWER HEADER */}
        <Box
          sx={{
            padding: "16px 20px",
            borderBottom: "1px solid #eaecf0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h6"
              sx={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#1c2130",
                mb: controlData.description ? 1.5 : 0,
              }}
            >
              {`${controlCategoryId}.${controlData.order_no} ${controlData.title}`}
            </Typography>
            {/* Control Description Panel */}
            {controlData.description && (
              <Stack
                sx={{
                  border: "1px solid #eee",
                  padding: "12px",
                  backgroundColor: "#f8f9fa",
                  borderRadius: "4px",
                }}
              >
                <Typography fontSize={13} sx={{ marginBottom: "8px" }}>
                  <strong>Description:</strong>
                </Typography>
                <Typography fontSize={13} color="#666">
                  {controlData.description}
                </Typography>
              </Stack>
            )}
          </Box>
          <Button
            onClick={handleClose}
            sx={{
              minWidth: "auto",
              padding: 0,
              color: "text.tertiary",
            }}
          >
            <CloseIcon size={20} />
          </Button>
        </Box>

        {/* OUTER TABS - SUBCONTROLS */}
        {controlData.subControls && controlData.subControls.length > 0 && (
          <TabContext value={selectedSubcontrolIndex.toString()}>
            <Box
              ref={subcontrolTabsContainerRef}
              sx={{
                overflowX: "auto",
                overflowY: "hidden",
                scrollBehavior: "smooth",
                "&::-webkit-scrollbar": {
                  height: "6px",
                },
                "&::-webkit-scrollbar-track": {
                  backgroundColor: "transparent",
                },
                "&::-webkit-scrollbar-thumb": {
                  backgroundColor: "border.dark",
                  borderRadius: "3px",
                  "&:hover": {
                    backgroundColor: "text.muted",
                  },
                },
              }}
            >
              <Box sx={{ padding: "0 20px", minWidth: "max-content" }}>
                <TabBar
                  tabs={outerTabs}
                  activeTab={selectedSubcontrolIndex.toString()}
                  onChange={(event, newValue) =>
                    handleSubcontrolTabChange(event, parseInt(newValue))
                  }
                />
              </Box>
            </Box>
          </TabContext>
        )}

        {/* DRAWER CONTENT */}
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            minHeight: 0,
          }}
        >
          {currentSubcontrol && currentFormData ? (
            <Stack spacing={3}>
              {/* Subcontrol Header */}
              <Box>
                <Typography
                  sx={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "#1c2130",
                    mb: currentSubcontrol.description ? 1.5 : 0,
                  }}
                >
                  {`${controlCategoryId}.${controlData.order_no}.${currentSubcontrol.order_no}`}{" "}
                  {currentSubcontrol.title}
                </Typography>
                {/* Description Panel */}
                {currentSubcontrol.description && (
                  <Stack
                    sx={{
                      border: "1px solid #eee",
                      padding: "12px",
                      backgroundColor: "#f8f9fa",
                      borderRadius: "4px",
                    }}
                  >
                    <Typography fontSize={13} sx={{ marginBottom: "8px" }}>
                      <strong>Description:</strong>
                    </Typography>
                    <Typography fontSize={13} color="#666">
                      {currentSubcontrol.description}
                    </Typography>
                  </Stack>
                )}
              </Box>

              {/* INNER TABS - SECTIONS */}
              <TabContext value={activeTab}>
                <Box>
                  <TabBar
                    tabs={innerTabs}
                    activeTab={activeTab}
                    onChange={handleSectionTabChange}
                  />
                </Box>

                {/* TAB 1: DETAILS */}
                <TabPanel value="details" sx={{ padding: 0 }}>
                  <Stack padding="15px 0" gap="15px">
                    {/* Implementation Details */}
                    <Stack>
                      <Typography fontSize={13} sx={{ marginBottom: "5px" }}>
                        Implementation description:
                      </Typography>
                      <RichTextEditor
                        toolbar="full"
                        initialContent={currentFormData.implementation_details}
                        onContentChange={(content) =>
                          updateSubcontrolField(
                            currentSubcontrol.id!,
                            "implementation_details",
                            content
                          )
                        }
                        placeholder="Describe how this requirement is implemented..."
                        isEditable={!isEditingDisabled}
                        height="120px"
                      />
                    </Stack>

                    {/* Status & Assignments */}
                    <Stack gap="24px">
                      <Select
                        id={`status-${currentSubcontrol.id}`}
                        label="Status:"
                        value={currentFormData.status}
                        onChange={(e: SelectChangeEvent<string | number>) =>
                          updateSubcontrolField(
                            currentSubcontrol.id!,
                            "status",
                            String(e.target.value)
                          )
                        }
                        items={[
                          { _id: "Waiting", name: "Waiting" },
                          { _id: "In progress", name: "In progress" },
                          { _id: "Done", name: "Done" },
                        ]}
                        sx={inputStyles}
                        placeholder="Select status"
                        disabled={isEditingDisabled}
                      />

                      <Select
                        id={`owner-${currentSubcontrol.id}`}
                        label="Owner:"
                        value={currentFormData.owner}
                        onChange={(e: SelectChangeEvent<string | number>) =>
                          updateSubcontrolField(
                            currentSubcontrol.id!,
                            "owner",
                            String(e.target.value)
                          )
                        }
                        items={(projectMembers || []).map((user) => ({
                          _id: user.id!.toString(),
                          name: user.name || "",
                          surname: user.surname || "",
                        }))}
                        sx={inputStyles}
                        placeholder="Select owner"
                        disabled={isEditingDisabled}
                      />

                      <Select
                        id={`reviewer-${currentSubcontrol.id}`}
                        label="Reviewer:"
                        value={currentFormData.reviewer}
                        onChange={(e: SelectChangeEvent<string | number>) =>
                          updateSubcontrolField(
                            currentSubcontrol.id!,
                            "reviewer",
                            String(e.target.value)
                          )
                        }
                        items={(projectMembers || []).map((user) => ({
                          _id: user.id!.toString(),
                          name: user.name || "",
                          surname: user.surname || "",
                        }))}
                        sx={inputStyles}
                        placeholder="Select reviewer"
                        disabled={isEditingDisabled}
                      />

                      <Select
                        id={`approver-${currentSubcontrol.id}`}
                        label="Approver:"
                        value={currentFormData.approver}
                        onChange={(e: SelectChangeEvent<string | number>) =>
                          updateSubcontrolField(
                            currentSubcontrol.id!,
                            "approver",
                            String(e.target.value)
                          )
                        }
                        items={(projectMembers || []).map((user) => ({
                          _id: user.id!.toString(),
                          name: user.name || "",
                          surname: user.surname || "",
                        }))}
                        sx={inputStyles}
                        placeholder="Select approver"
                        disabled={isEditingDisabled}
                      />

                      <Select
                        id={`risk-review-${currentSubcontrol.id}`}
                        label="Risk review:"
                        value={currentFormData.risk_review}
                        onChange={(e: SelectChangeEvent<string | number>) =>
                          updateSubcontrolField(
                            currentSubcontrol.id!,
                            "risk_review",
                            String(e.target.value)
                          )
                        }
                        items={[
                          { _id: "Acceptable risk", name: "Acceptable risk" },
                          { _id: "Residual risk", name: "Residual risk" },
                          {
                            _id: "Unacceptable risk",
                            name: "Unacceptable risk",
                          },
                        ]}
                        sx={inputStyles}
                        placeholder="Select risk review"
                        disabled={isEditingDisabled}
                      />

                      <DatePicker
                        label="Due date:"
                        date={currentFormData.due_date}
                        handleDateChange={(date) =>
                          updateSubcontrolField(
                            currentSubcontrol.id!,
                            "due_date",
                            date
                          )
                        }
                        sx={inputStyles}
                        disabled={isEditingDisabled}
                      />
                    </Stack>

                    {/* Evidence Description */}
                    <Stack>
                      <Typography fontSize={13} sx={{ marginBottom: "5px" }}>
                        Evidence:
                      </Typography>
                      <RichTextEditor
                        toolbar="full"
                        key={`evidence-${currentSubcontrol.id}`}
                        initialContent={currentFormData.evidence_description}
                        onContentChange={(content: string) =>
                          updateSubcontrolField(
                            currentSubcontrol.id!,
                            "evidence_description",
                            content
                          )
                        }
                        isEditable={!isEditingDisabled}
                        bodySx={{ minHeight: "90px" }}
                      />
                    </Stack>

                    {/* Auditor Feedback Description */}
                    <Stack>
                      <Typography fontSize={13} sx={{ marginBottom: "5px" }}>
                        Auditor feedback:
                      </Typography>
                      <RichTextEditor
                        toolbar="full"
                        key={`feedback-${currentSubcontrol.id}`}
                        initialContent={currentFormData.feedback_description}
                        onContentChange={(content: string) =>
                          updateSubcontrolField(
                            currentSubcontrol.id!,
                            "feedback_description",
                            content
                          )
                        }
                        isEditable={!isAuditingDisabled}
                        bodySx={{ minHeight: "90px" }}
                      />
                    </Stack>
                  </Stack>
                </TabPanel>

                {/* TAB 2: EVIDENCES */}
                <TabPanel value="evidences" sx={{ padding: "15px 0" }}>
                  <Stack spacing={3}>
                    {/* Evidence Files Section */}
                    {/* SECTION 1: EVIDENCE FILES */}
                    <Box>
                      {/* Section Header */}
                      <Typography
                        sx={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#1F2937",
                          mb: 1,
                        }}
                      >
                        Evidence files
                      </Typography>

                      {/* Description */}
                      <Typography
                        sx={{
                          fontSize: "13px",
                          color: "status.default.text",
                          mb: 2,
                        }}
                      >
                        Upload evidence files to document compliance with this
                        subcontrol.
                      </Typography>

                      {/* Upload and Attach Buttons */}
                      <Stack direction="row" spacing={1}>
                        <Button
                          variant="contained"
                          onClick={() => evidenceFileInputRef.current?.click()}
                          disabled={isEditingDisabled}
                          sx={{
                            borderRadius: 2,
                            width: 155,
                            height: 25,
                            fontSize: 11,
                            border: "1px solid #d0d5dd",
                            backgroundColor: "white",
                            color: "text.secondary",
                            textTransform: "none",
                            "&:hover": {
                              backgroundColor: "background.accent",
                              border: "1px solid #d0d5dd",
                            },
                          }}
                        >
                          Add evidence files
                        </Button>
                        <Button
                          variant="contained"
                          onClick={() => setShowEvidenceFilePicker(true)}
                          disabled={isEditingDisabled}
                          sx={{
                            borderRadius: 2,
                            width: 155,
                            height: 25,
                            fontSize: 11,
                            border: "1px solid #d0d5dd",
                            backgroundColor: "white",
                            color: "text.secondary",
                            textTransform: "none",
                            "&:hover": {
                              backgroundColor: "background.accent",
                              border: "1px solid #d0d5dd",
                            },
                          }}
                        >
                          Attach existing files
                        </Button>
                      </Stack>
                      <input
                        ref={evidenceFileInputRef}
                        type="file"
                        multiple
                        hidden
                        onChange={handleEvidenceFileInputChange}
                      />

                      {/* File Count Indicators */}
                      {(currentFormData.evidence_files.length > 0 ||
                        currentFormData.uploadEvidenceFiles.length > 0 ||
                        currentFormData.pendingAttachEvidenceFiles.length > 0 ||
                        currentFormData.deletedEvidenceFileIds.length > 0) && (
                        <Stack direction="row" spacing={2} sx={{ mt: 1.5 }}>
                          {currentFormData.evidence_files.length > 0 && (
                            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                              {currentFormData.evidence_files.length} files
                              attached
                            </Typography>
                          )}
                          {currentFormData.uploadEvidenceFiles.length > 0 && (
                            <Typography sx={{ fontSize: 11, color: "brand.primary" }}>
                              +{currentFormData.uploadEvidenceFiles.length}{" "}
                              pending upload
                            </Typography>
                          )}
                          {currentFormData.pendingAttachEvidenceFiles.length > 0 && (
                            <Typography sx={{ fontSize: 11, color: "#0369A1" }}>
                              +{currentFormData.pendingAttachEvidenceFiles.length}{" "}
                              pending attach
                            </Typography>
                          )}
                          {currentFormData.deletedEvidenceFileIds.length >
                            0 && (
                            <Typography sx={{ fontSize: 11, color: "status.error.text" }}>
                              -{currentFormData.deletedEvidenceFileIds.length}{" "}
                              pending delete
                            </Typography>
                          )}
                        </Stack>
                      )}

                      {/* Existing Files List */}
                      {currentFormData.evidence_files.length > 0 && (
                        <Stack spacing={1} sx={{ mt: 2 }}>
                          {currentFormData.evidence_files.map((file) => (
                            <Box
                              key={file.id}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 12px",
                                border: "1px solid #eaecf0",
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
                                  alignItems: "center",
                                  gap: 1.5,
                                  flex: 1,
                                  minWidth: 0,
                                }}
                              >
                                <FileIcon size={18} color={text.tertiary} />
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
                                  gap: "4px",
                                  flexShrink: 0,
                                  marginLeft: 1,
                                }}
                              >
                                <Tooltip title="Download">
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      handleDownloadFile(
                                        file.id.toString(),
                                        file.fileName
                                      )
                                    }
                                    disabled={isEditingDisabled}
                                  >
                                    <DownloadIcon size={16} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete">
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      handleDeleteEvidenceFile(
                                        file.id.toString()
                                      )
                                    }
                                    disabled={isEditingDisabled}
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
                      {currentFormData.uploadEvidenceFiles.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                          <Typography
                            sx={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#92400E",
                              mb: 1,
                            }}
                          >
                            Pending upload
                          </Typography>
                          <Stack spacing={1}>
                            {currentFormData.uploadEvidenceFiles.map((file) => (
                              <Box
                                key={file.id}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "10px 12px",
                                  border: "1px solid #FEF3C7",
                                  borderRadius: "4px",
                                  backgroundColor: "#FFFBEB",
                                }}
                              >
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.5,
                                    flex: 1,
                                    minWidth: 0,
                                  }}
                                >
                                  <FileIcon size={18} color="#D97706" />
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
                                <Tooltip title="Remove from queue">
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      setSubcontrolFormData((prev) => ({
                                        ...prev,
                                        [currentSubcontrol.id!]: {
                                          ...prev[currentSubcontrol.id!],
                                          uploadEvidenceFiles: prev[
                                            currentSubcontrol.id!
                                          ].uploadEvidenceFiles.filter(
                                            (f) => f.id !== file.id
                                          ),
                                        },
                                      }));
                                    }}
                                    disabled={isEditingDisabled}
                                    sx={{ flexShrink: 0, marginLeft: 1 }}
                                  >
                                    <DeleteIcon size={16} />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {/* Pending Attach Files (from File Manager) */}
                      {currentFormData.pendingAttachEvidenceFiles.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                          <Typography
                            sx={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#0369A1",
                              mb: 1,
                            }}
                          >
                            Pending attach from File Manager
                          </Typography>
                          <Stack spacing={1}>
                            {currentFormData.pendingAttachEvidenceFiles.map((file) => (
                              <Box
                                key={file.id}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "10px 12px",
                                  border: "1px solid #BAE6FD",
                                  borderRadius: "4px",
                                  backgroundColor: "#F0F9FF",
                                }}
                              >
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.5,
                                    flex: 1,
                                    minWidth: 0,
                                  }}
                                >
                                  <FileIcon size={18} color="#0369A1" />
                                  <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography
                                      sx={{
                                        fontSize: 13,
                                        fontWeight: 500,
                                        color: "#0C4A6E",
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
                                    onClick={() => {
                                      setSubcontrolFormData((prev) => ({
                                        ...prev,
                                        [currentSubcontrol.id!]: {
                                          ...prev[currentSubcontrol.id!],
                                          pendingAttachEvidenceFiles: prev[
                                            currentSubcontrol.id!
                                          ].pendingAttachEvidenceFiles.filter(
                                            (f) => f.id !== file.id
                                          ),
                                        },
                                      }));
                                    }}
                                    disabled={isEditingDisabled}
                                    sx={{ flexShrink: 0, marginLeft: 1 }}
                                  >
                                    <DeleteIcon size={16} />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {/* Empty State */}
                      {currentFormData.evidence_files.length === 0 &&
                        currentFormData.uploadEvidenceFiles.length === 0 &&
                        currentFormData.pendingAttachEvidenceFiles.length === 0 && (
                          <Box
                            sx={{
                              textAlign: "center",
                              py: 4,
                              mt: 2,
                              color: "status.default.text",
                              border: "2px dashed #D1D5DB",
                              borderRadius: 1,
                              backgroundColor: "background.accent",
                            }}
                          >
                            <Typography sx={{ fontSize: 13 }}>
                              No evidence files attached yet
                            </Typography>
                          </Box>
                        )}
                    </Box>

                    {/* SECTION 2: AUDITOR FEEDBACK FILES */}
                    <Box>
                      {/* Section Header */}
                      <Typography
                        sx={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#1F2937",
                          mb: 1,
                        }}
                      >
                        Auditor feedback files
                      </Typography>

                      {/* Description */}
                      <Typography
                        sx={{
                          fontSize: "13px",
                          color: "status.default.text",
                          mb: 2,
                        }}
                      >
                        Upload files related to auditor feedback for this
                        subcontrol.
                      </Typography>

                      {/* Upload and Attach Buttons */}
                      <Stack direction="row" spacing={1}>
                        <Button
                          variant="contained"
                          onClick={() => feedbackFileInputRef.current?.click()}
                          disabled={isAuditingDisabled}
                          sx={{
                            borderRadius: 2,
                            width: 155,
                            height: 25,
                            fontSize: 11,
                            border: "1px solid #d0d5dd",
                            backgroundColor: "white",
                            color: "text.secondary",
                            textTransform: "none",
                            "&:hover": {
                              backgroundColor: "background.accent",
                              border: "1px solid #d0d5dd",
                            },
                          }}
                        >
                          Add feedback files
                        </Button>
                        <Button
                          variant="contained"
                          onClick={() => setShowFeedbackFilePicker(true)}
                          disabled={isAuditingDisabled}
                          sx={{
                            borderRadius: 2,
                            width: 155,
                            height: 25,
                            fontSize: 11,
                            border: "1px solid #d0d5dd",
                            backgroundColor: "white",
                            color: "text.secondary",
                            textTransform: "none",
                            "&:hover": {
                              backgroundColor: "background.accent",
                              border: "1px solid #d0d5dd",
                            },
                          }}
                        >
                          Attach existing files
                        </Button>
                      </Stack>

                      <input
                        ref={feedbackFileInputRef}
                        type="file"
                        multiple
                        hidden
                        onChange={handleFeedbackFileInputChange}
                      />

                      {/* File Count Indicators */}
                      {(currentFormData.feedback_files.length > 0 ||
                        currentFormData.uploadFeedbackFiles.length > 0 ||
                        currentFormData.pendingAttachFeedbackFiles.length > 0 ||
                        currentFormData.deletedFeedbackFileIds.length > 0) && (
                        <Stack direction="row" spacing={2} sx={{ mt: 1.5 }}>
                          {currentFormData.feedback_files.length > 0 && (
                            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                              {currentFormData.feedback_files.length} files
                              attached
                            </Typography>
                          )}
                          {currentFormData.uploadFeedbackFiles.length > 0 && (
                            <Typography sx={{ fontSize: 11, color: "brand.primary" }}>
                              +{currentFormData.uploadFeedbackFiles.length}{" "}
                              pending upload
                            </Typography>
                          )}
                          {currentFormData.pendingAttachFeedbackFiles.length > 0 && (
                            <Typography sx={{ fontSize: 11, color: "#0369A1" }}>
                              +{currentFormData.pendingAttachFeedbackFiles.length}{" "}
                              pending attach
                            </Typography>
                          )}
                          {currentFormData.deletedFeedbackFileIds.length >
                            0 && (
                            <Typography sx={{ fontSize: 11, color: "status.error.text" }}>
                              -{currentFormData.deletedFeedbackFileIds.length}{" "}
                              pending delete
                            </Typography>
                          )}
                        </Stack>
                      )}

                      {/* Existing Files List */}
                      {currentFormData.feedback_files.length > 0 && (
                        <Stack spacing={1} sx={{ mt: 2 }}>
                          {currentFormData.feedback_files.map((file) => (
                            <Box
                              key={file.id}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 12px",
                                border: "1px solid #eaecf0",
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
                                  alignItems: "center",
                                  gap: 1.5,
                                  flex: 1,
                                  minWidth: 0,
                                }}
                              >
                                <FileIcon size={18} color={text.tertiary} />
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
                                  gap: "4px",
                                  flexShrink: 0,
                                  marginLeft: 1,
                                }}
                              >
                                <Tooltip title="Download">
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      handleDownloadFile(
                                        file.id.toString(),
                                        file.fileName
                                      )
                                    }
                                    disabled={isAuditingDisabled}
                                  >
                                    <DownloadIcon size={16} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete">
                                  <IconButton
                                    size="small"
                                    onClick={() =>
                                      handleDeleteFeedbackFile(
                                        file.id.toString()
                                      )
                                    }
                                    disabled={isAuditingDisabled}
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
                      {currentFormData.uploadFeedbackFiles.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                          <Typography
                            sx={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#92400E",
                              mb: 1,
                            }}
                          >
                            Pending upload
                          </Typography>
                          <Stack spacing={1}>
                            {currentFormData.uploadFeedbackFiles.map((file) => (
                              <Box
                                key={file.id}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "10px 12px",
                                  border: "1px solid #FEF3C7",
                                  borderRadius: "4px",
                                  backgroundColor: "#FFFBEB",
                                }}
                              >
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.5,
                                    flex: 1,
                                    minWidth: 0,
                                  }}
                                >
                                  <FileIcon size={18} color="#D97706" />
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
                                <Tooltip title="Remove from queue">
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      setSubcontrolFormData((prev) => ({
                                        ...prev,
                                        [currentSubcontrol.id!]: {
                                          ...prev[currentSubcontrol.id!],
                                          uploadFeedbackFiles: prev[
                                            currentSubcontrol.id!
                                          ].uploadFeedbackFiles.filter(
                                            (f) => f.id !== file.id
                                          ),
                                        },
                                      }));
                                    }}
                                    disabled={isAuditingDisabled}
                                    sx={{ flexShrink: 0, marginLeft: 1 }}
                                  >
                                    <DeleteIcon size={16} />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {/* Pending Attach Files (from File Manager) */}
                      {currentFormData.pendingAttachFeedbackFiles.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                          <Typography
                            sx={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#0369A1",
                              mb: 1,
                            }}
                          >
                            Pending attach from File Manager
                          </Typography>
                          <Stack spacing={1}>
                            {currentFormData.pendingAttachFeedbackFiles.map((file) => (
                              <Box
                                key={file.id}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "10px 12px",
                                  border: "1px solid #BAE6FD",
                                  borderRadius: "4px",
                                  backgroundColor: "#F0F9FF",
                                }}
                              >
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.5,
                                    flex: 1,
                                    minWidth: 0,
                                  }}
                                >
                                  <FileIcon size={18} color="#0369A1" />
                                  <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography
                                      sx={{
                                        fontSize: 13,
                                        fontWeight: 500,
                                        color: "#0C4A6E",
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
                                    onClick={() => {
                                      setSubcontrolFormData((prev) => ({
                                        ...prev,
                                        [currentSubcontrol.id!]: {
                                          ...prev[currentSubcontrol.id!],
                                          pendingAttachFeedbackFiles: prev[
                                            currentSubcontrol.id!
                                          ].pendingAttachFeedbackFiles.filter(
                                            (f) => f.id !== file.id
                                          ),
                                        },
                                      }));
                                    }}
                                    disabled={isAuditingDisabled}
                                    sx={{ flexShrink: 0, marginLeft: 1 }}
                                  >
                                    <DeleteIcon size={16} />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            ))}
                          </Stack>
                        </Box>
                      )}

                      {/* Empty State */}
                      {currentFormData.feedback_files.length === 0 &&
                        currentFormData.uploadFeedbackFiles.length === 0 &&
                        currentFormData.pendingAttachFeedbackFiles.length === 0 && (
                          <Box
                            sx={{
                              textAlign: "center",
                              py: 4,
                              mt: 2,
                              color: "status.default.text",
                              border: "2px dashed #D1D5DB",
                              borderRadius: 1,
                              backgroundColor: "background.accent",
                            }}
                          >
                            <Typography sx={{ fontSize: 13 }}>
                              No feedback files attached yet
                            </Typography>
                          </Box>
                        )}
                    </Box>
                  </Stack>
                </TabPanel>

                {/* TAB 3: CROSS MAPPINGS */}
                <TabPanel value="cross-mappings" sx={{ padding: "15px 0" }}>
                  <Stack spacing={3}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Linked risks
                    </Typography>

                    <Typography variant="body2" color={status.default.text}>
                      Link risks from your risk database to track which risks
                      are being addressed by this subcontrol.
                    </Typography>

                    <Stack direction="row" spacing={2} alignItems="center">
                      <Button
                        variant="contained"
                        sx={{
                          borderRadius: 2,
                          width: 155,
                          height: 25,
                          fontSize: 11,
                          border: "1px solid #d0d5dd",
                          backgroundColor: "white",
                          color: "text.secondary",
                          textTransform: "none",
                          "&:hover": {
                            backgroundColor: "background.accent",
                            border: "1px solid #d0d5dd",
                          },
                        }}
                        onClick={() => setShowLinkedRisksPopup(true)}
                        disabled={isEditingDisabled}
                      >
                        Add/remove risks
                      </Button>

                      <Stack direction="row" spacing={2}>
                        <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                          {`${
                            currentFormData.linkedRiskObjects.filter(
                              (r) =>
                                !currentFormData.deletedRisks.includes(r.id)
                            ).length || 0
                          } risks linked`}
                        </Typography>
                        {currentFormData.selectedRisks.length > 0 && (
                          <Typography sx={{ fontSize: 11, color: "brand.primary" }}>
                            {`+${currentFormData.selectedRisks.length} pending save`}
                          </Typography>
                        )}
                        {currentFormData.deletedRisks.length > 0 && (
                          <Typography sx={{ fontSize: 11, color: "status.error.text" }}>
                            {`-${currentFormData.deletedRisks.length} pending delete`}
                          </Typography>
                        )}
                      </Stack>
                    </Stack>

                    {/* Linked Risks List */}
                    {currentFormData.linkedRiskObjects.filter(
                      (r) => !currentFormData.deletedRisks.includes(r.id)
                    ).length > 0 && (
                      <Stack spacing={1}>
                        {currentFormData.linkedRiskObjects
                          .filter(
                            (r) => !currentFormData.deletedRisks.includes(r.id)
                          )
                          .map((risk) => (
                            <Box
                              key={risk.id}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 12px",
                                border: "1px solid #eaecf0",
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
                                  {risk.name || risk.risk_name}
                                </Typography>
                                {(risk.level || risk.risk_level) && (
                                  <Typography
                                    sx={{ fontSize: 11, color: "status.default.text" }}
                                  >
                                    Risk level: {risk.level || risk.risk_level}
                                  </Typography>
                                )}
                              </Box>

                              <Box sx={{ display: "flex", gap: 0.5 }}>
                                <Tooltip title="View details">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleViewRiskDetail(risk)}
                                    sx={{
                                      color: "text.tertiary",
                                      "&:hover": {
                                        color: "brand.primary",
                                        backgroundColor:
                                          "rgba(19, 113, 91, 0.08)",
                                      },
                                    }}
                                  >
                                    <ViewIcon size={16} />
                                  </IconButton>
                                </Tooltip>

                                <Tooltip title="Unlink risk">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleUnlinkRisk(risk.id)}
                                    disabled={isEditingDisabled}
                                    sx={{
                                      color: "text.tertiary",
                                      "&:hover": {
                                        color: "status.error.text",
                                        backgroundColor:
                                          "rgba(211, 47, 47, 0.08)",
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
                    {currentFormData.linkedRiskObjects.filter(
                      (r) => !currentFormData.deletedRisks.includes(r.id)
                    ).length === 0 &&
                      currentFormData.selectedRisks.length === 0 && (
                        <Box
                          sx={{
                            textAlign: "center",
                            py: 4,
                            color: "status.default.text",
                            border: "2px dashed #D1D5DB",
                            borderRadius: 1,
                            backgroundColor: "background.accent",
                          }}
                        >
                          <Typography variant="body2" sx={{ mb: 1 }}>
                            No risks linked yet
                          </Typography>
                          <Typography variant="caption" color={text.disabled}>
                            Click "Add/remove risks" to link risks from your
                            risk database
                          </Typography>
                        </Box>
                      )}
                  </Stack>
                </TabPanel>

                {/* LINKED RISKS POPUP - LAZY LOADED */}
                {showLinkedRisksPopup && (
                  <Suspense fallback={<CircularProgress size={24} />}>
                    <LinkedRisksPopup
                      onClose={() => setShowLinkedRisksPopup(false)}
                      currentRisks={currentFormData.risks
                        .concat(currentFormData.selectedRisks)
                        .filter(
                          (risk: number) =>
                            !currentFormData.deletedRisks.includes(risk)
                        )}
                      setSelectecRisks={(selectedRisks: number[]) => {
                        const currentSubcontrol =
                          controlData.subControls![selectedSubcontrolIndex];
                        if (!currentSubcontrol.id) return;
                        const subcontrolId = currentSubcontrol.id;
                        setSubcontrolFormData((prev) => ({
                          ...prev,
                          [subcontrolId]: {
                            ...prev[subcontrolId],
                            selectedRisks,
                          },
                        }));
                      }}
                      _setDeletedRisks={(deletedRisks: number[]) => {
                        const currentSubcontrol =
                          controlData.subControls![selectedSubcontrolIndex];
                        if (!currentSubcontrol.id) return;
                        const subcontrolId = currentSubcontrol.id;
                        setSubcontrolFormData((prev) => ({
                          ...prev,
                          [subcontrolId]: {
                            ...prev[subcontrolId],
                            deletedRisks,
                          },
                        }));
                      }}
                      projectId={projectId}
                      frameworkId={1}
                    />
                  </Suspense>
                )}

                {/* TAB 4: NOTES */}
                <TabPanel value="notes" sx={{ padding: "15px 0" }}>
                  <Suspense fallback={<CircularProgress size={24} />}>
                    <NotesTab
                      attachedTo="EU_AI_ACT_SUBCONTROL"
                      attachedToId={currentSubcontrol.id?.toString() || ""}
                    />
                  </Suspense>
                </TabPanel>
              </TabContext>
            </Stack>
          ) : (
            <CircularProgress />
          )}
        </Box>

        {/* DRAWER FOOTER */}
        <Box
          sx={{
            padding: "16px 20px",
            borderTop: "1px solid #eaecf0",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <CustomizableButton
            text="Save"
            onClick={confirmSave}
            isDisabled={isSubmitting}
            sx={{ height: "34px" }}
            startIcon={<SaveIcon size={16} />}
          />
        </Box>
      </Drawer>

      {/* Risk Detail Modal - Outside Drawer to appear on top */}
      <StandardModal
        isOpen={isRiskDetailModalOpen && !!riskFormData}
        onClose={handleRiskDetailModalClose}
        title={`Risk: ${
          selectedRiskForView?.name ||
          selectedRiskForView?.risk_name ||
          "Risk Details"
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

      {/* File Picker Modal for Evidence Files */}
      <FilePickerModal
        open={showEvidenceFilePicker}
        onClose={() => setShowEvidenceFilePicker(false)}
        onSelect={handleAttachExistingEvidenceFiles}
        excludeFileIds={[
          ...currentFormData?.evidence_files.map((f) => f.id) || [],
          ...currentFormData?.pendingAttachEvidenceFiles.map((f) => f.id) || [],
        ]}
        multiSelect={true}
        title="Attach Existing Files as Evidence"
      />

      {/* File Picker Modal for Feedback Files */}
      <FilePickerModal
        open={showFeedbackFilePicker}
        onClose={() => setShowFeedbackFilePicker(false)}
        onSelect={handleAttachExistingFeedbackFiles}
        excludeFileIds={[
          ...currentFormData?.feedback_files.map((f) => f.id) || [],
          ...currentFormData?.pendingAttachFeedbackFiles.map((f) => f.id) || [],
        ]}
        multiSelect={true}
        title="Attach Existing Files as Feedback"
      />
    </>
  );
};

export default NewControlPane;
