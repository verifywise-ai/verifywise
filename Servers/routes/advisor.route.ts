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

// Run advisor query
router.post("/", authenticateJWT, runAdvisor);

// Streaming advisor query (legacy SSE protocol)
router.post("/stream", authenticateJWT, streamAdvisor);

// AI SDK streaming endpoint (native UI message stream protocol for useChat)
router.post("/chat", authenticateJWT, streamAdvisorV2);

// Conversation persistence endpoints (multi-conversation per domain)
//
// GET    /advisor/conversations/:domain           — list all chats in a domain
// POST   /advisor/conversations/:domain           — create a new empty chat
// GET    /advisor/conversations/:domain/:id       — fetch one chat + messages
// PUT    /advisor/conversations/:domain/:id       — replace messages in a chat
// DELETE /advisor/conversations/:domain/:id       — delete a chat
router.get("/conversations/:domain", authenticateJWT, listConversations);
router.post("/conversations/:domain", authenticateJWT, createConversation);
router.get("/conversations/:domain/:id", authenticateJWT, getConversationById);
router.put("/conversations/:domain/:id", authenticateJWT, updateConversation);
router.delete("/conversations/:domain/:id", authenticateJWT, deleteConversation);

// Agent memory — inspection + GDPR right-to-erasure
//
// GET    /advisor/memory                            — summary of stored data for the calling user
// DELETE /advisor/memory                            — purge calling user's messages
//                                                    (?agentName=advisor & ?sessionId=foo to scope)
// GET    /advisor/memory/admin/agent/:agentName     — admin: latest messages for agent (org-wide)
// DELETE /advisor/memory/admin/agent/:agentName     — admin: clear ALL memory for agent (org-wide)
router.get("/memory", authenticateJWT, getMemorySummary);
router.delete("/memory", authenticateJWT, deleteMyMemory);
router.get("/memory/admin/agent/:agentName", authenticateJWT, adminListAgentMessages);
router.delete("/memory/admin/agent/:agentName", authenticateJWT, adminClearAgentMemory);

export default router;
