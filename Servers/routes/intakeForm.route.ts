import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { generalApiLimiter } from "../middleware/rateLimit.middleware";
import {
  // Intake form controllers (admin)
  getAllIntakeForms,
  getIntakeFormById,
  createIntakeForm,
  updateIntakeForm,
  deleteIntakeForm,
  archiveIntakeForm,
  previewForm,
  // Submission controllers (admin)
  getPendingSubmissions,
  getFormSubmissions,
  getSubmissionById,
  getSubmissionStats,
  approveSubmission,
  rejectSubmission,
  getSubmissionPreview,
  overrideSubmissionRisk,
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

const WRITE_ROLES = ["Admin", "Editor"];

// Intake Forms — Admin & Editor for write operations
router.get("/forms", authenticateJWT, getAllIntakeForms);
router.get("/forms/:id", authenticateJWT, getIntakeFormById);
router.post("/forms", authenticateJWT, authorize(WRITE_ROLES), createIntakeForm);
router.patch("/forms/:id", authenticateJWT, authorize(WRITE_ROLES), updateIntakeForm);
router.delete("/forms/:id", authenticateJWT, authorize(WRITE_ROLES), deleteIntakeForm);
router.post("/forms/:id/archive", authenticateJWT, authorize(WRITE_ROLES), archiveIntakeForm);
router.get("/forms/:id/preview", authenticateJWT, previewForm);

// LLM features — Admin & Editor
router.post("/forms/suggested-questions", authenticateJWT, authorize(WRITE_ROLES), getLLMSuggestedQuestions);
router.post("/forms/field-guidance", authenticateJWT, authorize(WRITE_ROLES), getFieldGuidance);

// Submissions
router.get("/submissions", authenticateJWT, getPendingSubmissions);
router.get("/submissions/stats", authenticateJWT, getSubmissionStats);
router.get("/submissions/by-entity/:entityType/:entityId", authenticateJWT, getSubmissionByEntity);
router.get("/submissions/:id", authenticateJWT, getSubmissionById);
router.get("/submissions/:id/preview", authenticateJWT, getSubmissionPreview);
router.patch("/submissions/:id/risk-override", authenticateJWT, authorize(WRITE_ROLES), overrideSubmissionRisk);
router.get("/forms/:id/submissions", authenticateJWT, getFormSubmissions);
router.post("/submissions/:id/approve", authenticateJWT, authorize(WRITE_ROLES), approveSubmission);
router.post("/submissions/:id/reject", authenticateJWT, authorize(WRITE_ROLES), rejectSubmission);

// ============================================================================
// PUBLIC ROUTES (Unauthenticated, rate-limited)
// ============================================================================

// Get CAPTCHA question
router.get("/public/captcha", generalApiLimiter, getCaptcha);

// New URL format: /{publicId}/use-case-form-intake
router.get("/public/by-id/:publicId", generalApiLimiter, getPublicFormByPublicId);
router.post("/public/by-id/:publicId", generalApiLimiter, submitPublicFormByPublicId);

// Legacy URL format: /{tenantSlug}/{formSlug}
router.get("/public/:tenantSlug/:formSlug", generalApiLimiter, getPublicForm);
router.post("/public/:tenantSlug/:formSlug", generalApiLimiter, submitPublicForm);

export default router;
