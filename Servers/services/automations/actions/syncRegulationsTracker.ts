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
  currentIsoDay,
  escapeHtml,
  getSettings,
  setLastImpactRunAt,
  CountryChange,
} from "../../../utils/regulationsTracker.utils";
import { runImpactAnalysis } from "../../../utils/regulationImpact.utils";
import { getLLMKeysWithKeyQuery } from "../../../utils/llmKey.utils";
import { createNotificationQuery } from "../../../utils/notification.utils";
import {
  NotificationType,
  NotificationEntityType,
} from "../../../domain.layer/interfaces/i.notification";
import { sendAutomationEmail } from "../../emailService";
import { compileMjmlToHtml } from "../../../tools/mjmlCompiler";
import logger from "../../../utils/logger/fileLogger";

const IMPACT_MAX_ANALYSES_PER_RUN = 200;

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

// In-process guard so an admin "check for updates now" can't run concurrently
// with the scheduled daily job (or with another admin trigger). The two would
// otherwise both hit the external feed (~60 detail fetches each) and race on the
// global-feed / run-status writes that sit outside upsertFeedTx's row lock.
let syncInProgress = false;

export async function syncRegulationsTracker(deps?: { feed?: unknown }): Promise<{
  fetched: number;
  changed: number;
  newlyAdded: number;
  newlyRemoved: number;
  orgsEmailed: number;
  orgsNotified: number;
  skipped?: string;
}> {
  if (syncInProgress) {
    logger.info("[regulations-tracker] sync already in progress; skipping concurrent run");
    return {
      fetched: 0,
      changed: 0,
      newlyAdded: 0,
      newlyRemoved: 0,
      orgsEmailed: 0,
      orgsNotified: 0,
      skipped: "already running",
    };
  }
  syncInProgress = true;
  try {
    return await runSync(deps);
  } finally {
    syncInProgress = false;
  }
}

