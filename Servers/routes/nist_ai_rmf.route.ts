import express from "express";
const router = express.Router();
import { validateId } from "../domain.layer/validations/id.valid";
import authenticateJWT from "../middleware/auth.middleware";
import {
  getAllNISTAIRMFfunctions,
  getNISTAIRMFfunctionById,
} from "../controllers/nist_ai_rmf.function.ctrl";
import { getAllNISTAIRMFCategoriesByfunctionId } from "../controllers/nist_ai_rmf.category.ctrl";
import {
  getAllNISTAIRMFSubcategoriesBycategoryIdAndtitle,
  getNISTAIRMFSubcategoryById,
  getNISTAIRMFSubcategoryRisks,
  updateNISTAIRMFSubcategoryById,
  updateNISTAIRMFSubcategoryStatus,
  getNISTAIRMFProgress,
  getNISTAIRMFProgressByFunction,
  getNISTAIRMFAssignments,
  getNISTAIRMFAssignmentsByFunction,
  getNISTAIRMFStatusBreakdown,
  getNISTAIRMFOverview,
} from "../controllers/nist_ai_rmf.subcategory.ctrl";
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

// CRUD requests for NIST AI RMF functions
router.get("/functions", authenticateJWT, getAllNISTAIRMFfunctions); // getting all NIST AI RMF functions of the organization
router.get("/functions/:id", authenticateJWT, validateId("id"), getNISTAIRMFfunctionById); // getting a specific NIST AI RMF function by id

// CRUD requests for NIST AI RMF categories
router.get("/categories/:title", authenticateJWT, getAllNISTAIRMFCategoriesByfunctionId); // getting all NIST AI RMF categories of the organization by function id

// CRUD requests for NIST AI RMF subcategories
router.get(
  "/subcategories/byId/:id",
  authenticateJWT,
  validateId("id"),
  getNISTAIRMFSubcategoryById,
); // getting a specific NIST AI RMF subcategory by id
router.get(
  "/subcategories/:id/risks",
  authenticateJWT,
  validateId("id"),
  getNISTAIRMFSubcategoryRisks,
); // getting all risks linked to a specific NIST AI RMF subcategory
router.get(
  "/subcategories/:categoryId/:title",
  authenticateJWT,
  validateId("categoryId"),
  getAllNISTAIRMFSubcategoriesBycategoryIdAndtitle,
); // getting all NIST AI RMF subcategories of the organization by category id and title
router.patch(
  "/subcategories/:id",
  authenticateJWT,
  validateId("id"),
  upload.any(),
  updateNISTAIRMFSubcategoryById,
); // updating a specific NIST AI RMF subcategory by id
router.patch(
  "/subcategories/:id/status",
  authenticateJWT,
  validateId("id"),
  updateNISTAIRMFSubcategoryStatus,
); // updating status of a specific NIST AI RMF subcategory by id

// Dashboard calculation endpoints
router.get("/progress", authenticateJWT, getNISTAIRMFProgress); // get total and completed subcategories
router.get("/progress-by-function", authenticateJWT, getNISTAIRMFProgressByFunction); // get progress grouped by function (Govern, Map, Measure, Manage)
router.get("/assignments", authenticateJWT, getNISTAIRMFAssignments); // get total and assigned subcategories
router.get("/assignments-by-function", authenticateJWT, getNISTAIRMFAssignmentsByFunction); // get assignments grouped by function (Govern, Map, Measure, Manage)
router.get("/status-breakdown", authenticateJWT, getNISTAIRMFStatusBreakdown); // get status breakdown
router.get("/overview", authenticateJWT, getNISTAIRMFOverview); // get all functions with categories and subcategories

export default router;
