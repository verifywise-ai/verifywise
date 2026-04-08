/**
 * @fileoverview AI Detection Controller
 *
 * HTTP request handlers for AI Detection endpoints.
 * Follows the established controller pattern with logging and status codes.
 *
 * @module controllers/aiDetection
 */

import { Request, Response } from "express";
import { logProcessing, logSuccess, logFailure as logError } from "../utils/logger/logHelper";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  ValidationException,
  NotFoundException,
  BusinessLogicException,
  ExternalServiceException,
} from "../domain.layer/exceptions/custom.exception";
import {
  startScan,
  getScanStatus,
  getScan,
  getScanFindings,
  getScans,
  getActiveScan,
  cancelScan,
  deleteScan,
  getSecurityFindings,
  getSecuritySummary,
  updateFindingGovernanceStatus,
  getGovernanceSummary,
  getAIDetectionStats,
  exportScanAsAIBOM,
  getDependencyGraph,
  getComplianceMapping,
} from "../services/aiDetection.service";
import { IServiceContext, ScanStatus, FINDING_TYPES, VULNERABILITY_FINDING_TYPES } from "../domain.layer/interfaces/i.aiDetection";
import { calculateAndStoreRiskScore } from "../services/aiDetection/riskScoring";
import { getRiskScoringConfigQuery, upsertRiskScoringConfigQuery } from "../utils/aiDetectionRiskScoring.utils";
import { DEFAULT_DIMENSION_WEIGHTS } from "../config/riskScoringConfig";

const FILE_NAME = "aiDetection.ctrl.ts";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build service context from request
 * Note: tenantId is set to organizationId.toString() for interface compatibility.
 * Services should use organizationId directly for database queries.
 */
function buildServiceContext(req: Request): IServiceContext {
  const organizationId = req.organizationId!;
  return {
    userId: req.userId!,
    role: req.role!,
    organizationId,
    // tenantId is kept for interface compatibility, but services should use organizationId
    tenantId: organizationId.toString(),
  };
}

/**
 * Handle service exceptions and send appropriate response
 */
function handleException(res: Response, error: unknown): Response {
  if (error instanceof ValidationException) {
    return res.status(400).json(STATUS_CODE[400](error.message));
  }
  if (error instanceof NotFoundException) {
    return res.status(404).json(STATUS_CODE[404](error.message));
  }
  if (error instanceof BusinessLogicException) {
    return res.status(422).json(STATUS_CODE[422](error.message));
  }
  if (error instanceof ExternalServiceException) {
    return res.status(502).json(STATUS_CODE[502](error.message));
  }

  const errorMessage = process.env.NODE_ENV === "production"
    ? "An internal error occurred"
    : error instanceof Error ? error.message : "Unknown error";
  return res.status(500).json(STATUS_CODE[500](errorMessage));
}

// ============================================================================
// Controller Functions
// ============================================================================

/**
 * Start a new repository scan
 *
 * POST /ai-detection/scans
 * Body: { repository_url: string }
 */
export async function startScanController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Starting AI detection scan",
    functionName: "startScanController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const { repository_url, scan_mode, base_commit_sha, head_commit_sha } = req.body;

    if (!repository_url) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("repository_url is required"));
    }

    // Validate incremental scan parameters
    const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;
    if (scan_mode === "incremental") {
      if (!base_commit_sha || !head_commit_sha) {
        return res
          .status(400)
          .json(STATUS_CODE[400]("Both base_commit_sha and head_commit_sha are required for incremental scans"));
      }
      if (!SHA_PATTERN.test(base_commit_sha) || !SHA_PATTERN.test(head_commit_sha)) {
        return res
          .status(400)
          .json(STATUS_CODE[400]("base_commit_sha and head_commit_sha must be valid hex strings (7-40 characters)"));
      }
    }

    const ctx = buildServiceContext(req);
    const incrementalOptions = scan_mode === "incremental"
      ? { scan_mode: scan_mode as "incremental", base_commit_sha, head_commit_sha }
      : undefined;
    const scan = await startScan(repository_url, ctx, undefined, incrementalOptions);

    await logSuccess({
      eventType: "Create",
      description: `Started AI detection scan for ${scan.repository_owner}/${scan.repository_name}`,
      functionName: "startScanController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(201).json(STATUS_CODE[201](scan));
  } catch (error) {
    await logError({
      error: error as Error,
      eventType: "Create",
      description: "Failed to start AI detection scan",
      functionName: "startScanController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return handleException(res, error);
  }
}

/**
 * Get scan status (for polling)
 *
 * GET /ai-detection/scans/:scanId/status
 */
export async function getScanStatusController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Getting AI detection scan status",
    functionName: "getScanStatusController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const scanId = parseInt(Array.isArray(req.params.scanId) ? req.params.scanId[0] : req.params.scanId, 10);

    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid scan ID"));
    }

    const ctx = buildServiceContext(req);
    const status = await getScanStatus(scanId, ctx);

    return res.status(200).json(STATUS_CODE[200](status));
  } catch (error) {
    return handleException(res, error);
  }
}

