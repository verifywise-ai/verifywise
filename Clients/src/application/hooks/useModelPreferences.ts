/**
 * Hook for auto-populating model settings in experiment forms
 *
 * The model comes from the most recently saved entry in the Models table.
 * The judge comes from the organization's most recent completed experiment that used
 * one, so it is remembered without adding anything to the Scorers list, and a judge
 * that made a run fail is not suggested again.
 */

import { useCallback, useState, useEffect, useRef } from "react";
import { evalModelsService } from "../../infrastructure/api/evalModelsService";
import { experimentsService } from "../../infrastructure/api/evaluationLogsService";
import { deepEvalOrgsService } from "../../infrastructure/api/deepEvalOrgsService";
import { DEFAULT_JUDGE } from "../../presentation/utils/providers";

export interface ModelPreferences {
  // Model being evaluated
  model: {
    name: string;
    accessMethod: string;
    endpointUrl?: string;
  };
  // Judge LLM settings (from the latest experiment, or defaults)
  judgeLlm: {
    provider: string;
    model: string;
    endpointUrl?: string;
  };
  // Timestamp of when this was saved
  savedAt?: string;
}

interface ExperimentJudgeSummary {
  created_at?: string;
  config?: { judgeLlm?: { provider?: string; model?: string; endpointUrl?: string } };
}

/** Enough recent runs to find one that used a judge; scorer-only runs carry none. */
const RECENT_EXPERIMENTS_TO_SCAN = 20;

/** The judge of the newest experiment that used one (the list comes newest first). */
function latestJudgeFrom(
  experiments: ExperimentJudgeSummary[],
): ModelPreferences["judgeLlm"] | null {
  for (const exp of experiments) {
    const judge = exp.config?.judgeLlm;
    if (judge?.provider && judge?.model) {
      return {
        provider: judge.provider,
        model: judge.model,
        endpointUrl: judge.endpointUrl || undefined,
      };
    }
  }
  return null;
}

/**
 * Hook to get the most recently used model for auto-populating experiments
 */
export function useModelPreferences(projectId: string, orgId?: string | null) {
  void projectId; // Preferences are organization-wide, like the Models list
  const [preferences, setPreferences] = useState<ModelPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Store orgId in ref for use in callbacks (updated via useEffect to avoid render-time mutation)
  const orgIdRef = useRef(orgId);
  useEffect(() => {
    orgIdRef.current = orgId;
  }, [orgId]);

  /**
   * Load the latest model and judge from the API
   */
  const loadPreferences = useCallback(async (): Promise<ModelPreferences | null> => {
    setLoading(true);
    try {
      const currentOrgId = orgIdRef.current;

      const [models, experimentsRes] = await Promise.all([
        evalModelsService.listModels(currentOrgId || undefined),
        experimentsService
          .getExperiments({ status: "completed", limit: RECENT_EXPERIMENTS_TO_SCAN })
          .catch(() => ({ experiments: [] })),
      ]);
      const experiments: ExperimentJudgeSummary[] = experimentsRes?.experiments ?? [];
      const latestJudge = latestJudgeFrom(experiments);

      if (models.length > 0 || latestJudge) {
        const latestModel = models[0];

        const prefs: ModelPreferences = {
          model: latestModel
            ? {
                name: latestModel.name,
                accessMethod: latestModel.provider,
                endpointUrl: latestModel.endpointUrl,
              }
            : {
                name: "",
                accessMethod: "",
                endpointUrl: undefined,
              },
          judgeLlm: latestJudge ?? { provider: DEFAULT_JUDGE.provider, model: DEFAULT_JUDGE.model },
          savedAt: latestModel?.updatedAt || experiments[0]?.created_at || undefined,
        };
        setPreferences(prefs);
        return prefs;
      }

      setPreferences(null);
      return null;
    } catch (err) {
      console.error("Failed to load model preferences:", err);
      setPreferences(null);
      return null;
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  /**
   * Get preferences (from cache or fetch from API)
   */
  const getPreferences = useCallback(async (): Promise<ModelPreferences | null> => {
    if (loaded) {
      return preferences;
    }
    return loadPreferences();
  }, [loaded, preferences, loadPreferences]);

  /**
   * Save the model to the Models table. Called when an experiment is submitted. The judge
   * needs no saving: the new experiment stores it and the next load reads it from there.
   */
  const savePreferences = useCallback(
    async (prefs: Omit<ModelPreferences, "savedAt">): Promise<boolean> => {
      try {
        // Get orgId - from ref, or fetch current org
        let currentOrgId = orgIdRef.current;
        if (!currentOrgId) {
          const { org } = await deepEvalOrgsService.getCurrentOrg();
          currentOrgId = org?.id || null;
        }
        if (!currentOrgId) {
          // Try to get first available org
          const { orgs } = await deepEvalOrgsService.getAllOrgs();
          if (orgs && orgs.length > 0) {
            currentOrgId = orgs[0].id;
          }
        }
        if (!currentOrgId) {
          console.error("No organization found - cannot save model preferences");
          return false;
        }

        // Save the model (if not already exists)
        const models = await evalModelsService.listModels(currentOrgId);
        const existingModel = models.find(
          (m) => m.name === prefs.model.name && m.provider === prefs.model.accessMethod,
        );

        if (!existingModel) {
          await evalModelsService.createModel({
            orgId: currentOrgId,
            name: prefs.model.name,
            provider: prefs.model.accessMethod,
            endpointUrl: prefs.model.endpointUrl,
          });
        }

        // A scorer-only run has no judge; keep the last one rather than blanking it
        setPreferences((prev) => ({
          ...prefs,
          judgeLlm:
            prefs.judgeLlm?.provider && prefs.judgeLlm?.model
              ? prefs.judgeLlm
              : (prev?.judgeLlm ?? {
                  provider: DEFAULT_JUDGE.provider,
                  model: DEFAULT_JUDGE.model,
                }),
          savedAt: new Date().toISOString(),
        }));
        return true;
      } catch (err) {
        console.error("Failed to save model preferences:", err);
        return false;
      }
    },
    [],
  );

  /**
   * Clear saved preferences - not implemented for this simplified version
   */
  const clearPreferences = useCallback(async (): Promise<boolean> => {
    return false;
  }, []);

  /**
   * Check if preferences exist
   */
  const hasPreferences = useCallback((): boolean => {
    return preferences !== null;
  }, [preferences]);

  // Auto-load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  return {
    preferences,
    loading,
    loaded,
    getPreferences,
    savePreferences,
    clearPreferences,
    hasPreferences,
    loadPreferences,
  };
}
