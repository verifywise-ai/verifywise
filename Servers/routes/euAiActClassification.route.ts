import express from "express";
import authenticateJWT from "../middleware/auth.middleware";
import { getQuestionnaire, scoreAnswers } from "../controllers/euAiActClassification.ctrl";

const router = express.Router();

router.get("/questionnaire", authenticateJWT, getQuestionnaire);
router.post("/score", authenticateJWT, scoreAnswers);

export default router;
