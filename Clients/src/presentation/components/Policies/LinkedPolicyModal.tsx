/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useState } from "react";
import { Box, Fade, Stack } from "@mui/material";
import { TabContext } from "@mui/lab";
import StandardModal from "../Modals/StandardModal";
import TabBar from "../TabBar";
import {
  deleteEntityById,
  getAllEntities,
} from "../../../application/repository/entity.repository";
import {
  addNewModelButtonStyle,
  toastFadeStyle,
} from "../../../presentation/pages/ModelInventory/style";
import { CustomizableButton } from "../button/customizable-button";
import { CirclePlus as AddCircleOutlineIcon } from "lucide-react";
import LinkedObjectsTable from "./LinkedPoliciesTable";
import { getAllProjectRisks } from "../../../application/repository/projectRisk.repository";
import { RiskModel } from "../../../domain/models/Common/risks/risk.model";
import { handleAlert } from "../../../application/tools/alertUtils";
import LinkRiskSelectorModal from "./LinkRiskSelectorModal";
import { createPolicyLinkedObjects } from "../../../application/repository/policyLinkedObjects.repository";
import { getUserFilesMetaData } from "../../../application/repository/file.repository";
import { transformFilesData } from "../../../application/utils/fileTransform.utils";
import { FileModel } from "../../../domain/models/Common/file/file.model";
import LinkEvidenceSelectorModal from "./LinkEvidenceSelectorModal";

import Alert from "../../components/Alert";
import { useCanCheck } from "../../../application/hooks/useCan";

interface LinkedPolicyModalProps {
  onClose: () => void;
  policyId: number | null;
  isOpen: boolean;
}

