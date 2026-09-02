/**
 * ISO 27001 Annex Drawer Dialog
 *
 * Composes the shared drawer pieces and adds the annex-control specifics:
 * /iso-27001 annex endpoints, "iso_27001"/"annex_control" file keys,
 * frameworkId=3, NotesTab bucket ISO_27001_ANNEX. Status uses the shared
 * STATUSES enum (already capitalized). AuditRiskPopup fires when moving to
 * "Implemented" while risks are still linked.
 */

import React, { useEffect, useMemo, useState } from "react";
import { CircularProgress, Dialog, Drawer, Stack, Typography } from "@mui/material";
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
import AuditRiskPopup from "../../RiskPopup/AuditRiskPopup";
import { FileData } from "../../../../domain/types/File";
import { STATUSES } from "../../../../domain/types/Status";
import { AlertProps } from "../../../types/alert.types";

import { useAuth } from "../../../../application/hooks/useAuth";
import useUsers from "../../../../application/hooks/useUsers";
import { User } from "../../../../domain/types/User";
import {
  getEntityById,
  updateEntityById,
} from "../../../../application/repository/entity.repository";
import { attachFilesToEntity } from "../../../../application/repository/file.repository";
import { GetAnnexControlISO27001ById } from "../../../../application/repository/annex_struct_iso.repository";
import allowedRoles from "../../../../application/constants/permissions";

const FRAMEWORK_TYPE = "iso_27001";
const ENTITY_TYPE = "annex_control";
const FRAMEWORK_ID = 3;
const NOTES_ATTACHED_TO = "ISO_27001_ANNEX";

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

const TABS: DrawerTab[] = [
  { label: "Details", value: "details", icon: "FileText" },
  { label: "Evidence", value: "evidence", icon: "FolderOpen" },
  { label: "Cross mappings", value: "cross-mappings", icon: "Link" },
  { label: "Notes", value: "notes", icon: "MessageSquare" },
];

interface AnnexFormData extends WorkflowFormData {
  requirement_summary: string;
  key_questions: string[];
  evidence_examples: string[];
  risks: number[];
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
  const { userId, userRoleName } = useAuth();
  const { users } = useUsers();

  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [fetchedAnnex, setFetchedAnnex] = useState<AnnexControlData>();
  const [date, setDate] = useState<Dayjs | null>(null);
  const [auditedStatusModalOpen, setAuditedStatusModalOpen] = useState(false);

  const [formData, setFormData] = useState<AnnexFormData>({
    requirement_summary: "",
    key_questions: [],
    evidence_examples: [],
    implementation_description: "",
    status: "",
    owner: "",
    reviewer: "",
    approver: "",
    auditor_feedback: "",
    risks: [],
  });

