import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import { getTasksLinkedToEntity } from "../../controllers/task.ctrl";

const router = express.Router();

// The tasks linked to one entity (an incident, a vendor, ...), with the same
// auth and visibility as the legacy GET /tasks list. The legacy /api/tasks
// router is frozen.
router.get("/linked/:entityType/:entityId", authenticateJWT, getTasksLinkedToEntity);

export default router;