/**
 * Get scan details with summary
 *
 * GET /ai-detection/scans/:scanId
 */
export async function getScanController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Getting AI detection scan details",
    functionName: "getScanController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const scanId = parseInt(Array.isArray(req.params.scanId) ? req.params.scanId[0] : req.params.scanId, 10);

    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid scan ID"));
    }

    const ctx = buildServiceContext(req);
    const scanResponse = await getScan(scanId, ctx);

    return res.status(200).json(STATUS_CODE[200](scanResponse));
  } catch (error) {
    return handleException(res, error);
  }
}

/**
 * Get findings for a scan
 *
 * GET /ai-detection/scans/:scanId/findings
 * Query: page, limit, confidence, finding_type
 */
export async function getScanFindingsController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Getting AI detection scan findings",
    functionName: "getScanFindingsController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const scanId = parseInt(Array.isArray(req.params.scanId) ? req.params.scanId[0] : req.params.scanId, 10);

    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid scan ID"));
    }

    const page = parseInt(Array.isArray(req.query.page) ? String(req.query.page[0]) : String(req.query.page || '1'), 10) || 1;
    const limit = Math.min(parseInt(Array.isArray(req.query.limit) ? String(req.query.limit[0]) : String(req.query.limit || '50'), 10) || 50, 100);
    const confidence = Array.isArray(req.query.confidence) ? String(req.query.confidence[0]) : (req.query.confidence ? String(req.query.confidence) : undefined);
    const findingType = Array.isArray(req.query.finding_type) ? String(req.query.finding_type[0]) : (req.query.finding_type ? String(req.query.finding_type) : undefined);

    // Validate confidence if provided
    if (confidence && !["high", "medium", "low"].includes(confidence)) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("confidence must be 'high', 'medium', or 'low'"));
    }

    // Validate finding_type if provided
    if (findingType && !(FINDING_TYPES as readonly string[]).includes(findingType)) {
      return res
        .status(400)
        .json(STATUS_CODE[400](`finding_type must be one of: ${FINDING_TYPES.join(", ")}`));
    }

    const ctx = buildServiceContext(req);
    const findings = await getScanFindings(scanId, ctx, page, limit, confidence, findingType);

    return res.status(200).json(STATUS_CODE[200](findings));
  } catch (error) {
    return handleException(res, error);
  }
}

/**
 * Get scan history list
 *
 * GET /ai-detection/scans
 * Query: page, limit, status
 */
export async function getScansController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Getting AI detection scan history",
    functionName: "getScansController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const page = parseInt(Array.isArray(req.query.page) ? String(req.query.page[0]) : String(req.query.page || '1'), 10) || 1;
    const limit = Math.min(parseInt(Array.isArray(req.query.limit) ? String(req.query.limit[0]) : String(req.query.limit || '20'), 10) || 20, 100);
    const status = Array.isArray(req.query.status) ? String(req.query.status[0]) as ScanStatus : (req.query.status ? String(req.query.status) as ScanStatus : undefined);

    // Validate status if provided
    if (
      status &&
      !["pending", "cloning", "scanning", "completed", "failed", "cancelled"].includes(
        status
      )
    ) {
      return res.status(400).json(STATUS_CODE[400]("Invalid status filter"));
    }

    const ctx = buildServiceContext(req);
    const scans = await getScans(ctx, page, limit, status);

    return res.status(200).json(STATUS_CODE[200](scans));
  } catch (error) {
    return handleException(res, error);
  }
}

