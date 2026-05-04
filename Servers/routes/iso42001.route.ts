import express from "express";
import { validateId } from "../domain.layer/validations/id.valid";
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

import authenticateJWT from "../middleware/auth.middleware";
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

router.get("/clauses", authenticateJWT, getAllClauses);
router.get(
  "/clauses/struct/byProjectId/:id",
  authenticateJWT,
  validateId("id"),
  getAllClausesStructForProject,
);
router.get("/annexes", authenticateJWT, getAllAnnexes);
router.get(
  "/annexes/struct/byProjectId/:id",
  authenticateJWT,
  validateId("id"),
  getAllAnnexesStructForProject,
);

router.get("/clauses/byProjectId/:id", authenticateJWT, validateId("id"), getClausesByProjectId);
router.get("/annexes/byProjectId/:id", authenticateJWT, validateId("id"), getAnnexesByProjectId);

router.get(
  "/subClauses/byClauseId/:id",
  authenticateJWT,
  validateId("id"),
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
  getSubClauseById,
);
// Get all risks linked to a specific ISO 42001 subclause
router.get("/subclauses/:id/risks", authenticateJWT, validateId("id"), getSubClauseRisks);
// Get all risks linked to a specific ISO 42001 annex category
router.get("/annexCategories/:id/risks", authenticateJWT, validateId("id"), getAnnexCategoryRisks);
router.get(
  "/annexCategory/byId/:id",
  authenticateJWT,
  validateId("id"),
  validateId("projectFrameworkId"),
  getAnnexCategoryById,
);

// calcation endpoints
router.get("/clauses/progress/:id", authenticateJWT, validateId("id"), getProjectClausesProgress);
router.get("/annexes/progress/:id", authenticateJWT, validateId("id"), getProjectAnnxesProgress);

router.get("/all/clauses/progress", authenticateJWT, getAllProjectsClausesProgress);
router.get("/all/annexes/progress", authenticateJWT, getAllProjectsAnnxesProgress);

// assignment endpoints
router.get(
  "/clauses/assignments/:id",
  authenticateJWT,
  validateId("id"),
  getProjectClausesAssignments,
);
router.get(
  "/annexes/assignments/:id",
  authenticateJWT,
  validateId("id"),
  getProjectAnnexesAssignments,
);

router.patch("/saveClauses/:id", authenticateJWT, validateId("id"), upload.any(), saveClauses);

router.patch("/saveAnnexes/:id", authenticateJWT, validateId("id"), upload.any(), saveAnnexes);

router.delete(
  "/clauses/byProjectId/:id",
  authenticateJWT,
  validateId("id"),
  deleteManagementSystemClauses,
);
router.delete(
  "/annexes/byProjectId/:id",
  authenticateJWT,
  validateId("id"),
  deleteReferenceControls,
);

export default router;
