/**
 * Hook for auto-populating model settings in experiment forms
 *
 * Fetches the most recently used model from the Models table.
 * For judge LLM, uses the most recently used scorer's config if available.
 */

import { useCallback, useState, useEffect, useRef } from "react";
import { evalModelsService } from "../../infrastructure/api/evalModelsService";
import { deepEvalScorersService } from "../../infrastructure/api/deepEvalScorersService";
import { deepEvalOrgsService } from "../../infrastructure/api/deepEvalOrgsService";

export interface ModelPreferences {
  // Model being evaluated
  model: {
    name: string;
    accessMethod: string;
    endpointUrl?: string;
  };
  // Judge LLM settings (from scorer config or defaults)
  judgeLlm: {
    provider: string;
    model: string;
    endpointUrl?: string;
    temperature: number;
    maxTokens: number;
  };
  // Timestamp of when this was saved
  savedAt?: string;
}

/**
 * Hook to get the most recently used model for auto-populating experiments
 */
export function useModelPreferences(projectId: string, orgId?: string | null) {
  void projectId; // Reserved for future project-scoped preferences
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

      // Fetch latest model and scorers in parallel
      const [models, scorersRes] = await Promise.all([
        evalModelsService.listModels(currentOrgId || undefined),
        deepEvalScorersService.list({ org_id: currentOrgId || undefined }),
      ]);

      // Find the latest judge scorer (type: "llm" with judge config)
      const latestJudge = scorersRes.scorers
        .filter((s) => s.type === "llm" && s.config?.provider && s.config?.model)
        .sort((a, b) => {
          const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return dateB - dateA;
        })[0];

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
          // Use latest judge from scorers, or default
          judgeLlm: latestJudge
            ? {
                provider: latestJudge.config?.provider || "openai",
                model: latestJudge.config?.model || "gpt-4o",
                endpointUrl: latestJudge.config?.endpointUrl || undefined,
                temperature: latestJudge.config?.temperature ?? 0.7,
                maxTokens: latestJudge.config?.maxTokens ?? 2048,
              }
            : {
                provider: "openai",
                model: "gpt-4o",
                temperature: 0.7,
                maxTokens: 2048,
              },
          savedAt: latestModel?.updatedAt || latestJudge?.updatedAt || undefined,
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
   * Save model to the models table and judge to the scorers table
   * Called when experiment is submitted - saves configs for next time
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

        // 1. Save the model (if not already exists)
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

        // 2. Save the judge as a scorer (if not already exists)
        if (prefs.judgeLlm?.provider && prefs.judgeLlm?.model) {
          const scorersRes = await deepEvalScorersService.list({ org_id: currentOrgId });
          const judgeScorerName = `Judge: ${prefs.judgeLlm.model}`;
          const existingJudge = scorersRes.scorers.find(
            (s) =>
              s.type === "llm" &&
              s.config?.model === prefs.judgeLlm.model &&
              s.config?.provider === prefs.judgeLlm.provider,
          );

          if (!existingJudge) {
            await deepEvalScorersService.create({
              orgId: currentOrgId,
              name: judgeScorerName,
              description: `Auto-saved judge LLM: ${prefs.judgeLlm.provider}/${prefs.judgeLlm.model}`,
              type: "llm",
              metricKey: "judge_llm",
              config: {
                provider: prefs.judgeLlm.provider,
                model: prefs.judgeLlm.model,
                ...(prefs.judgeLlm.endpointUrl ? { endpointUrl: prefs.judgeLlm.endpointUrl } : {}),
                temperature: prefs.judgeLlm.temperature,
                maxTokens: prefs.judgeLlm.maxTokens,
              },
              enabled: true,
            });
          }
        }

        setPreferences({
          ...prefs,
          savedAt: new Date().toISOString(),
        });
        return true;
      } catch (err) {
        console.error("Failed to save model/judge preferences:", err);
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
