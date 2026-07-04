import express from "express";
const router = express.Router();
import authenticateJWT from "../middleware/auth.middleware";
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
} from "../controllers/advisor.ctrl";
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
