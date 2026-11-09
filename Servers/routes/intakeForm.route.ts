import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  generalApiLimiter,
  intakeLiveChecksVisitorLimiter,
  intakePrefillVisitorLimiter,
} from "../middleware/rateLimit.middleware";
import { resolvePublicIntakeForm } from "../middleware/intakePublicForm.middleware";
import {
  postPublicLiveChecks,
  postPublicPrefill,
  receivePrefillUpload,
  requirePrefillAvailable,
} from "../controllers/intakeLiveChecks.ctrl";
import {
  // Intake form controllers (admin)
  getAllIntakeForms,
  getIntakeFormById,
  createIntakeForm,
  updateIntakeForm,
  deleteIntakeForm,
  archiveIntakeForm,
  previewForm,
  getEligibleReviewers,
  // Submission controllers (admin)
  getPendingSubmissions,
  getFormSubmissions,
  getSubmissionById,
  getSubmissionStats,
  getIntakeOversight,
  approveSubmission,
  rejectSubmission,
  escalateSubmission,
  recordSecondReview,
  resolveSecondReviewMiss,
  getSubmissionPreview,
  overrideSubmissionRisk,
  retrySubmissionAssessment,
  updateSuggestedRisk,
  acceptAllSuggestedRisks,
  getSubmissionByEntity,
  // LLM feature controllers (admin)
  getLLMSuggestedQuestions,
  getFieldGuidance,
  // Public controllers (unauthenticated)
  getPublicForm,
  submitPublicForm,
  getPublicFormByPublicId,
  submitPublicFormByPublicId,
  getCaptcha,
} from "../controllers/intakeForm.ctrl";

// ============================================================================
// ADMIN / EDITOR ROUTES (Authenticated)
// ============================================================================

// Intake Forms — Admin & Editor for write operations
router.get("/forms", authenticateJWT, getAllIntakeForms);
router.get("/forms/:id", authenticateJWT, getIntakeFormById);
router.post("/forms", authenticateJWT, authorize("intakeForm.edit"), createIntakeForm);
router.patch("/forms/:id", authenticateJWT, authorize("intakeForm.edit"), updateIntakeForm);
router.delete("/forms/:id", authenticateJWT, authorize("intakeForm.edit"), deleteIntakeForm);
router.post("/forms/:id/archive", authenticateJWT, authorize("intakeForm.edit"), archiveIntakeForm);
router.get("/forms/:id/preview", authenticateJWT, previewForm);

// Routing settings — reviewers a form can route to
router.get(
  "/routing/eligible-reviewers",
  authenticateJWT,
  authorize("intakeForm.edit"),
  getEligibleReviewers,
);

// LLM features — Admin & Editor
router.post(
  "/forms/suggested-questions",
  authenticateJWT,
  authorize("intakeForm.edit"),
  getLLMSuggestedQuestions,
);
router.post(
  "/forms/field-guidance",
  authenticateJWT,
  authorize("intakeForm.edit"),
  getFieldGuidance,
);

// Submissions
router.get("/oversight", authenticateJWT, authorize("intakeForm.edit"), getIntakeOversight);
router.get("/submissions", authenticateJWT, getPendingSubmissions);
router.get("/submissions/stats", authenticateJWT, getSubmissionStats);
router.get("/submissions/by-entity/:entityType/:entityId", authenticateJWT, getSubmissionByEntity);
router.get("/submissions/:id", authenticateJWT, getSubmissionById);
router.get("/submissions/:id/preview", authenticateJWT, getSubmissionPreview);
router.patch(
  "/submissions/:id/risk-override",
  authenticateJWT,
  authorize("intakeForm.edit"),
  overrideSubmissionRisk,
);
router.post(
  "/submissions/:id/assessment/retry",
  authenticateJWT,
  authorize("intakeForm.edit"),
  retrySubmissionAssessment,
);
// accept-all is registered before :suggestionId so it is not read as an id
router.post(
  "/submissions/:id/suggested-risks/accept-all",
  authenticateJWT,
  authorize("intakeForm.edit"),
  acceptAllSuggestedRisks,
);
router.patch(
  "/submissions/:id/suggested-risks/:suggestionId",
  authenticateJWT,
  authorize("intakeForm.edit"),
  updateSuggestedRisk,
);
router.get("/forms/:id/submissions", authenticateJWT, getFormSubmissions);
router.post(
  "/submissions/:id/approve",
  authenticateJWT,
  authorize("intakeForm.edit"),
  approveSubmission,
);
router.post(
  "/submissions/:id/reject",
  authenticateJWT,
  authorize("intakeForm.edit"),
  rejectSubmission,
);
router.post(
  "/submissions/:id/escalate",
  authenticateJWT,
  authorize("intakeForm.edit"),
  escalateSubmission,
);
router.post(
  "/submissions/:id/second-review",
  authenticateJWT,
  authorize("intakeForm.edit"),
  recordSecondReview,
);
router.post(
  "/submissions/:id/second-review/resolve",
  authenticateJWT,
  authorize("intakeForm.edit"),
  resolveSecondReviewMiss,
);

// ============================================================================
// PUBLIC ROUTES (Unauthenticated, rate-limited)
// ============================================================================

// Get CAPTCHA question
router.get("/public/captcha", generalApiLimiter, getCaptcha);

// Live checks and vendor-document prefill. The by-id routes come first:
// "/public/:tenantSlug/:formSlug/live-checks" would also match
// "/public/by-id/X/live-checks". The form is resolved before the visitor
// limiters so they key on the form id, not the URL. The handler stays the
// last named argument so generate:swagger can name the operation.
const liveCheckGuards = [
  generalApiLimiter,
  resolvePublicIntakeForm,
  intakeLiveChecksVisitorLimiter,
];
const prefillGuards = [
  generalApiLimiter,
  resolvePublicIntakeForm,
  intakePrefillVisitorLimiter,
  requirePrefillAvailable,
  receivePrefillUpload,
];
router.post("/public/by-id/:publicId/live-checks", ...liveCheckGuards, postPublicLiveChecks);
router.post("/public/by-id/:publicId/prefill", ...prefillGuards, postPublicPrefill);
router.post("/public/:tenantSlug/:formSlug/live-checks", ...liveCheckGuards, postPublicLiveChecks);
router.post("/public/:tenantSlug/:formSlug/prefill", ...prefillGuards, postPublicPrefill);

// New URL format: /{publicId}/use-case-form-intake
router.get("/public/by-id/:publicId", generalApiLimiter, getPublicFormByPublicId);
router.post("/public/by-id/:publicId", generalApiLimiter, submitPublicFormByPublicId);

// Legacy URL format: /{tenantSlug}/{formSlug}
router.get("/public/:tenantSlug/:formSlug", generalApiLimiter, getPublicForm);
router.post("/public/:tenantSlug/:formSlug", generalApiLimiter, submitPublicForm);

export default router;