/**
 * Get active scan (pending, cloning, or scanning)
 * Single efficient endpoint to check for active scans
 *
 * GET /ai-detection/scans/active
 */
export async function getActiveScanController(
  req: Request,
  res: Response
): Promise<Response> {
  // No processing log to reduce noise since this is polled frequently

  try {
    const ctx = buildServiceContext(req);
    const activeScan = await getActiveScan(ctx);

    // Return null if no active scan (not 404, as this is expected)
    return res.status(200).json(STATUS_CODE[200](activeScan));
  } catch (error) {
    // Error handling delegated to handleException
    return handleException(res, error);
  }
}

/**
 * Cancel an in-progress scan
 *
 * POST /ai-detection/scans/:scanId/cancel
 */
export async function cancelScanController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Cancelling AI detection scan",
    functionName: "cancelScanController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const scanId = parseInt(Array.isArray(req.params.scanId) ? req.params.scanId[0] : req.params.scanId, 10);

    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid scan ID"));
    }

    const ctx = buildServiceContext(req);
    const result = await cancelScan(scanId, ctx);

    await logSuccess({
      eventType: "Update",
      description: `Cancelled AI detection scan ${scanId}`,
      functionName: "cancelScanController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logError({
      error: error as Error,
      eventType: "Update",
      description: `Failed to cancel AI detection scan`,
      functionName: "cancelScanController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return handleException(res, error);
  }
}

/**
 * Delete a completed/failed/cancelled scan
 *
 * DELETE /ai-detection/scans/:scanId
 */
export async function deleteScanController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Deleting AI detection scan",
    functionName: "deleteScanController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const scanId = parseInt(Array.isArray(req.params.scanId) ? req.params.scanId[0] : req.params.scanId, 10);

    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid scan ID"));
    }

    const ctx = buildServiceContext(req);
    const result = await deleteScan(scanId, ctx);

    await logSuccess({
      eventType: "Delete",
      description: `Deleted AI detection scan ${scanId}`,
      functionName: "deleteScanController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logError({
      error: error as Error,
      eventType: "Delete",
      description: `Failed to delete AI detection scan`,
      functionName: "deleteScanController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return handleException(res, error);
  }
}

/**
 * Get security findings for a scan
 *
 * GET /ai-detection/scans/:scanId/security-findings
 * Query: page, limit, severity
 */
export async function getSecurityFindingsController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Getting AI detection security findings",
    functionName: "getSecurityFindingsController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const scanId = parseInt(Array.isArray(req.params.scanId) ? req.params.scanId[0] : req.params.scanId, 10);

    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid scan ID"));
    }

    const page = parseInt(Array.isArray(req.query.page) ? String(req.query.page[0]) : String(req.query.page || '1'), 10) || 1;
    const limit = Math.min(parseInt(Array.isArray(req.query.limit) ? String(req.query.limit[0]) : String(req.query.limit || '50'), 10) || 50, 100);
    const severity = Array.isArray(req.query.severity) ? String(req.query.severity[0]) : (req.query.severity ? String(req.query.severity) : undefined);

    // Validate severity if provided
    if (severity && !["critical", "high", "medium", "low"].includes(severity)) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("severity must be 'critical', 'high', 'medium', or 'low'"));
    }

    const ctx = buildServiceContext(req);
    const findings = await getSecurityFindings(scanId, ctx, page, limit, severity);

    return res.status(200).json(STATUS_CODE[200](findings));
  } catch (error) {
    return handleException(res, error);
  }
}

/**
 * Get security summary for a scan
 *
 * GET /ai-detection/scans/:scanId/security-summary
 */
export async function getSecuritySummaryController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Getting AI detection security summary",
    functionName: "getSecuritySummaryController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const scanId = parseInt(Array.isArray(req.params.scanId) ? req.params.scanId[0] : req.params.scanId, 10);

    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid scan ID"));
    }

    const ctx = buildServiceContext(req);
    const summary = await getSecuritySummary(scanId, ctx);

    return res.status(200).json(STATUS_CODE[200](summary));
  } catch (error) {
    return handleException(res, error);
  }
}

