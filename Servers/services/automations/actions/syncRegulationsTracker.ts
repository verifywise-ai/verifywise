import { promises as fs } from "fs";
import path from "path";
import {
  fetchManifest,
  validateManifest,
  fetchCountryDetail,
  fetchHorizon,
  fetchDeadlines,
  fetchSnapshot,
} from "../../../utils/regulationsTrackerFeed";
import {
  getMetaQuery,
  getStoredHashes,
  upsertFeedTx,
  setGlobalFeeds,
  getAffectedOrgsBySlugs,
  resolveEmailRecipients,
  resolveInAppUserIds,
  currentIsoWeek,
  escapeHtml,
  CountryChange,
} from "../../../utils/regulationsTracker.utils";
import { createNotificationQuery } from "../../../utils/notification.utils";
import { NotificationType, NotificationEntityType } from "../../../domain.layer/interfaces/i.notification";
import { sendAutomationEmail } from "../../emailService";
import { compileMjmlToHtml } from "../../../tools/mjmlCompiler";
import logger from "../../../utils/logger/fileLogger";


const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:5173";
const MODULE_URL = FRONTEND + "/regulations-tracker/browse";
const TRACKED_URL = FRONTEND + "/regulations-tracker/tracked";
const SETTINGS_URL = FRONTEND + "/regulations-tracker/settings";

export interface DigestItem {
  name: string;
  detail?: string;
}

export function sectionMjml(title: string, items: DigestItem[]): string {
  if (!items.length) return "";
  const header = `<mj-text font-size="14px" font-weight="600" color="#344054">${escapeHtml(title)}</mj-text>`;
  const lines = items
    .map((it) => {
      const label = it.detail ? `${it.name} — ${it.detail}` : it.name;
      return `<mj-text font-size="13px" color="#475467">• ${escapeHtml(label)}</mj-text>`;
    })
    .join("");
  return header + lines;
}

async function renderDigest(changed: DigestItem[], removed: DigestItem[]): Promise<string> {
  const tmplPath = path.join(__dirname, "../../../templates/regulations-tracker-digest.mjml");
  const template = await fs.readFile(tmplPath, "utf8");
  return compileMjmlToHtml(template, {
    changedSection: sectionMjml("Changed", changed),
    removedSection: sectionMjml("No longer in the feed", removed),
    moduleUrl: MODULE_URL,
    trackedUrl: TRACKED_URL,
    settingsUrl: SETTINGS_URL,
  });
}

