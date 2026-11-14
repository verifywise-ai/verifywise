import express from "express";
import authenticateJWT from "../../middleware/auth.middleware";
import {
  setChangeNoticeDismissedHandler,
  viewChangeNoticeHandler,
} from "../../controllers/changeNotice.ctrl";

const router = express.Router();

// Every role sees notices; a user only ever touches their own state.
router.post("/:id/view", authenticateJWT, viewChangeNoticeHandler);
router.put("/:id/dismissed", authenticateJWT, setChangeNoticeDismissedHandler);

export default router;
