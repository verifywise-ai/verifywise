/**
 * @fileoverview AI Detection Routes
 *
 * Express router for AI Detection endpoints.
 * All routes require authentication and role-based authorization.
 *
 * Authorization Model:
 * - Start scan: Admin, Editor
 * - View scans/findings: Admin, Editor, Reviewer, Auditor
 * - Cancel scan: Admin, Editor (ownership check in service layer)
 * - Delete scan: Admin only
 *
 * @module routes/aiDetection
 */

import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { aiDetectionScanLimiter } from "../middleware/rateLimit.middleware";
import {
  startScanController,
  getScanStatusController,
  getScanController,
  getScanFindingsController,
  getScansController,
  getActiveScanController,
  cancelScanController,
  deleteScanController,
  getSecurityFindingsController,
  getSecuritySummaryController,
  updateGovernanceStatusController,
  getGovernanceSummaryController,
  getAIDetectionStatsController,
  exportAIBOMController,
  getDependencyGraphController,
  getComplianceMappingController,
  getRiskScoreController,
  recalculateRiskScoreController,
  getRiskScoringConfigController,
  updateRiskScoringConfigController,
} from "../controllers/aiDetection.ctrl";
import {
  createSuppressionController,
  listSuppressionsController,
  deleteSuppressionController,
} from "../controllers/aiDetectionSuppression.ctrl";

const router = express.Router();

// Role groups for authorization
const ALL_ROLES = ["Admin", "Editor", "Reviewer", "Auditor"];
const WRITE_ROLES = ["Admin", "Editor"];
const ADMIN_ONLY = ["Admin"];

/**
 * @route   POST /ai-detection/scans
 * @desc    Start a new repository scan
 * @access  Private - Admin, Editor
 * @body    { repository_url: string }
 * @rateLimit 30 requests per 15 minutes per IP
 */
router.post(
  "/scans",
  aiDetectionScanLimiter,
  authenticateJWT,
  authorize(WRITE_ROLES),
  startScanController,
);

/**
 * @route   GET /ai-detection/scans
 * @desc    Get scan history list
 * @access  Private - All roles
 * @query   page, limit, status
 */
router.get("/scans", authenticateJWT, authorize(ALL_ROLES), getScansController);

/**
 * @route   GET /ai-detection/scans/active
 * @desc    Get the most recent active scan (pending, cloning, or scanning)
 * @access  Private - All roles
 * @note    Efficient single-query endpoint for polling
 */
router.get("/scans/active", authenticateJWT, authorize(ALL_ROLES), getActiveScanController);

/**
 * @route   GET /ai-detection/scans/:scanId
 * @desc    Get scan details with summary
 * @access  Private - All roles
 */
router.get("/scans/:scanId", authenticateJWT, authorize(ALL_ROLES), getScanController);

/**
 * @route   GET /ai-detection/scans/:scanId/status
 * @desc    Get scan status for polling
 * @access  Private - All roles
 */
router.get("/scans/:scanId/status", authenticateJWT, authorize(ALL_ROLES), getScanStatusController);

/**
 * @route   GET /ai-detection/scans/:scanId/findings
 * @desc    Get findings for a scan
 * @access  Private - All roles
 * @query   page, limit, confidence
 */
router.get(
  "/scans/:scanId/findings",
  authenticateJWT,
  authorize(ALL_ROLES),
  getScanFindingsController,
);

/**
 * @route   GET /ai-detection/scans/:scanId/security-findings
 * @desc    Get security findings for a scan
 * @access  Private - All roles
 * @query   page, limit, severity
 */
router.get(
  "/scans/:scanId/security-findings",
  authenticateJWT,
  authorize(ALL_ROLES),
  getSecurityFindingsController,
);

/**
 * @route   GET /ai-detection/scans/:scanId/security-summary
 * @desc    Get security summary for a scan
 * @access  Private - All roles
 */
router.get(
  "/scans/:scanId/security-summary",
  authenticateJWT,
  authorize(ALL_ROLES),
  getSecuritySummaryController,
);

/**
 * @route   POST /ai-detection/scans/:scanId/cancel
 * @desc    Cancel an in-progress scan
 * @access  Private - Admin, Editor (ownership check in service layer)
 */
router.post("/scans/:scanId/cancel", authenticateJWT, authorize(WRITE_ROLES), cancelScanController);

/**
 * @route   DELETE /ai-detection/scans/:scanId
 * @desc    Delete a completed/failed/cancelled scan
 * @access  Private - Admin only
 */
