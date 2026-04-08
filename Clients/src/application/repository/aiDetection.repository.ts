/**
 * @fileoverview AI Detection Repository
 *
 * API client for AI Detection endpoints.
 *
 * @module repository/aiDetection
 */

import { apiServices } from "../../infrastructure/api/networkServices";
import {
  Scan,
  ScanStatusResponse,
  ScanResponse,
  FindingsResponse,
  ScansResponse,
  StartScanRequest,
  GetScansParams,
  GetFindingsParams,
  SecurityFindingsResponse,
  GetSecurityFindingsParams,
  SecuritySummary,
  GovernanceStatus,
  GovernanceSummary,
  UpdateGovernanceStatusResponse,
  AIDetectionStats,
  DependencyGraphResponse,
  ComplianceMappingResponse,
  Finding,
  VulnerabilityFindingType,
  VULNERABILITY_FINDING_TYPES,
} from "../../domain/ai-detection/types";
import {
  RiskScore,
  RiskScoreResult,
  RiskScoringConfig,
} from "../../domain/ai-detection/riskScoringTypes";

const BASE_URL = "/ai-detection";

// ============================================================================
// Scan Operations
// ============================================================================

/**
 * Start a new repository scan
 *
 * @param repositoryUrl - GitHub repository URL to scan
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns Created scan
 */
export async function startScan(
  repositoryUrl: string,
  signal?: AbortSignal,
  options?: {
    scan_mode?: "full" | "incremental";
    base_commit_sha?: string;
    head_commit_sha?: string;
  },
): Promise<Scan> {
  const body: StartScanRequest = {
    repository_url: repositoryUrl,
    ...options,
  };
  const response = await apiServices.post<{ data: Scan }>(
    `${BASE_URL}/scans`,
    body,
    {
      signal,
    }
  );
  return response.data.data;
}

/**
 * Get scan status for polling
 *
 * @param scanId - Scan ID
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns Scan status
 */
export async function getScanStatus(
  scanId: number,
  signal?: AbortSignal,
): Promise<ScanStatusResponse> {
  const response = await apiServices.get<{ data: ScanStatusResponse }>(
    `${BASE_URL}/scans/${scanId}/status`,
    {
      signal,
    }
  );
  return response.data.data;
}

/**
 * Get scan details with summary
 *
 * @param scanId - Scan ID
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns Scan with summary
 */
export async function getScan(
  scanId: number,
  signal?: AbortSignal,
): Promise<ScanResponse> {
  const response = await apiServices.get<{ data: ScanResponse }>(
    `${BASE_URL}/scans/${scanId}`,
    {
      signal,
    }
  );
  return response.data.data;
}

/**
 * Get findings for a scan
 *
 * @param scanId - Scan ID
 * @param params - Pagination and filter params
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns Paginated findings
 */
export async function getScanFindings(
  scanId: number,
  params: GetFindingsParams = {},
  signal?: AbortSignal,
): Promise<FindingsResponse> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", params.page.toString());
  if (params.limit) queryParams.append("limit", params.limit.toString());
  if (params.confidence) queryParams.append("confidence", params.confidence);
  if (params.finding_type) queryParams.append("finding_type", params.finding_type);

  const queryString = queryParams.toString();
  const url = `${BASE_URL}/scans/${scanId}/findings${queryString ? `?${queryString}` : ""}`;

  const response = await apiServices.get<{ data: FindingsResponse }>(url, {
    signal,
  });
  return response.data.data;
}

/**
 * Get security findings for a scan
 *
 * @param scanId - Scan ID
 * @param params - Pagination and filter params
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns Paginated security findings
 */
export async function getScanSecurityFindings(
  scanId: number,
  params: GetSecurityFindingsParams = {},
  signal?: AbortSignal,
): Promise<SecurityFindingsResponse> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", params.page.toString());
  if (params.limit) queryParams.append("limit", params.limit.toString());
  if (params.severity) queryParams.append("severity", params.severity);

  const queryString = queryParams.toString();
  const url = `${BASE_URL}/scans/${scanId}/security-findings${queryString ? `?${queryString}` : ""}`;

  const response = await apiServices.get<{ data: SecurityFindingsResponse }>(url, {
    signal,
  });
  return response.data.data;
}

/**
 * Get security summary for a scan
 *
 * @param scanId - Scan ID
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns Security summary
 */
export async function getScanSecuritySummary(
  scanId: number,
  signal?: AbortSignal,
): Promise<SecuritySummary> {
  const response = await apiServices.get<{ data: SecuritySummary }>(
    `${BASE_URL}/scans/${scanId}/security-summary`,
    {
      signal,
    }
  );
  return response.data.data;
}

