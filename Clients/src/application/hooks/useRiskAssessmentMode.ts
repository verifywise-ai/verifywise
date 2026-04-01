import { useState, useEffect, useCallback } from "react";
import {
  getRiskAssessmentMode,
  updateRiskAssessmentMode,
} from "../repository/quantitativeRisk.repository";

/**
 * Hook to get and toggle the organization's risk assessment mode.
 * Returns { mode, isQuantitative, isLoading, toggleMode, refetch }.
 */
export function useRiskAssessmentMode() {
  const [mode, setMode] = useState<"qualitative" | "quantitative">(
    "qualitative"
  );
  const [isLoading, setIsLoading] = useState(true);

  const fetchMode = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getRiskAssessmentMode();
      setMode(
        (data.risk_assessment_mode as "qualitative" | "quantitative") ||
          "qualitative"
      );
    } catch (error) {
      console.error("Failed to fetch risk assessment mode:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMode();
  }, [fetchMode]);

  const toggleMode = useCallback(async () => {
    const newMode = mode === "qualitative" ? "quantitative" : "qualitative";
    try {
      const data = await updateRiskAssessmentMode(newMode);
      setMode(
        (data.risk_assessment_mode as "qualitative" | "quantitative") ||
          newMode
      );
      return data;
    } catch (error) {
      console.error("Failed to update risk assessment mode:", error);
      throw error;
    }
  }, [mode]);

  const setModeDirectly = useCallback(
    async (newMode: "qualitative" | "quantitative") => {
      try {
        const data = await updateRiskAssessmentMode(newMode);
        setMode(
          (data.risk_assessment_mode as "qualitative" | "quantitative") ||
            newMode
        );
        return data;
      } catch (error) {
        console.error("Failed to update risk assessment mode:", error);
        throw error;
      }
    },
    []
  );

  return {
    mode,
    isQuantitative: mode === "quantitative",
    isLoading,
    toggleMode,
    setMode: setModeDirectly,
    refetch: fetchMode,
  };
}
