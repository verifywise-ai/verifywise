/**
 * LLM key writes that check the key with its provider before saving
 * (`services/llmKeyVerification.ts`). A refused key is a 400 with a `code`
 * (workspace_required, invalid_key, model_unavailable); a key that could not
 * be checked is a 409 with code "unreachable" unless the body sets
 * skip_verification: true. Reads and the delete did not change and stay on
 * the legacy /api/llm-keys.
 */
import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import { createLLMKeyV1, updateLLMKeyV1 } from "../../controllers/llmKey.ctrl";

const router = express.Router();

router.post("/", authenticateJWT, authorize("llmKeys.admin"), createLLMKeyV1);
router.patch("/:id", authenticateJWT, authorize("llmKeys.admin"), updateLLMKeyV1);

export default router;
