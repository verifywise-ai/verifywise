import { useCallback, useRef, useState } from "react";
import { getEntityById } from "../../../../application/repository/entity.repository";
import { RiskFormValues } from "../../../../domain/types/riskForm.types";
import { LinkedRisk, OnAlert } from "./types";

interface UseLinkedRisksParams {
  onAlert: OnAlert;
}

/**
 * Risks-tab state + handlers, shared across framework drawers. The parent
 * decides how to source the linked risks (a per-entity risks endpoint or a
 * batch fetch of IDs from the entity payload) and calls `applyLinkedRisks`
 * with the resulting objects. The hook then handles LinkedRisksPopup
 * selection state, the "view details" risk-form modal, and pending
 * add/remove queues that the parent reads in its save handler.
 */
export function useLinkedRisks({ onAlert }: UseLinkedRisksParams) {
  const [currentRisks, setCurrentRisks] = useState<number[]>([]);
  const [linkedRiskObjects, setLinkedRiskObjects] = useState<LinkedRisk[]>([]);
  const [selectedRisks, setSelectedRisks] = useState<number[]>([]);
  const [deletedRisks, setDeletedRisks] = useState<number[]>([]);
  const [isLinkedRisksModalOpen, setIsLinkedRisksModalOpen] = useState(false);

  const [isRiskDetailModalOpen, setIsRiskDetailModalOpen] = useState(false);
  const [selectedRiskForView, setSelectedRiskForView] = useState<LinkedRisk | null>(null);
  const [riskFormData, setRiskFormData] = useState<RiskFormValues | undefined>(undefined);
  const onRiskSubmitRef = useRef<(() => void) | null>(null);

  const applyLinkedRisks = useCallback((risks: LinkedRisk[]) => {
    setLinkedRiskObjects(risks);
    setCurrentRisks(risks.map((r) => r.id));
  }, []);

  const handleViewRiskDetails = useCallback(
    async (risk: LinkedRisk) => {
      setSelectedRiskForView(risk);
      try {
        const response = await getEntityById({ routeUrl: `/projectRisks/${risk.id}` });
        if (response.data) {
          const riskData = response.data;
          setRiskFormData({
            riskName: riskData.risk_name || "",
            actionOwner: riskData.risk_owner ?? riskData.action_owner ?? 0,
            aiLifecyclePhase: riskData.ai_lifecycle_phase || 0,
            riskDescription: riskData.risk_description || "",
            riskCategory: riskData.risk_category || [1],
            potentialImpact: riskData.impact ?? riskData.potential_impact ?? "",
            assessmentMapping: riskData.assessment_mapping || 0,
            controlsMapping: riskData.controls_mapping || 0,
            likelihood: riskData.likelihood_score ?? riskData.likelihood ?? 1,
            riskSeverity: riskData.severity_score ?? riskData.risk_severity ?? 1,
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
        onAlert({ variant: "error", body: "Failed to load risk details" });
      }
    },
    [onAlert],
  );

  const handleRiskDetailModalClose = () => {
    setIsRiskDetailModalOpen(false);
    setSelectedRiskForView(null);
    setRiskFormData(undefined);
  };

  const handleUnlinkRisk = (riskId: number) => {
    setDeletedRisks((prev) => [...prev, riskId]);
    onAlert({
      variant: "info",
      body: "Risk marked for removal. Save to apply changes.",
    });
  };

  const resetPending = () => {
    setSelectedRisks([]);
    setDeletedRisks([]);
  };

  return {
    currentRisks,
    linkedRiskObjects,
    selectedRisks,
    deletedRisks,
    isLinkedRisksModalOpen,
    setIsLinkedRisksModalOpen,
    setSelectedRisks,
    setDeletedRisks,
    isRiskDetailModalOpen,
    selectedRiskForView,
    riskFormData,
    onRiskSubmitRef,
    applyLinkedRisks,
    handleViewRiskDetails,
    handleRiskDetailModalClose,
    handleUnlinkRisk,
    resetPending,
    setCurrentRisks,
  };
}

export type UseLinkedRisksReturn = ReturnType<typeof useLinkedRisks>;
