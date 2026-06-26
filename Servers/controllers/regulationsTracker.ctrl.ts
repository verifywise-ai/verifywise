import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import {
  listCountries,
  getCountryRow,
  listTracked,
  trackCountry,
  trackCountriesBulk,
  untrackCountry,
  getSettings,
  upsertSettings,
} from "../utils/regulationsTracker.utils";
import { fetchCountryDetail } from "../utils/regulationsTrackerFeed";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isAdmin = (role?: string) => role === "Admin" || role === "SuperAdmin";

const file = "regulationsTracker.ctrl.ts";

// ---------------------------------------------------------------------------
// GET /api/regulations-tracker/countries
// ---------------------------------------------------------------------------
export async function getCountries(req: Request, res: Response): Promise<any> {
  const fn = "getCountries";
  logProcessing({
    description: "list regulation countries",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const qStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
    const data = await listCountries({
      region: qStr(req.query.region),
      q: qStr(req.query.q),
    });
    await logSuccess({
      eventType: "Read",
      description: "listed regulation countries",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "list regulation countries failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ---------------------------------------------------------------------------
// GET /api/regulations-tracker/countries/:slug
// ---------------------------------------------------------------------------
export async function getCountryDetail(req: Request, res: Response): Promise<any> {
  const fn = "getCountryDetail";
  logProcessing({
    description: "proxy country detail",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const slug = req.params.slug as string;
    const local = await getCountryRow(slug);
    if (!local) return res.status(404).json(STATUS_CODE[404]("country not found"));
    try {
      const live = await fetchCountryDetail(slug);
      await logSuccess({
        eventType: "Read",
        description: "fetched live country detail",
        functionName: fn,
        fileName: file,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200]({ ...(live as object), stale: false }));
    } catch {
      await logSuccess({
        eventType: "Read",
        description: "returned stale country detail",
        functionName: fn,
        fileName: file,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200]({ country: local.data, stale: true }));
    }
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "country detail failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ---------------------------------------------------------------------------
// GET /api/regulations-tracker/tracked
// ---------------------------------------------------------------------------
export async function getTracked(req: Request, res: Response): Promise<any> {
  const fn = "getTracked";
  logProcessing({
    description: "list tracked countries",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const data = await listTracked(req.organizationId!);
    await logSuccess({
      eventType: "Read",
      description: "listed tracked countries",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "list tracked countries failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ---------------------------------------------------------------------------
// POST /api/regulations-tracker/tracked  [ADMIN]
// ---------------------------------------------------------------------------
export async function trackCountryCtrl(req: Request, res: Response): Promise<any> {
  const fn = "trackCountryCtrl";
  logProcessing({
    description: "track country",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    if (!isAdmin(req.role)) return res.status(403).json(STATUS_CODE[403]("Admin access required"));
    const { slug } = req.body ?? {};
    if (!slug || typeof slug !== "string")
      return res.status(400).json(STATUS_CODE[400]("slug is required"));
    const result = await trackCountry(req.organizationId!, slug, req.userId!);
    await logSuccess({
      eventType: "Create",
      description: "tracked country",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "track country failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ---------------------------------------------------------------------------
// POST /api/regulations-tracker/tracked/bulk  [ADMIN]
// ---------------------------------------------------------------------------
export async function trackBulkCtrl(req: Request, res: Response): Promise<any> {
  const fn = "trackBulkCtrl";
  logProcessing({
    description: "bulk track countries",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    if (!isAdmin(req.role)) return res.status(403).json(STATUS_CODE[403]("Admin access required"));
    const slugs: unknown = req.body?.slugs;
    if (!Array.isArray(slugs)) return res.status(400).json(STATUS_CODE[400]("slugs must be an array"));
    const badSlug = (slugs as unknown[]).find((s) => typeof s !== "string" || !s.trim());
    if (badSlug !== undefined)
      return res.status(400).json(STATUS_CODE[400](`Invalid slug: ${String(badSlug)}`));
    const result = await trackCountriesBulk(req.organizationId!, slugs as string[], req.userId!);
    await logSuccess({
      eventType: "Create",
      description: "bulk tracked countries",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "bulk track countries failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/regulations-tracker/tracked/:slug  [ADMIN]
// ---------------------------------------------------------------------------
export async function untrackCountryCtrl(req: Request, res: Response): Promise<any> {
  const fn = "untrackCountryCtrl";
  logProcessing({
    description: "untrack country",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    if (!isAdmin(req.role)) return res.status(403).json(STATUS_CODE[403]("Admin access required"));
    const slug = req.params.slug as string;
    await untrackCountry(req.organizationId!, slug);
    await logSuccess({
      eventType: "Delete",
      description: "untracked country",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ slug }));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: "untrack country failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ---------------------------------------------------------------------------
// GET /api/regulations-tracker/settings
// ---------------------------------------------------------------------------
export async function getSettingsCtrl(req: Request, res: Response): Promise<any> {
  const fn = "getSettingsCtrl";
  logProcessing({
    description: "get regulation tracker settings",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    const data = await getSettings(req.organizationId!);
    await logSuccess({
      eventType: "Read",
      description: "fetched regulation tracker settings",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "get regulation tracker settings failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// ---------------------------------------------------------------------------
// PUT /api/regulations-tracker/settings  [ADMIN]
// ---------------------------------------------------------------------------
export async function updateSettingsCtrl(req: Request, res: Response): Promise<any> {
  const fn = "updateSettingsCtrl";
  logProcessing({
    description: "update regulation tracker settings",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    if (!isAdmin(req.role)) return res.status(403).json(STATUS_CODE[403]("Admin access required"));
    const recipientUserIds: unknown = req.body?.recipient_user_ids ?? [];
    const recipientEmails: unknown = req.body?.recipient_emails ?? [];
    if (!Array.isArray(recipientUserIds) || !Array.isArray(recipientEmails))
      return res
        .status(400)
        .json(STATUS_CODE[400]("recipient_user_ids and recipient_emails must be arrays"));
    const badUserId = (recipientUserIds as unknown[]).find((id) => !Number.isInteger(id));
    if (badUserId !== undefined)
      return res.status(400).json(STATUS_CODE[400](`Invalid user id: ${String(badUserId)}`));
    const badEmail = (recipientEmails as unknown[]).find(
      (e) => typeof e !== "string" || !EMAIL_RE.test(e),
    );
    if (badEmail !== undefined)
      return res.status(400).json(STATUS_CODE[400](`Invalid email: ${String(badEmail)}`));
    const result = await upsertSettings(
      req.organizationId!,
      recipientUserIds as number[],
      recipientEmails as string[],
      req.userId!,
    );
    await logSuccess({
      eventType: "Update",
      description: "updated regulation tracker settings",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "update regulation tracker settings failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
