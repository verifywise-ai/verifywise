/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { Suspense, useEffect, useState } from "react";
import { Box, Fade, Stack } from "@mui/material";
import StandardModal from "../Modals/StandardModal";
import {
  deleteEntityById,
  getAllEntities,
} from "../../../application/repository/entity.repository";
import { toastFadeStyle } from "../../../presentation/pages/ModelInventory/style";
import { getAllPolicies } from "../../../application/repository/policy.repository";
import { PolicyManagerModel } from "../../../../src/domain/models/Common/policy/policyManager.model";
import LinkedPolicyObjectsTable from "../Table/PolicyTable/LinkedPolicyObjectTable";
const Alert = React.lazy(() => import("../../components/Alert"));

interface ProjectRiskLinkedPoliciesModalProps {
  onClose: () => void;
  isOpen: boolean;
  type: string;
  riskId?: number | null | undefined;
  evidenceId?: number | null | undefined;
}

const ProjectRiskLinkedPolicies: React.FC<ProjectRiskLinkedPoliciesModalProps> = ({
  onClose,
  isOpen,
  type,
  riskId,
  evidenceId,
}) => {
  const [risks, setRisks] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);

  const [policies, setPolicies] = useState<PolicyManagerModel[]>([]);

  const [linkedPolicies, setLinkedPolicies] = useState<PolicyManagerModel[]>([]);

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
        routeUrl: `/policy-linked`,
      });

      const data = res.data;

      setRisks(data.risks || []);
      setEvidence(data.evidence || []);
    };

    fetchData();
  }, [isOpen]);

  const fetchAll = async () => {
    const [pRes] = await Promise.all([getAllPolicies()]);
    setPolicies(pRes);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const buildLinkedPolicies = (
    allPolicies: PolicyManagerModel[],
    links: any[],
    objectId: number | null | undefined,
  ) => {
    const linkedPolicyIds = new Set(
      links
        .filter((l) => l.object_id === objectId) // 👈 KEY FIX
        .map((l) => l.policy_id),
    );

    return allPolicies.filter((policy) => linkedPolicyIds.has(policy.id));
  };

  useEffect(() => {
    if (!policies.length) return;

    if (type === "risk") {
      setLinkedPolicies(buildLinkedPolicies(policies, risks, riskId));
    }

    if (type === "evidence") {
      setLinkedPolicies(buildLinkedPolicies(policies, evidence, evidenceId));
    }
  }, [type, policies, risks, evidence, riskId, evidenceId]);

  useEffect(() => {
    if (!alert) return;

    setShowAlert(true);
    const timer = setTimeout(() => {
      setShowAlert(false);
      setTimeout(() => setAlert(null), 300);
    }, 3000);

    return () => clearTimeout(timer);
  }, [alert]);

  // ------------------------------------
  // REMOVE LINK
  // ------------------------------------

  const handleRemove = async (type: string, id: number) => {
    // Find the actual linked object in the risks/evidence array
    let itemToRemove;
    if (type === "risk") {
      itemToRemove = risks.find((r) => r.object_id === riskId && r.policy_id === id);
    } else if (type === "evidence") {
      itemToRemove = evidence.find((e) => e.object_id === evidenceId && e.policy_id === id);
    }

    if (!itemToRemove) {
      setAlert({
        variant: "error",
        body: `Cannot find the linked ${type} to remove.`,
      });
      return;
    }

    // Send the actual DB id to delete
    await deleteEntityById({
      routeUrl: `/policy-linked/${itemToRemove.id}/linked-objects`,
    });

    // Update local state
    if (type === "risk") {
      const newRisks = risks.filter((r) => r.id !== itemToRemove.id);
      setRisks(newRisks);
      setLinkedPolicies(buildLinkedPolicies(policies, newRisks, riskId));
    } else if (type === "evidence") {
      const newEvidence = evidence.filter((e) => e.id !== itemToRemove.id);
      setEvidence(newEvidence);
      setLinkedPolicies(buildLinkedPolicies(policies, newEvidence, evidenceId));
    }

    setAlert({
      variant: "success",
      body: `${type} unlinked successfully!`,
    });
  };

  // ------------------------------------
  // RENDER LIST + ADD BUTTON
  // ------------------------------------
  const renderSection = (_items: any[], type: "control" | "risk" | "evidence") => (
    <Box onWheel={(e) => e.stopPropagation()} sx={{ height: "100%", overflow: "auto" }}>
      <Stack spacing={3}>
        {/* ---------- TABLE LIST ---------- */}
        <LinkedPolicyObjectsTable
          onRemove={handleRemove}
          policies={linkedPolicies}
          paginated={true}
          type={type}
        />
      </Stack>
    </Box>
  );

  return (
    <>
      <StandardModal
        isOpen={isOpen}
        onClose={onClose}
        title="Linked Policies Objects"
        description="View or remove linked policies"
        hideFooter={true}
      >
        {type === "risk" &&
          renderSection(
            risks.length ? risks : [], // <-- empty array if no risks
            "risk",
          )}
        {type === "evidence" && renderSection(evidence.length ? evidence : [], "evidence")}
      </StandardModal>

      {alert && (
        <Suspense fallback={<div>Loading...</div>}>
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
        </Suspense>
      )}
    </>
  );
};

export default ProjectRiskLinkedPolicies;