export async function syncRegulationsTracker(deps?: { feed?: unknown }): Promise<{
  fetched: number;
  changed: number;
  newlyRemoved: number;
  orgsEmailed: number;
  orgsNotified: number;
  skipped?: string;
}> {
  const meta = await getMetaQuery();
  const thisWeek = currentIsoWeek(new Date());
  if (meta.last_run_week === thisWeek)
    return {
      fetched: 0,
      changed: 0,
      newlyRemoved: 0,
      orgsEmailed: 0,
      orgsNotified: 0,
      skipped: `already ran ${thisWeek}`,
    };

  let raw: unknown;
  try {
    raw = deps?.feed ?? (await fetchManifest());
  } catch (e) {
    logger.error(`[regulations-tracker] feed fetch failed: ${(e as Error).message}`);
    return {
      fetched: 0,
      changed: 0,
      newlyRemoved: 0,
      orgsEmailed: 0,
      orgsNotified: 0,
      skipped: "fetch failed",
    };
  }

  const validated = validateManifest(raw, meta.last_good_count ?? null);
  if (!validated.ok) {
    logger.error(`[regulations-tracker] feed rejected: ${validated.reason}`);
    return {
      fetched: 0,
      changed: 0,
      newlyRemoved: 0,
      orgsEmailed: 0,
      orgsNotified: 0,
      skipped: validated.reason,
    };
  }

  // Fetch full per-country detail (regulations/timeline/meta) for countries that
  // are new or whose hash moved, so the catalog stores complete content (the
  // detail page renders from our DB without a per-request external call). Stored
  // as data = { ...country, meta }, matching the live-fetch shape in the detail
  // controller. A per-country fetch failure is non-fatal — that country falls
  // back to its manifest summary for this run.
  const norm = (s: string) => s.trim().toLowerCase();
  const storedHashes = await getStoredHashes(validated.countries.map((c) => c.slug));
  const staleForDetail = validated.countries.filter(
    (c) => storedHashes.get(norm(c.slug)) !== c.hash,
  );
  const detailBySlug = new Map<string, unknown>();
  for (const c of staleForDetail) {
    try {
      const d = (await fetchCountryDetail(c.slug)) as {
        country?: Record<string, unknown>;
        meta?: Record<string, unknown>;
      };
      if (d.country) detailBySlug.set(norm(c.slug), { ...d.country, meta: d.meta ?? null });
    } catch (e) {
      logger.warn(
        `[regulations-tracker] detail fetch failed for ${c.slug}: ${(e as Error).message}; storing summary`,
      );
    }
  }

  const { changed, newlyRemoved, wasFirstSeed } = await upsertFeedTx(
    validated.countries,
    validated.presentSlugs,
    validated.rawCount,
    detailBySlug,
  );

  // Refresh the three global, non-tenant feeds (changelog / deadlines /
  // frameworks) cached on the meta singleton. Best-effort: a failure here must
  // not abort the country sync or notifications.
  try {
    const [horizon, deadlines, snapshot] = await Promise.all([
      fetchHorizon().catch(() => undefined),
      fetchDeadlines().catch(() => undefined),
      fetchSnapshot().catch(() => undefined),
    ]);
    await setGlobalFeeds({
      horizon,
      deadlines,
      frameworks: (snapshot as { frameworks?: unknown[] } | undefined)?.frameworks,
    });
  } catch (e) {
    logger.warn(`[regulations-tracker] global feed refresh failed: ${(e as Error).message}`);
  }

  if (wasFirstSeed) {
    logger.info(
      `[regulations-tracker] first seed (${validated.countries.length}); notifications suppressed`,
    );
    return {
      fetched: validated.countries.length,
      changed: 0,
      newlyRemoved: 0,
      orgsEmailed: 0,
      orgsNotified: 0,
    };
  }

  const changeBySlug = new Map<string, CountryChange>(changed.map((c) => [c.slug, c]));
  const changedSlugs = Array.from(new Set([...changed.map((c) => c.slug), ...newlyRemoved]));
  let orgsEmailed = 0;
  let orgsNotified = 0;

  if (changedSlugs.length) {
    const affected = await getAffectedOrgsBySlugs(changedSlugs);
    const byOrg = new Map<
      number,
      { changed: DigestItem[]; removed: DigestItem[] }
    >();
    for (const row of affected) {
      const bucket = byOrg.get(row.organization_id) ?? {
        changed: [],
        removed: [],
      };
      const name = row.name ?? row.country_slug;
      if (newlyRemoved.includes(row.country_slug)) {
        bucket.removed.push({ name });
      } else {
        const ch = changeBySlug.get(row.country_slug);
        bucket.changed.push({ name, detail: ch ? ch.lines.join(", ") : undefined });
      }
      byOrg.set(row.organization_id, bucket);
    }

    for (const [orgId, { changed: ch, removed: rm }] of byOrg) {
      // In-app: always to admins ∪ configured recipients.
      const userIds = await resolveInAppUserIds(orgId);
      if (userIds.length) {
        const title = "AI regulations updated";
        const message = [
          ...ch.map((i) => i.name),
          ...rm.map((i) => `${i.name} (removed)`),
        ].join(", ");
        for (const uid of userIds) {
          await createNotificationQuery(
            {
              user_id: uid,
              type: NotificationType.REGULATIONS_TRACKER,
              title,
              message,
              entity_type: NotificationEntityType.REGULATION_COUNTRY,
            },
            orgId,
          );
        }
        orgsNotified++;
      }
      // Email: configured recipients only, no fallback.
      const emails = await resolveEmailRecipients(orgId);
      if (emails.length) {
        const html = await renderDigest(ch, rm);
        await sendAutomationEmail(emails, "Global AI regulations — weekly update", html, undefined);
        orgsEmailed++;
      }
    }
  }

  logger.info(
    `[regulations-tracker] done: fetched=${validated.countries.length} changed=${changed.length} removed=${newlyRemoved.length} emailed=${orgsEmailed} notified=${orgsNotified}`,
  );
  return {
    fetched: validated.countries.length,
    changed: changed.length,
    newlyRemoved: newlyRemoved.length,
    orgsEmailed,
    orgsNotified,
  };
}