/**
 * Get scan history list
 *
 * @param params - Pagination and filter params
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns Paginated scans
 */
export async function getScans(
  params: GetScansParams = {},
  signal?: AbortSignal,
): Promise<ScansResponse> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append("page", params.page.toString());
  if (params.limit) queryParams.append("limit", params.limit.toString());
  if (params.status) queryParams.append("status", params.status);

  const queryString = queryParams.toString();
  const url = `${BASE_URL}/scans${queryString ? `?${queryString}` : ""}`;

  const response = await apiServices.get<{ data: ScansResponse }>(url, {
    signal,
  });
  return response.data.data;
}

/**
 * Cancel an in-progress scan
 *
 * @param scanId - Scan ID
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns Cancellation result
 */
export async function cancelScan(
  scanId: number,
  signal?: AbortSignal,
): Promise<{ id: number; status: "cancelled"; message: string }> {
  const response = await apiServices.post<{
    data: { id: number; status: "cancelled"; message: string };
  }>(
    `${BASE_URL}/scans/${scanId}/cancel`,
    {},
    {
      signal,
    }
  );
  return response.data.data;
}

/**
 * Delete a completed/failed/cancelled scan
 *
 * @param scanId - Scan ID
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns Deletion result
 */
export async function deleteScan(
  scanId: number,
  signal?: AbortSignal,
): Promise<{ message: string }> {
  const response = await apiServices.delete<{ data: { message: string } }>(
    `${BASE_URL}/scans/${scanId}`,
    {
      signal,
    }
  );
  return response.data.data;
}

/**
 * Get the most recent active scan (pending, cloning, or scanning)
 * Uses a single API call with server-side filtering for efficiency.
 *
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns Most recent active scan or null
 */
export async function getActiveScan(
  signal?: AbortSignal,
): Promise<Scan | null> {
  // Use the dedicated active scan endpoint for efficiency (single API call)
  const url = `${BASE_URL}/scans/active`;

  try {
    const response = await apiServices.get<{ data: Scan | null }>(url, {
      signal,
    });
    return response.data.data;
  } catch {
    // If endpoint doesn't exist or fails, return null
    return null;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Poll scan status until complete
 *
 * @param scanId - Scan ID
 * @param onProgress - Progress callback
 * @param pollInterval - Poll interval in ms (default 1000)
 * @param signal - Optional abort signal
 * @returns Final scan status
 */
export async function pollScanStatus(
  scanId: number,
  onProgress?: (status: ScanStatusResponse) => void,
  pollInterval: number = 1000,
  signal?: AbortSignal
): Promise<ScanStatusResponse> {
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isSettled = false;

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const settle = (
      resolver: (value: ScanStatusResponse) => void,
      value: ScanStatusResponse
    ) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      resolver(value);
    };

    const settleError = (error: Error) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      reject(error);
    };

    // Handle abort signal
    if (signal) {
      if (signal.aborted) {
        reject(new Error("Polling aborted"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => settleError(new Error("Polling aborted")),
        { once: true }
      );
    }

    const poll = async () => {
      if (isSettled || signal?.aborted) {
        return;
      }

      try {
        const status = await getScanStatus(scanId, signal);

        // Check again after async operation
        if (isSettled || signal?.aborted) {
          return;
        }

        onProgress?.(status);

        if (
          status.status === "completed" ||
          status.status === "failed" ||
          status.status === "cancelled"
        ) {
          settle(resolve, status);
        } else {
          timeoutId = setTimeout(poll, pollInterval);
        }
      } catch (error) {
        settleError(error instanceof Error ? error : new Error(String(error)));
      }
    };

    poll();
  });
}

// ============================================================================
// Governance Operations
// ============================================================================

/**
 * Update governance status for a finding
 *
 * @param scanId - Scan ID
 * @param findingId - Finding ID
 * @param governanceStatus - New status or null to clear
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns Updated finding
 */
export async function updateFindingGovernanceStatus(
  scanId: number,
  findingId: number,
  governanceStatus: GovernanceStatus | null,
  signal?: AbortSignal,
): Promise<UpdateGovernanceStatusResponse> {
  const response = await apiServices.patch<{ data: UpdateGovernanceStatusResponse }>(
    `${BASE_URL}/scans/${scanId}/findings/${findingId}/governance`,
    { governance_status: governanceStatus },
    {
      signal,
    }
  );
  return response.data.data;
}

/**
 * Get governance summary for a scan
 *
 * @param scanId - Scan ID
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns Governance summary
 */
