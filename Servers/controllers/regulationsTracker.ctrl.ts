import { Request, Response } from "express";
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import logger from "../utils/logger/fileLogger";
import {
  listCountries,
  getCountryRow,
  listTracked,
  trackCountry,
  trackCountriesBulk,
  untrackCountry,
  getSettings,
  upsertSettings,
  getGlobalFeed,
  setGlobalFeeds,
  getMetaQuery,
  normalizeSlug,
} from "../utils/regulationsTracker.utils";
import {
  fetchCountryDetail,
  fetchHorizon,
  fetchDeadlines,
  fetchSnapshot,
} from "../utils/regulationsTrackerFeed";
import { getLLMKeysWithKeyQuery } from "../utils/llmKey.utils";
import { getImpactRow, runImpactAnalysis } from "../utils/regulationImpact.utils";

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
    const data = await listCountries(req.organizationId!, {
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
    const local = await getCountryRow(slug, req.organizationId!);
    if (!local) return res.status(404).json(STATUS_CODE[404]("country not found"));

    // Try the live feed first; fall back to our stored snapshot if the feed is
    // unreachable OR returns a 200 with an empty/unexpected body. We capture the
    // fallback reason and log it, so a genuine bug in the live path surfaces in
    // monitoring instead of being silently masked as "stale".
    let staleReason: string | null = null;
    try {
      // Use the canonical stored slug (normalized) rather than the raw URL param to
      // avoid a false stale fallback when the URL slug has different casing/whitespace.
      const live = (await fetchCountryDetail(local.slug)) as {
        country?: Record<string, unknown>;
        meta?: Record<string, unknown>;
      };
      // fetchCountryDetail only throws on non-200; a 200 with an empty/missing
      // `country` would otherwise render a blank page. Guard for real content.
      const liveCountry = live?.country;
      if (!liveCountry || Object.keys(liveCountry).length === 0) {
        staleReason = "live feed returned an empty country payload";
      } else {
        await logSuccess({
          eventType: "Read",
          description: "fetched live country detail",
          functionName: fn,
          fileName: file,
          userId: req.userId!,
          organizationId: req.organizationId!,
        });
        // The live feed nests detail under `country` with `meta` alongside; the client
        // reads regulations/timeline/meta at the root, so flatten to one shape that
        // matches the stale (DB) path exactly.
        return res.status(200).json(
          STATUS_CODE[200]({
            ...liveCountry,
            meta: live.meta ?? null,
            stale: false,
            is_tracked: local.is_tracked,
          }),
        );
      }
    } catch (liveErr) {
      staleReason = (liveErr as Error).message;
    }

    // Fallback path: log WHY we're serving stale so real failures are visible.
    logger.warn(`[regulations-tracker] serving stored detail for ${local.slug}: ${staleReason}`);
    await logSuccess({
      eventType: "Read",
      description: "returned stored country detail",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    // local.data already holds the full detail (regulations/timeline/meta) seeded
    // and refreshed by the weekly sync, so this renders complete content offline.
    return res
      .status(200)
      .json(STATUS_CODE[200]({ ...local.data, stale: true, is_tracked: local.is_tracked }));
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
    if (!Array.isArray(slugs) || slugs.length === 0)
      return res.status(400).json(STATUS_CODE[400]("slugs must be a non-empty array"));
    if (slugs.length > 200)
      return res.status(400).json(STATUS_CODE[400]("too many slugs (max 200)"));
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
    const settings = await getSettings(req.organizationId!);
    // Merge in global run observability (last sync time + outcome) so the
    // Settings page can show when the catalogue was last checked.
    const meta = await getMetaQuery();
    let has_llm_key = false;
    try {
      has_llm_key = (await getLLMKeysWithKeyQuery(req.organizationId!)).length > 0;
    } catch {
      has_llm_key = false;
    }
    const data = {
      ...settings,
      last_run_at: meta.last_run_at,
      last_run_status: meta.last_run_status,
      has_llm_key,
    };
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
    const impactEnabledRaw = req.body?.impact_enabled;
    const impactEnabled = typeof impactEnabledRaw === "boolean" ? impactEnabledRaw : undefined;
    const result = await upsertSettings(
      req.organizationId!,
      recipientUserIds as number[],
      recipientEmails as string[],
      req.userId!,
      impactEnabled,
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

// ---------------------------------------------------------------------------
// Global feeds: changelog (horizon), deadlines, international frameworks.
// Each tries the live feed first and falls back to the stored snapshot so the
// page renders offline. Returns { items, stale } (frameworks uses { items });
// deadlines returns { deadlines, unscheduled, stale }.
// ---------------------------------------------------------------------------

export async function getHorizon(req: Request, res: Response): Promise<any> {
  const fn = "getHorizon";
  logProcessing({
    description: "regulations changelog (horizon)",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    try {
      const live = (await fetchHorizon()) as { changes?: unknown[] };
      return res.status(200).json(STATUS_CODE[200]({ items: live.changes ?? [], stale: false }));
    } catch {
      const stored = (await getGlobalFeed("horizon")) as { changes?: unknown[] } | null;
      return res.status(200).json(STATUS_CODE[200]({ items: stored?.changes ?? [], stale: true }));
    }
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "horizon fetch failed",
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
// Enriches a deadlines array with countryFlag from the regulation_countries
// catalog. One batched query for all distinct slugs; best-effort (never throws).
// ---------------------------------------------------------------------------
async function enrichWithFlags(items: unknown[]): Promise<unknown[]> {
  if (!items.length) return items;
  try {
    const slugs = [
      ...new Set(
        items
          .map((i) => (i as Record<string, unknown>).countrySlug)
          .filter((s) => typeof s === "string"),
      ),
    ] as string[];
    if (!slugs.length) return items;
    const rows = (await sequelize.query(
      `SELECT slug, data->>'flag' AS flag FROM regulation_countries WHERE slug = ANY(:slugs)`,
      { replacements: { slugs }, type: QueryTypes.SELECT },
    )) as { slug: string; flag: string | null }[];
    const flagMap = new Map(rows.map((r) => [r.slug, r.flag ?? undefined]));
    return items.map((item) => {
      const it = item as Record<string, unknown>;
      const flag = flagMap.get(it.countrySlug as string);
      return flag !== undefined ? { ...it, countryFlag: flag } : it;
    });
  } catch {
    return items;
  }
}

export async function getDeadlines(req: Request, res: Response): Promise<any> {
  const fn = "getDeadlines";
  logProcessing({
    description: "regulations deadlines",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    try {
      const live = (await fetchDeadlines()) as { deadlines?: unknown[]; unscheduled?: unknown[] };
      const deadlines = await enrichWithFlags(live.deadlines ?? []);
      const unscheduled = await enrichWithFlags(live.unscheduled ?? []);
      return res.status(200).json(
        STATUS_CODE[200]({
          deadlines,
          unscheduled,
          stale: false,
        }),
      );
    } catch {
      const stored = (await getGlobalFeed("deadlines")) as {
        deadlines?: unknown[];
        unscheduled?: unknown[];
      } | null;
      const deadlines = await enrichWithFlags(stored?.deadlines ?? []);
      const unscheduled = await enrichWithFlags(stored?.unscheduled ?? []);
      return res.status(200).json(
        STATUS_CODE[200]({
          deadlines,
          unscheduled,
          stale: true,
        }),
      );
    }
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "deadlines fetch failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getFrameworks(req: Request, res: Response): Promise<any> {
  const fn = "getFrameworks";
  logProcessing({
    description: "international AI frameworks",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    try {
      const live = (await fetchSnapshot()) as { frameworks?: unknown[] };
      // Opportunistically refresh the cached copy so the stale fallback stays warm.
      if (Array.isArray(live.frameworks)) {
        await setGlobalFeeds({ frameworks: live.frameworks }).catch(() => undefined);
      }
      return res.status(200).json(STATUS_CODE[200]({ items: live.frameworks ?? [], stale: false }));
    } catch {
      const stored = (await getGlobalFeed("frameworks")) as unknown[] | null;
      return res.status(200).json(STATUS_CODE[200]({ items: stored ?? [], stale: true }));
    }
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "frameworks fetch failed",
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
// POST /api/regulations-tracker/sync  [ADMIN]
// On-demand "check for updates now". Bypasses the weekly-idempotency guard by
// clearing last_run_week first, then runs the sync inline. Rate-limited at the
// route layer.
// ---------------------------------------------------------------------------
export async function triggerSync(req: Request, res: Response): Promise<any> {
  const fn = "triggerSync";
  logProcessing({
    description: "manual regulations sync",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    if (!isAdmin(req.role)) return res.status(403).json(STATUS_CODE[403]("Admin access required"));
    // Lazy import to avoid a controller -> automations import cycle at module load.
    const { syncRegulationsTracker } =
      await import("../services/automations/actions/syncRegulationsTracker");
    const { clearLastRunWeek } = await import("../utils/regulationsTracker.utils");
    await clearLastRunWeek();
    const result = await syncRegulationsTracker();
    await logSuccess({
      eventType: "Update",
      description: "manual regulations sync complete",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "manual regulations sync failed",
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
// GET /api/regulations-tracker/impact/:slug  [any authenticated user]
// Returns the stored impact-analysis row for the org + country, plus a stale
// flag computed by comparing the stored regulation_hash to the current catalog.
// Returns 200/null when no analysis row exists yet or impact is disabled.
// ---------------------------------------------------------------------------
export async function getImpactAnalysis(req: Request, res: Response): Promise<any> {
  const fn = "getImpactAnalysis";
  logProcessing({
    description: "get regulation impact analysis",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  try {
    // BUG 4: Honor the impact_enabled toggle — return null so the panel hides.
    const settings = await getSettings(req.organizationId!);
    if (settings.impact_enabled === false) {
      await logSuccess({
        eventType: "Read",
        description: "impact analysis disabled — returning null",
        functionName: fn,
        fileName: file,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](null));
    }

    // BUG 3: Normalize slug so reads agree with writes.
    const slug = normalizeSlug(req.params.slug as string);
    const row = await getImpactRow(req.organizationId!, slug);
    if (!row) {
      await logSuccess({
        eventType: "Read",
        description: "no impact analysis row yet",
        functionName: fn,
        fileName: file,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](null));
    }
    // Staleness: compare the hash that was current when analysis ran against
    // the hash that is current in the catalog now. Wrapped defensively so that
    // test mocks which stub this util to {} still pass.
    let stale = false;
    try {
      const current = await getCountryRow(slug, req.organizationId!);
      stale = !!current && current.hash !== row.regulation_hash;
    } catch {
      // Unable to fetch current hash — treat as not stale rather than erroring.
    }
    await logSuccess({
      eventType: "Read",
      description: "fetched impact analysis",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(
      STATUS_CODE[200]({
        result: row.result,
        status: row.status,
        refreshed_at: row.refreshed_at,
        stale,
      }),
    );
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "get impact analysis failed",
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
// POST /api/regulations-tracker/impact/:slug/refresh  [ADMIN]
// Runs the full impact-analysis pipeline for the org + country and returns the
// fresh result. Rate-limited at the route layer.
// ---------------------------------------------------------------------------
export async function refreshImpactAnalysis(req: Request, res: Response): Promise<any> {
  const fn = "refreshImpactAnalysis";
  logProcessing({
    description: "refresh regulation impact analysis",
    functionName: fn,
    fileName: file,
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  if (!isAdmin(req.role)) {
    return res.status(403).json(STATUS_CODE[403]("Admin access required"));
  }
  try {
    const settings = await getSettings(req.organizationId!);
    if (settings.impact_enabled === false) {
      await logSuccess({
        eventType: "Update",
        description: "impact analysis disabled — skipping refresh",
        functionName: fn,
        fileName: file,
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200]({ status: "disabled" }));
    }
    // BUG 3: Normalize slug.
    // BUG 2: Pass force=true so admin re-analysis is never silently skipped by cache.
    const slug = normalizeSlug(req.params.slug as string);
    const out = await runImpactAnalysis(req.organizationId!, slug, true);
    await logSuccess({
      eventType: "Update",
      description: "refreshed impact analysis",
      functionName: fn,
      fileName: file,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](out));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: "refresh impact analysis failed",
      functionName: fn,
      fileName: file,
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
