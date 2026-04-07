import { useState, useEffect, useCallback, useRef } from "react";
import { friaRepository } from "../repository/fria.repository";

export interface FriaRight {
  id: number;
  right_key: string;
  right_title: string;
  charter_ref: string;
  flagged: boolean;
  severity: number;
  confidence: number;
  impact_pathway: string | null;
  mitigation: string | null;
}

export interface FriaRiskItem {
  id: number;
  fria_id: number;
  risk_description: string;
  likelihood: string | null;
  severity: string | null;
  existing_controls: string | null;
  further_action: string | null;
  linked_project_risk_id: number | null;
  linked_risk_name: string | null;
  sort_order: number;
}

export interface FriaModelLink {
  id: number;
  model_id: number;
  provider: string | null;
  model: string | null;
  version: string | null;
  model_status: string | null;
}

export interface FriaAssessment {
  id: number;
  project_id: number;
  version: number;
  status: string;
  assessment_owner: string | null;
  assessment_date: string | null;
  operational_context: string | null;
  is_high_risk: string | null;
  high_risk_basis: string | null;
  deployer_type: string | null;
  annex_iii_category: string | null;
  first_use_date: string | null;
  review_cycle: string | null;
  period_frequency: string | null;
  fria_rationale: string | null;
  affected_groups: string | null;
  vulnerability_context: string | null;
  group_flags: string[];
  risk_scenarios: string | null;
  provider_info_used: string | null;
  human_oversight: string | null;
  transparency_measures: string | null;
  redress_process: string | null;
  data_governance: string | null;
  legal_review: string | null;
  dpo_review: string | null;
  owner_approval: string | null;
  stakeholders_consulted: string | null;
  consultation_notes: string | null;
  deployment_decision: string | null;
  decision_conditions: string | null;
  completion_pct: number;
  risk_score: number;
  risk_level: string;
  rights_flagged: number;
  project_title: string | null;
  organization_name: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export function useFria(projectId: string) {
  const [assessment, setAssessment] = useState<FriaAssessment | null>(null);
  const [rights, setRights] = useState<FriaRight[]>([]);
  const [riskItems, setRiskItems] = useState<FriaRiskItem[]>([]);
  const [modelLinks, setModelLinks] = useState<FriaModelLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaveStatus, setLastSaveStatus] = useState<"saved" | "error" | null>(null);

  const fetchFria = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await friaRepository.getFria(projectId);
      setAssessment(data.assessment);
      setRights(data.rights || []);
      setRiskItems(data.riskItems || []);
      setModelLinks(data.modelLinks || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load FRIA");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchFria();
  }, [fetchFria]);

  // Debounce assessment updates — accumulate fields and flush after 500ms
  const pendingUpdate = useRef<Partial<FriaAssessment>>({});
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushUpdate = useCallback(async () => {
    if (!projectId) return;
    const data = { ...pendingUpdate.current };
    pendingUpdate.current = {};
    if (Object.keys(data).length === 0) return;

    setIsSaving(true);
    setLastSaveStatus(null);
    try {
      const updated = await friaRepository.updateFria(projectId, data);
      setAssessment(updated);
      setLastSaveStatus("saved");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update FRIA");
      setLastSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  }, [projectId]);

  const updateAssessment = useCallback(
    (data: Partial<FriaAssessment>) => {
      pendingUpdate.current = { ...pendingUpdate.current, ...data };
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(flushUpdate, 500);
    },
    [flushUpdate]
  );

  // Fire-and-forget flush on unmount (no state updates)
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        const data = { ...pendingUpdate.current };
        pendingUpdate.current = {};
        if (Object.keys(data).length > 0 && projectId) {
          friaRepository.updateFria(projectId, data).catch(() => {});
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Re-fetch assessment for updated scores after mutations
  const refreshAssessment = useCallback(async () => {
    const fresh = await friaRepository.getFria(projectId);
    setAssessment(fresh.assessment);
  }, [projectId]);

  const updateRights = useCallback(
    async (updatedRights: Partial<FriaRight>[]) => {
      if (!assessment) return;
      setIsSaving(true);
      setLastSaveStatus(null);
      try {
        const result = await friaRepository.updateRights(
          assessment.id,
          updatedRights
        );
        setRights(result);
        await refreshAssessment();
        setLastSaveStatus("saved");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to update rights");
        setLastSaveStatus("error");
      } finally {
        setIsSaving(false);
      }
    },
    [assessment, refreshAssessment]
  );

  const addRiskItem = useCallback(
    async (data: Partial<FriaRiskItem>) => {
      if (!assessment) return;
      setIsSaving(true);
      setLastSaveStatus(null);
      try {
        const newItem = await friaRepository.addRiskItem(assessment.id, data);
        setRiskItems((prev) => [...prev, newItem]);
        await refreshAssessment();
        setLastSaveStatus("saved");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to add risk item");
        setLastSaveStatus("error");
      } finally {
        setIsSaving(false);
      }
    },
    [assessment, refreshAssessment]
  );

  const updateRiskItem = useCallback(
    async (itemId: number, data: Partial<FriaRiskItem>) => {
      if (!assessment) return;
      setIsSaving(true);
      setLastSaveStatus(null);
      try {
        const updated = await friaRepository.updateRiskItem(assessment.id, itemId, data);
        setRiskItems((prev) =>
          prev.map((item) => (item.id === itemId ? updated : item))
        );
        await refreshAssessment();
        setLastSaveStatus("saved");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to update risk item");
        setLastSaveStatus("error");
      } finally {
        setIsSaving(false);
      }
    },
    [assessment, refreshAssessment]
  );

  const deleteRiskItem = useCallback(
    async (itemId: number) => {
      if (!assessment) return;
      setIsSaving(true);
      setLastSaveStatus(null);
      try {
        await friaRepository.deleteRiskItem(assessment.id, itemId);
        setRiskItems((prev) => prev.filter((item) => item.id !== itemId));
        await refreshAssessment();
        setLastSaveStatus("saved");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to delete risk item");
        setLastSaveStatus("error");
      } finally {
        setIsSaving(false);
      }
    },
    [assessment, refreshAssessment]
  );

  const linkModel = useCallback(
    async (modelId: number) => {
      if (!assessment) return;
      try {
        await friaRepository.linkModel(assessment.id, modelId);
        await fetchFria();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to link model");
      }
    },
    [assessment, fetchFria]
  );

  const unlinkModel = useCallback(
    async (modelId: number) => {
      if (!assessment) return;
      try {
        await friaRepository.unlinkModel(assessment.id, modelId);
        await fetchFria();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to unlink model");
      }
    },
    [assessment, fetchFria]
  );

  const submitFria = useCallback(
    async (reason?: string) => {
      if (!assessment) return;
      // Flush any pending debounced field updates before submitting
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
        await flushUpdate();
      }
      setIsSaving(true);
      try {
        await friaRepository.submitFria(assessment.id, reason);
        await fetchFria();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to submit FRIA");
      } finally {
        setIsSaving(false);
      }
    },
    [assessment, fetchFria, flushUpdate]
  );

  return {
    assessment,
    rights,
    riskItems,
    modelLinks,
    isLoading,
    error,
    isSaving,
    lastSaveStatus,
    fetchFria,
    updateAssessment,
    updateRights,
    addRiskItem,
    updateRiskItem,
    deleteRiskItem,
    linkModel,
    unlinkModel,
    submitFria,
  };
}
