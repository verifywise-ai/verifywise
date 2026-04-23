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

export default router;
