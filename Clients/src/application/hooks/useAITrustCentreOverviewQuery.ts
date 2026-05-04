import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
    logo_url?: string;
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

// Query key for overview data
export const overviewQueryKey = ["aiTrustCentre", "overview"] as const;

// Hook for fetching overview data
export const useAITrustCentreOverviewQuery = () => {
  return useQuery({
    queryKey: overviewQueryKey,
    queryFn: async () => {
      const response = await getAITrustCentreOverview();
      // Handle nested response structure
      const overviewData = response?.data?.overview || response?.overview || response;
      return overviewData as AITrustCentreOverviewData;
    },
    // Uses default options from QueryClient
  });
};

// Hook for updating overview data
export const useAITrustCentreOverviewMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<AITrustCentreOverviewData>) => {
      return await updateAITrustCentreOverview(data);
    },
    onSuccess: () => {
      // Invalidate and refetch overview data
      queryClient.invalidateQueries({ queryKey: overviewQueryKey });
    },
    onError: (error: any) => {
      console.error("Error updating AI Trust Centre overview:", error);
    },
  });
};
