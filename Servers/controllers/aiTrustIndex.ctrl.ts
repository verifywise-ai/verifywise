import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import {
  getAppsQuery,
  getAppBySlugQuery,
  getTrackedQuery,
  trackAppQuery,
  trackAppsBulkQuery,
  untrackAppQuery,
  getSettingsQuery,
  upsertSettingsQuery,
} from "../utils/aiTrustIndex.utils";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isAdmin = (role?: string) => role === "Admin" || role === "SuperAdmin";

export async function getApps(req: Request, res: Response): Promise<any> {
  const fn = "getApps",
    file = "aiTrustIndex.ctrl.ts";
  logProcessing({
    description: "list trust index apps",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const qStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
    const result = await getAppsQuery(req.organizationId!, {
      search: qStr(req.query.search),
      category: qStr(req.query.category),
      grade: qStr(req.query.grade),
      page: parseInt(qStr(req.query.page) ?? "1", 10),
      pageSize: parseInt(qStr(req.query.pageSize) ?? "25", 10),
      sort: qStr(req.query.sort) ?? "score",
      dir: qStr(req.query.dir),
    });
    await logSuccess({
      eventType: "Read",
      description: "listed apps",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "list apps failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getApp(req: Request, res: Response): Promise<any> {
  try {
    const app = await getAppBySlugQuery(req.organizationId!, req.params.slug as string);
    if (!app) return res.status(404).json(STATUS_CODE[404]("App not found"));
    return res.status(200).json(STATUS_CODE[200](app));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getTracked(req: Request, res: Response): Promise<any> {
  try {
    const tracked = await getTrackedQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](tracked));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function trackApp(req: Request, res: Response): Promise<any> {
  const fn = "trackApp",
    file = "aiTrustIndex.ctrl.ts";
  logProcessing({
    description: "track trust index app",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const slug = req.body?.slug;
    if (!slug) return res.status(400).json(STATUS_CODE[400]("slug is required"));
    const result = await trackAppQuery(req.organizationId!, slug, req.userId!);
    if (!result.tracked)
      return res.status(400).json(STATUS_CODE[400]("App not found or not active"));
    await logSuccess({
      eventType: "Create",
      description: "tracked app",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](result));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "track app failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function trackAppsBulk(req: Request, res: Response): Promise<any> {
  const fn = "trackAppsBulk",
    file = "aiTrustIndex.ctrl.ts";
  logProcessing({
    description: "track trust index apps in bulk",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const slugs = req.body?.slugs;
    if (!Array.isArray(slugs) || slugs.length === 0)
      return res.status(400).json(STATUS_CODE[400]("slugs must be a non-empty array"));
    if (slugs.length > 200)
      return res.status(400).json(STATUS_CODE[400]("too many slugs (max 200)"));
    const result = await trackAppsBulkQuery(req.organizationId!, slugs, req.userId!);
    await logSuccess({
      eventType: "Create",
      description: "tracked apps in bulk",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "bulk track apps failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function untrackApp(req: Request, res: Response): Promise<any> {
  const fn = "untrackApp",
    file = "aiTrustIndex.ctrl.ts";
  logProcessing({
    description: "untrack trust index app",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    await untrackAppQuery(req.organizationId!, req.params.slug as string);
    await logSuccess({
      eventType: "Delete",
      description: "untracked app",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ untracked: true }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "untrack app failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getSettings(req: Request, res: Response): Promise<any> {
  try {
    const settings = await getSettingsQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateSettings(req: Request, res: Response): Promise<any> {
  const fn = "updateSettings",
    file = "aiTrustIndex.ctrl.ts";
  logProcessing({
    description: "update trust index settings",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    if (!isAdmin(req.role)) return res.status(403).json(STATUS_CODE[403]("Admin access required"));
    const recipientUserIds = req.body?.recipientUserIds ?? [];
    const recipientEmails = req.body?.recipientEmails ?? [];
    if (!Array.isArray(recipientUserIds) || !Array.isArray(recipientEmails))
      return res
        .status(400)
        .json(STATUS_CODE[400]("recipientUserIds and recipientEmails must be arrays"));
    const badUserId = recipientUserIds.find((id: unknown) => !Number.isInteger(id));
    if (badUserId !== undefined)
      return res.status(400).json(STATUS_CODE[400](`Invalid user id: ${String(badUserId)}`));
    const badEmail = recipientEmails.find(
      (e: unknown) => typeof e !== "string" || !EMAIL_RE.test(e),
    );
    if (badEmail !== undefined)
      return res.status(400).json(STATUS_CODE[400](`Invalid email: ${String(badEmail)}`));
    await upsertSettingsQuery(req.organizationId!, req.userId!, recipientUserIds, recipientEmails);
    await logSuccess({
      eventType: "Update",
      description: "updated settings",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ recipientUserIds, recipientEmails }));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "update settings failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
