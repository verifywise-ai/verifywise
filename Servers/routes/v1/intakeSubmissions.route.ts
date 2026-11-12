import express from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { approveSubmissionV1, getSubmissionPreviewV1 } from "../../controllers/intakeForm.ctrl";

// Intake submission review with custom field values (#5262). Same middleware
// as the legacy /api/intake/submissions/:id/preview and .../approve, whose
// responses keep their old shape.
router.get("/:id/preview", authenticateJWT, getSubmissionPreviewV1);
router.post("/:id/approve", authenticateJWT, authorize("intakeForm.edit"), approveSubmissionV1);

export default router;
