import React, { useState, useEffect, Suspense, useRef, lazy } from "react";
import { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { Box, IconButton, Tooltip } from "@mui/material";
import { TabContext, TabPanel } from "@mui/lab";
import { Button, CircularProgress, SelectChangeEvent, useTheme } from "@mui/material";
import { Stack } from "@mui/material";
import { Divider, Drawer, Typography } from "@mui/material";
import { X as CloseIcon, Save as SaveIcon, Trash2 as DeleteIcon, Eye as ViewIcon, Download as DownloadIcon, FileText as FileIcon } from "lucide-react";

import Field from "../../Inputs/Field";
import RichTextEditor from "../../RichTextEditor";
import Select from "../../Inputs/Select";
import DatePicker from "../../Inputs/Datepicker";
import ChipInput from "../../Inputs/ChipInput";
import { CustomizableButton } from "../../button/customizable-button";
import Alert from "../../Alert";
import TabBar from "../../TabBar";
import { LinkedRisksPopup } from "../../LinkedRisks";
import StandardModal from "../../Modals/StandardModal";
import { text } from "../../../themes/palette";

const AddNewRiskForm = lazy(() => import("../../AddNewRiskForm"));
const NotesTab = lazy(() => import("../../Notes/NotesTab"));
import {
  NISTAIRMFDrawerProps,
  NISTAIRMFStatus,
} from "../../../pages/Framework/NIST-AI-RMF/types";
import { AlertProps } from "../../../types/alert.types";
import { updateEntityById, getEntityById } from "../../../../application/repository/entity.repository";
import { useAuth } from "../../../../application/hooks/useAuth";
import useUsers from "../../../../application/hooks/useUsers";
import { User } from "../../../../domain/types/User";
import { FileData } from "../../../../domain/types/File";
import { getFileById } from "../../../../application/repository/file.repository";
import allowedRoles from "../../../../application/constants/permissions";
import { RiskFormValues } from "../../../../domain/types/riskForm.types";

// Type for risk objects
interface LinkedRisk {
  id: number;
  risk_name: string;
  risk_description?: string;
  risk_level?: string;
  mitigation_status?: string;
}

export const inputStyles = {
  minWidth: 200,
  maxWidth: "100%",
  flexGrow: 1,
  height: 34,
};

const NISTAIRMFDrawerDialog: React.FC<NISTAIRMFDrawerProps> = ({
  open,
  onClose,
  onSaveSuccess,
  subcategory,
  category,
  function: functionType,
}) => {
  const theme = useTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [projectMembers, setProjectMembers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState("details");

  // Risk linking state
  const [isLinkedRisksModalOpen, setIsLinkedRisksModalOpen] = useState(false);
  const [selectedRisks, setSelectedRisks] = useState<number[]>([]);
  const [deletedRisks, setDeletedRisks] = useState<number[]>([]);
  const [currentRisks, setCurrentRisks] = useState<number[]>([]);
  const [linkedRiskObjects, setLinkedRiskObjects] = useState<LinkedRisk[]>([]);

  // Risk detail modal state
  const [isRiskDetailModalOpen, setIsRiskDetailModalOpen] = useState(false);
  const [selectedRiskForView, setSelectedRiskForView] = useState<LinkedRisk | null>(null);
  const [riskFormData, setRiskFormData] = useState<RiskFormValues | undefined>(undefined);
  const onRiskSubmitRef = useRef<(() => void) | null>(null);

  const { userRoleName, userId } = useAuth();
  const { users } = useUsers();

  const isEditingDisabled =
    !allowedRoles.frameworks.edit.includes(userRoleName);
  const isAuditingDisabled =
    !allowedRoles.frameworks.audit.includes(userRoleName);

  // Filter users to only show project members
  useEffect(() => {
    if (users?.length > 0) {
      // Since we don't have project data, use all users
      setProjectMembers(users);
    }
  }, [users]);

  // Load evidence files when subcategory changes
  useEffect(() => {
    if (subcategory?.evidence_links) {
      setEvidenceFiles(subcategory.evidence_links as unknown as FileData[]);
    } else {
      setEvidenceFiles([]);
    }
    // Reset upload and deleted files
    setUploadFiles([]);
    setDeletedFiles([]);
  }, [subcategory]);

  // Fetch linked risks when subcategory changes
  useEffect(() => {
    const fetchLinkedRisks = async () => {
      if (subcategory?.id) {
        try {
          const response = await getEntityById({
            routeUrl: `/nist-ai-rmf/subcategories/${subcategory.id}/risks`,
          });
          if (response.data) {
            const riskIds = response.data.map((risk: { id: number }) => risk.id);
            setCurrentRisks(riskIds);
            // Store full risk objects for display
            setLinkedRiskObjects(response.data as LinkedRisk[]);
          }
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("Error fetching linked risks:", error);
          }
          setCurrentRisks([]);
          setLinkedRiskObjects([]);
        }
      } else {
        setCurrentRisks([]);
        setLinkedRiskObjects([]);
      }
      // Reset risk selection state
      setSelectedRisks([]);
      setDeletedRisks([]);
    };

    fetchLinkedRisks();
  }, [subcategory?.id]);

  const [formData, setFormData] = useState({
    status: NISTAIRMFStatus.NOT_STARTED,
    owner: "",
    reviewer: "",
    approver: "",
    auditor_feedback: "",
    implementation_description: "",
    tags: [] as string[],
  });

  const [date, setDate] = useState<Dayjs | null>(null);

  // File upload state
  const [evidenceFiles, setEvidenceFiles] = useState<FileData[]>([]);
  const [uploadFiles, setUploadFiles] = useState<FileData[]>([]);
  const [deletedFiles, setDeletedFiles] = useState<string[]>([]);

  const statusOptions = [
    { id: NISTAIRMFStatus.NOT_STARTED, name: "Not started" },
    { id: NISTAIRMFStatus.DRAFT, name: "Draft" },
    { id: NISTAIRMFStatus.IN_PROGRESS, name: "In progress" },
    { id: NISTAIRMFStatus.AWAITING_REVIEW, name: "Awaiting review" },
    { id: NISTAIRMFStatus.AWAITING_APPROVAL, name: "Awaiting approval" },
    { id: NISTAIRMFStatus.IMPLEMENTED, name: "Implemented" },
    { id: NISTAIRMFStatus.NEEDS_REWORK, name: "Needs rework" },
  ];

  const tabs = [
    {
      label: "Details",
      value: "details",
      icon: "FileText" as const,
    },
    {
      label: "Evidence",
      value: "evidences",
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

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  };

  const inputStyles = {
    minWidth: 200,
    maxWidth: "100%",
    flexGrow: 1,
    height: 34,
  };

  // Populate form data when subcategory changes
  useEffect(() => {
    if (subcategory) {
      setFormData({
        status: subcategory.status || NISTAIRMFStatus.NOT_STARTED,
        owner: subcategory.owner?.toString() || "",
        reviewer: subcategory.reviewer?.toString() || "",
        approver: subcategory.approver?.toString() || "",
        auditor_feedback: subcategory.auditor_feedback || "",
        implementation_description:
          subcategory.implementation_description || "",
        tags: subcategory.tags || [],
      });

      // Set the date if it exists in the fetched data
      if (subcategory.due_date) {
        setDate(dayjs(subcategory.due_date));
      } else {
        setDate(null);
      }
    } else {
      // Reset form when no subcategory
      setFormData({
        status: NISTAIRMFStatus.NOT_STARTED,
        owner: "",
        reviewer: "",
        approver: "",
        auditor_feedback: "",
        implementation_description: "",
        tags: [],
      });
      setDate(null);
    }
  }, [subcategory]);

  const handleFieldChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSelectChange = (field: string) => (event: SelectChangeEvent<string | number>) => {
    const value = event.target.value.toString();
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAlert = ({
    variant,
    body,
  }: {
    variant: "success" | "error" | "warning" | "info";
    body: string;
  }) => {
    setAlert({ variant, body });
    setTimeout(() => setAlert(null), 3000); // 3 seconds
  };

  // File handling functions
  const handleAddFiles = (files: File[]) => {
    const newFiles: FileData[] = files.map((file) => ({
      id: (Date.now() + Math.random()).toString(), // Temporary string ID
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
      body: `${files.length} file(s) added. Please save to apply changes.`,
    });
  };

  const handleDeleteEvidenceFile = (fileId: string) => {
    setEvidenceFiles((prev) => prev.filter((file) => file.id !== fileId));
    setDeletedFiles((prev) => [...prev, fileId]);
    handleAlert({
      variant: "info",
      body: "File marked for deletion. Please save to apply changes.",
    });
  };

  const handleDeleteUploadFile = (fileId: string) => {
    setUploadFiles((prev) => prev.filter((file) => file.id !== fileId));
    handleAlert({
      variant: "info",
      body: "File removed from upload queue.",
    });
  };

  const handleEvidenceFileDownload = async (
    fileId: string,
    fileName: string
  ) => {
    try {
      // Use /files/:id endpoint for evidence files (not file-manager)
      // This avoids project access checks since evidence files are linked to subcategories
      // Use arraybuffer and create Blob manually for better compatibility
      const response = await getFileById({
        id: fileId,
        responseType: "arraybuffer",
      });

      // Create Blob from arraybuffer
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

  const handleSave = async () => {
    if (!subcategory?.id) {
      handleAlert({
        variant: "error",
        body: "No subcategory selected for update",
      });
      return;
    }

    setIsLoading(true);
    try {
      // Always use FormData to support both file and regular updates (ISO pattern)
      const formDataToSend = new FormData();

      // Add form fields
      formDataToSend.append("status", formData.status);
      formDataToSend.append(
        "implementation_description",
        formData.implementation_description
      );
      formDataToSend.append("auditor_feedback", formData.auditor_feedback);
      formDataToSend.append("tags", JSON.stringify(formData.tags));

      if (formData.owner) formDataToSend.append("owner", formData.owner);
      if (formData.reviewer)
        formDataToSend.append("reviewer", formData.reviewer);
      if (formData.approver)
        formDataToSend.append("approver", formData.approver);
      if (date) formDataToSend.append("due_date", date.toISOString());

      // Add file handling fields (ISO pattern)
      // Note: project_id is handled by backend - it gets user's actual project
      formDataToSend.append("user_id", userId?.toString() || "1");
      formDataToSend.append("delete", JSON.stringify(deletedFiles));

      // Add risk linking parameters
      formDataToSend.append("risksMitigated", JSON.stringify(selectedRisks));
      formDataToSend.append("risksDelete", JSON.stringify(deletedRisks));

      // Add uploaded files - use the exact same pattern as ISO frameworks
      uploadFiles.forEach((file: FileData) => {
        if (file.data instanceof Blob) {
          const fileToUpload =
            file.data instanceof File
              ? file.data
              : new File([file.data!], file.fileName, { type: file.type });
          formDataToSend.append("files", fileToUpload);
        }
      });

      const response = await updateEntityById({
        routeUrl: `/nist-ai-rmf/subcategories/${subcategory.id}`,
        body: formDataToSend,
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.status === 200) {
        const hasFiles = uploadFiles.length > 0 || deletedFiles.length > 0;
        setAlert({
          variant: "success",
          body: hasFiles
            ? "Subcategory updated successfully with files"
            : "Subcategory updated successfully",
        });
        setTimeout(() => setAlert(null), 3000); // 3 seconds

        // Reset pending states after successful save
        setUploadFiles([]);
        setDeletedFiles([]);
        setSelectedRisks([]);
        setDeletedRisks([]);

        // Refresh data from server
        if (subcategory?.id) {
          // Refresh evidence files
          const subcategoryResponse = await getEntityById({
            routeUrl: `/nist-ai-rmf/subcategories/byId/${subcategory.id}`,
          });
          if (subcategoryResponse.data?.evidence_links) {
            setEvidenceFiles(subcategoryResponse.data.evidence_links);
          }

          // Refresh linked risks
          const risksResponse = await getEntityById({
            routeUrl: `/nist-ai-rmf/subcategories/${subcategory.id}/risks`,
          });
          if (risksResponse.data) {
            const riskIds = risksResponse.data.map((risk: { id: number }) => risk.id);
            setCurrentRisks(riskIds);
            setLinkedRiskObjects(risksResponse.data as LinkedRisk[]);
          }
        }

        onSaveSuccess?.(
          true,
          "Subcategory updated successfully",
          subcategory.id
        );
        // Don't close the drawer - user can continue editing or close manually with X
      } else {
        throw new Error(
          response.data?.message || "Failed to update subcategory"
        );
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMessage =
        err.response?.data?.message ||
        err.message ||
        "Failed to update subcategory";
      setAlert({
        variant: "error",
        body: errorMessage,
      });
      setTimeout(() => setAlert(null), 3000); // 3 seconds
      onSaveSuccess?.(false, errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle opening risk detail modal
  const handleViewRiskDetails = async (risk: LinkedRisk) => {
    setSelectedRiskForView(risk);
    try {
      // Fetch full risk data
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
      setAlert({
        variant: "error",
        body: "Failed to load risk details",
      });
      setTimeout(() => setAlert(null), 3000);
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
    if (subcategory?.id) {
      getEntityById({
        routeUrl: `/nist-ai-rmf/subcategories/${subcategory.id}/risks`,
      }).then((response) => {
        if (response.data) {
          const riskIds = response.data.map((risk: { id: number }) => risk.id);
          setCurrentRisks(riskIds);
          setLinkedRiskObjects(response.data as LinkedRisk[]);
        }
      });
    }
  };

  return (
    <>
      <Drawer
        className="nist-ai-rmf-drawer-dialog"
        open={open}
        onClose={(_event, reason) => {
          if (reason !== "backdropClick") {
            onClose();
          }
        }}
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
          className="nist-ai-rmf-drawer-dialog-content"
          sx={{
            width: 850,
          }}
        >
          {/* Loading State */}
          {isLoading && (
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
              <Typography sx={{ mt: 2 }}>
                Loading subcategory data...
              </Typography>
            </Stack>
          )}

          {/* Main Content */}
          {!isLoading && (
            <>
              {/* Header */}
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                padding="15px 20px"
              >
                <Typography fontSize={15} fontWeight={700}>
                  {functionType} {category?.index}.{subcategory?.index}
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

              {/* Tabs */}
              <TabContext value={activeTab}>
                <Box sx={{ padding: "0 20px" }}>
                  <TabBar
                    tabs={tabs}
                    activeTab={activeTab}
                    onChange={handleTabChange}
                  />
                </Box>

                {/* Description Section - Details Tab */}
                <TabPanel value="details" sx={{ padding: 0 }}>
                  <Stack padding="15px 20px" gap="15px">
                    <Stack
                      sx={{
                        border: `1px solid #eee`,
                        padding: "10px",
                        backgroundColor: "background.accent",
                        borderRadius: "4px",
                      }}
                    >
                      <Typography fontSize={13}>
                        <strong>Description:</strong> {subcategory?.description}
                      </Typography>
                    </Stack>

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
                        placeholder="Enter implementation details and how this subcategory is being addressed..."
                        isEditable={!isEditingDisabled}
                        height="120px"
                      />
                    </Stack>
                  </Stack>

                  {/* Status Assignment Section */}
                  <Stack padding="15px 20px" gap="24px">
                    <Select
                      id="status"
                      label="Status:"
                      value={formData.status}
                      onChange={handleSelectChange("status")}
                      items={statusOptions.map((status) => ({
                        _id: status.id,
                        name: status.name,
                      }))}
                      sx={inputStyles}
                      placeholder={"Select status"}
                      disabled={isEditingDisabled}
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
                      sx={inputStyles}
                      placeholder={"Select owner"}
                      disabled={isEditingDisabled}
                    />

                    <Select
                      id="Reviewer"
                      label="Reviewer:"
                      value={
                        formData.reviewer ? parseInt(formData.reviewer) : ""
                      }
                      onChange={handleSelectChange("reviewer")}
                      items={projectMembers.map((user) => ({
                        _id: user.id,
                        name: `${user.name}`,
                        email: user.email,
                        surname: user.surname,
                      }))}
                      sx={inputStyles}
                      placeholder={"Select reviewer"}
                      disabled={isEditingDisabled}
                    />

                    <Select
                      id="Approver"
                      label="Approver:"
                      value={
                        formData.approver ? parseInt(formData.approver) : ""
                      }
                      onChange={handleSelectChange("approver")}
                      items={projectMembers.map((user) => ({
                        _id: user.id,
                        name: `${user.name}`,
                        email: user.email,
                        surname: user.surname,
                      }))}
                      sx={inputStyles}
                      placeholder={"Select approver"}
                      disabled={isEditingDisabled}
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
                        Auditor feedback:
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

                    <Stack>
                      <Typography fontSize={13} sx={{ marginBottom: "5px" }}>
                        Tags:
                      </Typography>
                      <ChipInput
                        id="tags"
                        value={formData.tags}
                        onChange={(newValue) =>
                          setFormData((prev) => ({
                            ...prev,
                            tags: newValue,
                          }))
                        }
                        placeholder="Add tags..."
                        disabled={isEditingDisabled}
                        sx={{
                          ...inputStyles,
                          "& .MuiOutlinedInput-root": {
                            borderRadius: "5px",
                            minHeight: "34px",
                          },
                          "& .MuiChip-root": {
                            borderRadius: "4px",
                            height: "22px",
                            margin: "1px 2px",
                            fontSize: "13px",
                          },
                        }}
                      />
                    </Stack>
                  </Stack>
                </TabPanel>

                {/* Evidences Tab */}
                <TabPanel value="evidences" sx={{ padding: "15px 20px" }}>
                  <Stack spacing={3}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Evidence files
                    </Typography>
                    <Typography variant="body2" color="text.tertiary">
                      Upload evidence files to document how this subcategory is being implemented.
                    </Typography>

                    {/* File Upload Button */}
                    <Box>
                      <input
                        type="file"
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
                        style={{ display: "none" }}
                        id="evidence-file-input"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length > 0) {
                            handleAddFiles(files);
                          }
                          e.target.value = ""; // Reset input
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
                          }}
                          disableRipple={
                            theme.components?.MuiButton?.defaultProps?.disableRipple
                          }
                        >
                          Add evidence files
                        </Button>
                        <Stack direction="row" spacing={2}>
                          <Typography
                            sx={{
                              fontSize: 11,
                              color: "text.secondary",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            {`${evidenceFiles.length || 0} files attached`}
                          </Typography>
                          {uploadFiles.length > 0 && (
                            <Typography
                              sx={{
                                fontSize: 11,
                                color: "primary.main",
                                display: "flex",
                                alignItems: "center",
                              }}
                            >
                              {`+${uploadFiles.length} pending upload`}
                            </Typography>
                          )}
                          {deletedFiles.length > 0 && (
                            <Typography
                              sx={{
                                fontSize: 11,
                                color: "status.error.main",
                                display: "flex",
                                alignItems: "center",
                              }}
                            >
                              {`-${deletedFiles.length} pending delete`}
                            </Typography>
                          )}
                        </Stack>
                      </Stack>
                    </Box>

                    {/* Existing Evidence Files */}
                    {evidenceFiles.length > 0 && (
                      <Stack spacing={1}>
                        {evidenceFiles.map((file) => (
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
                                alignItems: "center",
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
                                  sx={{
                                    fontSize: 11,
                                    color: "status.default.text",
                                  }}
                                >
                                  {file.size ? `${(file.size / 1024).toFixed(1)} KB` : ""}
                                  {file.size && file.source ? " • " : ""}
                                  {file.source ? `Source: ${file.source}` : ""}
                                </Typography>
                              </Box>
                            </Box>
                            <Box sx={{ display: "flex", gap: 0.5 }}>
                              <Tooltip title="Download file">
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    handleEvidenceFileDownload(
                                      file.id,
                                      file.fileName
                                    );
                                  }}
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
                                    handleDeleteEvidenceFile(file.id)
                                  }
                                  disabled={isEditingDisabled}
                                  sx={{
                                    color: "text.tertiary",
                                    "&:hover": {
                                      color: "status.error.main",
                                      backgroundColor: "rgba(211, 47, 47, 0.08)",
                                    },
                                    "&:disabled": {
                                      color: "border.dark",
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
                          sx={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#92400E",
                          }}
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
                                alignItems: "center",
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
                                    sx={{
                                      fontSize: 11,
                                      color: "#B45309",
                                    }}
                                  >
                                    {(file.size / 1024).toFixed(1)} KB
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                            <Tooltip title="Remove from queue">
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteUploadFile(file.id)}
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

                    {evidenceFiles.length === 0 && uploadFiles.length === 0 && (
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
                          this subcategory
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                </TabPanel>

                {/* Cross Mappings Tab */}
                <TabPanel value="cross-mappings" sx={{ padding: "15px 20px" }}>
                  <Stack spacing={3}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Linked risks
                    </Typography>
                    <Typography variant="body2" color="text.tertiary">
                      Link risks from your risk database to this subcategory to
                      track which risks are being addressed by this implementation.
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
                        disableRipple={
                          theme.components?.MuiButton?.defaultProps?.disableRipple
                        }
                        onClick={() => setIsLinkedRisksModalOpen(true)}
                        disabled={isEditingDisabled}
                      >
                        Add/remove risks
                      </Button>
                      <Stack direction="row" spacing={2}>
                        <Typography
                          sx={{
                            fontSize: 11,
                            color: "text.secondary",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          {`${currentRisks.length || 0} risks linked`}
                        </Typography>
                        {selectedRisks.length > 0 && (
                          <Typography
                            sx={{
                              fontSize: 11,
                              color: "primary.main",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            {`+${selectedRisks.length} pending save`}
                          </Typography>
                        )}
                        {deletedRisks.length > 0 && (
                          <Typography
                            sx={{
                              fontSize: 11,
                              color: "status.error.main",
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            {`-${deletedRisks.length} pending delete`}
                          </Typography>
                        )}
                      </Stack>
                    </Stack>

                    {/* Linked risks list */}
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
                                    sx={{
                                      fontSize: 11,
                                      color: "text.tertiary",
                                    }}
                                  >
                                    Risk level: {risk.risk_level}
                                  </Typography>
                                )}
                              </Box>
                              <Box sx={{ display: "flex", gap: 0.5 }}>
                                <Tooltip title="View risk details">
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
                                      // Add to deleted risks and remove from current
                                      setDeletedRisks((prev) => [...prev, risk.id]);
                                      handleAlert({
                                        variant: "info",
                                        body: "Risk marked for unlinking. Save to apply changes.",
                                      });
                                    }}
                                    disabled={isEditingDisabled}
                                    sx={{
                                      color: "text.tertiary",
                                      "&:hover": {
                                        color: "status.error.main",
                                        backgroundColor: "rgba(211, 47, 47, 0.08)",
                                      },
                                      "&:disabled": {
                                        color: "border.dark",
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

                    {currentRisks.length === 0 &&
                      selectedRisks.length === 0 && (
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
                            Click "Add/remove risks" to link risks from your
                            risk database
                          </Typography>
                        </Box>
                      )}
                  </Stack>
                </TabPanel>

                {/* Notes Tab */}
                <TabPanel value="notes" sx={{ padding: "15px 20px" }}>
                  <Suspense fallback={<CircularProgress />}>
                    <NotesTab
                      attachedTo="NIST_SUBCATEGORY"
                      attachedToId={subcategory?.id?.toString() || ""}
                    />
                  </Suspense>
                </TabPanel>

              </TabContext>

              {/* Linked Risks Modal */}
              {isLinkedRisksModalOpen && (
                <Suspense fallback={"Loading..."}>
                  <LinkedRisksPopup
                    onClose={() => setIsLinkedRisksModalOpen(false)}
                    currentRisks={currentRisks
                      .concat(selectedRisks)
                      .filter((risk) => !deletedRisks.includes(risk))}
                    setSelectecRisks={setSelectedRisks}
                    _setDeletedRisks={setDeletedRisks}
                    frameworkId={4}
                    isOrganizational={true}
                  />
                </Suspense>
              )}

              {/* Footer */}
              <Stack
                className="nist-ai-rmf-drawer-dialog-footer"
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
                  text="Save"
                  sx={{
                    backgroundColor: "primary.main",
                    border: `1px solid ${theme.palette.primary.main}`,
                    gap: 2,
                    minWidth: "120px",
                    height: "36px",
                  }}
                  onClick={handleSave}
                  icon={<SaveIcon size={16} />}
                />
              </Stack>
            </>
          )}
        </Stack>
      </Drawer>

      {/* Alert Component */}
      {alert && (
        <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />
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
              setAlert({
                variant: "error",
                body: error || "Failed to update risk",
              });
              setTimeout(() => setAlert(null), 3000);
            }}
            users={users}
            onSubmitRef={onRiskSubmitRef}
          />
        </Suspense>
      </StandardModal>
    </>
  );
};

export default NISTAIRMFDrawerDialog;
