import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  runAdvisor,
  streamAdvisor,
  streamAdvisorV2,
  listConversations,
  getConversationById,
  createConversation,
  updateConversation,
  deleteConversation,
  getMemorySummary,
  deleteMyMemory,
  adminClearAgentMemory,
  adminListAgentMessages,
  getToolsRoadmap,
} from "../controllers/advisor.ctrl";
import { ADVISOR_ROADMAP_READ_ROLES } from "../advisor/roadmap/roadmapService";
import {
  validateAdminAgentParam,
  validateConversationParams,
  validateDomainParam,
  validateMemoryQuery,
  validateRunAdvisor,
  validateStreamAdvisorV2,
  validateUpdateConversation,
} from "../middleware/validators/advisor.validator";

// Run advisor query
router.post("/", authenticateJWT, validateRunAdvisor, runAdvisor);

// Streaming advisor query (legacy SSE protocol)
router.post("/stream", authenticateJWT, validateRunAdvisor, streamAdvisor);

// AI SDK streaming endpoint (native UI message stream protocol for useChat)
router.post("/chat", authenticateJWT, validateStreamAdvisorV2, streamAdvisorV2);

// Tools roadmap — read-only plan-vs-implementation tracker.
// Role read access (Admin, Editor, Reviewer, Auditor) enforced server-side.
router.get(
  "/tools/roadmap",
  authenticateJWT,
  authorize(ADVISOR_ROADMAP_READ_ROLES),
  getToolsRoadmap,
);

// Conversation persistence endpoints (multi-conversation per domain)
router.get("/conversations/:domain", authenticateJWT, validateDomainParam, listConversations);
router.post("/conversations/:domain", authenticateJWT, validateDomainParam, createConversation);
router.get(
  "/conversations/:domain/:id",
  authenticateJWT,
  validateConversationParams,
  getConversationById,
);
router.put(
  "/conversations/:domain/:id",
  authenticateJWT,
  validateUpdateConversation,
  updateConversation,
);
router.delete(
  "/conversations/:domain/:id",
  authenticateJWT,
  validateConversationParams,
  deleteConversation,
);

// Agent memory — inspection + GDPR right-to-erasure
router.get("/memory", authenticateJWT, getMemorySummary);
router.delete("/memory", authenticateJWT, validateMemoryQuery, deleteMyMemory);
router.get(
  "/memory/admin/agent/:agentName",
  authenticateJWT,
  validateAdminAgentParam,
  adminListAgentMessages,
);
router.delete(
  "/memory/admin/agent/:agentName",
  authenticateJWT,
  validateAdminAgentParam,
  adminClearAgentMemory,
);

export default router;
