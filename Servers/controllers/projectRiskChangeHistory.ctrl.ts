/**
 * Project Risk Change History Controller
 *
 * Handles API endpoints for project risk change history.
 */

import { Request, Response } from "express";
import { getProjectRiskChangeHistory } from "../utils/projectRiskChangeHistory.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { isRiskVisibleQuery, riskViewer } from "../utils/riskVisibility.utils";

import { translateError } from "../utils/i18n.utils";
export async function getProjectRiskChangeHistoryByRiskId(
  req: Request,
  res: Response,
): Promise<any> {
  try {
    const projectRiskId = parseInt(
      Array.isArray(req.params.projectRiskId)
        ? req.params.projectRiskId[0]
        : req.params.projectRiskId,
    );
    const limit =
      parseInt(
        Array.isArray(req.query.limit)
          ? String(req.query.limit[0])
          : String(req.query.limit || "100"),
        10,
      ) || 100;
    const offset =
      parseInt(
        Array.isArray(req.query.offset)
          ? String(req.query.offset[0])
          : String(req.query.offset || "0"),
        10,
      ) || 0;

    if (isNaN(projectRiskId)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Invalid project risk ID")));
    }

    // A risk the viewer cannot see answers like a missing one: no history.
    const visible = await isRiskVisibleQuery(projectRiskId, req.organizationId!, riskViewer(req));
    const history = visible
      ? await getProjectRiskChangeHistory(projectRiskId, req.organizationId!, limit, offset)
      : { data: [], hasMore: false, total: 0 };

    return res.status(200).json(STATUS_CODE[200](history));
  } catch (error) {
    console.error("Error getting project risk change history:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
