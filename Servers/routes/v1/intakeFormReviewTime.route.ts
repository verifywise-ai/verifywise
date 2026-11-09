import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import {
  getIntakeFormReviewTime,
  updateIntakeFormReviewTime,
} from "../../controllers/intakeFormReviewTime.ctrl";

// An intake form's agreed review time in business days (#5189). Reading
// matches GET /api/intake/forms/:id; changing it needs the same permission as
// editing the form.
router.get("/:formId", authenticateJWT, getIntakeFormReviewTime);
router.put("/:formId", authenticateJWT, authorize("intakeForm.edit"), updateIntakeFormReviewTime);

export default router;
