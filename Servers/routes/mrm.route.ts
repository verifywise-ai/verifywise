import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import {
  assignModelTier,
  createFinding,
  createValidation,
  getFindings,
  getFleetTiering,
  getModelRoles,
  getValidations,
  setModelRoles,
  signoffValidation,
  updateFinding,
  updateValidation,
} from "../controllers/mrm.ctrl";

// --- Tiering ---
router.get("/tiering", authenticateJWT, getFleetTiering);
router.put("/models/:modelId/tier", authenticateJWT, assignModelTier);

// --- Validations ---
router.get("/validations", authenticateJWT, getValidations);
router.post("/models/:modelId/validations", authenticateJWT, createValidation);
router.patch("/validations/:id", authenticateJWT, updateValidation);
router.post("/validations/:id/signoff", authenticateJWT, signoffValidation);

// --- Findings ---
// Findings are audit records — there is intentionally NO hard-delete endpoint.
// A finding is raised, worked through its lifecycle, and reaches "closed
// (verified)" via PATCH; it always remains in the register for the audit trail.
router.get("/findings", authenticateJWT, getFindings);
router.post("/validations/:validationId/findings", authenticateJWT, createFinding);
router.patch("/findings/:id", authenticateJWT, updateFinding);

// --- Per-model roles ---
router.get("/models/:modelId/roles", authenticateJWT, getModelRoles);
router.put("/models/:modelId/roles", authenticateJWT, setModelRoles);

export default router;
