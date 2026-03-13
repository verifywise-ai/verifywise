import { apiServices } from "../../infrastructure/api/networkServices";
import { RiskLibrarySearchParams } from "../../domain/types/RiskLibrary";

// ============================================================================
// SEARCH & READ
// ============================================================================

export async function searchRiskLibrary({
  params,
  signal,
}: {
  params: RiskLibrarySearchParams;
  signal?: AbortSignal;
}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.append(key, String(value));
    }
  });
  const response = await apiServices.get(`/risk-library?${query.toString()}`, {
    signal,
  });
  return response.data;
}

export async function getRiskLibraryEntry({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}) {
  const response = await apiServices.get(`/risk-library/${id}`, { signal });
  return response.data;
}

export async function getRiskLibraryFilters({
  signal,
}: {
  signal?: AbortSignal;
} = {}) {
  const response = await apiServices.get("/risk-library/filters", { signal });
  return response.data;
}

export async function getRiskLibraryStats({
  signal,
}: {
  signal?: AbortSignal;
} = {}) {
  const response = await apiServices.get("/risk-library/stats", { signal });
  return response.data;
}

// ============================================================================
// FEEDBACK
// ============================================================================

export async function submitRiskLibraryFeedback({
  id,
  feedback_type,
  flag_reason,
  context,
}: {
  id: number;
  feedback_type: "upvote" | "downvote" | "flag";
  flag_reason?: string;
  context?: Record<string, unknown>;
}) {
  const response = await apiServices.post(`/risk-library/${id}/feedback`, {
    feedback_type,
    flag_reason,
    context,
  });
  return response.data;
}

export async function removeRiskLibraryFeedback({ id }: { id: number }) {
  const response = await apiServices.delete(`/risk-library/${id}/feedback`);
  return response.data;
}

export async function getRiskLibraryFeedback({
  id,
  signal,
}: {
  id: number;
  signal?: AbortSignal;
}) {
  const response = await apiServices.get(`/risk-library/${id}/feedback`, {
    signal,
  });
  return response.data;
}

// ============================================================================
// ORG CUSTOMIZATION
// ============================================================================

export async function upsertRiskLibraryCustomization({
  id,
  custom_mitigations,
  custom_notes,
  is_hidden,
}: {
  id: number;
  custom_mitigations?: string;
  custom_notes?: string;
  is_hidden?: boolean;
}) {
  const response = await apiServices.put(`/risk-library/${id}/customize`, {
    custom_mitigations,
    custom_notes,
    is_hidden,
  });
  return response.data;
}

// ============================================================================
// AI GENERATION
// ============================================================================

export async function generateRiskTaxonomy(body: {
  industry: string;
  use_case: string;
  ai_system_type?: string;
  lifecycle_phase?: string;
  project_description?: string;
  existing_risks?: string[];
  llm_key_id: number;
}) {
  const response = await apiServices.post(
    "/risk-library/generate/taxonomy",
    body
  );
  return response.data;
}

export async function generateRiskMitigations(body: {
  risk_summary: string;
  risk_description: string;
  risk_category?: string;
  severity?: string;
  industry?: string;
  existing_mitigations?: string[];
  llm_key_id: number;
}) {
  const response = await apiServices.post(
    "/risk-library/generate/mitigations",
    body
  );
  return response.data;
}

export async function generateRiskAssessment(body: {
  use_case: string;
  industry: string;
  project_description?: string;
  model_type?: string;
  lifecycle_phase?: string;
  llm_key_id: number;
}) {
  const response = await apiServices.post(
    "/risk-library/generate/assessment",
    body
  );
  return response.data;
}

export async function submitGenerationFeedback({
  id,
  feedback_type,
}: {
  id: number;
  feedback_type: "upvote" | "downvote" | "flag";
}) {
  const response = await apiServices.post(
    `/risk-library/generations/${id}/feedback`,
    { feedback_type }
  );
  return response.data;
}
