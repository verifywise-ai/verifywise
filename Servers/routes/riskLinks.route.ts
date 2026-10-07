import express from "express";
const router = express.Router();

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  acknowledgeParentLevelChange,
  createRiskLink,
  getControlCoverage,
  getDismissalAnalytics,
  getDuplicateCandidates,
  getRiskGraph,
  getRiskLinks,
  getSharedProjects,
  getVendorDuplicateCandidates,
  getVendorExposure,
  getVendorFrameworkCoverage,
  getVendorRiskLinks,
  getVendorRiskSharedProjects,
  recomputeAllRiskLinks,
  recomputeAllVendorRiskLinks,
  suggestRiskHierarchy,
  suggestVendorRiskHierarchy,
  updateRiskLinkStatus,
} from "../controllers/riskLinks.ctrl";

// Declared before GET /:riskId is irrelevant (different verb), but kept first
// so the backfill route is the obvious one in this file.
router.post(
  "/recompute",
  authenticateJWT,
  authorize("riskLinks.admin"),
  recomputeAllRiskLinks,
);
router.post(
  "/suggest-hierarchy",
  authenticateJWT,
  authorize("riskLinks.admin"),
  suggestRiskHierarchy,
);

router.post("/", authenticateJWT, authorize("risks.edit"), createRiskLink);
// Org-wide graph + dismissal analytics expose every link and raw dismiss notes;
// admin-only, matching the write/fan-out routes above.
router.get("/", authenticateJWT, authorize("riskLinks.admin"), getRiskGraph);
router.get(
  "/dismissals",
  authenticateJWT,
  authorize("riskLinks.admin"),
  getDismissalAnalytics,
);
// Declared before /:riskId: the param route would swallow /duplicates as a
// risk id. Org-wide report like the graph and dismissals above: admin-only.
router.get(
  "/duplicates",
  authenticateJWT,
  authorize("riskLinks.admin"),
  getDuplicateCandidates,
);
// Same param-route trap as /duplicates: /coverage must sit above /:riskId.
router.get("/coverage", authenticateJWT, authorize("riskLinks.admin"), getControlCoverage);
// Vendor risk insights. Single segments, so they must sit above /:riskId like
// /duplicates and /coverage. Any authenticated user: they show nothing that
// GET /api/vendorRisks/all does not.
router.get("/vendor-exposure", authenticateJWT, getVendorExposure);
router.get("/vendor-duplicates", authenticateJWT, getVendorDuplicateCandidates);
router.get("/vendor-coverage", authenticateJWT, getVendorFrameworkCoverage);
// A vendor risk's children. Two segments, so /:riskId cannot match it, but kept
// above the param routes with the other literal prefixes. Readable by any
// authenticated user, like GET /:riskId and GET /api/vendorRisks/:id.
router.get("/vendor-risks/:vendorRiskId", authenticateJWT, getVendorRiskLinks);
router.get(
  "/vendor-risks/:vendorRiskId/shared-projects",
  authenticateJWT,
  getVendorRiskSharedProjects,
);
// Backfill of related vendor risks, admin-only like /recompute. Two literal
// segments, so neither /vendor-risks/:vendorRiskId (GET) nor /:id matches it.
router.post(
  "/vendor-risks/recompute",
  authenticateJWT,
  authorize("riskLinks.admin"),
  recomputeAllVendorRiskLinks,
);
// The hierarchy pass scoped to one vendor risk. Admin-only like the org-wide
// pass: it spends the org's LLM key.
router.post(
  "/vendor-risks/:vendorRiskId/suggest-hierarchy",
  authenticateJWT,
  authorize("riskLinks.admin"),
  suggestVendorRiskHierarchy,
);
router.get("/:riskId", authenticateJWT, getRiskLinks);
router.get("/:riskId/shared-projects", authenticateJWT, getSharedProjects);
// Role matrix: Admin full, Editor write, Reviewer approve (status), Auditor
// read-only. Create and ack are writes (Admin/Editor); status transitions are
// approvals (Admin/Editor/Reviewer).
router.patch(
  "/:id",
  authenticateJWT,
  authorize("riskLinks.status"),
  updateRiskLinkStatus,
);
// Clearing a stale-inheritance warning the user has reviewed. Idempotent.
router.post(
  "/:id/acknowledge-parent-change",
  authenticateJWT,
  authorize("risks.edit"),
  acknowledgeParentLevelChange,
);

export default router;
