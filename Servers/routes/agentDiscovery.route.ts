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
router.post("/", authenticateJWT, authorize(["Admin"]), createAgentPrimitive);
router.post("/sync", authenticateJWT, authorize(["Admin"]), triggerSync);

// Update (manual agents only)
router.patch("/:id", authenticateJWT, authorize(["Admin"]), updateAgentPrimitive);

// Review + model linking
router.patch("/:id/review", authenticateJWT, authorize(["Admin"]), reviewAgentPrimitive);
router.patch("/:id/link-model", authenticateJWT, authorize(["Admin"]), linkModelToAgent);
router.patch("/:id/unlink-model", authenticateJWT, authorize(["Admin"]), unlinkModelFromAgent);

// Audit logs
router.get("/:id/audit-logs", authenticateJWT, getAgentAuditLogs);

// Delete
router.delete("/:id", authenticateJWT, authorize(["Admin"]), deleteAgentPrimitiveById);

export default router;
