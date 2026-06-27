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
  recordRunStatus,
  getAffectedOrgsBySlugs,
  getAllOrgAdmins,
  resolveEmailRecipients,
  resolveInAppUserIds,
  currentIsoWeek,
  escapeHtml,
  CountryChange,
} from "../../../utils/regulationsTracker.utils";
import { createNotificationQuery } from "../../../utils/notification.utils";
import {
  NotificationType,
  NotificationEntityType,
} from "../../../domain.layer/interfaces/i.notification";
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
    await recordRunStatus("fetch failed").catch(() => undefined);
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
    await recordRunStatus(`rejected: ${validated.reason}`).catch(() => undefined);
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

  const { changed, newlyAdded, newlyRemoved, wasFirstSeed } = await upsertFeedTx(
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
    await recordRunStatus(`ok: first seed (${validated.countries.length})`).catch(() => undefined);
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
    // Per-org buckets carry each affected country's slug + name + (for changed
    // countries) the human change lines, so we can both build the email digest
    // and emit one deep-linked in-app notification per country.
    interface OrgCountry {
      slug: string;
      name: string;
      removed: boolean;
      lines: string[];
      changeCount: number;
      changeDates: string[];
    }
    const byOrg = new Map<number, OrgCountry[]>();
    for (const row of affected) {
      const list = byOrg.get(row.organization_id) ?? [];
      const name = row.name ?? row.country_slug;
      const removed = newlyRemoved.includes(row.country_slug);
      const ch = changeBySlug.get(row.country_slug);
      list.push({
        slug: row.country_slug,
        name,
        removed,
        lines: ch?.lines ?? [],
        changeCount: ch?.changeCount ?? 1,
        changeDates: ch?.changeDates ?? [],
      });
      byOrg.set(row.organization_id, list);
    }

    for (const [orgId, countries] of byOrg) {
      const changedItems: DigestItem[] = countries
        .filter((c) => !c.removed)
        .map((c) => ({ name: c.name, detail: c.lines.length ? c.lines.join(", ") : undefined }));
      const removedItems: DigestItem[] = countries
        .filter((c) => c.removed)
        .map((c) => ({ name: c.name }));

      // In-app: always to admins ∪ configured recipients. One deep-linked
      // notification per affected country so the message names what changed and
      // links straight to that country's page.
      const userIds = await resolveInAppUserIds(orgId);
      if (userIds.length) {
        for (const c of countries) {
          const title = c.removed
            ? `${c.name} removed from the regulations feed`
            : `AI regulations updated: ${c.name}`;
          // When a country changed more than once since our last check, the feed
          // only carries the latest change's detail — note the count + dates so
          // the user knows to review the full history at the source.
          const multiNote =
            !c.removed && c.changeCount > 1
              ? ` (changed ${c.changeCount} times since last check${
                  c.changeDates.length ? `: ${c.changeDates.join(", ")}` : ""
                }; showing the latest)`
              : "";
          const message = c.removed
            ? `${c.name} is no longer in the regulations feed.`
            : (c.lines.length
                ? c.lines.join("; ")
                : "Regulations were updated — open to see the details.") + multiNote;
          for (const uid of userIds) {
            await createNotificationQuery(
              {
                user_id: uid,
                type: NotificationType.REGULATIONS_TRACKER,
                title,
                message,
                entity_type: NotificationEntityType.REGULATION_COUNTRY,
                entity_name: c.name,
                action_url: `/regulations-tracker/${c.slug}`,
              },
              orgId,
            );
          }
        }
        orgsNotified++;
      }
      // Email: configured recipients only, no fallback.
      const emails = await resolveEmailRecipients(orgId);
      if (emails.length) {
        const html = await renderDigest(changedItems, removedItems);
        await sendAutomationEmail(emails, "Global AI regulations — weekly update", html, undefined);
        orgsEmailed++;
      }
    }
  }

  // New countries appeared in the feed. They aren't tracked by anyone yet, so
  // notify each org's admins (in-app only) so they can decide whether to track.
  let orgsNotifiedNew = 0;
  if (newlyAdded.length) {
    // Resolve display names from the validated feed (slug -> name).
    const feedName = new Map(validated.countries.map((c) => [c.slug.trim().toLowerCase(), c.name]));
    const addedNames = newlyAdded.map((s) => feedName.get(s) ?? s);
    const admins = await getAllOrgAdmins();
    const byOrgAdmins = new Map<number, number[]>();
    for (const a of admins) {
      const arr = byOrgAdmins.get(a.organization_id) ?? [];
      arr.push(a.user_id);
      byOrgAdmins.set(a.organization_id, arr);
    }
    const title =
      newlyAdded.length === 1
        ? `New jurisdiction added: ${addedNames[0]}`
        : `${newlyAdded.length} new jurisdictions added`;
    const message =
      newlyAdded.length === 1
        ? `${addedNames[0]} was added to the regulations catalogue. Track it to monitor its AI regulations.`
        : `Added: ${addedNames.join(", ")}. Track the ones relevant to your organization.`;
    const actionUrl =
      newlyAdded.length === 1
        ? `/regulations-tracker/${newlyAdded[0]}`
        : "/regulations-tracker/browse";
    for (const [orgId, userIds] of byOrgAdmins) {
      for (const uid of userIds) {
        await createNotificationQuery(
          {
            user_id: uid,
            type: NotificationType.REGULATIONS_TRACKER,
            title,
            message,
            entity_type: NotificationEntityType.REGULATION_COUNTRY,
            action_url: actionUrl,
          },
          orgId,
        );
      }
      orgsNotifiedNew++;
    }
  }

  logger.info(
    `[regulations-tracker] done: fetched=${validated.countries.length} added=${newlyAdded.length} changed=${changed.length} removed=${newlyRemoved.length} emailed=${orgsEmailed} notified=${orgsNotified} newCountryOrgs=${orgsNotifiedNew}`,
  );
  await recordRunStatus(`ok: ${changed.length} changed, ${newlyRemoved.length} removed`).catch(
    () => undefined,
  );
  return {
    fetched: validated.countries.length,
    changed: changed.length,
    newlyRemoved: newlyRemoved.length,
    orgsEmailed,
    orgsNotified,
  };
}