  const handleAlert = (payload: {
    variant: "success" | "error" | "warning" | "info";
    body: string;
  }) => {
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
    if (!fetchedAnnex?.id) return;
    const ids = riskIds
      ? riskIds
      : [...(formData.risks || []), ...risks.selectedRisks].filter(
          (id) => !risks.deletedRisks.includes(id),
        );
    if (ids.length === 0) {
      risks.applyLinkedRisks([]);
      return;
    }
    try {
      const promises = ids.map((riskId: number) =>
        getEntityById({ routeUrl: `/projectRisks/${riskId}` })
          .then((r) => r.data)
          .catch(() => null),
      );
      const results = await Promise.all(promises);
      risks.applyLinkedRisks(results.filter((r) => r !== null) as LinkedRisk[]);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching linked risks:", error);
      }
      risks.applyLinkedRisks([]);
    }
  };

  useEffect(() => {
    const fetchAnnexControl = async () => {
      if (!open || !annex?.id) return;
      setIsLoading(true);
      try {
        const response = (await GetAnnexControlISO27001ById({
          routeUrl: `/iso-27001/annexControl/byId/${control.id}?projectFrameworkId=${projectFrameworkId}`,
        })) as AnnexControlResponse;
        setFetchedAnnex(response.data);
        if (response.data) {
          setFormData({
            requirement_summary: response.data.requirement_summary || "",
            key_questions: response.data.key_questions || [],
            evidence_examples: response.data.evidence_examples || [],
            implementation_description: response.data.implementation_description || "",
            status: response.data.status || "",
            owner: response.data.owner?.toString() || "",
            reviewer: response.data.reviewer?.toString() || "",
            approver: response.data.approver?.toString() || "",
            auditor_feedback: response.data.auditor_feedback || "",
            risks: response.data.risks || [],
          });
          if (response.data.due_date) setDate(dayjs(response.data.due_date));
        }
        await evidence.loadFiles(control.id, response.data.evidence_links);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("Error fetching annex control:", error);
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchAnnexControl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, annex?.id, projectFrameworkId]);

  useEffect(() => {
    if (open && fetchedAnnex?.id) {
      fetchLinkedRisks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fetchedAnnex?.id, formData.risks, risks.selectedRisks, risks.deletedRisks]);

  const handleWorkflowFieldChange = (field: keyof WorkflowFormData, value: string) => {
    if (
      field === "status" &&
      value === "Implemented" &&
      (formData.risks.length > 0 || risks.selectedRisks.length > 0)
    ) {
      setAuditedStatusModalOpen(true);
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append("implementation_description", formData.implementation_description);
      formDataToSend.append("status", formData.status);
      formDataToSend.append("owner", formData.owner || "");
      formDataToSend.append("reviewer", formData.reviewer || "");
      formDataToSend.append("approver", formData.approver || "");
      formDataToSend.append("auditor_feedback", formData.auditor_feedback);
      if (date) formDataToSend.append("due_date", date.toString());
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
              : new File([file.data!], file.fileName, { type: file.type });
          formDataToSend.append("files", fileToUpload);
        }
      });

      if (!fetchedAnnex) {
        handleAlert({ variant: "error", body: "Error: Annex data not found" });
        onSaveSuccess?.(false, "Error: Annex data not found");
        return;
      }

      const response = await updateEntityById({
        routeUrl: `/iso-27001/saveAnnexes/${fetchedAnnex.id}`,
        body: formDataToSend,
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response && response.status === 200) {
        if (evidence.pendingAttachFiles.length > 0 && fetchedAnnex?.id) {
          try {
            const fileIds = evidence.pendingAttachFiles.map((f) => parseInt(String(f.id)));
            await attachFilesToEntity({
              file_ids: fileIds,
              framework_type: FRAMEWORK_TYPE,
              entity_type: ENTITY_TYPE,
              entity_id: fetchedAnnex.id,
              project_id: project_id,
              link_type: "evidence",
            });
          } catch (attachError) {
            console.error("Failed to attach files:", attachError);
          }
        }

        evidence.resetPending();
        risks.resetPending();
        handleAlert({ variant: "success", body: "Annex control saved successfully" });
        onSaveSuccess?.(true, "Annex control saved successfully");
        onClose();
      } else {
        throw new Error(`Failed to save annex control. Status: ${response?.status || "unknown"}`);
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error saving annex control:", error);
      }
      const errorMessage =
        error instanceof Error ? error.message : "An error occurred while saving changes";
      handleAlert({ variant: "error", body: errorMessage });
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
          <Typography sx={{ mt: 2 }}>Loading annex control data...</Typography>
        </Stack>
      </Drawer>
    );
  }

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
        drawerClassName="vw-iso-27001-annex-drawer-dialog"
        drawerId={`vw-iso-27001-annex-drawer-dialog-${annex?.id}`}
      >
        <TabPanel value="details" sx={{ padding: "15px 20px" }}>
          <Stack sx={{ gap: "15px" }}>
            <StructInfoPanels
              summary={formData.requirement_summary}
              summaryLabel="Requirement Summary"
              questions={formData.key_questions}
              evidenceExamples={formData.evidence_examples}
            />
          </Stack>
          <Stack
            sx={{
              gap: "24px",
              marginTop: "15px",
            }}
          >
            <WorkflowFields
              formData={formData}
              onFieldChange={handleWorkflowFieldChange}
              date={date}
              onDateChange={setDate}
              statusOptions={STATUSES.map((s) => ({ id: s, name: s }))}
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
          <NotesTab
            attachedTo={NOTES_ATTACHED_TO}
            attachedToId={fetchedAnnex?.id?.toString() || ""}
          />
        </TabPanel>
      </DrawerFrame>

      <Dialog
        open={auditedStatusModalOpen}
        onClose={() => setAuditedStatusModalOpen(false)}
        slotProps={{
          paper: { sx: { width: "800px", maxWidth: "800px" } },
        }}
      >
        <AuditRiskPopup
          onClose={() => setAuditedStatusModalOpen(false)}
          risks={formData.risks.concat(risks.selectedRisks)}
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

export default VWISO27001AnnexDrawerDialog;
