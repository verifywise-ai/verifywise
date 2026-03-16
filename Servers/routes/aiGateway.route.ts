import express from "express";
const router = express.Router();

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import { generalApiLimiter } from "../middleware/rateLimit.middleware";
import {
  // API Keys
  getApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  verifyApiKey,
  // Endpoints
  getEndpoints,
  getEndpoint,
  createEndpoint,
  updateEndpoint,
  deleteEndpoint,
  // Spend
  getSpendSummary,
  getSpendByEndpoint,
  getSpendByUser,
  // Budget
  getBudget,
  upsertBudget,
  // Proxy
  chatCompletion,
  chatCompletionStream,
  embeddingProxy,
  // Providers
  getProviders,
  getSpendByTag,
  getSpendLogs,
  purgeSpendLogs,
  // Guardrails
  getGuardrails,
  createGuardrail,
  updateGuardrail,
  deleteGuardrail,
  getGuardrailSettings,
  updateGuardrailSettings,
  testGuardrails,
  getGuardrailLogs,
  getGuardrailStats,
  purgeGuardrailLogs,
  // Virtual Keys
  getVirtualKeys,
  createVirtualKey,
  updateVirtualKey,
  revokeVirtualKey,
  deleteVirtualKey,
  // Prompts
  getPrompts,
  createPrompt,
  getPrompt,
  updatePrompt,
  deletePrompt,
  createPromptVersion,
  getPromptVersions,
  publishPromptVersion,
  testPrompt,
} from "../controllers/aiGateway.ctrl";

// All routes require authentication
router.use(authenticateJWT);

// API Key management — Admin only for create/update/delete
router.get("/keys", getApiKeys);
router.post("/keys", authorize(["Admin"]), createApiKey);
router.post("/keys/verify", authorize(["Admin"]), verifyApiKey);
router.patch("/keys/:id", authorize(["Admin"]), updateApiKey);
router.delete("/keys/:id", authorize(["Admin"]), deleteApiKey);

// Endpoint management — Admin only for create/update/delete
router.get("/endpoints", getEndpoints);
router.get("/endpoints/:id", getEndpoint);
router.post("/endpoints", authorize(["Admin"]), createEndpoint);
router.patch("/endpoints/:id", authorize(["Admin"]), updateEndpoint);
router.delete("/endpoints/:id", authorize(["Admin"]), deleteEndpoint);

// Spend analytics
router.get("/spend", getSpendSummary);
router.get("/spend/by-endpoint", getSpendByEndpoint);
router.get("/spend/by-user", getSpendByUser);
router.get("/spend/by-tag", getSpendByTag);
router.get("/spend/logs", getSpendLogs);
router.post("/spend/logs/purge", authorize(["Admin"]), purgeSpendLogs);

// Budget management — Admin only for write
router.get("/budget", getBudget);
router.put("/budget", authorize(["Admin"]), upsertBudget);

// Utility
router.get("/providers", getProviders);

// Guardrail settings (specific routes BEFORE parameterized :id) — Admin only for write
router.get("/guardrails/settings", getGuardrailSettings);
router.put("/guardrails/settings", authorize(["Admin"]), updateGuardrailSettings);
router.post("/guardrails/test", testGuardrails);
router.get("/guardrails/logs", getGuardrailLogs);
router.get("/guardrails/stats", getGuardrailStats);
router.post("/guardrails/logs/purge", authorize(["Admin"]), purgeGuardrailLogs);

// Guardrail rule CRUD — Admin only for create/update/delete
router.get("/guardrails", getGuardrails);
router.post("/guardrails", authorize(["Admin"]), createGuardrail);
router.patch("/guardrails/:id", authorize(["Admin"]), updateGuardrail);
router.delete("/guardrails/:id", authorize(["Admin"]), deleteGuardrail);

// Prompt management — test route BEFORE :id to avoid param capture
router.post("/prompts/test", testPrompt);
router.get("/prompts", getPrompts);
router.post("/prompts", authorize(["Admin"]), createPrompt);
router.get("/prompts/:id", getPrompt);
router.patch("/prompts/:id", authorize(["Admin"]), updatePrompt);
router.delete("/prompts/:id", authorize(["Admin"]), deletePrompt);
router.get("/prompts/:id/versions", getPromptVersions);
router.post("/prompts/:id/versions", authorize(["Admin"]), createPromptVersion);
router.post("/prompts/:id/versions/:v/publish", authorize(["Admin"]), publishPromptVersion);

// Virtual key management — Admin only for write
router.get("/virtual-keys", getVirtualKeys);
router.post("/virtual-keys", authorize(["Admin"]), createVirtualKey);
router.patch("/virtual-keys/:id", authorize(["Admin"]), updateVirtualKey);
router.post("/virtual-keys/:id/revoke", authorize(["Admin"]), revokeVirtualKey);
router.delete("/virtual-keys/:id", authorize(["Admin"]), deleteVirtualKey);

// Proxy endpoints — rate limited
router.post("/chat", generalApiLimiter, chatCompletion);
router.post("/chat/stream", generalApiLimiter, chatCompletionStream);
router.post("/embeddings", generalApiLimiter, embeddingProxy);

export default router;
