/**
 * ISO 27001 Clause Drawer Dialog
 *
 * Composes the shared drawer pieces and adds the ISO 27001 specifics:
 * /iso-27001 endpoints, "iso_27001"/"subclause" file keys, frameworkId=3,
 * NotesTab bucket ISO_27001_CLAUSE, plus a 7-value status enum (no
 * "Audited") and an AuditRiskPopup shown when moving to "Needs rework"
 * while risks are still linked.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  CircularProgress,
  Dialog,
  Drawer,
  Stack,
  Typography,
} from "@mui/material";
import { TabPanel } from "@mui/lab";
import { Dayjs } from "dayjs";

import DrawerFrame from "../shared/DrawerFrame";
import StructInfoPanels from "../shared/StructInfoPanels";
import WorkflowFields, { WorkflowFormData } from "../shared/WorkflowFields";
import EvidenceTab from "../shared/EvidenceTab";
import CrossMappingsTab from "../shared/CrossMappingsTab";
import { useEvidenceFiles } from "../shared/useEvidenceFiles";
import { useLinkedRisks } from "../shared/useLinkedRisks";
import { drawerAccessibilityProps } from "../drawerAccessibility";
import { DrawerTab } from "../shared/types";

import Alert from "../../Alert";
import { AlertProps } from "../../../types/alert.types";
import NotesTab from "../../Notes/NotesTab";
import AuditRiskPopup from "../../RiskPopup/AuditRiskPopup";
import { FileData } from "../../../../domain/types/File";

import { useAuth } from "../../../../application/hooks/useAuth";
import useUsers from "../../../../application/hooks/useUsers";
import { User } from "../../../../domain/types/User";
import {
  getEntityById,
  updateEntityById,
} from "../../../../application/repository/entity.repository";
import { attachFilesToEntity } from "../../../../application/repository/file.repository";
import { ISO27001GetSubClauseById } from "../../../../application/repository/subClause_iso.repository";
import allowedRoles from "../../../../application/constants/permissions";

const FRAMEWORK_TYPE = "iso_27001";
const ENTITY_TYPE = "subclause";
const FRAMEWORK_ID = 3;
const NOTES_ATTACHED_TO = "ISO_27001_CLAUSE";
const NEEDS_REWORK_ID = "6";

// Kept for external imports.
export const inputStyles = {
  minWidth: 200,
  maxWidth: "100%",
  flexGrow: 1,
  height: 34,
};

// Backend uses status names; the drawer's Select uses string ids.
const STATUS_ITEMS = [
  { id: "0", name: "Not started" },
  { id: "1", name: "Draft" },
  { id: "2", name: "In progress" },
  { id: "3", name: "Awaiting review" },
  { id: "4", name: "Awaiting approval" },
  { id: "5", name: "Implemented" },
  { id: "6", name: "Needs rework" },
];

const statusIdMap = new Map(STATUS_ITEMS.map((s) => [s.name, s.id]));
const idStatusMap = new Map(STATUS_ITEMS.map((s) => [s.id, s.name]));

const TABS: DrawerTab[] = [
  { label: "Details", value: "details", icon: "FileText" },
  { label: "Evidence", value: "evidence", icon: "FolderOpen" },
  { label: "Cross mappings", value: "cross-mappings", icon: "Link" },
  { label: "Notes", value: "notes", icon: "MessageSquare" },
];

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

  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [activeTab, setActiveTab] = useState("details");

  const [fetchedSubClause, setFetchedSubClause] = useState<ISO27001SubClauseData | null>(null);
  const [formData, setFormData] = useState<WorkflowFormData>({
    implementation_description: "",
    status: "",
    owner: "",
    reviewer: "",
    approver: "",
    auditor_feedback: "",
  });
  const [date, setDate] = useState<Dayjs | null>(null);
  const [auditedStatusModalOpen, setAuditedStatusModalOpen] = useState(false);

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
      { _id: "", name: "(none)" },
      ...(users || []).map((user: User) => ({
        _id: user.id.toString(),
        name: user.name,
        email: user.email,
        surname: user.surname,
      })),
    ],
    [users],
  );

  const isEditingDisabled = !allowedRoles.frameworks.edit.includes(userRoleName);
  const isAuditingDisabled = !allowedRoles.frameworks.audit.includes(userRoleName);

  const fetchLinkedRisks = async (riskIds?: number[]) => {
    const ids = riskIds
      ? riskIds
      : [...(fetchedSubClause?.risks || []), ...risks.selectedRisks].filter(
          (id) => !risks.deletedRisks.includes(id),
        );

    if (ids.length === 0) {
      risks.applyLinkedRisks([]);
      return;
    }

    try {
      const promises = ids.map((riskId: number) =>
        getEntityById({ routeUrl: `/projectRisks/${riskId}` })
          .then((response) => response.data)
          .catch(() => null),
      );
      const results = await Promise.all(promises);
      risks.applyLinkedRisks(results.filter((r) => r !== null));
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching linked risks:", error);
      }
      risks.applyLinkedRisks([]);
    }
  };

  const fetchSubClauseData = async () => {
    if (!subClause?.id) return;
    setIsLoading(true);
    try {
      const response = await ISO27001GetSubClauseById({
        routeUrl: `/iso-27001/subClause/byId/${subClause.id}?projectFrameworkId=${projectFrameworkId}`,
      });
      const data = response.data;
      setFetchedSubClause(data);
      if (data) {
        setFormData({
          implementation_description: data.implementation_description || "",
          status: statusIdMap.get(data.status) || "0",
          owner: data.owner?.toString() || "",
          reviewer: data.reviewer?.toString() || "",
          approver: data.approver?.toString() || "",
          auditor_feedback: data.auditor_feedback || "",
        });
        setDate(data.due_date || null);
        await evidence.loadFiles(data.id, data.evidence_links);
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching subclause:", error);
      }
      handleAlert({ variant: "error", body: "Failed to load clause data" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open && subClause?.id) {
      fetchSubClauseData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subClause?.id, projectFrameworkId]);

  useEffect(() => {
    if (open && fetchedSubClause?.id) {
      fetchLinkedRisks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fetchedSubClause?.id, risks.selectedRisks, risks.deletedRisks]);

  const handleFieldChange = (field: keyof WorkflowFormData, value: string) => {
    if (
      field === "status" &&
      value === NEEDS_REWORK_ID &&
      ((fetchedSubClause?.risks?.length ?? 0) > 0 || risks.selectedRisks.length > 0)
    ) {
      setAuditedStatusModalOpen(true);
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  };

  const handleSave = async () => {
    if (!fetchedSubClause?.id) {
      handleAlert({ variant: "error", body: "No clause selected for update" });
      return;
    }
    setIsLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append("implementation_description", formData.implementation_description);
      formDataToSend.append("status", idStatusMap.get(formData.status) || "Not started");
      formDataToSend.append("owner", formData.owner);
      formDataToSend.append("reviewer", formData.reviewer);
      formDataToSend.append("approver", formData.approver);
      formDataToSend.append("auditor_feedback", formData.auditor_feedback);
      if (date) formDataToSend.append("due_date", date.toString());
      formDataToSend.append("user_id", userId?.toString() || "1");
      formDataToSend.append("delete", JSON.stringify(evidence.deletedFileIds));
      formDataToSend.append("risksMitigated", JSON.stringify(risks.selectedRisks));
      formDataToSend.append("risksDelete", JSON.stringify(risks.deletedRisks));
      formDataToSend.append("project_id", project_id.toString());

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
        routeUrl: `/iso-27001/saveClauses/${fetchedSubClause.id}`,
        body: formDataToSend,
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response.status === 200) {
        if (evidence.pendingAttachFiles.length > 0 && subClause?.id) {
          try {
            const fileIds = evidence.pendingAttachFiles.map((f) => parseInt(String(f.id)));
            await attachFilesToEntity({
              file_ids: fileIds,
              framework_type: FRAMEWORK_TYPE,
              entity_type: ENTITY_TYPE,
              entity_id: subClause.id,
              project_id: project_id,
              link_type: "evidence",
            });
          } catch (attachError) {
            console.error("Failed to attach files:", attachError);
          }
        }

        handleAlert({ variant: "success", body: "Clause updated successfully" });
        await fetchSubClauseData();
        evidence.resetPending();
        risks.resetPending();
        onSaveSuccess?.(true, "Clause saved successfully");
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

  const displayData = fetchedSubClause || subClause;

  if (isLoading) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        {...drawerAccessibilityProps}
        sx={{
          "width": 850,
          "margin": 0,
          "& .MuiDrawer-paper": { margin: 0, borderRadius: 0 },
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

  const title = `${clause?.order_no}.${index + 1} ${displayData?.title || ""}`;

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
        drawerClassName="vw-iso-27001-clause-drawer-dialog"
      >
        <TabPanel value="details" sx={{ padding: "15px 20px", gap: "15px" }}>
          <Stack gap="15px">
            <StructInfoPanels
              summary={displayData?.requirement_summary}
              summaryLabel="Requirement Summary"
              questions={displayData?.key_questions}
              evidenceExamples={displayData?.evidence_examples}
            />
          </Stack>
          <Stack gap="24px" sx={{ mt: "15px" }}>
            <WorkflowFields
              formData={formData}
              onFieldChange={handleFieldChange}
              date={date}
              onDateChange={setDate}
              statusOptions={STATUS_ITEMS}
              memberOptions={memberOptions}
              isEditingDisabled={isEditingDisabled}
              isAuditingDisabled={isAuditingDisabled}
              auditorFeedbackLabel="Auditor Feedback:"
              auditorFeedbackPlaceholder="Enter any feedback from the internal or external audits..."
              ownerValueAsInt={false}
            />
          </Stack>
        </TabPanel>

        <TabPanel value="evidence" sx={{ padding: "15px 20px" }}>
          <EvidenceTab
            evidence={evidence}
            isEditingDisabled={isEditingDisabled}
            bodyText="Upload evidence files to document compliance with this requirement."
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
          {fetchedSubClause?.id && (
            <NotesTab
              key={`iso27001-clause-${fetchedSubClause.id}`}
              attachedTo={NOTES_ATTACHED_TO}
              attachedToId={fetchedSubClause.id.toString()}
            />
          )}
        </TabPanel>
      </DrawerFrame>

      <Dialog
        open={auditedStatusModalOpen}
        onClose={() => setAuditedStatusModalOpen(false)}
        PaperProps={{ sx: { width: "800px", maxWidth: "800px" } }}
      >
        <AuditRiskPopup
          onClose={() => setAuditedStatusModalOpen(false)}
          risks={(fetchedSubClause?.risks || []).concat(risks.selectedRisks)}
          _deletedRisks={risks.deletedRisks}
          _setDeletedRisks={risks.setDeletedRisks}
          _selectedRisks={risks.selectedRisks}
          _setSelectedRisks={risks.setSelectedRisks}
        />
      </Dialog>

      {alert && <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />}
    </>
  );
};

export default VWISO27001ClauseDrawerDialog;
