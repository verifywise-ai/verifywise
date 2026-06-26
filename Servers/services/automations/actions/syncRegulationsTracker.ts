import { promises as fs } from "fs";
import path from "path";
import { fetchManifest, validateManifest } from "../../../utils/regulationsTrackerFeed";
import {
  getMetaQuery,
  upsertFeedTx,
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

  const { changed, newlyRemoved, wasFirstSeed } = await upsertFeedTx(
    validated.countries,
    validated.presentSlugs,
    validated.rawCount,
  );

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
              // "regulations_tracker" is a new type not yet in the enum;
              // cast through unknown so the enum can be extended later without
              // a breaking change to this job.
              type: "regulations_tracker" as unknown as NotificationType,
              title,
              message,
              // "regulation_country" is a new entity type; same cast pattern.
              entity_type: "regulation_country" as unknown as NotificationEntityType,
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