const LinkedPolicyModal: React.FC<LinkedPolicyModalProps> = ({ onClose, policyId, isOpen }) => {
  const can = useCanCheck();
  const canEditPolicies = can("policy.edit");
  const [activeTab, setActiveTab] = useState("risks");

  const [risks, setRisks] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);

  const [projectRisk, setProjectRisks] = useState<RiskModel[]>([]);

  const [openRiskSelector, setOpenRiskSelector] = useState(false);

  const [openEvidenceSelector, setOpenEvidenceSelector] = useState(false);

  const [filesData, setFilesData] = useState<FileModel[]>([]);

  const [showAlert, setShowAlert] = useState(false);

  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title?: string;
    body: string;
  } | null>(null);

  // ------------------------------------
  // FETCH EXISTING LINKS
  // ------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      const res = await getAllEntities({
        routeUrl: `/policy-linked/${policyId}/linked-objects`,
      });

      const data = res.data;

      setRisks(data.risks || []);
      setEvidence(data.evidence || []);
    };

    fetchData();
  }, [isOpen, policyId, projectRisk]);

  useEffect(() => {
    if (!alert) return;

    setShowAlert(true);
    const timer = setTimeout(() => {
      setShowAlert(false);
      setTimeout(() => setAlert(null), 300);
    }, 3000);

    return () => clearTimeout(timer);
  }, [alert]);

  const fetchProjectRisks = useCallback(async (filter: "active" | "deleted" | "all" = "active") => {
    try {
      const response = await getAllProjectRisks({ filter });

      setProjectRisks(response.data);
    } catch (error) {
      console.error("Error fetching project risks:", error);
      handleToast("error", "Unexpected error occurs while fetching project risks.");
    }
  }, []);

  useEffect(() => {
    const fetchEvidenceData = async () => {
      const response = await getUserFilesMetaData();
      setFilesData(transformFilesData(response));
    };

    fetchEvidenceData();
  }, []);

  const handleToast = (type: "success" | "info" | "warning" | "error", message: string) => {
    handleAlert({
      variant: type,
      body: message,
      setAlert,
    });
    setTimeout(() => {
      setAlert(null);
    }, 3000);
  };

  useEffect(() => {
    fetchProjectRisks();
  }, [fetchProjectRisks]);

  // ------------------------------------
  // REMOVE LINK
  // ------------------------------------
  const handleRemove = async (type: string, id: number) => {
    try {
      await deleteEntityById({
        routeUrl: `/policy-linked/${id}/linked-objects`,
      });
    } catch {
      // The link is still there, so leave the list as it is.
      handleToast("error", "Couldn't unlink this item. Try again.");
      return;
    }

    if (type === "risk") setRisks((prev) => prev.filter((i) => i.id !== id));
    if (type === "evidence") setEvidence((prev) => prev.filter((i) => i.id !== id));

    setAlert({
      variant: "success",
      body: `${type} unlinked successfully!`,
    });
  };

  const handleAddLinkedObjects = async (
    objectType: "risk" | "evidence" | "control",
    objectIds: number[],
  ) => {
    try {
      await createPolicyLinkedObjects(`/policy-linked/${policyId}/linked-objects`, {
        object_type: objectType,
        object_ids: objectIds,
      });
    } catch (error) {
      // Report once here, then rethrow so the selector modal stays open and
      // does not run its own success path.
      handleToast(
        "error",
        objectType === "evidence"
          ? "Couldn't link the selected evidence. Try again."
          : "Couldn't link the selected risks. Try again.",
      );
      throw error;
    }

    // The link is saved from here on. A failed refresh must not reject, or the
    // selector stays open and invites a second, duplicate link.
    try {
      const updated = await getAllEntities({
        routeUrl: `/policy-linked/${policyId}/linked-objects`,
      });

      if (objectType === "risk") {
        setRisks(updated.data.risks || []);
      } else if (objectType === "evidence") {
        setEvidence(updated.data.evidence || []);
      }
    } catch {
      handleToast(
        "error",
        "Linked, but the list couldn't be refreshed. Reopen this window to see it.",
      );
      return;
    }

    setAlert({
      variant: "success",
      body: `${objectType} linked successfully!`,
    });
  };

  // ------------------------------------
  // RENDER LIST + ADD BUTTON
  // ------------------------------------
  const renderSection = (items: any[], type: "control" | "risk" | "evidence", label: string) => (
    <Box onWheel={(e) => e.stopPropagation()} sx={{ height: "100%", overflow: "auto" }}>
      <Stack spacing={3}>
        {/* ---------- ADD BUTTON ---------- */}
        {canEditPolicies && (
          <Box display="flex" justifyContent="flex-end">
            <CustomizableButton
              variant="contained"
              sx={addNewModelButtonStyle}
              text={`Link new ${label.toLowerCase()}`}
              icon={<AddCircleOutlineIcon size={16} />}
              onClick={() => {
                if (type === "risk") setOpenRiskSelector(true);
                if (type === "evidence") setOpenEvidenceSelector(true);
              }}
            />
          </Box>
        )}

        {/* ---------- TABLE LIST ---------- */}
        <LinkedObjectsTable
          items={items}
          onRemove={handleRemove}
          projectRisk={projectRisk}
          evidenceData={filesData}
          paginated={true}
          type={type}
          canRemove={canEditPolicies}
        />
      </Stack>
    </Box>
  );

  return (
    <>
      <StandardModal
        isOpen={isOpen}
        onClose={onClose}
        title="Linked Operational Objects"
        description="View or remove linked items"
        hideFooter={true}
      >
        <TabContext value={activeTab}>
          <Box sx={{ mb: 3 }}>
            <TabBar
              tabs={[
                { label: "Risks", value: "risks" },
                { label: "Evidence", value: "evidence" },
              ]}
              activeTab={activeTab}
              onChange={(_, newVal) => setActiveTab(newVal)}
            />
          </Box>

          {/* ---------- TAB CONTENT ---------- */}
          {activeTab === "risks" &&
            renderSection(
              risks.length ? risks : [], // <-- empty array if no risks
              "risk",
              "Risk",
            )}
          {activeTab === "evidence" &&
            renderSection(evidence.length ? evidence : [], "evidence", "Evidence")}
        </TabContext>

        <LinkRiskSelectorModal
          isOpen={openRiskSelector}
          onClose={() => setOpenRiskSelector(false)}
          linkedRiskIds={risks.map((r) => r.object_id)}
          policyId={policyId!}
          onSubmit={(ids) => handleAddLinkedObjects("risk", ids)}
          paginated={true}
        />

        <LinkEvidenceSelectorModal
          isOpen={openEvidenceSelector}
          onClose={() => setOpenEvidenceSelector(false)}
          linkedEvidenceIds={evidence.map((r) => r.object_id)}
          onSubmit={(ids) => handleAddLinkedObjects("evidence", ids)}
          paginated={true}
        />
      </StandardModal>

      {alert && (
        <Fade in={showAlert} timeout={300} style={toastFadeStyle}>
          <Box mb={2}>
            <Alert
              variant={alert.variant}
              title={alert.title}
              body={alert.body}
              isToast={true}
              onClick={() => {
                setShowAlert(false);
                setTimeout(() => setAlert(null), 300);
              }}
            />
          </Box>
        </Fade>
      )}
    </>
  );
};

export default LinkedPolicyModal;