/**
 * Update governance status for a finding
 *
 * PATCH /ai-detection/scans/:scanId/findings/:findingId/governance
 * Body: { governance_status: "reviewed" | "approved" | "flagged" | null }
 */
export async function updateGovernanceStatusController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Updating finding governance status",
    functionName: "updateGovernanceStatusController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const scanId = parseInt(Array.isArray(req.params.scanId) ? req.params.scanId[0] : req.params.scanId, 10);
    const findingId = parseInt(Array.isArray(req.params.findingId) ? req.params.findingId[0] : req.params.findingId, 10);

    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid scan ID"));
    }

    if (isNaN(findingId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid finding ID"));
    }

    const { governance_status } = req.body;

    // Validate governance_status if provided
    if (governance_status !== null && governance_status !== undefined &&
      !["reviewed", "approved", "flagged"].includes(governance_status)) {
      return res
        .status(400)
        .json(STATUS_CODE[400]("governance_status must be 'reviewed', 'approved', 'flagged', or null"));
    }

    const ctx = buildServiceContext(req);
    const result = await updateFindingGovernanceStatus(
      scanId,
      findingId,
      governance_status ?? null,
      ctx
    );

    await logSuccess({
      eventType: "Update",
      description: `Updated governance status for finding ${findingId} to ${governance_status || 'cleared'}`,
      functionName: "updateGovernanceStatusController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logError({
      error: error as Error,
      eventType: "Update",
      description: "Failed to update finding governance status",
      functionName: "updateGovernanceStatusController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return handleException(res, error);
  }
}

/**
 * Get governance summary for a scan
 *
 * GET /ai-detection/scans/:scanId/governance-summary
 */
export async function getGovernanceSummaryController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Getting governance summary",
    functionName: "getGovernanceSummaryController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const scanId = parseInt(Array.isArray(req.params.scanId) ? req.params.scanId[0] : req.params.scanId, 10);

    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid scan ID"));
    }

    const ctx = buildServiceContext(req);
    const summary = await getGovernanceSummary(scanId, ctx);

    return res.status(200).json(STATUS_CODE[200](summary));
  } catch (error) {
    return handleException(res, error);
  }
}

/**
 * Get overall AI Detection statistics
 *
 * GET /ai-detection/stats
 */
export async function getAIDetectionStatsController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Getting AI Detection statistics",
    functionName: "getAIDetectionStatsController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const ctx = buildServiceContext(req);
    const stats = await getAIDetectionStats(ctx);

    return res.status(200).json(STATUS_CODE[200](stats));
  } catch (error) {
    return handleException(res, error);
  }
}

/**
 * Export scan results as AI Bill of Materials (AI-BOM)
 *
 * GET /ai-detection/scans/:scanId/export/ai-bom
 *
 * Returns an AI-BOM formatted JSON document containing all
 * detected AI/ML components from the scan.
 */
