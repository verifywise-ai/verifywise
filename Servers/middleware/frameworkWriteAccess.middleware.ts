/**
 * @fileoverview Framework save access control (framework.edit, framework.audit).
 *
 * The framework save routes take implementation fields and audit fields in
 * one request, and the drawers send every field on every save. A caller
 * holding both permissions (Admin, Editor) passes straight through. Anyone
 * else gets the fields the request would change compared with the stored row
 * (see utils/frameworkWriteAccess.utils.ts) and is refused with 403 when
 * those changes need a permission the role lacks:
 *
 * - implementation fields, evidence files and linked risks need framework.edit;
 * - auditor feedback (and its files) needs framework.audit;
 * - a save that changes nothing passes, as it always has.
 *
 * The comparisons are tolerant (rich text by its text, due dates within a
 * day), so a passing save can still carry other bytes for a field it "did
 * not change". For each class the caller lacks, the detector's `restore`
 * rewrites the request so that class is saved as stored: an Auditor cannot
 * slip a link into implementation HTML or move a due date by a day.
 *
 * So an Auditor can still record audit results through the drawer it shares
 * with Editors, and a Reviewer's unchanged save still succeeds.
 *
 * Mount after the multipart parser (upload.any()) so req.body and req.files
 * are populated.
 *
 * @module middleware/frameworkWriteAccess
 */

import { NextFunction, Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { requestHasPermission } from "../utils/rolePermissions.utils";
import type { FrameworkChangeDetector } from "../utils/frameworkWriteAccess.utils";

export const requireFrameworkWriteAccess =
  (detectChanges: FrameworkChangeDetector) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (!req.role) {
      return res.status(401).json(STATUS_CODE[401](req.t!("Authentication required")));
    }

    try {
      const [canEdit, canAudit] = await Promise.all([
        requestHasPermission(req, "framework.edit"),
        requestHasPermission(req, "framework.audit"),
      ]);
      if (canEdit && canAudit) return next();

      const changes = await detectChanges(req);
      if ((changes.edit && !canEdit) || (changes.audit && !canAudit)) {
        return res.status(403).json(STATUS_CODE[403](req.t!("Access denied")));
      }
      if (!canEdit) changes.restore?.("edit");
      if (!canAudit) changes.restore?.("audit");
      return next();
    } catch (error) {
      return next(error);
    }
  };

export default requireFrameworkWriteAccess;
