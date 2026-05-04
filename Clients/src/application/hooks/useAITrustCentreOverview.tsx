import { useState, useEffect, useCallback } from "react";
import {
  getAITrustCentreOverview,
  updateAITrustCentreOverview,
} from "../repository/aiTrustCentre.repository";

export interface AITrustCentreOverviewData {
  info?: {
    company_description_visible: boolean;
    compliance_badges_visible: boolean;
    header_color: string;
    id: number;
    intro_visible: boolean;
    resources_visible: boolean;
    subprocessor_visible: boolean;
    terms_and_contact_visible: boolean;
    title: string;
    visible: boolean;
  };
  intro?: {
    our_mission_text: string;
    our_mission_visible: boolean;
    our_statement_text: string;
    our_statement_visible: boolean;
    purpose_text: string;
    purpose_visible: boolean;
  };
  compliance_badges?: {
    ccpa: boolean;
    eu_ai_act: boolean;
    gdpr: boolean;
    hipaa: boolean;
    iso_27001: boolean;
    iso_42001: boolean;
    soc2_type_i: boolean;
    soc2_type_ii: boolean;
  };
  company_description?: {
    background_text: string;
    background_visible: boolean;
    compliance_doc_text: string;
    compliance_doc_visible: boolean;
    core_benefits_text: string;
    core_benefits_visible: boolean;
  };
  terms_and_contact?: {
    email_text: string;
    email_visible: boolean;
    privacy_text: string;
    privacy_visible: boolean;
    terms_text: string;
    terms_visible: boolean;
  };
}

interface UseAITrustCentreOverviewReturn {
  data: AITrustCentreOverviewData | null;
  loading: boolean;
  error: string | null;
  fetchOverview: () => Promise<any>;
  updateOverview: (data: Partial<AITrustCentreOverviewData>) => Promise<void>;
}

export const useAITrustCentreOverview = (): UseAITrustCentreOverviewReturn => {
  const [data, setData] = useState<AITrustCentreOverviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAITrustCentreOverview();
      // debugger;
      if (response && response.data && response.data.overview) {
        setData(response.data.overview);
      } else if (response && response.overview) {
        setData(response.overview);
      } else {
        setData(null);
      }
      return response; // Return the response
    } catch (err: any) {
      setError(err.message || "Failed to fetch AI Trust Centre overview");
      console.error("Error fetching AI Trust Centre overview:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateOverview = useCallback(async (overviewData: Partial<AITrustCentreOverviewData>) => {
    setLoading(true);
    setError(null);
    try {
      await updateAITrustCentreOverview(overviewData);
      // Don't refetch immediately - let the component handle the state update
      // await fetchOverview();
    } catch (err: any) {
      setError(err.message || "Failed to update AI Trust Centre overview");
      console.error("Error updating AI Trust Centre overview:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch data on mount
  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  return {
    data,
    loading,
    error,
    fetchOverview,
    updateOverview,
  };
};
