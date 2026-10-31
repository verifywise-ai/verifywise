import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import {
  generalApiLimiter,
  intakeLiveChecksVisitorLimiter,
} from "../../middleware/rateLimit.middleware";
import { resolvePublicIntakeForm } from "../../middleware/intakePublicForm.middleware";
import {
  getSubmissionTierSuggestionResponse,
  postPublicTierExplanation,
  postPublicTierSuggestion,
  takeTierSuggestionResponse,
} from "../../controllers/intakeTierSuggestion.ctrl";
import { submitPublicForm, submitPublicFormByPublicId } from "../../controllers/intakeForm.ctrl";

// Risk tier suggested to an applicant before they submit (#5190). The form is
// resolved before the visitor limiter so it keys on the form, not the URL,
// and the by-id routes come first: the slug routes would also match them.
const publicGuards = [generalApiLimiter, resolvePublicIntakeForm, intakeLiveChecksVisitorLimiter];

router.post("/public/by-id/:publicId", ...publicGuards, postPublicTierSuggestion);
router.post("/public/by-id/:publicId/explain", ...publicGuards, postPublicTierExplanation);
// Submit with the applicant's response to the suggestion: the legacy submit
// handler with one more body field (ADR 0001: a changed contract goes to v1).
router.post(
  "/public/by-id/:publicId/submit",
  generalApiLimiter,
  takeTierSuggestionResponse,
  submitPublicFormByPublicId,
);
router.post("/public/:tenantSlug/:formSlug", ...publicGuards, postPublicTierSuggestion);
router.post("/public/:tenantSlug/:formSlug/explain", ...publicGuards, postPublicTierExplanation);
router.post(
  "/public/:tenantSlug/:formSlug/submit",
  generalApiLimiter,
  takeTierSuggestionResponse,
  submitPublicForm,
);

// Reviewers: what the applicant said about the suggestion (same access as the submission preview).
router.get("/submissions/:id", authenticateJWT, getSubmissionTierSuggestionResponse);

export default router;
