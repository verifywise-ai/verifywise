/**
 * @fileoverview Report Runs Controller
 *
 * Endpoints for the enterprise reporting run archive: list runs, fetch a run,
 * and download a run's generated file.
 *
 * All endpoints require JWT authentication and are org-scoped via
 * req.organizationId. The download is doubly guarded: the run row is fetched
 * org-scoped (getRunQuery), and the file is fetched org-scoped (getFileById),
 * so a run's file can never be downloaded across organizations.
 *
 * @module controllers/reportRun
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { listRunsQuery, getRunQuery } from "../utils/reportRun.utils";
import { getFileById } from "../utils/fileUpload.utils";
import { getRunAnalysesQuery } from "../utils/reportRunAnalysis.utils";

const MAX_PAGE = 200;

export async function listRuns(req: Request, res: Response): Promise<any> {
  try {
    // Clamp rather than trust: an unclamped limit is a cheap way for a client
    // to ask the database for everything.
    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_PAGE) : MAX_PAGE;
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

    const { rows, total } = await listRunsQuery(req.organizationId!, {
      scheduledReportId: req.query.scheduledReportId,
      status: req.query.status,
      limit,
      offset,
    });

    return res.status(200).json(STATUS_CODE[200]({ rows, total, limit, offset }));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}

export async function getRun(req: Request, res: Response): Promise<any> {
  try {
    const run = await getRunQuery(Number(req.params.id), req.organizationId!);
    if (!run) return res.status(404).json(STATUS_CODE[404]("not found"));
    return res.status(200).json(STATUS_CODE[200](run));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}

export async function downloadRun(req: Request, res: Response): Promise<any> {
  try {
    const run = await getRunQuery(Number(req.params.id), req.organizationId!);
    if (!run || !run.file_id) return res.status(404).json(STATUS_CODE[404]("not found"));
    // Org-scoped file fetch (WHERE organization_id = :org AND id = :id) returns
    // a FileModel whose `content` is the stored file buffer.
    const file: any = await getFileById(run.file_id, req.organizationId!);
    if (!file) return res.status(404).json(STATUS_CODE[404]("file missing"));
    res.setHeader("Content-Type", run.output_mime_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${run.output_filename}"`);
    return res.send(file.content);
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}

// Doubly org-scoped, matching downloadRun: the run row is fetched org-scoped
// first (404 on miss), and getRunAnalysesQuery filters on organization_id
// again. A run id from another org can never yield analysis rows.
export async function getRunAnalyses(req: Request, res: Response): Promise<any> {
  try {
    const id = Number(req.params.id);
    const run = await getRunQuery(id, req.organizationId!);
    if (!run) return res.status(404).json(STATUS_CODE[404]("not found"));
    const analyses = await getRunAnalysesQuery(id, req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](analyses));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}
