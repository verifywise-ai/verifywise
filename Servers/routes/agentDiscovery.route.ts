import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  getAllAgentPrimitives,
  getAgentStats,
  getSyncLogs,
  getSyncStatus,
  getAgentPrimitiveById,
  createAgentPrimitive,
  updateAgentPrimitive,
  triggerSync,
  reviewAgentPrimitive,
  linkModelToAgent,
  unlinkModelFromAgent,
  linkUseCaseToAgent,
  unlinkUseCaseFromAgent,
  getAgentAuditLogs,
  deleteAgentPrimitiveById,
} from "../controllers/agentDiscovery.ctrl";

// Static paths first to avoid :id param collision
router.get("/", authenticateJWT, getAllAgentPrimitives);
router.get("/stats", authenticateJWT, getAgentStats);
router.get("/sync/logs", authenticateJWT, getSyncLogs);
router.get("/sync/status", authenticateJWT, getSyncStatus);

// Parameterized routes
router.get("/:id", authenticateJWT, getAgentPrimitiveById);

// Create + sync trigger
router.post("/", authenticateJWT, authorize("agentDiscovery.admin"), createAgentPrimitive);
router.post("/sync", authenticateJWT, authorize("agentDiscovery.admin"), triggerSync);

// Update (manual agents only)
router.patch("/:id", authenticateJWT, authorize("agentDiscovery.admin"), updateAgentPrimitive);

// Review + model and use case linking (synced agents included)
router.patch(
  "/:id/review",
  authenticateJWT,
  authorize("agentDiscovery.admin"),
  reviewAgentPrimitive,
);
router.patch(
  "/:id/link-model",
  authenticateJWT,
  authorize("agentDiscovery.admin"),
  linkModelToAgent,
);
router.patch(
  "/:id/unlink-model",
  authenticateJWT,
  authorize("agentDiscovery.admin"),
  unlinkModelFromAgent,
);
router.patch(
  "/:id/link-use-case",
  authenticateJWT,
  authorize("agentDiscovery.admin"),
  linkUseCaseToAgent,
);
router.patch(
  "/:id/unlink-use-case",
  authenticateJWT,
  authorize("agentDiscovery.admin"),
  unlinkUseCaseFromAgent,
);

// Audit logs
router.get("/:id/audit-logs", authenticateJWT, getAgentAuditLogs);

// Delete
router.delete("/:id", authenticateJWT, authorize("agentDiscovery.admin"), deleteAgentPrimitiveById);

export default router;
