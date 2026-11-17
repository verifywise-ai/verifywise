/**
 * AI Detection (v1).
 *
 * Finding reviews and what was done with the LLM-suggested risks of a scan.
 * Mounted at /api/v1/ai-detection; the legacy /api/ai-detection router is
 * frozen and keeps its response shapes.
 */
import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { validateCreateRisk } from "../../middleware/validators/risks.validator";
import {
  getScanFindingsV1Controller,
  updateGovernanceStatusV1Controller,
} from "../../controllers/aiDetection.ctrl";
import {
  addSuggestedRiskToRegisterController,
  deleteSuggestedRiskActionController,
  listSuggestedRiskActionsController,
  recordSuggestedRiskActionController,
} from "../../controllers/aiDetectionSuggestedRisks.ctrl";

const router = express.Router();

/**
 * @route   GET /scans/:scanId/findings
 * @desc    Get findings for a scan, with who set each governance status and whether the scan is the repository's latest completed scan
 * @access  Private - All roles
 * @query   page, limit, confidence, finding_type
 */
router.get(
  "/scans/:scanId/findings",
  authenticateJWT,
  authorize("aiDetection.read"),
  getScanFindingsV1Controller,
);

/**
 * @route   PATCH /scans/:scanId/findings/:findingId/governance
 * @desc    Update governance status for a finding. On the repository's latest completed scan the status is also stored for later scans (decision_scope "repository"); on an older scan only that scan's finding changes (decision_scope "scan").
 * @access  Private - Admin, Editor
 * @body    { governance_status: "reviewed" | "approved" | "flagged" | "suppressed" | "accepted_risk" | null }
 */
router.patch(
  "/scans/:scanId/findings/:findingId/governance",
  authenticateJWT,
  authorize("aiDetection.edit"),
  updateGovernanceStatusV1Controller,
);

/**
 * @route   GET /scans/:scanId/suggested-risks/actions
 * @desc    List what was done with the scan's suggested risks (added to the risk register or ignored)
 * @access  Private - All roles
 */
router.get(
  "/scans/:scanId/suggested-risks/actions",
  authenticateJWT,
  authorize("aiDetection.read"),
  listSuggestedRiskActionsController,
);

/**
 * @route   POST /scans/:scanId/suggested-risks/risks
 * @desc    Create a risk from a suggested risk and link it to the suggestion, in one step. 409 with risk_id when the suggestion is already in the risk register.
 * @access  Private - Admin, Editor
 * @body    The risk, as for POST /projectRisks, plus suggestion_name: string
 */
router.post(
  "/scans/:scanId/suggested-risks/risks",
  authenticateJWT,
  authorize("aiDetection.edit"),
  authorize("risks.edit"),
  validateCreateRisk,
  addSuggestedRiskToRegisterController,
);

/**
 * @route   PUT /scans/:scanId/suggested-risks/actions
 * @desc    Record that a suggested risk was ignored, with the reason
 * @access  Private - Admin, Editor
 * @body    { risk_name: string, action: "ignored", reason: "already_added" | "not_real_risk" }
 */
router.put(
  "/scans/:scanId/suggested-risks/actions",
  authenticateJWT,
  authorize("aiDetection.edit"),
  recordSuggestedRiskActionController,
);

/**
 * @route   DELETE /scans/:scanId/suggested-risks/actions/:actionId
 * @desc    Restore an ignored suggested risk
 * @access  Private - Admin, Editor
 */
router.delete(
  "/scans/:scanId/suggested-risks/actions/:actionId",
  authenticateJWT,
  authorize("aiDetection.edit"),
  deleteSuggestedRiskActionController,
);

export default router;
