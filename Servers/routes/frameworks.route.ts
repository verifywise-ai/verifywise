import express from "express";
const router = express.Router();

import {
  addFrameworkToProject,
  deleteFrameworkFromProject,
  getAllFrameworks,
  getFrameworkById,
} from "../controllers/framework.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { requireProjectAccess } from "../middleware/projectAccess.middleware";
import { validateId } from "../domain.layer/validations/id.valid";

// GET requests
router.get("/", authenticateJWT, getAllFrameworks);
router.get("/:id", authenticateJWT, validateId("id"), getFrameworkById);

router.post(
  "/toProject",
  authenticateJWT,
  authorize("framework.edit"),
  validateId("frameworkId"),
  validateId("projectId"),
  requireProjectAccess("projectId", "query"),
  addFrameworkToProject,
);

router.delete(
  "/fromProject",
  authenticateJWT,
  authorize("framework.edit"),
  validateId("frameworkId"),
  validateId("projectId"),
  requireProjectAccess("projectId", "query"),
  deleteFrameworkFromProject,
);

export default router;
