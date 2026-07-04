import express from "express";
const router = express.Router();

import authenticateJWT from "../middleware/auth.middleware";
import { validateTokenCreation, validateTokenDeletion } from "../middleware/tokens.middleware";
import {
  createApiToken,
  deleteApiToken,
  getApiTokens,
  revokeApiToken,
} from "../controllers/tokens.ctrl";

router.get("/", authenticateJWT, getApiTokens);
router.post("/", authenticateJWT, validateTokenCreation, createApiToken);
router.post("/:id/revoke", authenticateJWT, validateTokenDeletion, revokeApiToken);
router.delete("/:id", authenticateJWT, validateTokenDeletion, deleteApiToken);

export default router;
