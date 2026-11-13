/**
 * AI Detection suggested risk actions (v1).
 *
 * What a user did with the LLM-suggested risks of a scan: added to the risk
 * register (with the created risk's id) or ignored (with a reason). Mounted
 * at /api/v1/ai-detection; the legacy /api/ai-detection router is frozen.
 */
import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import {
  deleteSuggestedRiskActionController,
  listSuggestedRiskActionsController,
  recordSuggestedRiskActionController,
} from "../../controllers/aiDetectionSuggestedRisks.ctrl";

const router = express.Router();

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
 * @route   PUT /scans/:scanId/suggested-risks/actions
 * @desc    Record that a suggested risk was added to the risk register or ignored
 * @access  Private - Admin, Editor
 * @body    { risk_name: string, action: "added", risk_id: number } | { risk_name: string, action: "ignored", reason: "already_added" | "not_real_risk" }
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
