import express from "express";
import { validateId } from "../domain.layer/validations/id.valid";
const router = express.Router();
import { createMemoryUpload, handleUploadError } from "../utils/upload.utils";
// Security: bounded upload config (30MB/file, 10 files, MIME allowlist).
const upload = createMemoryUpload();

import authenticateJWT from "../middleware/auth.middleware";
import { requireUseCaseAccessVia } from "../middleware/projectAccess.middleware";
import {
  useCaseOfIso42001AnnexCategory,
  useCaseOfIso42001Subclause,
  useCaseOfProjectFramework,
} from "../utils/useCaseOfChild.utils";
import authorize from "../middleware/accessControl.middleware";
import { requireFrameworkWriteAccess } from "../middleware/frameworkWriteAccess.middleware";
import {
  iso42001AnnexChanges,
  iso42001SubclauseChanges,
} from "../utils/frameworkWriteAccess.utils";
import {
  deleteManagementSystemClauses,
  deleteReferenceControls,
  getAllAnnexes,
  getAllAnnexesStructForProject,
  getAllClauses,
  getAllClausesStructForProject,
  getAllProjectsAnnxesProgress,
  getAllProjectsClausesProgress,
  getAnnexCategoriesByAnnexId,
  getAnnexCategoryById,
  getAnnexesByProjectId,
  getClausesByProjectId,
  getProjectAnnxesProgress,
  getProjectClausesProgress,
  getProjectClausesAssignments,
  getProjectAnnexesAssignments,
  getSubClauseById,
  getSubClausesByClauseId,
  getSubClauseRisks,
  getAnnexCategoryRisks,
  saveAnnexes,
  saveClauses,
} from "../controllers/iso42001.ctrl";

// Every route keyed by a projects_frameworks row or a requirement row runs the
// access rule of the use case it belongs to (requireUseCaseAccessVia).
const pfInPath = requireUseCaseAccessVia(useCaseOfProjectFramework);
const pfInQuery = requireUseCaseAccessVia(useCaseOfProjectFramework, {
  param: "projectFrameworkId",
  source: "query",
});
const subclauseInPath = requireUseCaseAccessVia(useCaseOfIso42001Subclause);
const annexInPath = requireUseCaseAccessVia(useCaseOfIso42001AnnexCategory);

router.get("/clauses", authenticateJWT, getAllClauses);
router.get(
  "/clauses/struct/byProjectId/:id",
  authenticateJWT,
  validateId("id"),
  pfInPath,
  getAllClausesStructForProject,
);
router.get("/annexes", authenticateJWT, getAllAnnexes);
router.get(
  "/annexes/struct/byProjectId/:id",
  authenticateJWT,
  validateId("id"),
  pfInPath,
  getAllAnnexesStructForProject,
);

router.get(
  "/clauses/byProjectId/:id",
  authenticateJWT,
  validateId("id"),
  pfInPath,
  getClausesByProjectId,
);
router.get(
  "/annexes/byProjectId/:id",
  authenticateJWT,
  validateId("id"),
  pfInPath,
  getAnnexesByProjectId,
);

router.get(
  "/subClauses/byClauseId/:id",
  authenticateJWT,
  validateId("id"),
  pfInQuery,
  getSubClausesByClauseId,
);
router.get(
  "/annexCategories/byAnnexId/:id",
  authenticateJWT,
  validateId("id"),
  getAnnexCategoriesByAnnexId,
);

router.get(
  "/subClause/byId/:id",
  authenticateJWT,
  validateId("id"),
  validateId("projectFrameworkId"),
  subclauseInPath,
  getSubClauseById,
);
// Get all risks linked to a specific ISO 42001 subclause
router.get(
  "/subclauses/:id/risks",
  authenticateJWT,
  validateId("id"),
  subclauseInPath,
  getSubClauseRisks,
);
// Get all risks linked to a specific ISO 42001 annex category
router.get(
  "/annexCategories/:id/risks",
  authenticateJWT,
  validateId("id"),
  annexInPath,
  getAnnexCategoryRisks,
);
router.get(
  "/annexCategory/byId/:id",
  authenticateJWT,
  validateId("id"),
  validateId("projectFrameworkId"),
  pfInQuery,
  getAnnexCategoryById,
);

// calcation endpoints
router.get(
  "/clauses/progress/:id",
  authenticateJWT,
  validateId("id"),
  pfInPath,
  getProjectClausesProgress,
);
router.get(
  "/annexes/progress/:id",
  authenticateJWT,
  validateId("id"),
  pfInPath,
  getProjectAnnxesProgress,
);

router.get("/all/clauses/progress", authenticateJWT, getAllProjectsClausesProgress);
router.get("/all/annexes/progress", authenticateJWT, getAllProjectsAnnxesProgress);

// assignment endpoints
router.get(
  "/clauses/assignments/:id",
  authenticateJWT,
  validateId("id"),
  pfInPath,
  getProjectClausesAssignments,
);
router.get(
  "/annexes/assignments/:id",
  authenticateJWT,
  validateId("id"),
  pfInPath,
  getProjectAnnexesAssignments,
);

router.patch(
  "/saveClauses/:id",
  authenticateJWT,
  validateId("id"),
  subclauseInPath,
  upload.any(),
  handleUploadError,
  requireFrameworkWriteAccess(iso42001SubclauseChanges),
  saveClauses,
);

router.patch(
  "/saveAnnexes/:id",
  authenticateJWT,
  validateId("id"),
  annexInPath,
  upload.any(),
  handleUploadError,
  requireFrameworkWriteAccess(iso42001AnnexChanges),
  saveAnnexes,
);

router.delete(
  "/clauses/byProjectId/:id",
  authenticateJWT,
  validateId("id"),
  authorize("framework.edit"),
  pfInPath,
  deleteManagementSystemClauses,
);
router.delete(
  "/annexes/byProjectId/:id",
  authenticateJWT,
  validateId("id"),
  authorize("framework.edit"),
  pfInPath,
  deleteReferenceControls,
);

export default router;
