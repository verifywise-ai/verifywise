/**
 * Generic Framework Drawer
 *
 * Composes the shared drawer pieces for any framework whose implementation
 * lives in the generic impl tables driven by Servers/structures/. Takes the
 * per-framework metadata as props and calls the generic backend endpoints
 * keyed by frameworkId:
 *   GET   /api/frameworks/:frameworkId/impl/:level/:id
 *   GET   /api/frameworks/:frameworkId/impl/:level/:id/risks
 *   PATCH /api/frameworks/:frameworkId/impl/:level/:id  (multipart)
 *
 * Notes tab: NotesAttachedToEnum currently only carries values for the
 * built-in frameworks (EU AI Act, ISO 27001, ISO 42001, NIST AI RMF). The
 * tab is only rendered when the parent passes `notesAttachedTo`.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Stack } from "@mui/material";
import { TabPanel } from "@mui/lab";
import dayjs, { Dayjs } from "dayjs";

import DrawerFrame from "../shared/DrawerFrame";
import StructInfoPanels from "../shared/StructInfoPanels";
import WorkflowFields, { WorkflowFormData } from "../shared/WorkflowFields";
import EvidenceTab from "../shared/EvidenceTab";
import CrossMappingsTab from "../shared/CrossMappingsTab";
import { useEvidenceFiles } from "../shared/useEvidenceFiles";
import { useLinkedRisks } from "../shared/useLinkedRisks";
import { DrawerTab, LinkedRisk, StatusOption } from "../shared/types";

import Alert from "../../Alert";
import NotesTab from "../../Notes/NotesTab";
import { AlertProps } from "../../../types/alert.types";

import { useAuth } from "../../../../application/hooks/useAuth";
import useUsers from "../../../../application/hooks/useUsers";
import { User } from "../../../../domain/types/User";
import {
  getEntityById,
  updateEntityById,
} from "../../../../application/repository/entity.repository";
import { attachFilesToEntity } from "../../../../application/repository/file.repository";
import allowedRoles from "../../../../application/constants/permissions";

// Default 8-value status enum shared by every generic impl table.
const DEFAULT_STATUS_OPTIONS: StatusOption[] = [
  { id: "Not started", name: "Not started" },
  { id: "Draft", name: "Draft" },
  { id: "In progress", name: "In progress" },
  { id: "Awaiting review", name: "Awaiting review" },
  { id: "Awaiting approval", name: "Awaiting approval" },
  { id: "Implemented", name: "Implemented" },
  { id: "Audited", name: "Audited" },
  { id: "Needs rework", name: "Needs rework" },
];

const DEFAULT_TABS: DrawerTab[] = [
  { label: "Details", value: "details", icon: "FileText" },
  { label: "Evidence", value: "evidence", icon: "FolderOpen" },
  { label: "Cross mappings", value: "cross-mappings", icon: "Link" },
];

export interface GenericFrameworkDrawerProps {
  open: boolean;
  onClose: () => void;

  // Framework identity — passed by the parent page from the tree response.
  frameworkId: number;
  frameworkType: string; // used for file_entity_links keys
  entityType: string; // used for file_entity_links keys
  level: "l2" | "l3"; // impl table level

  // Impl row + context.
  entityId: number; // impl row id
  projectFrameworkId: number;
  project_id: number;

  // Struct fields — shown in the details tab. Parent already has these from
  // the tree query; passing them avoids a second fetch just for display.
  title: React.ReactNode;
  summary?: string | null;
  questions?: string[] | null;
  evidenceExamples?: string[] | null;

  isOrganizational?: boolean;

  // Optional overrides.
  statusOptions?: StatusOption[];
  notesAttachedTo?: string; // enables Notes tab when provided
  drawerClassName?: string;

  onSaveSuccess?: (success: boolean, message?: string, id?: number) => void;
}

const GenericFrameworkDrawer: React.FC<GenericFrameworkDrawerProps> = ({
  open,
  onClose,
  frameworkId,
  frameworkType,
  entityType,
  level,
  entityId,
  projectFrameworkId,
  project_id,
  title,
  summary,
  questions,
  evidenceExamples,
  isOrganizational = false,
  statusOptions = DEFAULT_STATUS_OPTIONS,
  notesAttachedTo,
  drawerClassName,
  onSaveSuccess,
}) => {
  const { userRoleName, userId } = useAuth();
  const { users } = useUsers();

  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [date, setDate] = useState<Dayjs | null>(null);

  const [formData, setFormData] = useState<WorkflowFormData>({
    status: "Not started",
    implementation_description: "",
    owner: "",
    reviewer: "",
    approver: "",
    auditor_feedback: "",
  });

  const handleAlert = (payload: {
    variant: "success" | "error" | "warning" | "info";
    body: string;
  }) => {
    setAlert(payload);
    setTimeout(() => setAlert(null), 3000);
  };

  const evidence = useEvidenceFiles({
    frameworkType,
    entityType,
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

  const baseUrl = `/frameworks/${frameworkId}/impl/${level}/${entityId}`;

  const fetchImpl = async () => {
    if (!entityId) return;
    console.debug("[fw] GenericFrameworkDrawer fetchImpl", { url: baseUrl, entityId });
    setIsLoading(true);
    try {
      const response = await getEntityById({ routeUrl: baseUrl });
      if (response.data) {
        console.debug("[fw] GenericFrameworkDrawer impl loaded", {
          status: response.data.status,
          owner: response.data.owner,
          reviewer: response.data.reviewer,
          approver: response.data.approver,
          due_date: response.data.due_date,
          risks: response.data.risks?.length ?? 0,
        });
        setFormData({
          status: response.data.status || "Not started",
          implementation_description: response.data.implementation_description || "",
          owner: response.data.owner ? response.data.owner.toString() : "",
          reviewer: response.data.reviewer ? response.data.reviewer.toString() : "",
          approver: response.data.approver ? response.data.approver.toString() : "",
          auditor_feedback: response.data.auditor_feedback || "",
        });
        setDate(response.data.due_date ? dayjs(response.data.due_date) : null);
        await evidence.loadFiles(entityId);
      } else {
        console.warn("[fw] GenericFrameworkDrawer: empty impl response");
      }
    } catch (error) {
      console.error("[fw] GenericFrameworkDrawer fetchImpl failed", error);
      handleAlert({ variant: "error", body: "Failed to load record" });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLinkedRisks = async () => {
    if (!entityId) return;
    console.debug("[fw] GenericFrameworkDrawer fetchLinkedRisks", { url: `${baseUrl}/risks` });
    try {
      const response = await getEntityById({ routeUrl: `${baseUrl}/risks` });
      if (response.data) {
        console.debug("[fw] GenericFrameworkDrawer risks loaded", { count: response.data.length });
        risks.applyLinkedRisks(response.data as LinkedRisk[]);
      }
    } catch (error) {
      console.error("[fw] GenericFrameworkDrawer fetchLinkedRisks failed", error);
      risks.applyLinkedRisks([]);
    }
  };

  useEffect(() => {
    if (open && entityId) {
      console.debug("[fw] GenericFrameworkDrawer opened", {
        frameworkId,
        frameworkType,
        entityType,
        level,
        entityId,
        projectFrameworkId,
        notesAttachedTo,
      });
      fetchImpl();
      fetchLinkedRisks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entityId]);

  const handleFieldChange = (field: keyof WorkflowFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  };

  const handleSave = async () => {
    if (!entityId) {
      console.warn("[fw] GenericFrameworkDrawer save aborted: no entityId");
      handleAlert({ variant: "error", body: "No record selected for update" });
      return;
    }
    console.debug("[fw] GenericFrameworkDrawer save start", {
      status: formData.status,
      owner: formData.owner,
      files_to_upload: evidence.uploadFiles.length,
      files_to_delete: evidence.deletedFileIds.length,
      files_to_attach: evidence.pendingAttachFiles.length,
      risks_selected: risks.selectedRisks.length,
      risks_deleted: risks.deletedRisks.length,
    });
    setIsLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append("status", formData.status);
      formDataToSend.append("implementation_description", formData.implementation_description);
      formDataToSend.append("owner", formData.owner || "");
      formDataToSend.append("reviewer", formData.reviewer || "");
      formDataToSend.append("approver", formData.approver || "");
      formDataToSend.append("auditor_feedback", formData.auditor_feedback);
      if (date) formDataToSend.append("due_date", date.toISOString());
      formDataToSend.append("user_id", userId?.toString() || "1");
      formDataToSend.append("project_id", project_id.toString());
      formDataToSend.append("delete", JSON.stringify(evidence.deletedFileIds));
      formDataToSend.append("risksMitigated", JSON.stringify(risks.selectedRisks));
      formDataToSend.append("risksDelete", JSON.stringify(risks.deletedRisks));

      evidence.uploadFiles.forEach((file) => {
        if (file.data instanceof Blob) {
          const fileToUpload =
            file.data instanceof File
              ? file.data
              : new File([file.data], file.fileName, { type: file.type });
          formDataToSend.append("files", fileToUpload);
        }
      });

      const response = await updateEntityById({
        routeUrl: baseUrl,
        body: formDataToSend,
        headers: { "Content-Type": "multipart/form-data" },
      });

      console.debug("[fw] GenericFrameworkDrawer PATCH response", { status: response.status });
      if (response.status === 200) {
        if (evidence.pendingAttachFiles.length > 0) {
          try {
            const fileIds = evidence.pendingAttachFiles.map((f) =>
              typeof f.id === "number" ? f.id : parseInt(String(f.id)),
            );
            console.debug("[fw] GenericFrameworkDrawer attaching existing files", {
              fileIds,
              frameworkType,
              entityType,
              entityId,
            });
            await attachFilesToEntity({
              file_ids: fileIds,
              framework_type: frameworkType,
              entity_type: entityType,
              entity_id: entityId,
              project_id,
              link_type: "evidence",
            });
          } catch (attachError) {
            console.error("[fw] GenericFrameworkDrawer attach failed", attachError);
          }
        }

        handleAlert({ variant: "success", body: "Saved" });
        await fetchImpl();
        await fetchLinkedRisks();
        evidence.resetPending();
        risks.resetPending();
        onSaveSuccess?.(true, "Saved", entityId);
      } else {
        throw new Error(response.data?.message || "Failed to save");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      console.error("[fw] GenericFrameworkDrawer save failed", error);
      handleAlert({ variant: "error", body: errorMessage });
      onSaveSuccess?.(false, errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const tabs: DrawerTab[] = notesAttachedTo
    ? [...DEFAULT_TABS, { label: "Notes", value: "notes", icon: "MessageSquare" }]
    : DEFAULT_TABS;

  return (
    <>
      <DrawerFrame
        open={open}
        onClose={onClose}
        title={title}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onSave={handleSave}
        isSaving={isLoading}
        drawerClassName={drawerClassName}
      >
        <TabPanel value="details" sx={{ padding: "15px 20px", gap: "15px" }}>
          <Stack
            sx={{
              gap: "15px",
            }}
          >
            <StructInfoPanels
              summary={summary}
              questions={questions}
              evidenceExamples={evidenceExamples}
            />
          </Stack>
          <Stack
            sx={{
              gap: "24px",
              mt: "15px",
            }}
          >
            <WorkflowFields
              formData={formData}
              onFieldChange={handleFieldChange}
              date={date}
              onDateChange={setDate}
              statusOptions={statusOptions}
              memberOptions={memberOptions}
              isEditingDisabled={isEditingDisabled}
              isAuditingDisabled={isAuditingDisabled}
            />
          </Stack>
        </TabPanel>

        <TabPanel value="evidence" sx={{ padding: "15px 20px" }}>
          <EvidenceTab evidence={evidence} isEditingDisabled={isEditingDisabled} />
        </TabPanel>

        <TabPanel value="cross-mappings" sx={{ padding: "15px 20px" }}>
          <CrossMappingsTab
            risks={risks}
            frameworkId={frameworkId}
            isOrganizational={isOrganizational}
            users={users || []}
            isEditingDisabled={isEditingDisabled}
            onAlert={handleAlert}
            onRiskUpdateSuccess={fetchLinkedRisks}
          />
        </TabPanel>

        {notesAttachedTo && (
          <TabPanel value="notes" sx={{ padding: "15px 20px" }}>
            <NotesTab
              key={`${frameworkType}-${entityType}-${entityId}`}
              attachedTo={notesAttachedTo}
              attachedToId={entityId.toString()}
            />
          </TabPanel>
        )}
      </DrawerFrame>

      {alert && <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />}
    </>
  );
};

export default GenericFrameworkDrawer;
