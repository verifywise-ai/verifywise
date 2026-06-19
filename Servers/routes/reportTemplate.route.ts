import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import { listTemplates, getTemplate } from "../controllers/reportTemplate.ctrl";

const router = express.Router();

router.get("/", authenticateJWT, listTemplates);
router.get("/:id", authenticateJWT, getTemplate);

export default router;
