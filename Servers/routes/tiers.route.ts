import express from "express";
const router = express.Router();

import { getTiersFeatures } from "../controllers/tiers.ctrl";
import authenticateJWT from "../middleware/auth.middleware";

// This route fetches features of a particular tier
router.get("/features/:id", authenticateJWT, getTiersFeatures);

export default router;
