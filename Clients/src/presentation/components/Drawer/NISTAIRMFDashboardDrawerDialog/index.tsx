/**
 * NIST AI RMF Subcategory Drawer Dialog
 *
 * Composes the shared drawer pieces and adds the NIST specifics:
 * /nist-ai-rmf endpoints, "nist_ai_rmf"/"subcategory" file keys,
 * frameworkId=4, NotesTab bucket NIST_SUBCATEGORY, plus a tags field
 * (ChipInput) below the standard workflow fields.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import { TabPanel } from "@mui/lab";
import dayjs, { Dayjs } from "dayjs";

import DrawerFrame from "../shared/DrawerFrame";
import WorkflowFields, { WorkflowFormData } from "../shared/WorkflowFields";
import EvidenceTab from "../shared/EvidenceTab";
import CrossMappingsTab from "../shared/CrossMappingsTab";
import { useEvidenceFiles } from "../shared/useEvidenceFiles";
import { useLinkedRisks } from "../shared/useLinkedRisks";
import { DrawerTab } from "../shared/types";

import ChipInput from "../../Inputs/ChipInput";
import Alert from "../../Alert";
import NotesTab from "../../Notes/NotesTab";

import { NISTAIRMFDrawerProps, NISTAIRMFStatus } from "../../../pages/Framework/NIST-AI-RMF/types";
import { AlertProps } from "../../../types/alert.types";
import { LinkedRisk } from "../shared/types";
import {
  updateEntityById,
  getEntityById,
} from "../../../../application/repository/entity.repository";
import { useAuth } from "../../../../application/hooks/useAuth";
import useUsers from "../../../../application/hooks/useUsers";
import { User } from "../../../../domain/types/User";
import { FileData } from "../../../../domain/types/File";
import { attachFilesToEntity } from "../../../../application/repository/file.repository";
import allowedRoles from "../../../../application/constants/permissions";

const FRAMEWORK_TYPE = "nist_ai_rmf";
const ENTITY_TYPE = "subcategory";
const FRAMEWORK_ID = 4;
const NOTES_ATTACHED_TO = "NIST_SUBCATEGORY";

export const inputStyles = {
  minWidth: 200,
  maxWidth: "100%",
  flexGrow: 1,
  height: 34,
};

const STATUS_OPTIONS = [
  { id: NISTAIRMFStatus.NOT_STARTED, name: "Not started" },
  { id: NISTAIRMFStatus.DRAFT, name: "Draft" },
  { id: NISTAIRMFStatus.IN_PROGRESS, name: "In progress" },
  { id: NISTAIRMFStatus.AWAITING_REVIEW, name: "Awaiting review" },
  { id: NISTAIRMFStatus.AWAITING_APPROVAL, name: "Awaiting approval" },
  { id: NISTAIRMFStatus.IMPLEMENTED, name: "Implemented" },
  { id: NISTAIRMFStatus.NEEDS_REWORK, name: "Needs rework" },
];

const TABS: DrawerTab[] = [
  { label: "Details", value: "details", icon: "FileText" },
  { label: "Evidence", value: "evidences", icon: "FolderOpen" },
  { label: "Cross mappings", value: "cross-mappings", icon: "Link" },
  { label: "Notes", value: "notes", icon: "MessageSquare" },
];

interface NISTFormData extends WorkflowFormData {
  tags: string[];
}

const NISTAIRMFDrawerDialog: React.FC<NISTAIRMFDrawerProps> = ({
  open,
  onClose,
  onSaveSuccess,
  subcategory,
  category,
  function: functionType,
}) => {
  const theme = useTheme();
  const { userRoleName, userId } = useAuth();
  const { users } = useUsers();

  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [date, setDate] = useState<Dayjs | null>(null);
  const prevSubcategoryIdRef = useRef<number | undefined>(undefined);

  const [formData, setFormData] = useState<NISTFormData>({
    status: NISTAIRMFStatus.NOT_STARTED,
    owner: "",
    reviewer: "",
    approver: "",
    auditor_feedback: "",
    implementation_description: "",
    tags: [],
  });

  const handleAlert = (payload: { variant: "success" | "error" | "warning" | "info"; body: string }) => {
    setAlert(payload);
    setTimeout(() => setAlert(null), 3000);
  };

  const evidence = useEvidenceFiles({
    frameworkType: FRAMEWORK_TYPE,
    entityType: ENTITY_TYPE,
    onAlert: handleAlert,
  });

  const risks = useLinkedRisks({ onAlert: handleAlert });

  const memberOptions = useMemo(
    () => [
      { _id: "" as string | number, name: "(none)" },
      ...(users || []).map((user: User) => ({
        _id: user.id as string | number,
        name: `${user.name}`,
        email: user.email,
        surname: user.surname,
      })),
    ],
    [users],
  );

  const isEditingDisabled = !allowedRoles.frameworks.edit.includes(userRoleName);
  const isAuditingDisabled = !allowedRoles.frameworks.audit.includes(userRoleName);

  // Populate form when subcategory prop changes and (re)load evidence files.
  useEffect(() => {
    const currentId = subcategory?.id;
    const prevId = prevSubcategoryIdRef.current;

    if (subcategory) {
      setFormData({
        status: subcategory.status || NISTAIRMFStatus.NOT_STARTED,
        owner: subcategory.owner?.toString() || "",
        reviewer: subcategory.reviewer?.toString() || "",
        approver: subcategory.approver?.toString() || "",
        auditor_feedback: subcategory.auditor_feedback || "",
        implementation_description: subcategory.implementation_description || "",
        tags: subcategory.tags || [],
      });
      setDate(subcategory.due_date ? dayjs(subcategory.due_date) : null);
    } else {
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

    if (currentId && currentId !== prevId) {
      evidence.loadFiles(currentId, subcategory?.evidence_links as unknown as FileData[]);
    }
    prevSubcategoryIdRef.current = currentId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subcategory]);

  const fetchLinkedRisks = async () => {
    if (!subcategory?.id) {
      risks.applyLinkedRisks([]);
      return;
    }
    try {
      const response = await getEntityById({
        routeUrl: `/nist-ai-rmf/subcategories/${subcategory.id}/risks`,
      });
      if (response.data) {
        risks.applyLinkedRisks(response.data as LinkedRisk[]);
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching linked risks:", error);
      }
      risks.applyLinkedRisks([]);
    }
  };

  useEffect(() => {
    fetchLinkedRisks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subcategory?.id]);

  const handleFieldChange = (field: keyof WorkflowFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  };

  const handleDrawerClose = (
    _event?: React.SyntheticEvent | Record<string, never>,
    reason?: string,
  ) => {
    if (reason !== "backdropClick") onClose();
  };

  const handleSave = async () => {
    if (!subcategory?.id) {
      handleAlert({ variant: "error", body: "No subcategory selected for update" });
      return;
    }
    setIsLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append("status", formData.status);
      formDataToSend.append("implementation_description", formData.implementation_description);
      formDataToSend.append("auditor_feedback", formData.auditor_feedback);
      formDataToSend.append("tags", JSON.stringify(formData.tags));
      formDataToSend.append("owner", formData.owner || "");
      formDataToSend.append("reviewer", formData.reviewer || "");
      formDataToSend.append("approver", formData.approver || "");
      if (date) formDataToSend.append("due_date", date.toISOString());
      formDataToSend.append("user_id", userId?.toString() || "1");
      formDataToSend.append("delete", JSON.stringify(evidence.deletedFileIds));
      formDataToSend.append("risksMitigated", JSON.stringify(risks.selectedRisks));
      formDataToSend.append("risksDelete", JSON.stringify(risks.deletedRisks));

      evidence.uploadFiles.forEach((file) => {
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
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response.status === 200) {
        if (evidence.pendingAttachFiles.length > 0 && subcategory?.id) {
          try {
            const fileIds = evidence.pendingAttachFiles.map((f) =>
              typeof f.id === "number" ? f.id : parseInt(String(f.id)),
            );
            await attachFilesToEntity({
              file_ids: fileIds,
              framework_type: FRAMEWORK_TYPE,
              entity_type: ENTITY_TYPE,
              entity_id: subcategory.id,
              link_type: "evidence",
            });
          } catch (attachError) {
            if (process.env.NODE_ENV === "development") {
              console.error("Error attaching existing files:", attachError);
            }
          }
        }

        const hasFiles =
          evidence.uploadFiles.length > 0 ||
          evidence.deletedFileIds.length > 0 ||
          evidence.pendingAttachFiles.length > 0;
        handleAlert({
          variant: "success",
          body: hasFiles
            ? "Subcategory updated successfully with files"
            : "Subcategory updated successfully",
        });

        evidence.resetPending();
        risks.resetPending();

        // Refresh from server.
        try {
          const refreshed = await getEntityById({
            routeUrl: `/nist-ai-rmf/subcategories/byId/${subcategory.id}`,
          });
          if (refreshed.data) {
            await evidence.loadFiles(subcategory.id, refreshed.data.evidence_links);
          }
        } catch (refreshError) {
          if (process.env.NODE_ENV === "development") {
            console.error("Error refreshing subcategory:", refreshError);
          }
        }
        await fetchLinkedRisks();

        onSaveSuccess?.(true, "Subcategory updated successfully", subcategory.id);
      } else {
        throw new Error(response.data?.message || "Failed to update subcategory");
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMessage =
        err.response?.data?.message || err.message || "Failed to update subcategory";
      handleAlert({ variant: "error", body: errorMessage });
      onSaveSuccess?.(false, errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const title = (
    <>
      {functionType} {category?.index}.{subcategory?.index}
    </>
  );

  return (
    <>
      <DrawerFrame
        open={open}
        onClose={handleDrawerClose}
        title={title}
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onSave={handleSave}
        isSaving={isLoading}
        drawerClassName="nist-ai-rmf-drawer-dialog"
      >
        <TabPanel value="details" sx={{ padding: 0 }}>
          <Stack padding="15px 20px" gap="15px">
            <Stack
              sx={{
                border: `1px solid ${theme.palette.border.light}`,
                padding: "10px",
                backgroundColor: "background.accent",
                borderRadius: "4px",
              }}
            >
              <Typography fontSize={13}>
                <strong>Description:</strong> {subcategory?.description}
              </Typography>
            </Stack>
          </Stack>

          <Stack padding="15px 20px" gap="24px">
            <WorkflowFields
              formData={formData}
              onFieldChange={handleFieldChange}
              date={date}
              onDateChange={setDate}
              statusOptions={STATUS_OPTIONS}
              memberOptions={memberOptions}
              isEditingDisabled={isEditingDisabled}
              isAuditingDisabled={isAuditingDisabled}
              implementationDescriptionPlaceholder="Enter implementation details and how this subcategory is being addressed..."
            />

            <Stack>
              <Typography fontSize={13} sx={{ marginBottom: "5px" }}>
                Tags:
              </Typography>
              <ChipInput
                id="tags"
                value={formData.tags}
                onChange={(newValue) =>
                  setFormData((prev) => ({ ...prev, tags: newValue }))
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

        <TabPanel value="evidences" sx={{ padding: "15px 20px" }}>
          <EvidenceTab
            evidence={evidence}
            isEditingDisabled={isEditingDisabled}
            acceptedFileTypes="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
            bodyText="Upload evidence files to document how this subcategory is being implemented."
          />
        </TabPanel>

        <TabPanel value="cross-mappings" sx={{ padding: "15px 20px" }}>
          <CrossMappingsTab
            risks={risks}
            frameworkId={FRAMEWORK_ID}
            isOrganizational={true}
            users={users || []}
            isEditingDisabled={isEditingDisabled}
            onAlert={handleAlert}
            onRiskUpdateSuccess={fetchLinkedRisks}
          />
        </TabPanel>

        <TabPanel value="notes" sx={{ padding: "15px 20px" }}>
          <NotesTab
            attachedTo={NOTES_ATTACHED_TO}
            attachedToId={subcategory?.id?.toString() || ""}
          />
        </TabPanel>
      </DrawerFrame>

      {alert && <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />}
    </>
  );
};

export default NISTAIRMFDrawerDialog;
