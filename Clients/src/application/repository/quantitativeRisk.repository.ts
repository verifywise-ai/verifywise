import CustomAxios from "../../infrastructure/api/customAxios";
import type {
  IRiskBenchmark,
  IPortfolioSummary,
  IPortfolioSnapshot,
  IBenchmarkFilters,
} from "../../domain/interfaces/i.quantitativeRisk";

// ── Benchmarks ──

export async function getAllBenchmarks(
  industry?: string,
  aiRiskType?: string
): Promise<IRiskBenchmark[]> {
  const params = new URLSearchParams();
  if (industry) params.set("industry", industry);
  if (aiRiskType) params.set("ai_risk_type", aiRiskType);
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await CustomAxios.get(`/risk-benchmarks${query}`);
  return response.data.data;
}

export async function getBenchmarkById(id: number): Promise<IRiskBenchmark> {
  const response = await CustomAxios.get(`/risk-benchmarks/${id}`);
  return response.data.data;
}

export async function getBenchmarkFilters(): Promise<IBenchmarkFilters> {
  const response = await CustomAxios.get("/risk-benchmarks/filters");
  return response.data.data;
}

// ── Apply benchmark ──

export async function applyBenchmarkToRisk(
  riskId: number,
  benchmarkId: number
): Promise<any> {
  const response = await CustomAxios.post(
    `/quantitative-risks/${riskId}/apply-benchmark/${benchmarkId}`
  );
  return response.data.data;
}

// ── Portfolio ──

export async function getOrgPortfolio(): Promise<IPortfolioSummary> {
  const response = await CustomAxios.get("/quantitative-risks/portfolio/org");
  return response.data.data;
}

export async function getProjectPortfolio(
  projectId: number
): Promise<IPortfolioSummary> {
  const response = await CustomAxios.get(
    `/quantitative-risks/portfolio/project/${projectId}`
  );
  return response.data.data;
}

export async function getPortfolioTrend(
  days?: number,
  projectId?: number
): Promise<IPortfolioSnapshot[]> {
  const params = new URLSearchParams();
  if (days) params.set("days", String(days));
  if (projectId) params.set("projectId", String(projectId));
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await CustomAxios.get(
    `/quantitative-risks/portfolio/trend${query}`
  );
  return response.data.data;
}

// ── Assessment mode ──

export async function getRiskAssessmentMode(): Promise<{
  risk_assessment_mode: string;
}> {
  const response = await CustomAxios.get(
    "/quantitative-risks/assessment-mode"
  );
  return response.data.data;
}

export async function updateRiskAssessmentMode(
  mode: "qualitative" | "quantitative"
): Promise<{ risk_assessment_mode: string }> {
  const response = await CustomAxios.put(
    "/quantitative-risks/assessment-mode",
    { mode }
  );
  return response.data.data;
}
