import express from "express";
const router = express.Router();

import { getResearchConfig } from "../controllers/vendorResearch.ctrl";

import authenticateJWT from "../middleware/auth.middleware";

// GET requests
// What the vendor research button depends on. Any signed-in user may read it, and it holds no key.
router.get("/config", authenticateJWT, getResearchConfig);

export default router;
