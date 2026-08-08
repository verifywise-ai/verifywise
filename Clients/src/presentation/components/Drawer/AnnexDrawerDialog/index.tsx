/**
 * ISO 42001 Annex Drawer Dialog
 *
 * Composes the shared drawer pieces and adds the annex-specific bits:
 * /iso-42001 annex endpoints, "iso_42001"/"annex_category" file keys,
 * frameworkId=2, NotesTab bucket ISO_42001_ANNEX, and the applicability
 * cascade — when a control is not applicable the impl/status/assignment
 * fields dim out and the justification field takes over. AuditRiskPopup
 * still fires when the user marks status "Implemented" while risks remain.
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
import dayjs, { Dayjs } from "dayjs";

import DrawerFrame from "../shared/DrawerFrame";
import WorkflowFields, { WorkflowFormData } from "../shared/WorkflowFields";
import EvidenceTab from "../shared/EvidenceTab";
import CrossMappingsTab from "../shared/CrossMappingsTab";
import { useEvidenceFiles } from "../shared/useEvidenceFiles";
import { useLinkedRisks } from "../shared/useLinkedRisks";
import { DrawerTab } from "../shared/types";
import { drawerAccessibilityProps } from "../drawerAccessibility";

import Checkbox from "../../Inputs/Checkbox";
import Field from "../../Inputs/Field";
import Alert from "../../Alert";
import NotesTab from "../../Notes/NotesTab";
import AuditRiskPopup from "../../RiskPopup/AuditRiskPopup";
import { FileData } from "../../../../domain/types/File";
import { AnnexCategoryISO } from "../../../../domain/types/AnnexCategoryISO";
import { STATUSES } from "../../../../domain/types/Status";
import { AlertProps } from "../../../types/alert.types";

import { useAuth } from "../../../../application/hooks/useAuth";
import useUsers from "../../../../application/hooks/useUsers";
import { User } from "../../../../domain/types/User";
import {
  GetAnnexCategoriesById,
  UpdateAnnexCategoryById,
} from "../../../../application/repository/annexCategory_iso.repository";
import { getEntityById } from "../../../../application/repository/entity.repository";
import { attachFilesToEntity } from "../../../../application/repository/file.repository";
import allowedRoles from "../../../../application/constants/permissions";

const FRAMEWORK_TYPE = "iso_42001";
const ENTITY_TYPE = "annex_category";
const FRAMEWORK_ID = 2;
const NOTES_ATTACHED_TO = "ISO_42001_ANNEX";

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

interface AnnexFormData extends WorkflowFormData {
  guidance: string;
  is_applicable: boolean;
  justification_for_exclusion: string;
}

const TABS: DrawerTab[] = [
  { label: "Details", value: "details", icon: "FileText" },
  { label: "Evidence", value: "evidence", icon: "FolderOpen" },
  { label: "Cross mappings", value: "cross-mappings", icon: "Link" },
  { label: "Notes", value: "notes", icon: "MessageSquare" },
];

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
  const { userId, userRoleName } = useAuth();
  const { users } = useUsers();

  const [isLoading, setIsLoading] = useState(false);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [fetchedAnnex, setFetchedAnnex] = useState<AnnexCategoryISO>();
  const [date, setDate] = useState<Dayjs | null>(null);
  const [auditedStatusModalOpen, setAuditedStatusModalOpen] = useState(false);

  const [formData, setFormData] = useState<AnnexFormData>({
    guidance: "",
    is_applicable: false,
    justification_for_exclusion: "",
    implementation_description: "",
    status: "",
    owner: "",
    reviewer: "",
    approver: "",
    auditor_feedback: "",
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

  const fetchLinkedRisks = async () => {
    if (!fetchedAnnex?.id) return;
    try {
      const response = await getEntityById({
        routeUrl: `/iso-42001/annexCategories/${fetchedAnnex.id}/risks`,
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
    const fetchAnnexCategory = async () => {
      if (!open || !annex?.id) return;
      setIsLoading(true);
      try {
        const response = (await GetAnnexCategoriesById({
          routeUrl: `/iso-42001/annexCategory/byId/${control.id}?projectFrameworkId=${projectFrameworkId}`,
        })) as {
          data: AnnexCategoryISO & {
            evidence_links?: FileData[];
            guidance?: string;
            risks?: number[];
          };
        };
        setFetchedAnnex(response.data);
        if (response.data) {
          setFormData({
            guidance: response.data.guidance || "",
            is_applicable: response.data.is_applicable ?? false,
            justification_for_exclusion: response.data.justification_for_exclusion || "",
            implementation_description: response.data.implementation_description || "",
            status: response.data.status || "",
            owner: response.data.owner?.toString() || "",
            reviewer: response.data.reviewer?.toString() || "",
            approver: response.data.approver?.toString() || "",
            auditor_feedback: response.data.auditor_feedback || "",
          });
          if (response.data.due_date) setDate(dayjs(response.data.due_date));
        }
        await evidence.loadFiles(control.id, response.data.evidence_links);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("Error fetching annex category:", error);
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchAnnexCategory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, annex?.id, projectFrameworkId]);

  useEffect(() => {
    if (open && fetchedAnnex?.id) {
      fetchLinkedRisks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fetchedAnnex?.id]);

  const handleWorkflowFieldChange = (field: keyof WorkflowFormData, value: string) => {
    if (
      field === "status" &&
      value === "Implemented" &&
      (risks.currentRisks.length > 0 || risks.selectedRisks.length > 0)
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
      formDataToSend.append("is_applicable", formData.is_applicable.toString());
      formDataToSend.append("justification_for_exclusion", formData.justification_for_exclusion);
      formDataToSend.append("implementation_description", formData.implementation_description);
      formDataToSend.append("status", formData.status);
      formDataToSend.append("owner", formData.owner);
      formDataToSend.append("reviewer", formData.reviewer);
      formDataToSend.append("approver", formData.approver);
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

      const response = await UpdateAnnexCategoryById({
        routeUrl: `/iso-42001/saveAnnexes/${fetchedAnnex.id}`,
        body: formDataToSend,
      });

      if (response.status === 200) {
        if (evidence.pendingAttachFiles.length > 0 && control?.id) {
          try {
            const fileIds = evidence.pendingAttachFiles.map((f) => parseInt(String(f.id)));
            await attachFilesToEntity({
              file_ids: fileIds,
              framework_type: FRAMEWORK_TYPE,
              entity_type: ENTITY_TYPE,
              entity_id: control.id,
              project_id: project_id,
              link_type: "evidence",
            });
          } catch (attachError) {
            console.error("Failed to attach files:", attachError);
          }
        }

        handleAlert({ variant: "success", body: "Annex category saved successfully" });
        onSaveSuccess?.(true, "Annex category saved successfully");
        evidence.resetPending();
        risks.resetPending();
        if (fetchedAnnex?.id) await fetchLinkedRisks();
        onClose();
      } else {
        throw new Error("Failed to save annex category");
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error saving annex category:", error);
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
          <Typography sx={{ mt: 2 }}>Loading annex category data...</Typography>
        </Stack>
      </Drawer>
    );
  }

  const applicableSx = {
    opacity: formData.is_applicable ? 1 : 0.5,
    pointerEvents: (formData.is_applicable ? "auto" : "none") as "auto" | "none",
  };
  const inverseApplicableSx = {
    opacity: formData.is_applicable ? 0.5 : 1,
    pointerEvents: (formData.is_applicable ? "none" : "auto") as "auto" | "none",
  };

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
        drawerClassName="vw-iso-42001-annex-drawer-dialog"
        drawerId={`vw-iso-42001-annex-drawer-dialog-${annex?.id}`}
      >
        <TabPanel value="details" sx={{ padding: "15px 20px" }}>
          <Stack gap="15px">
            <Stack
              sx={{
                border: "1px solid #eee",
                padding: "10px",
                backgroundColor: "background.accent",
                borderRadius: "4px",
              }}
            >
              <Typography fontSize={13}>
                <strong>Guidance:</strong> {formData.guidance}
              </Typography>
            </Stack>

            <Stack sx={{ gap: "15px" }}>
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
                    setFormData((prev) => ({ ...prev, is_applicable: false }))
                  }
                  size="small"
                  isDisabled={isEditingDisabled}
                />
              </Stack>
            </Stack>

            <Stack sx={inverseApplicableSx}>
              <Typography fontSize={13} sx={{ marginBottom: "5px" }}>
                Justification for Exclusion (if Not Applicable):
              </Typography>
              <Field
                type="description"
                value={formData.justification_for_exclusion}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    justification_for_exclusion: e.target.value,
                  }))
                }
                disabled={formData.is_applicable || isEditingDisabled}
                sx={{
                  cursor: formData.is_applicable ? "not-allowed" : "text",
                }}
                placeholder="Required if control is not applicable..."
              />
            </Stack>

            <Stack sx={applicableSx} gap="24px">
              <WorkflowFields
                formData={formData}
                onFieldChange={handleWorkflowFieldChange}
                date={date}
                onDateChange={setDate}
                statusOptions={STATUSES.map((s) => ({ id: s, name: s }))}
                memberOptions={memberOptions}
                isEditingDisabled={!formData.is_applicable || isEditingDisabled}
                isAuditingDisabled={!formData.is_applicable || isAuditingDisabled}
                auditorFeedbackLabel="Auditor Feedback:"
                auditorFeedbackPlaceholder="Enter any feedback from the internal or external audits..."
              />
            </Stack>
          </Stack>
        </TabPanel>

        <TabPanel value="evidence" sx={{ padding: "15px 20px" }}>
          <EvidenceTab evidence={evidence} isEditingDisabled={isEditingDisabled} />
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
        PaperProps={{ sx: { width: "800px", maxWidth: "800px" } }}
      >
        <AuditRiskPopup
          onClose={() => setAuditedStatusModalOpen(false)}
          risks={risks.currentRisks.concat(risks.selectedRisks)}
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

export default VWISO42001AnnexDrawerDialog;
