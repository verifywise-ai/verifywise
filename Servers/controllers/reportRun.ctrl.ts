/**
 * @fileoverview Report Runs Controller
 *
 * Endpoints for the enterprise reporting run archive: list runs, fetch a run,
 * and download a run's generated file.
 *
 * All endpoints require JWT authentication and are org-scoped via
 * req.organizationId. Organization scope alone is not enough for a single run:
 * run ids are sequential integers, so it would let any member of the
 * organization — an Auditor included — enumerate ids and read every project's
 * report. Every per-run endpoint therefore also passes through
 * canViewRunQuery, the same project-membership rule listRunsQuery applies to
 * the list, and answers a denial with 404 (see runViewer below).
 *
 * The download is guarded three times over: the visibility gate, then the
 * org-scoped run row (getRunQuery), then the org-scoped file (getFileById).
 *
 * @module controllers/reportRun
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  listRunsQuery,
  getRunQuery,
  canViewRunQuery,
  setRunArchivedQuery,
  deleteRunQuery,
  ReportRunViewer,
} from "../utils/reportRun.utils";
import { getFileById } from "../utils/fileUpload.utils";
import { getRunAnalysesQuery } from "../utils/reportRunAnalysis.utils";

const MAX_PAGE = 200;

/**
 * The viewer, from the authenticated request only — never from the body or the
 * query, which the caller controls. Missing identity becomes null rather than
 * undefined: null matches no project owner and no membership row, so an
 * unidentifiable caller sees organization-scoped runs only.
 */
function runViewer(req: Request): ReportRunViewer {
  return { userId: req.userId ?? null, role: req.role ?? null };
}

/**
 * 404 rather than 403 on denial. It matches how the rest of this controller
 * hides rows belonging to another organization, and a 403 would confirm that
 * the id exists — an oracle over a sequential id space. The gate runs before
 * the row is read, so a denied caller's request never touches the run, its
 * file or its analyses.
 */
async function denyUnlessVisible(req: Request, res: Response): Promise<boolean> {
  const visible = await canViewRunQuery(Number(req.params.id), req.organizationId!, runViewer(req));
  if (!visible) {
    res.status(404).json(STATUS_CODE[404]("not found"));
    return true;
  }
  return false;
}

export async function listRuns(req: Request, res: Response): Promise<any> {
  try {
    // Clamp rather than trust: an unclamped limit is a cheap way for a client
    // to ask the database for everything.
    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_PAGE) : MAX_PAGE;
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

    // Query strings are strings: only the two literals map to booleans, and
    // anything else leaves the filter off rather than guessing.
    const archived =
      req.query.archived === "true" ? true : req.query.archived === "false" ? false : undefined;

    // The viewer is not optional: organization scope alone would show an
    // Auditor every report in the organization, which is wider than the list
    // this one replaced. listRunsQuery narrows non-Admins to the projects they
    // own or belong to.
    const { rows, total } = await listRunsQuery(
      req.organizationId!,
      {
        scheduledReportId: req.query.scheduledReportId,
        status: req.query.status,
        archived,
        limit,
        offset,
      },
      runViewer(req),
    );

    return res.status(200).json(STATUS_CODE[200]({ rows, total, limit, offset }));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}

// SELECT * includes config_snapshot (which carries project_id) and
// delivery_config (which carries email recipients), so this is not a harmless
// read for a non-member.
export async function getRun(req: Request, res: Response): Promise<any> {
  try {
    if (await denyUnlessVisible(req, res)) return;
    const run = await getRunQuery(Number(req.params.id), req.organizationId!);
    if (!run) return res.status(404).json(STATUS_CODE[404]("not found"));
    return res.status(200).json(STATUS_CODE[200](run));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}

export async function downloadRun(req: Request, res: Response): Promise<any> {
  try {
    if (await denyUnlessVisible(req, res)) return;
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

// Guarded like downloadRun: the visibility gate first, then the org-scoped run
// row (404 on miss), and getRunAnalysesQuery filters on organization_id again.
// A run id from another org can never yield analysis rows.
export async function getRunAnalyses(req: Request, res: Response): Promise<any> {
  try {
    if (await denyUnlessVisible(req, res)) return;
    const id = Number(req.params.id);
    const run = await getRunQuery(id, req.organizationId!);
    if (!run) return res.status(404).json(STATUS_CODE[404]("not found"));
    const analyses = await getRunAnalysesQuery(id, req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](analyses));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}

// authorize(["Admin", "Editor"]) on the route says the caller may mutate runs;
// it does not say which runs. An Editor is not necessarily a member of the
// project a run covers, so the same visibility rule applies here as to the
// reads — you cannot archive, restore or delete a run you cannot see. The gate
// is a separate statement from the mutation, but each mutation keeps its own
// organization_id in the WHERE clause, so the window between them cannot widen
// the blast radius beyond the organization.
async function setArchived(req: Request, res: Response, archived: boolean): Promise<any> {
  try {
    if (await denyUnlessVisible(req, res)) return;
    const run = await setRunArchivedQuery(
      Number(req.params.id),
      req.organizationId!,
      archived,
      req.userId ?? null,
    );
    if (!run) return res.status(404).json(STATUS_CODE[404]("not found"));
    return res.status(200).json(STATUS_CODE[200](run));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}

export async function archiveRun(req: Request, res: Response): Promise<any> {
  return setArchived(req, res, true);
}

export async function restoreRun(req: Request, res: Response): Promise<any> {
  return setArchived(req, res, false);
}

export async function deleteRun(req: Request, res: Response): Promise<any> {
  try {
    if (await denyUnlessVisible(req, res)) return;
    const deleted = await deleteRunQuery(Number(req.params.id), req.organizationId!);
    if (!deleted) return res.status(404).json(STATUS_CODE[404]("not found"));
    return res.status(200).json(STATUS_CODE[200]({ id: Number(req.params.id) }));
  } catch (e) {
    return res.status(500).json(STATUS_CODE[500]((e as Error).message));
  }
}
