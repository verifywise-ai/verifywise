import express from "express";
const router = express.Router();

import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
import {
  createLLMKey,
  updateLLMKey,
  deleteLLMKey,
  getLLMKey,
  getLLMKeys,
  getLLMKeyStatus,
} from "../controllers/llmKey.ctrl";

router.get("/", authenticateJWT, getLLMKeys);
router.get("/status", authenticateJWT, getLLMKeyStatus);
router.get("/:name", authenticateJWT, getLLMKey);
// Reads stay open to every authenticated role: the Advisor, reporting and
// Start here check whether a key exists, and responses never include the key.
// Writes are limited to holders of llmKeys.admin (built-in: Admin only).
router.post("/", authenticateJWT, authorize("llmKeys.admin"), createLLMKey);
router.patch("/:id", authenticateJWT, authorize("llmKeys.admin"), updateLLMKey);
router.delete("/:id", authenticateJWT, authorize("llmKeys.admin"), deleteLLMKey);

export default router;