export async function getGovernanceSummary(
  scanId: number,
  signal?: AbortSignal,
): Promise<GovernanceSummary> {
  const response = await apiServices.get<{ data: GovernanceSummary }>(
    `${BASE_URL}/scans/${scanId}/governance-summary`,
    {
      signal,
    }
  );
  return response.data.data;
}

// ============================================================================
// Statistics Operations
// ============================================================================

/**
 * Get overall AI Detection statistics
 *
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns AI Detection statistics
 */
export async function getAIDetectionStats(
  signal?: AbortSignal,
): Promise<AIDetectionStats> {
  const response = await apiServices.get<{ data: AIDetectionStats }>(
    `${BASE_URL}/stats`,
    {
      signal,
    }
  );
  return response.data.data;
}

// ============================================================================
// Export Operations
// ============================================================================

/**
 * Export scan results as AI Bill of Materials (AI-BOM)
 *
 * @param scanId - Scan ID
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns AI-BOM JSON data
 */
export async function exportAIBOM(
  scanId: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await apiServices.get<{ data: unknown }>(
    `${BASE_URL}/scans/${scanId}/export/ai-bom`,
    {
      signal,
    }
  );
  return response.data.data;
}

// ============================================================================
// Dependency Graph Operations
// ============================================================================

/**
 * Get dependency graph data for visualization
 *
 * @param scanId - Scan ID
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns Dependency graph nodes, edges, and metadata
 */
export async function getDependencyGraph(
  scanId: number,
  signal?: AbortSignal,
): Promise<DependencyGraphResponse> {
  const response = await apiServices.get<{ data: DependencyGraphResponse }>(
    `${BASE_URL}/scans/${scanId}/dependency-graph`,
    {
      signal,
    }
  );
  return response.data.data;
}

// ============================================================================
// Compliance Operations
// ============================================================================

/**
 * Get EU AI Act compliance mapping for a scan
 *
 * @param scanId - Scan ID
 * @param signal - Optional abort signal
 * @param authToken - Optional auth token
 * @returns Compliance mapping with findings, checklist, and summary
 */
export async function getComplianceMapping(
  scanId: number,
  signal?: AbortSignal,
): Promise<ComplianceMappingResponse> {
  const response = await apiServices.get<{ data: ComplianceMappingResponse }>(
    `${BASE_URL}/scans/${scanId}/compliance`,
    {
      signal,
    }
  );
  return response.data.data;
}

// ============================================================================
// Risk Scoring Operations
// ============================================================================

/**
 * Get risk score for a scan
 */
export async function getRiskScore(
  scanId: number,
  signal?: AbortSignal,
): Promise<RiskScore> {
  const response = await apiServices.get<{ data: RiskScore }>(
    `${BASE_URL}/scans/${scanId}/risk-score`,
    { signal }
  );
  return response.data.data;
}

/**
 * Recalculate risk score for a completed scan
 */
export async function recalculateRiskScore(
  scanId: number,
  signal?: AbortSignal,
): Promise<RiskScoreResult> {
  const response = await apiServices.post<{ data: RiskScoreResult }>(
    `${BASE_URL}/scans/${scanId}/risk-score/recalculate`,
    {},
    { signal }
  );
  return response.data.data;
}

/**
 * Get risk scoring configuration
 */
export async function getRiskScoringConfig(
  signal?: AbortSignal,
): Promise<RiskScoringConfig> {
  const response = await apiServices.get<{ data: RiskScoringConfig }>(
    `${BASE_URL}/risk-scoring/config`,
    { signal }
  );
  return response.data.data;
}

/**
 * Update risk scoring configuration
 */
export async function updateRiskScoringConfig(
  config: Partial<Pick<RiskScoringConfig, "llm_enabled" | "llm_key_id" | "dimension_weights" | "vulnerability_scan_enabled" | "vulnerability_types_enabled">>,
  signal?: AbortSignal,
): Promise<RiskScoringConfig> {
  const response = await apiServices.patch<{ data: RiskScoringConfig }>(
    `${BASE_URL}/risk-scoring/config`,
    config,
    { signal }
  );
  return response.data.data;
}

// ============================================================================
// Vulnerability Findings Operations
// ============================================================================

/**
 * Get all vulnerability findings for a scan (prompt_injection, pii_exposure, excessive_agency, jailbreak_risk)
 */
export async function getScanVulnerabilityFindings(
  scanId: number,
  signal?: AbortSignal,
): Promise<Finding[]> {
  const responses = await Promise.all(
    VULNERABILITY_FINDING_TYPES.map((type) =>
      getScanFindings(scanId, { page: 1, limit: 50, finding_type: type as VulnerabilityFindingType }, signal)
    )
  );
  return responses.flatMap((r) => r.findings);
}