async function runSync(deps?: { feed?: unknown }): Promise<{
  fetched: number;
  changed: number;
  newlyAdded: number;
  newlyRemoved: number;
  orgsEmailed: number;
  orgsNotified: number;
  skipped?: string;
}> {
  const meta = await getMetaQuery();
  // Daily idempotency: the cron fires every morning, but we only fetch + diff
  // once per UTC day. The day key is stored in the legacy last_run_week column.
  const today = currentIsoDay(new Date());
  if (meta.last_run_week === today)
    return {
      fetched: 0,
      changed: 0,
      newlyAdded: 0,
      newlyRemoved: 0,
      orgsEmailed: 0,
      orgsNotified: 0,
      skipped: `already ran ${today}`,
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
      newlyAdded: 0,
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
      newlyAdded: 0,
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
      const d = (await fetchCountryDetail(norm(c.slug))) as {
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
    // Persist the VALID country count as last_good_count, not rawCount. The
    // 50%-drop guard compares the next run's valid count against this watermark,
    // so storing the (larger) raw count would inflate the baseline and could
    // wrongly reject a later, legitimately-smaller-but-valid feed.
    validated.countries.length,
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
      newlyAdded: 0,
      newlyRemoved: 0,
      orgsEmailed: 0,
      orgsNotified: 0,
    };
  }

  const changeBySlug = new Map<string, CountryChange>(changed.map((c) => [c.slug, c]));
  const changedSlugs = Array.from(new Set([...changed.map((c) => c.slug), ...newlyRemoved]));
  let orgsEmailed = 0;
  let orgsNotified = 0;
  let orgsNotifiedNew = 0;

  // The catalogue is already committed by upsertFeedTx (and last_run_week is set,
  // so we won't re-import this week — that's correct, the data landed). But if
  // notification/email dispatch throws, we must NOT leave last_run_status showing
  // the previous "ok": record the failure and rethrow so the job is marked failed
  // and the Settings page reflects that notifications didn't go out.
  try {
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

      let impactAnalysesRun = 0;
      let impactCapLogged = false;

      for (const [orgId, countries] of byOrg) {
        let orgHasKey = false;
        let impactEnabled = true;
        let impactRan = false; // becomes true if at least one impact pass executes this run
        try {
          orgHasKey = (await getLLMKeysWithKeyQuery(orgId)).length > 0;
          const orgSettings = await getSettings(orgId);
          impactEnabled = orgSettings.impact_enabled !== false; // default ON
        } catch {
          orgHasKey = false;
        }

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
            const baseMessage = c.removed
              ? `${c.name} is no longer in the regulations feed.`
              : (c.lines.length
                  ? c.lines.join("; ")
                  : "Regulations were updated — open to see the details.") + multiNote;
            let impactSuffix = "";
            if (!c.removed) {
              if (orgHasKey && impactEnabled) {
                if (impactAnalysesRun >= IMPACT_MAX_ANALYSES_PER_RUN) {
                  if (!impactCapLogged) {
                    logger.warn(
                      `[regulations-tracker] per-run impact cap (${IMPACT_MAX_ANALYSES_PER_RUN}) reached; skipping remaining LLM analyses for this sync`,
                    );
                    impactCapLogged = true;
                  }
                } else {
                  impactRan = true;
                  try {
                    const impact = await runImpactAnalysis(orgId, c.slug);
                    // BUG 5: Only count passes that actually called the LLM. Cache
                    // hits, no_key, and skipped statuses do not consume LLM capacity
                    // and must not burn the per-run cap.
                    if (
                      !impact.cached &&
                      impact.status !== "no_key" &&
                      impact.status !== "skipped_no_candidates"
                    )
                      impactAnalysesRun += 1;
                    if (impact.status === "ok") {
                      const parts: string[] = [];
                      if (impact.counts.system)
                        parts.push(`${impact.counts.system} AI system(s) affected`);
                      if (impact.counts.control)
                        parts.push(`${impact.counts.control} control(s) to review`);
                      if (impact.counts.policy)
                        parts.push(`${impact.counts.policy} policy(ies) may be outdated`);
                      if (impact.counts.vendor)
                        parts.push(`${impact.counts.vendor} vendor(s) impacted`);
                      if (impact.counts.assessment)
                        parts.push(`${impact.counts.assessment} assessment(s) to update`);
                      if (parts.length) impactSuffix = `\n\nImpact: ${parts.join(", ")}.`;
                    }
                  } catch (err) {
                    logger.error(
                      `[regulations-tracker] impact analysis failed for org ${orgId} / ${c.slug}: ${(err as Error).message}`,
                    );
                  }
                } // end cap-else
              } else if (!orgHasKey) {
                // keyless org → nudge to configure a key. A key-having org that toggled
                // impact OFF (impactEnabled === false) gets NEITHER panel NOR nudge — they chose.
                impactSuffix =
                  "\n\nConfigure an LLM key to see which of your AI systems, controls and vendors this affects.";
              }
            }
            const message = `${baseMessage}${impactSuffix}`;
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
          await sendAutomationEmail(
            emails,
            "Global AI regulations — update",
            html,
            undefined,
          );
          orgsEmailed++;
        }
        if (impactRan) {
          try {
            await setLastImpactRunAt(orgId);
          } catch {
            /* best-effort */
          }
        }
      }
    }

    // New countries appeared in the feed. They aren't tracked by anyone yet, so
    // notify each org's admins (in-app only) so they can decide whether to track.
    if (newlyAdded.length) {
      // Resolve display names from the validated feed (slug -> name).
      const feedName = new Map(
        validated.countries.map((c) => [c.slug.trim().toLowerCase(), c.name]),
      );
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
  } catch (e) {
    // Notifications/emails failed after the catalogue was committed. Surface the
    // failure on the run status and rethrow so BullMQ marks the job failed.
    logger.error(`[regulations-tracker] notification dispatch failed: ${(e as Error).message}`);
    await recordRunStatus(`error: notifications failed: ${(e as Error).message}`).catch(
      () => undefined,
    );
    throw e;
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
    newlyAdded: newlyAdded.length,
    newlyRemoved: newlyRemoved.length,
    orgsEmailed,
    orgsNotified,
  };
}
