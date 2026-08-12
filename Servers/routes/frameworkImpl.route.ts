import express from "express";
const router = express.Router();

import { validateId } from "../domain.layer/validations/id.valid";
import { createMemoryUpload } from "../utils/upload.utils";
import authenticateJWT from "../middleware/auth.middleware";
import {
  getFrameworkDashboard,
  getFrameworkTree,
  getImplById,
  getImplRisks,
  updateImpl,
} from "../controllers/frameworkImpl.ctrl";

// Bounded upload config: 30MB/file, 10 files, MIME allowlist.
const upload = createMemoryUpload();

/**
 * Generic impl endpoints for the 21 migrated frameworks. Mounted at
 * /api/frameworks in app.ts. Table + column names come from
 * Servers/structures/ via the dispatch inside frameworkImpl.utils.ts.
 */

// GET /api/frameworks/:frameworkId/tree/:projectId
router.get(
  "/:frameworkId/tree/:projectId",
  authenticateJWT,
  validateId("frameworkId"),
  validateId("projectId"),
  getFrameworkTree,
);

// GET /api/frameworks/:frameworkId/dashboard/:projectFrameworkId
router.get(
  "/:frameworkId/dashboard/:projectFrameworkId",
  authenticateJWT,
  validateId("frameworkId"),
  validateId("projectFrameworkId"),
  getFrameworkDashboard,
);

// GET /api/frameworks/:frameworkId/impl/:level/:id
router.get(
  "/:frameworkId/impl/:level/:id",
  authenticateJWT,
  validateId("frameworkId"),
  validateId("id"),
  getImplById,
);

// GET /api/frameworks/:frameworkId/impl/:level/:id/risks
router.get(
  "/:frameworkId/impl/:level/:id/risks",
  authenticateJWT,
  validateId("frameworkId"),
  validateId("id"),
  getImplRisks,
);

// PATCH /api/frameworks/:frameworkId/impl/:level/:id  (multipart form)
router.patch(
  "/:frameworkId/impl/:level/:id",
  authenticateJWT,
  validateId("frameworkId"),
  validateId("id"),
  upload.any(),
  updateImpl,
);

export default router;
