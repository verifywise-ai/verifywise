import { Router } from "express";
import authenticateJWT from "../middleware/auth.middleware";
import {
  createLinkedObject,
  deleteEvidenceFromAllPolicies,
  deleteLinkedObject,
  deleteRiskFromAllPolicies,
  getAllLinkedObjects,
  getLinkedObjects,
} from "../controllers/policy-linked-objects.ctrl";

const router = Router();

// GET /policy-linked/:policyId/linked-objects - Get all linked objects for a policy
router.get("/", authenticateJWT, getAllLinkedObjects);

router.get("/:policyId/linked-objects", authenticateJWT, getLinkedObjects);

// POST /policy-linked/:policyId/linked-objects - Create a new linked object for a policy
router.post("/:policyId/linked-objects", authenticateJWT, createLinkedObject);

// DELETE /policy-linked/:policyId/linked-objects - Delete a linked object for a policy
router.delete("/:policyId/linked-objects", authenticateJWT, deleteLinkedObject);

// DELETE /policy-linked/risk/:riskId/unlink-all - Delete a risk from all policies
router.delete("/risk/:riskId/unlink-all", authenticateJWT, deleteRiskFromAllPolicies);

// DELETE /policy-linked/evidence/:evidenceId/unlink-all - Delete evidence from all policies
router.delete("/evidence/:evidenceId/unlink-all", authenticateJWT, deleteEvidenceFromAllPolicies);

export default router;
