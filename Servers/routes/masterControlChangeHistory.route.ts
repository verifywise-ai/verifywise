/**
 * Controls Hub — master_control_change_history route definitions.
 *
 * Registered in `index.ts` as `app.use("/api/master-control-change-history", …)`.
 * Client derives this path by replacing `_` with `-` in the EntityType.
 */

import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import { getMasterControlChangeHistoryById } from "../controllers/masterControlChangeHistory.ctrl";

const router = express.Router();

router.get("/:id", authenticateJWT, getMasterControlChangeHistoryById);

export default router;
