import express from "express";
const router = express.Router();

import { validateId } from "../domain.layer/validations/id.valid";
import { createMemoryUpload } from "../utils/upload.utils";
import authenticateJWT from "../middleware/auth.middleware";
import { requireFrameworkWriteAccess } from "../middleware/frameworkWriteAccess.middleware";
import {
  requireProjectAccess,
  requireUseCaseAccessVia,
} from "../middleware/projectAccess.middleware";
import { useCaseOfFrameworkImpl, useCaseOfProjectFramework } from "../utils/useCaseOfChild.utils";
import { frameworkImplChanges } from "../utils/frameworkWriteAccess.utils";
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
 * Generic impl endpoints for the 22 bundled frameworks. Mounted at
 * /api/frameworks in app.ts. Table + column names come from
 * Servers/structures/ via the dispatch inside frameworkImpl.utils.ts.
 * Each route runs the access rule of the use case it reads or writes.
 */

const implUseCase = requireUseCaseAccessVia(useCaseOfFrameworkImpl);

// GET /api/frameworks/:frameworkId/tree/:projectId
router.get(
  "/:frameworkId/tree/:projectId",
  authenticateJWT,
  validateId("frameworkId"),
  validateId("projectId"),
  requireProjectAccess("projectId"),
  getFrameworkTree,
);

// GET /api/frameworks/:frameworkId/dashboard/:projectFrameworkId
router.get(
  "/:frameworkId/dashboard/:projectFrameworkId",
  authenticateJWT,
  validateId("frameworkId"),
  validateId("projectFrameworkId"),
  requireUseCaseAccessVia(useCaseOfProjectFramework, { param: "projectFrameworkId" }),
  getFrameworkDashboard,
);

// GET /api/frameworks/:frameworkId/impl/:level/:id
router.get(
  "/:frameworkId/impl/:level/:id",
  authenticateJWT,
  validateId("frameworkId"),
  validateId("id"),
  implUseCase,
  getImplById,
);

// GET /api/frameworks/:frameworkId/impl/:level/:id/risks
router.get(
  "/:frameworkId/impl/:level/:id/risks",
  authenticateJWT,
  validateId("frameworkId"),
  validateId("id"),
  implUseCase,
  getImplRisks,
);

// PATCH /api/frameworks/:frameworkId/impl/:level/:id  (multipart form)
router.patch(
  "/:frameworkId/impl/:level/:id",
  authenticateJWT,
  validateId("frameworkId"),
  validateId("id"),
  implUseCase,
  upload.any(),
  requireFrameworkWriteAccess(frameworkImplChanges),
  updateImpl,
);

export default router;
