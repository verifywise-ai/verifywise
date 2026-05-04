import express from "express";
const router = express.Router();

import { getCEMarking, updateCEMarking } from "../controllers/ceMarking.ctrl";

import authenticateJWT from "../middleware/auth.middleware";
import { validateId } from "../domain.layer/validations/id.valid";

// GET CE Marking data for a project
router.get("/:projectId", authenticateJWT, validateId("projectId"), getCEMarking);

// UPDATE CE Marking data for a project
router.put("/:projectId", authenticateJWT, validateId("projectId"), updateCEMarking);

export default router;