export async function exportAIBOMController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Exporting scan as AI-BOM",
    functionName: "exportAIBOMController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const scanId = parseInt(Array.isArray(req.params.scanId) ? req.params.scanId[0] : req.params.scanId, 10);
    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid scan ID"));
    }

    const ctx = buildServiceContext(req);
    const aibom = await exportScanAsAIBOM(scanId, ctx);

    // Set response headers for JSON download
    const filename = `ai-bom-${aibom.metadata.repository.owner}-${aibom.metadata.repository.name}-${scanId}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await logSuccess({
      eventType: "Read",
      description: `AI-BOM export for scan ${scanId}`,
      functionName: "exportAIBOMController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](aibom));
  } catch (error) {
    await logError({
      error: error as Error,
      eventType: "Read",
      description: "Failed to export AI-BOM",
      functionName: "exportAIBOMController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return handleException(res, error);
  }
}

/**
 * Get AI Dependency Graph for a scan
 *
 * GET /ai-detection/scans/:scanId/dependency-graph
 *
 * Returns graph nodes and edges for visualizing AI component relationships.
 */
export async function getDependencyGraphController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Getting AI dependency graph",
    functionName: "getDependencyGraphController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const scanId = parseInt(Array.isArray(req.params.scanId) ? req.params.scanId[0] : req.params.scanId, 10);
    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid scan ID"));
    }

    const ctx = buildServiceContext(req);
    const graph = await getDependencyGraph(scanId, ctx);

    return res.status(200).json(STATUS_CODE[200](graph));
  } catch (error) {
    return handleException(res, error);
  }
}

/**
 * Get Compliance Mapping for a scan
 *
 * GET /ai-detection/scans/:scanId/compliance
 *
 * Returns EU AI Act compliance requirements mapped to scan findings,
 * along with a generated compliance checklist.
 */
export async function getComplianceMappingController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Getting compliance mapping for scan",
    functionName: "getComplianceMappingController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const scanId = parseInt(Array.isArray(req.params.scanId) ? req.params.scanId[0] : req.params.scanId, 10);
    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid scan ID"));
    }

    const ctx = buildServiceContext(req);
    const compliance = await getComplianceMapping(scanId, ctx);

    await logSuccess({
      eventType: "Read",
      description: `Retrieved compliance mapping with ${compliance.checklist.length} checklist items`,
      functionName: "getComplianceMappingController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](compliance));
  } catch (error) {
    return handleException(res, error);
  }
}

// ============================================================================
// Risk Scoring Controllers
// ============================================================================

/**
 * Get risk score for a scan
 * @route GET /ai-detection/scans/:scanId/risk-score
 */
export async function getRiskScoreController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Getting risk score for scan",
    functionName: "getRiskScoreController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const scanId = parseInt(Array.isArray(req.params.scanId) ? req.params.scanId[0] : req.params.scanId, 10);
    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid scan ID"));
    }

    const ctx = buildServiceContext(req);
    const scan = await getScan(scanId, ctx);

    const riskScore = {
      score: scan.scan.risk_score ?? null,
      grade: scan.scan.risk_score_grade ?? null,
      details: scan.scan.risk_score_details ?? null,
      calculated_at: scan.scan.risk_score_calculated_at ?? null,
    };

    await logSuccess({
      eventType: "Read",
      description: `Retrieved risk score for scan ${scanId}`,
      functionName: "getRiskScoreController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](riskScore));
  } catch (error) {
    return handleException(res, error);
  }
}

/**
 * Recalculate risk score for a scan
 * @route POST /ai-detection/scans/:scanId/risk-score/recalculate
 */
export async function recalculateRiskScoreController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Recalculating risk score for scan",
    functionName: "recalculateRiskScoreController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const scanId = parseInt(Array.isArray(req.params.scanId) ? req.params.scanId[0] : req.params.scanId, 10);
    if (isNaN(scanId)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid scan ID"));
    }

    const ctx = buildServiceContext(req);

    // Verify scan exists and is completed
    const scan = await getScan(scanId, ctx);
    if (scan.scan.status !== "completed") {
      return res.status(422).json(STATUS_CODE[422]("Can only calculate risk score for completed scans"));
    }

    const repoName = `${scan.scan.repository_owner}/${scan.scan.repository_name}`;
    const result = await calculateAndStoreRiskScore(scanId, repoName, ctx);

    if (!result) {
      return res.status(500).json(STATUS_CODE[500]("Failed to calculate risk score"));
    }

    await logSuccess({
      eventType: "Update",
      description: `Recalculated risk score for scan ${scanId}: ${result.score} (${result.grade})`,
      functionName: "recalculateRiskScoreController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    return handleException(res, error);
  }
}

/**
 * Get risk scoring configuration
 * @route GET /ai-detection/risk-scoring/config
 */
export async function getRiskScoringConfigController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Getting risk scoring config",
    functionName: "getRiskScoringConfigController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const config = await getRiskScoringConfigQuery(req.organizationId!);

    // Return config or defaults
    const response = config || {
      id: null,
      llm_enabled: false,
      llm_key_id: null,
      dimension_weights: DEFAULT_DIMENSION_WEIGHTS,
      vulnerability_scan_enabled: false,
      vulnerability_types_enabled: {
        prompt_injection: true,
        pii_exposure: true,
        excessive_agency: true,
        jailbreak_risk: true,
        training_data_poisoning: true,
        model_dos: true,
        supply_chain: true,
        insecure_plugin: true,
        overreliance: true,
        model_theft: true,
      },
      updated_by: null,
      updated_at: null,
    };

    await logSuccess({
      eventType: "Read",
      description: "Retrieved risk scoring config",
      functionName: "getRiskScoringConfigController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](response));
  } catch (error) {
    return handleException(res, error);
  }
}

/**
 * Update risk scoring configuration
 * @route PATCH /ai-detection/risk-scoring/config
 */
export async function updateRiskScoringConfigController(
  req: Request,
  res: Response
): Promise<Response> {
  logProcessing({
    description: "Updating risk scoring config",
    functionName: "updateRiskScoringConfigController",
    fileName: FILE_NAME,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const ctx = buildServiceContext(req);
    const { llm_enabled, llm_key_id, dimension_weights, vulnerability_scan_enabled, vulnerability_types_enabled } = req.body;

    // Validate dimension weights if provided
    if (dimension_weights) {
      const requiredKeys = [
        "data_sovereignty", "transparency", "security",
        "autonomy", "supply_chain"
      ];
      const providedKeys = Object.keys(dimension_weights);
      const extraKeys = providedKeys.filter((k) => !requiredKeys.includes(k));
      if (extraKeys.length > 0) {
        return res.status(400).json(STATUS_CODE[400](`Unknown dimension keys: ${extraKeys.join(", ")}`));
      }
      for (const key of requiredKeys) {
        if (typeof dimension_weights[key] !== "number" || dimension_weights[key] < 0 || dimension_weights[key] > 1) {
          return res.status(400).json(STATUS_CODE[400](`Invalid weight for ${key}: must be a number between 0 and 1`));
        }
      }
      const total = requiredKeys.reduce((sum: number, k: string) => sum + dimension_weights[k], 0);
      if (Math.abs(total - 1.0) > 0.01) {
        return res.status(400).json(STATUS_CODE[400](`Dimension weights must sum to 1.0, got ${total.toFixed(2)}`));
      }
    }

    // Validate vulnerability_scan_enabled requires llm_enabled
    // Check persisted config when llm_enabled is not in the request body
    let effectiveVulnScan: boolean | undefined = undefined;
    if (vulnerability_scan_enabled !== undefined) {
      let effectiveLlmEnabled = llm_enabled;
      if (effectiveLlmEnabled === undefined) {
        const existingConfig = await getRiskScoringConfigQuery(req.organizationId!);
        effectiveLlmEnabled = existingConfig?.llm_enabled ?? false;
      }
      effectiveVulnScan = vulnerability_scan_enabled && effectiveLlmEnabled;
    }

    // Validate vulnerability_types_enabled if provided
    if (vulnerability_types_enabled !== undefined) {
      const providedKeys = Object.keys(vulnerability_types_enabled);
      const invalidKeys = providedKeys.filter((k) => !(VULNERABILITY_FINDING_TYPES as readonly string[]).includes(k));
      if (invalidKeys.length > 0) {
        return res.status(400).json(STATUS_CODE[400](`Unknown vulnerability types: ${invalidKeys.join(", ")}`));
      }
      for (const key of providedKeys) {
        if (typeof vulnerability_types_enabled[key] !== "boolean") {
          return res.status(400).json(STATUS_CODE[400](`vulnerability_types_enabled.${key} must be a boolean`));
        }
      }
    }

    const updated = await upsertRiskScoringConfigQuery(req.organizationId!, {
      llm_enabled,
      llm_key_id,
      dimension_weights,
      vulnerability_scan_enabled: effectiveVulnScan,
      vulnerability_types_enabled,
      updated_by: ctx.userId,
    });

    await logSuccess({
      eventType: "Update",
      description: "Updated risk scoring config",
      functionName: "updateRiskScoringConfigController",
      fileName: FILE_NAME,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    return handleException(res, error);
  }
}
