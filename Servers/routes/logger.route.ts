import express from "express";
import { getEvents, getLogs } from "../controllers/logger.ctrl";
import authenticateJWT from "../middleware/auth.middleware";
import authorize from "../middleware/accessControl.middleware";
const router = express.Router();

router.get("/events", authenticateJWT, getEvents);

// The organization's raw server log is Admin-only: only holders of logs.admin
// (built-in: Admin) may read it. Events stay open to every member.
router.get("/logs", authenticateJWT, authorize("logs.admin"), getLogs);

export default router;
