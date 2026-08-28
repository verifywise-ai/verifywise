/**
 * AI Detection fixtures — scans and repositories.
 *
 * Types come from `domain/ai-detection/types.ts` and `repositoryTypes.ts`.
 * Deterministic, matching the other fixture files.
 */

import type { Pagination, Scan, ScansResponse } from "../../../domain/ai-detection/types";
import type {
  AIDetectionRepository,
  RepositoriesResponse,
} from "../../../domain/ai-detection/repositoryTypes";

const pagination = (total: number): Pagination => ({
  total,
  page: 1,
  limit: 20,
  total_pages: Math.max(1, Math.ceil(total / 20)),
});

// ─── Scans ───────────────────────────────────────────────────────────

export function createMockScan(overrides: Partial<Scan> = {}) {
  return {
    id: 1,
    repository_url: "https://github.com/acme/ml-platform",
    repository_owner: "acme",
    repository_name: "ml-platform",
    status: "completed",
    findings_count: 7,
    files_scanned: 412,
    started_at: "2026-02-10T09:00:00Z",
    completed_at: "2026-02-10T09:04:20Z",
    duration_ms: 260000,
    triggered_by: { id: 1, name: "Test", surname: "User" },
    risk_score: 68,
    created_at: "2026-02-10T09:00:00Z",
    ...overrides,
  } satisfies Scan;
}

export const mockScans: Scan[] = [
  createMockScan(),
  createMockScan({
    id: 2,
    repository_name: "inference-api",
    repository_url: "https://github.com/acme/inference-api",
    status: "scanning",
    findings_count: 0,
    files_scanned: 0,
    completed_at: undefined,
    duration_ms: undefined,
    risk_score: null,
  }),
];

/** The one currently running, as AIDetectionSidebar.context expects. */
export const mockActiveScan: Scan = mockScans[1];

export function mockScansResponse(scans: Scan[] = mockScans): ScansResponse {
  return { scans, pagination: pagination(scans.length) };
}

export const mockScanStatus = {
  id: 1,
  status: "completed",
  findings_count: 7,
  files_scanned: 412,
};

/** Findings are large and vary by view; keep the list minimal and extend per test. */
export function mockFindingsResponse(findings: unknown[] = []) {
  return { findings, pagination: pagination(findings.length) };
}

export const mockSecuritySummary = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 1,
  total: 7,
};

export const mockGovernanceSummary = {
  governed: 3,
  ungoverned: 4,
  total: 7,
};

export const mockAiDetectionStats = {
  total_scans: 12,
  total_findings: 45,
  repositories_scanned: 4,
};

export const mockRiskScore = {
  score: 68,
  grade: "C",
  calculated_at: "2026-02-10T09:04:20Z",
};

export const mockDependencyGraph = {
  nodes: [
    { id: "ml-platform", label: "ml-platform", type: "root" },
    { id: "torch", label: "torch", type: "package" },
  ],
  edges: [{ source: "ml-platform", target: "torch" }],
};

export const mockComplianceMapping = {
  frameworks: [{ framework: "EU AI Act", mapped: 5, total: 8 }],
};

export const mockRiskScoringConfig = {
  weights: { critical: 10, high: 5, medium: 2, low: 1 },
  thresholds: { a: 90, b: 75, c: 60, d: 40 },
};

export const mockSuppressions = [
  {
    id: 1,
    finding_type: "hardcoded_key",
    reason: "False positive in test fixtures",
    created_at: "2026-02-01T00:00:00Z",
  },
];

// ─── Repositories ────────────────────────────────────────────────────

export function createMockAiDetectionRepository(overrides: Partial<AIDetectionRepository> = {}) {
  return {
    id: 1,
    repository_url: "https://github.com/acme/ml-platform",
    repository_owner: "acme",
    repository_name: "ml-platform",
    display_name: "ML Platform",
    default_branch: "main",
    schedule_enabled: true,
    schedule_hour: 3,
    schedule_minute: 0,
    ci_enabled: false,
    ci_min_score: 60,
    ci_max_critical: 0,
    ci_post_comments: true,
    ci_status_checks: true,
    last_scan_id: 1,
    last_scan_status: "completed",
    last_scan_at: "2026-02-10T09:04:20Z",
    is_enabled: true,
    ...overrides,
  } as AIDetectionRepository;
}

export const mockAiDetectionRepositories: AIDetectionRepository[] = [
  createMockAiDetectionRepository(),
  createMockAiDetectionRepository({
    id: 2,
    repository_name: "inference-api",
    repository_url: "https://github.com/acme/inference-api",
    display_name: "Inference API",
    schedule_enabled: false,
    is_enabled: false,
  }),
];

export function mockRepositoriesResponse(
  repositories: AIDetectionRepository[] = mockAiDetectionRepositories,
): RepositoriesResponse {
  return { repositories, pagination: pagination(repositories.length) };
}
