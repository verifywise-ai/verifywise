import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import { NOTICE_ID_RE } from "../services/changeNotice/rules";
import { setDismissed, viewNotice } from "../services/changeNotice";

const FILE = "changeNotice.ctrl.ts";

/**
 * Counts a visit to a page's change notice and says whether to show it.
 * User and organization come from the token only.
 */
export async function viewChangeNoticeHandler(req: Request, res: Response) {
  const fn = "viewChangeNoticeHandler";
  logStructured("processing", "viewing change notice", fn, FILE);

  const id = String(req.params.id ?? "");
  if (!NOTICE_ID_RE.test(id)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid notice id")));
  }
  // A pure super admin has no organization, so nothing is shown to them.
  if (!req.organizationId) {
    return res.status(200).json(STATUS_CODE[200]({ show: false }));
  }

  try {
    const result = await viewNotice({
      userId: req.userId!,
      organizationId: req.organizationId,
      id,
      now: new Date(),
    });
    logStructured("successful", "change notice viewed", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured("error", "failed to view change notice", fn, FILE);
    logger.error(`❌ Error in ${fn}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/** Dismisses a change notice, or restores it when `dismissed` is false (Undo). */
export async function setChangeNoticeDismissedHandler(req: Request, res: Response) {
  const fn = "setChangeNoticeDismissedHandler";
  logStructured("processing", "setting change notice dismissed", fn, FILE);

  const id = String(req.params.id ?? "");
  if (!NOTICE_ID_RE.test(id)) {
    return res.status(400).json(STATUS_CODE[400](req.t!("Invalid notice id")));
  }
  const dismissed = req.body?.dismissed;
  if (typeof dismissed !== "boolean") {
    return res.status(400).json(STATUS_CODE[400](req.t!("Dismissed must be true or false")));
  }

  try {
    const result = await setDismissed({ userId: req.userId!, id, dismissed, now: new Date() });
    logStructured("successful", "change notice dismissed state set", fn, FILE);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    logStructured("error", "failed to set change notice dismissed", fn, FILE);
    logger.error(`❌ Error in ${fn}:`, error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
