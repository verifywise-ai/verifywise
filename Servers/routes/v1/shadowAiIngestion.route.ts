import express from "express";
const router = express.Router();
import { ingestEvents } from "../../controllers/shadowAiIngestion.ctrl";

// Public endpoint — authenticated via X-API-Key header (not JWT)
router.post("/events", ingestEvents);

export default router;
