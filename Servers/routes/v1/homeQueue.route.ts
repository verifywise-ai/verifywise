import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import { getHomeQueueHandler } from "../../controllers/homeQueue.ctrl";

const router = express.Router();

// Every role gets its own queue; each source decides what the user may see.
router.get("/queue", authenticateJWT, getHomeQueueHandler);

export default router;
