/**
 * ISO 42001 Clause Drawer Dialog
 *
 * Composes the shared drawer pieces (DrawerFrame, StructInfoPanels,
 * WorkflowFields, EvidenceTab, CrossMappingsTab) and adds the ISO 42001
 * specifics: /iso-42001 endpoints, "iso_42001"/"subclause" file keys,
 * frameworkId=2, and the ISO_42001_CLAUSE notes bucket.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  CircularProgress,
  Drawer,
  Stack,
  Typography,
} from "@mui/material";
import { TabPanel } from "@mui/lab";
import dayjs, { Dayjs } from "dayjs";

import DrawerFrame from "../shared/DrawerFrame";
import StructInfoPanels from "../shared/StructInfoPanels";
import WorkflowFields, { WorkflowFormData } from "../shared/WorkflowFields";
import EvidenceTab from "../shared/EvidenceTab";
import CrossMappingsTab from "../shared/CrossMappingsTab";
import { useEvidenceFiles } from "../shared/useEvidenceFiles";
import { useLinkedRisks } from "../shared/useLinkedRisks";
import { DrawerTab } from "../shared/types";
import { drawerAccessibilityProps } from "../drawerAccessibility";

import Alert from "../../Alert";
import NotesTab from "../../Notes/NotesTab";

import {
  ISO42001Status,
  ISO42001_STATUS_OPTIONS,
  ISO42001ClauseDrawerProps,
  AlertProps,
  ACCEPTED_FILE_TYPES,
  LinkedRisk,
} from "../../../pages/Framework/ISO42001/types";

import { useAuth } from "../../../../application/hooks/useAuth";
import useUsers from "../../../../application/hooks/useUsers";
import { User } from "../../../../domain/types/User";
import {
  getEntityById,
  updateEntityById,
} from "../../../../application/repository/entity.repository";
import { attachFilesToEntity } from "../../../../application/repository/file.repository";
import allowedRoles from "../../../../application/constants/permissions";

const FRAMEWORK_TYPE = "iso_42001";
const ENTITY_TYPE = "subclause";
const FRAMEWORK_ID = 2;
const NOTES_ATTACHED_TO = "ISO_42001_CLAUSE";

// Kept for external imports (some pages import this from the drawer file).
export const inputStyles = {
  minWidth: 200,
  maxWidth: "100%",
  flexGrow: 1,
  height: 34,
};

const TABS: DrawerTab[] = [
  { label: "Details", value: "details", icon: "FileText" },
  { label: "Evidence", value: "evidence", icon: "FolderOpen" },
  { label: "Cross mappings", value: "cross-mappings", icon: "Link" },
  { label: "Notes", value: "notes", icon: "MessageSquare" },
];

const ISO42001ClauseDrawerDialog: React.FC<ISO42001ClauseDrawerProps> = ({
  open,
  onClose,
  onSaveSuccess,
  clause,
  subclause,
  projectFrameworkId,
  project_id,
}) => {
  const { userRoleName, userId } = useAuth();
  const { users } = useUsers();

  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [activeTab, setActiveTab] = useState("details");

  const [formData, setFormData] = useState<WorkflowFormData>({
    status: ISO42001Status.NOT_STARTED,
    implementation_description: "",
    owner: "",
    reviewer: "",
    approver: "",
    auditor_feedback: "",
  });
  const [date, setDate] = useState<Dayjs | null>(null);

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

  const fetchClauseData = async () => {
    if (!subclause?.id) return;
    setIsLoading(true);
    try {
      const response = await getEntityById({
        routeUrl: `/iso-42001/subClause/byId/${subclause.id}?projectFrameworkId=${projectFrameworkId}`,
      });
      if (response.data) {
        setFormData({
          status: response.data.status || ISO42001Status.NOT_STARTED,
          implementation_description: response.data.implementation_description || "",
          owner: response.data.owner ? response.data.owner.toString() : "",
          reviewer: response.data.reviewer ? response.data.reviewer.toString() : "",
          approver: response.data.approver ? response.data.approver.toString() : "",
          auditor_feedback: response.data.auditor_feedback || "",
        });
        setDate(response.data.due_date ? dayjs(response.data.due_date) : null);
        await evidence.loadFiles(subclause.id, response.data.evidence_links);
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching clause data:", error);
      }
      handleAlert({ variant: "error", body: "Failed to load clause data" });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLinkedRisks = async () => {
    if (!subclause?.id) return;
    try {
      const response = await getEntityById({
        routeUrl: `/iso-42001/subclauses/${subclause.id}/risks`,
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
    if (open && subclause?.id) {
      fetchClauseData();
      fetchLinkedRisks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subclause?.id]);

  const handleFieldChange = (field: keyof WorkflowFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  };

  const handleSave = async () => {
    if (!subclause?.id) {
      handleAlert({ variant: "error", body: "No clause selected for update" });
      return;
    }
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
        routeUrl: `/iso-42001/saveClauses/${subclause.id}`,
        body: formDataToSend,
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response.status === 200) {
        if (evidence.pendingAttachFiles.length > 0 && subclause?.id) {
          try {
            const fileIds = evidence.pendingAttachFiles.map((f) =>
              typeof f.id === "number" ? f.id : parseInt(String(f.id)),
            );
            await attachFilesToEntity({
              file_ids: fileIds,
              framework_type: FRAMEWORK_TYPE,
              entity_type: ENTITY_TYPE,
              entity_id: subclause.id,
              project_id: project_id,
              link_type: "evidence",
            });
          } catch (attachError) {
            console.error("Failed to attach files:", attachError);
          }
        }

        handleAlert({ variant: "success", body: "Clause updated successfully" });
        await fetchClauseData();
        await fetchLinkedRisks();
        evidence.resetPending();
        risks.resetPending();
        onSaveSuccess?.(true, "Clause saved successfully", subclause.id);
      } else {
        throw new Error(response.data?.message || "Failed to save clause");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred";
      handleAlert({ variant: "error", body: errorMessage });
      onSaveSuccess?.(false, errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !subclause) {
    return (
      <Drawer open={open} onClose={onClose} anchor="right" {...drawerAccessibilityProps}>
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
          <Typography sx={{ mt: 2 }}>Loading clause data...</Typography>
        </Stack>
      </Drawer>
    );
  }

  const questions = subclause?.questions || subclause?.key_questions;
  const title = (
    <>
      {subclause?.subclause_id ??
        (clause?.clause_no ? `${clause.clause_no}.${subclause?.order_no || 1}` : "Clause")}{" "}
      {subclause?.title}
    </>
  );

  return (
    <>
      <DrawerFrame
        open={open}
        onClose={onClose}
        title={title}
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onSave={handleSave}
        isSaving={isLoading}
        drawerClassName="iso42001-clause-drawer-dialog"
        drawerId={`iso42001-clause-drawer-dialog-${subclause?.order_no}`}
      >
        <TabPanel value="details" sx={{ padding: "15px 20px", gap: "15px" }}>
          <Stack gap="15px">
            <StructInfoPanels
              summary={subclause?.summary}
              questions={questions}
              evidenceExamples={subclause?.evidence_examples}
            />
          </Stack>
          <Stack gap="24px" sx={{ mt: "15px" }}>
            <WorkflowFields
              formData={formData}
              onFieldChange={handleFieldChange}
              date={date}
              onDateChange={setDate}
              statusOptions={ISO42001_STATUS_OPTIONS.map((s) => ({
                id: s.id,
                name: s.name,
              }))}
              memberOptions={memberOptions}
              isEditingDisabled={isEditingDisabled}
              isAuditingDisabled={isAuditingDisabled}
            />
          </Stack>
        </TabPanel>

        <TabPanel value="evidence" sx={{ padding: "15px 20px" }}>
          <EvidenceTab
            evidence={evidence}
            isEditingDisabled={isEditingDisabled}
            acceptedFileTypes={ACCEPTED_FILE_TYPES}
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
          {subclause?.id && (
            <NotesTab
              key={`iso42001-clause-${subclause.id}`}
              attachedTo={NOTES_ATTACHED_TO}
              attachedToId={subclause.id.toString()}
            />
          )}
        </TabPanel>
      </DrawerFrame>

      {alert && <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />}
    </>
  );
};

export default ISO42001ClauseDrawerDialog;
