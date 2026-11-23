/**
 * Report template endpoints under /api/v1. Thin: they reuse the controllers
 * and RBAC of the frozen /api/reporting/templates router.
 */
import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
// accessControl.middleware exports authorize as its DEFAULT export.
import authorize from "../../middleware/accessControl.middleware";
import { runTemplateNow } from "../../controllers/reportTemplate.ctrl";
import { getLastParameters } from "../../controllers/reportParameters.ctrl";

const router = express.Router();

// Run a template now, with report parameters for kinds that take them.
router.post("/:id/run", authenticateJWT, authorize("reportTemplate.edit"), runTemplateNow);

// Prefill for the run wizard: answers from the org's latest successful run.
router.get(
  "/:id/last-parameters",
  authenticateJWT,
  authorize("reportTemplate.edit"),
  getLastParameters,
);

export default router;
