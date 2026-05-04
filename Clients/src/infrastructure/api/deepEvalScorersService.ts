import CustomAxios from "./customAxios";

export type ScorerType = "llm" | "builtin" | "custom";

export interface DeepEvalScorer {
  id: string;
  orgId?: string | null;
  name: string;
  description?: string | null;
  type: ScorerType;
  metricKey: string;
  config: Record<string, any>;
  enabled: boolean;
  defaultThreshold?: number | null;
  weight?: number | null;
  tenant?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
}

export interface ListScorersResponse {
  scorers: DeepEvalScorer[];
}

class DeepEvalScorersService {
  async list(params?: { org_id?: string }): Promise<ListScorersResponse> {
    const res = await CustomAxios.get("/deepeval/scorers", { params });
    return res.data as ListScorersResponse;
  }

  async create(
    payload: Partial<DeepEvalScorer> & { name: string; metricKey: string },
  ): Promise<DeepEvalScorer> {
    // org_id is required by the backend - fetch current org if not provided
    let finalOrgId = payload.orgId;
    if (!finalOrgId) {
      // Dynamically import to avoid circular dependency
      const { deepEvalOrgsService } = await import("./deepEvalOrgsService");
      const { org } = await deepEvalOrgsService.getCurrentOrg();
      if (org) {
        finalOrgId = org.id;
      } else {
        // Try to get first org
        const { orgs } = await deepEvalOrgsService.getAllOrgs();
        if (orgs && orgs.length > 0) {
          finalOrgId = orgs[0].id;
          await deepEvalOrgsService.setCurrentOrg(finalOrgId);
        }
      }
    }

    if (!finalOrgId) {
      throw new Error("No organization available. Please create an organization first.");
    }

    const res = await CustomAxios.post("/deepeval/scorers", { ...payload, orgId: finalOrgId });
    return res.data as DeepEvalScorer;
  }

  async update(id: string, payload: Partial<DeepEvalScorer>): Promise<DeepEvalScorer> {
    const res = await CustomAxios.put(`/deepeval/scorers/${id}`, payload);
    return res.data as DeepEvalScorer;
  }

  async delete(id: string): Promise<{ message: string; id: string }> {
    const res = await CustomAxios.delete(`/deepeval/scorers/${id}`);
    return res.data as { message: string; id: string };
  }

  async test(
    id: string,
    payload: { input: string; output: string; expected?: string },
  ): Promise<ScorerTestResult> {
    const res = await CustomAxios.post(`/deepeval/scorers/${id}/test`, payload);
    return res.data as ScorerTestResult;
  }
}

export interface ScorerTestResult {
  scorerId: string;
  scorerName: string;
  label: string;
  score: number;
  passed: boolean;
  rawResponse: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export const deepEvalScorersService = new DeepEvalScorersService();
