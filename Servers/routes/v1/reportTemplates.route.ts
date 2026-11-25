/**
 * Report template endpoints under /api/v1. Thin: they reuse the controllers
 * and RBAC of the frozen /api/reporting/templates router. The v1 contract adds
 * parameters_config (the report kind and its declared fields) on create and
 * update, reportParameters on run, and a server-side duplicate; the legacy
 * router drops those fields (see legacyReportingContract.middleware.ts).
 */
import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
// accessControl.middleware exports authorize as its DEFAULT export.
import authorize from "../../middleware/accessControl.middleware";
import {
  createTemplate,
  duplicateTemplate,
  runTemplateNow,
  updateTemplate,
} from "../../controllers/reportTemplate.ctrl";
import { getLastParameters } from "../../controllers/reportParameters.ctrl";

const router = express.Router();

router.post("/", authenticateJWT, authorize("reportTemplate.edit"), createTemplate);
router.patch("/:id", authenticateJWT, authorize("reportTemplate.edit"), updateTemplate);

// Copy a system or own template, with its latest version's config and report
// kind, into the caller's organization.
router.post("/:id/duplicate", authenticateJWT, authorize("reportTemplate.edit"), duplicateTemplate);

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
