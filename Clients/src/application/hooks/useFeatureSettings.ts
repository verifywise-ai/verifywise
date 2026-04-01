import { useState, useEffect, useCallback } from "react";
import {
  getFeatureSettings,
  updateFeatureSettings,
  type FeatureSettings,
} from "../repository/featureSettings.repository";

export function useFeatureSettings() {
  const [settings, setSettings] = useState<FeatureSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getFeatureSettings();
      setSettings(data);
    } catch (error) {
      console.error("Failed to fetch feature settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const update = useCallback(
    async (
      updates: Partial<
        Pick<FeatureSettings, "lifecycle_enabled" | "audit_ledger_enabled">
      >
    ) => {
      try {
        const updated = await updateFeatureSettings(updates);
        setSettings(updated);
        return updated;
      } catch (error) {
        console.error("Failed to update feature settings:", error);
        throw error;
      }
    },
    []
  );

  return { settings, isLoading, update, refetch: fetchSettings };
}