router.delete("/scans/:scanId", authenticateJWT, authorize(ADMIN_ONLY), deleteScanController);

/**
 * @route   PATCH /ai-detection/scans/:scanId/findings/:findingId/governance
 * @desc    Update governance status for a finding
 * @access  Private - Admin, Editor
 * @body    { governance_status: "reviewed" | "approved" | "flagged" | null }
 */
router.patch(
  "/scans/:scanId/findings/:findingId/governance",
  authenticateJWT,
  authorize(WRITE_ROLES),
  updateGovernanceStatusController,
);

/**
 * @route   GET /ai-detection/scans/:scanId/governance-summary
 * @desc    Get governance summary for a scan
 * @access  Private - All roles
 */
router.get(
  "/scans/:scanId/governance-summary",
  authenticateJWT,
  authorize(ALL_ROLES),
  getGovernanceSummaryController,
);

/**
 * @route   GET /ai-detection/stats
 * @desc    Get overall AI Detection statistics
 * @access  Private - All roles
 */
router.get("/stats", authenticateJWT, authorize(ALL_ROLES), getAIDetectionStatsController);

/**
 * @route   GET /ai-detection/scans/:scanId/export/ai-bom
 * @desc    Export scan results as AI Bill of Materials (AI-BOM)
 * @access  Private - All roles
 * @returns JSON file with AI-BOM format
 */
router.get(
  "/scans/:scanId/export/ai-bom",
  authenticateJWT,
  authorize(ALL_ROLES),
  exportAIBOMController,
);

/**
 * @route   GET /ai-detection/scans/:scanId/dependency-graph
 * @desc    Get dependency graph data for visualization
 * @access  Private - All roles
 * @returns { nodes: DependencyGraphNode[], edges: DependencyGraphEdge[], metadata: {...} }
 */
router.get(
  "/scans/:scanId/dependency-graph",
  authenticateJWT,
  authorize(ALL_ROLES),
  getDependencyGraphController,
);

/**
 * @route   GET /ai-detection/scans/:scanId/compliance
 * @desc    Get EU AI Act compliance mapping for scan findings
 * @access  Private - All roles
 * @returns { mappings: [...], checklist: [...], summary: {...} }
 */
router.get(
  "/scans/:scanId/compliance",
  authenticateJWT,
  authorize(ALL_ROLES),
  getComplianceMappingController,
);

/**
 * @route   GET /ai-detection/scans/:scanId/risk-score
 * @desc    Get risk score with dimension breakdown for a scan
 * @access  Private - All roles
 */
router.get(
  "/scans/:scanId/risk-score",
  authenticateJWT,
  authorize(ALL_ROLES),
  getRiskScoreController,
);

/**
 * @route   POST /ai-detection/scans/:scanId/risk-score/recalculate
 * @desc    Recalculate risk score for a completed scan
 * @access  Private - Admin, Editor
 */
router.post(
  "/scans/:scanId/risk-score/recalculate",
  authenticateJWT,
  authorize(WRITE_ROLES),
  recalculateRiskScoreController,
);

/**
 * @route   GET /ai-detection/risk-scoring/config
 * @desc    Get risk scoring configuration (weights, LLM settings)
 * @access  Private - All roles
 */
router.get(
  "/risk-scoring/config",
  authenticateJWT,
  authorize(ALL_ROLES),
  getRiskScoringConfigController,
);

/**
 * @route   PATCH /ai-detection/risk-scoring/config
 * @desc    Update risk scoring configuration
 * @access  Private - Admin only
 */
router.patch(
  "/risk-scoring/config",
  authenticateJWT,
  authorize(ADMIN_ONLY),
  updateRiskScoringConfigController,
);

/**
 * @route   POST /ai-detection/suppressions
 * @desc    Create a finding suppression rule
 * @access  Private - Admin, Editor
 * @body    { match_type, field, value, reason?, expires_at? }
 */
router.post("/suppressions", authenticateJWT, authorize(WRITE_ROLES), createSuppressionController);

/**
 * @route   GET /ai-detection/suppressions
 * @desc    List finding suppression rules for the organization
 * @access  Private - All roles
 * @query   include_expired
 */
router.get("/suppressions", authenticateJWT, authorize(ALL_ROLES), listSuppressionsController);

/**
 * @route   DELETE /ai-detection/suppressions/:id
 * @desc    Delete a finding suppression rule
 * @access  Private - Admin, Editor
 */
router.delete(
  "/suppressions/:id",
  authenticateJWT,
  authorize(WRITE_ROLES),
  deleteSuppressionController,
);

export default router;
