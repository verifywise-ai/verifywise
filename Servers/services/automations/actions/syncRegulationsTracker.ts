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
import { runImpactAnalysis, ImpactResult } from "../../../utils/regulationImpact.utils";
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

// Per-run tally of impact-analysis outcomes, for the feed-quality / value
// telemetry logged at the end of a sync. See the call sites in run().
export interface ImpactOutcomeTally {
  ok: number;
  skipped_no_candidates: number;
  error: number;
  no_key: number;
  cached: number;
}

/**
 * Classify one runImpactAnalysis result into the tally. A cached `ok` is
 * recorded as `cached` (reused analysis), not as a fresh `ok`, so the two
 * signals stay distinct. Unknown statuses fall into `error` so nothing is
 * silently dropped.
 */
export function tallyImpact(
  tally: ImpactOutcomeTally,
  impact: { status: string; cached: boolean },
): void {
  if (impact.cached) {
    tally.cached += 1;
    return;
  }
  switch (impact.status) {
    case "ok":
      tally.ok += 1;
      break;
    case "skipped_no_candidates":
      tally.skipped_no_candidates += 1;
      break;
    case "no_key":
      tally.no_key += 1;
      break;
    default:
      tally.error += 1;
  }
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

// One country's impact analysis, prepared for the email digest. `result` is the
// full ImpactResult (per-entity name + reason), not just counts — the email has
// the room the cramped in-app notification does not.
export interface ImpactDigestItem {
  countryName: string;
  result: ImpactResult;
}

// Renders the "How these changes affect your organization" block: per country,
// each affected entity group (systems / controls / policies / vendors /
// assessments) with the specific item names and the LLM's one-line reason. Only
// groups with at least one affected entity are shown.
export function impactSectionMjml(items: ImpactDigestItem[]): string {
  const GROUPS: { key: keyof Omit<ImpactResult, "generatedAt">; label: string }[] = [
    { key: "systems", label: "AI systems" },
    { key: "controls", label: "Controls to review" },
    { key: "policies", label: "Policies that may be outdated" },
    { key: "vendors", label: "Vendors impacted" },
    { key: "assessments", label: "Assessments to update" },
  ];

  const blocks = items
    .map(({ countryName, result }) => {
      const groupMjml = GROUPS.map(({ key, label }) => {
        const entities = result[key];
        if (!entities.length) return "";
        const groupHeader = `<mj-text font-size="13px" font-weight="600" color="#344054" padding-bottom="2px">${escapeHtml(
          label,
        )} (${entities.length})</mj-text>`;
        const rows = entities
          .map(
            (e) =>
              `<mj-text font-size="13px" color="#475467" padding-top="0" padding-bottom="2px">• <strong>${escapeHtml(
                e.name,
              )}</strong> — ${escapeHtml(e.why)}</mj-text>`,
          )
          .join("");
        return groupHeader + rows;
      }).join("");

      if (!groupMjml) return ""; // nothing affected for this country
      const countryHeader = `<mj-text font-size="14px" font-weight="600" color="#13715B" padding-top="12px">${escapeHtml(
        countryName,
      )}</mj-text>`;
      return countryHeader + groupMjml;
    })
    .filter(Boolean)
    .join("");

  if (!blocks) return "";

  return (
    `<mj-divider border-width="1px" border-color="#eaecf0" padding="16px 0 8px 0" />` +
    `<mj-text font-size="15px" font-weight="600" color="#101828">How these changes affect your organization</mj-text>` +
    `<mj-text font-size="12px" color="#98a2b3" padding-top="0" padding-bottom="4px">Based on your AI systems, controls, policies, vendors and assessments. Generated automatically — review before acting.</mj-text>` +
    blocks
  );
}

async function renderDigest(
  changed: DigestItem[],
  removed: DigestItem[],
  impact: ImpactDigestItem[] = [],
): Promise<string> {
  const tmplPath = path.join(__dirname, "../../../templates/regulations-tracker-digest.mjml");
  const template = await fs.readFile(tmplPath, "utf8");
  return compileMjmlToHtml(template, {
    changedSection: sectionMjml("Changed", changed),
    removedSection: sectionMjml("No longer in the feed", removed),
    impactSection: impactSectionMjml(impact),
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

  // Feed-quality signal: a "changed" country is only actionable for impact
  // analysis when the feed gives us a structured per-field diff (status /
  // effective-date / regulation added-or-removed). When `unstructured` is true
  // the hash moved but the feed carried no field-level changes, so the LLM is
  // told "(no structured diff available)" and its verdicts degrade to generic.
  // Tracking the split over time tells us whether the enriched email is
  // delivering change-specific value or just "something changed" noise.
  const structuredChanges = changed.filter((c) => !c.unstructured).length;
  const unstructuredChanges = changed.length - structuredChanges;
  if (changed.length) {
    logger.info(
      `[regulations-tracker] feed diff quality: ${structuredChanges}/${changed.length} changed countries had a structured field-level diff, ${unstructuredChanges} were hash-only (no structured diff)`,
    );
    if (unstructuredChanges) {
      logger.warn(
        `[regulations-tracker] ${unstructuredChanges} changed countr${
          unstructuredChanges === 1 ? "y" : "ies"
        } had no structured diff this run: ${changed
          .filter((c) => c.unstructured)
          .map((c) => c.slug)
          .join(", ")} — impact analysis for these will be generic`,
      );
    }
  }

  // Impact-run outcome tally across every org/country pass this run. Lets us
  // measure, in production, how often the LLM pass actually produced a verdict
  // ("ok") versus had nothing to judge ("skipped_no_candidates"), failed
  // ("error"), or was gated out ("no_key"). Cache hits are counted separately
  // since they reflect reused, not freshly-generated, analysis.
  const impactOutcomes = {
    ok: 0,
    skipped_no_candidates: 0,
    error: 0,
    no_key: 0,
    cached: 0,
  };

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
        // True when the feed moved the country's hash but carried no structured
        // field-level diff. Impact analysis is skipped for these: with no diff
        // to judge, the LLM would only produce a generic verdict, so we don't
        // run it, don't show an impact block, and don't burn LLM capacity.
        unstructured: boolean;
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
          unstructured: ch?.unstructured ?? false,
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

        // Per-country impact results captured during analysis below, for the
        // email digest (the verbose, roomy surface). Keyed by slug so a country
        // analyzed for in-app notifications is reused for the email too.
        const impactBySlug = new Map<string, ImpactResult>();

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
              if (orgHasKey && impactEnabled && !c.unstructured) {
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
                    tallyImpact(impactOutcomes, impact);
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
                      if (impact.result) impactBySlug.set(c.slug, impact.result);
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
              } else if (!orgHasKey && !c.unstructured) {
                // Keyless org with a structured change → nudge to configure a key,
                // since a key would have produced a real impact panel here. A
                // key-having org that toggled impact OFF (impactEnabled === false)
                // gets NEITHER panel NOR nudge — they chose. An unstructured change
                // gets no nudge either: even with a key there'd be nothing to show.
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
          // Email-only orgs (no in-app recipients) never entered the loop above,
          // so impactBySlug may be empty even though a key is configured. Backfill
          // impact for changed countries we haven't analyzed yet, honoring the
          // same key/enabled gate and per-run LLM cap.
          if (orgHasKey && impactEnabled) {
            for (const c of countries) {
              // Skip removed, already-analyzed, and unstructured changes — the
              // last has no diff to judge, so we don't run the LLM or show a
              // panel (mirrors the in-app gate above).
              if (c.removed || c.unstructured || impactBySlug.has(c.slug)) continue;
              if (impactAnalysesRun >= IMPACT_MAX_ANALYSES_PER_RUN) {
                if (!impactCapLogged) {
                  logger.warn(
                    `[regulations-tracker] per-run impact cap (${IMPACT_MAX_ANALYSES_PER_RUN}) reached; skipping remaining LLM analyses for this sync`,
                  );
                  impactCapLogged = true;
                }
                break;
              }
              impactRan = true;
              try {
                const impact = await runImpactAnalysis(orgId, c.slug);
                tallyImpact(impactOutcomes, impact);
                if (
                  !impact.cached &&
                  impact.status !== "no_key" &&
                  impact.status !== "skipped_no_candidates"
                )
                  impactAnalysesRun += 1;
                if (impact.status === "ok" && impact.result) impactBySlug.set(c.slug, impact.result);
              } catch (err) {
                logger.error(
                  `[regulations-tracker] impact analysis failed for org ${orgId} / ${c.slug}: ${(err as Error).message}`,
                );
              }
            }
          }

          // Build the per-country impact section for the email (verbose surface).
          const impactItems: ImpactDigestItem[] = countries
            .filter((c) => !c.removed && impactBySlug.has(c.slug))
            .map((c) => ({ countryName: c.name, result: impactBySlug.get(c.slug)! }));

          const html = await renderDigest(changedItems, removedItems, impactItems);
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
  if (changed.length) {
    logger.info(
      `[regulations-tracker] value telemetry: feedDiff structured=${structuredChanges} unstructured=${unstructuredChanges} | impact ok=${impactOutcomes.ok} skippedNoCandidates=${impactOutcomes.skipped_no_candidates} error=${impactOutcomes.error} noKey=${impactOutcomes.no_key} cached=${impactOutcomes.cached}`,
    );
  }
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
