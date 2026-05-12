/**
 * Legacy routes for Evaluation LLM API Keys — retired in favor of AI Gateway key storage.
 *
 * Provider keys for LLM Evals live in verifywise.ai_gateway_api_keys and are managed under
 * AI Gateway → Settings → API keys. Mutations return HTTP 410 Gone.
 */

import express, { Request, Response } from "express";
import authenticateJWT from "../middleware/auth.middleware";

const router = express.Router();

const AI_GATEWAY_KEYS_PATH = "/ai-gateway/settings/api-keys";

function evalKeysRetired(_req: Request, res: Response) {
  return res.status(410).json({
    success: false,
    message:
      "LLM provider API keys for evaluations are managed in AI Gateway Settings. Add keys there to run evals.",
    manageKeysPath: AI_GATEWAY_KEYS_PATH,
  });
}

router.get("/", authenticateJWT, evalKeysRetired);
router.post("/", authenticateJWT, evalKeysRetired);
router.post("/verify", authenticateJWT, evalKeysRetired);
router.delete("/:provider", authenticateJWT, evalKeysRetired);
router.get("/internal/decrypted", evalKeysRetired);

export default router;
