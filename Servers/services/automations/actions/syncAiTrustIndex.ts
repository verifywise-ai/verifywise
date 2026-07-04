import { promises as fs } from "fs";
import path from "path";
import { fetchFeed, validateFeed } from "../../../utils/aiTrustIndexFeed";
import {
  getMetaQuery,
  upsertFeedTx,
  getAffectedOrgsBySlugs,
  resolveRecipients,
  currentIsoWeek,
} from "../../../utils/aiTrustIndex.utils";
import { sendAutomationEmail } from "../../emailService";
import { compileMjmlToHtml } from "../../../tools/mjmlCompiler";
import logger from "../../../utils/logger/fileLogger";

const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:5173";
// Deep links surfaced in the digest. The module link lands on Browse (the bare
// /ai-trust-index path redirects there); tracked and settings are direct.
const MODULE_URL = FRONTEND + "/ai-trust-index/browse";
const TRACKED_URL = FRONTEND + "/ai-trust-index/tracked";
const SETTINGS_URL = FRONTEND + "/ai-trust-index/settings";

// Escape HTML metacharacters so a slug can never inject markup into the
// rendered email (defensive — the feed is first-party, but the digest is HTML).
// Exported for unit testing of the HTML-escaping path (no behavioral change).
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A single line in a digest section: the human app name plus optional trailing
// detail describing what changed (e.g. "grade B → C, policy updated"). Falls
// back to the slug when no name resolved.
export interface DigestItem {
  name: string;
  detail?: string;
}

// Build MJML fragments (valid <mj-text> components) injected into the template's {{...}} slots.
// Exported for unit testing of the escaping path (no behavioral change).
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

async function renderDigest(orgChanged: DigestItem[], orgRemoved: DigestItem[]): Promise<string> {
  const tmplPath = path.join(__dirname, "../../../templates/ai-trust-index-digest.mjml");
  const template = await fs.readFile(tmplPath, "utf8");
  return compileMjmlToHtml(template, {
    changedSection: sectionMjml("Changed", orgChanged),
    removedSection: sectionMjml("No longer assessed", orgRemoved),
    moduleUrl: MODULE_URL,
    trackedUrl: TRACKED_URL,
    settingsUrl: SETTINGS_URL,
  });
}

export async function syncAiTrustIndex(deps?: { feed?: unknown }): Promise<{
  fetched: number;
  materialChanged: number;
  newlyRemoved: number;
  orgsEmailed: number;
  skipped?: string;
}> {
  const meta = await getMetaQuery();
  const thisWeek = currentIsoWeek(new Date());
  if (meta.last_run_week === thisWeek) {
    return {
      fetched: 0,
      materialChanged: 0,
      newlyRemoved: 0,
      orgsEmailed: 0,
      skipped: `already ran ${thisWeek}`,
    };
  }

  let raw: unknown;
  try {
    raw = deps?.feed ?? (await fetchFeed());
  } catch (e) {
    logger.error(`[ai-trust-index] feed fetch failed: ${(e as Error).message}`);
    return {
      fetched: 0,
      materialChanged: 0,
      newlyRemoved: 0,
      orgsEmailed: 0,
      skipped: "fetch failed",
    };
  }

  const validated = validateFeed(raw, meta.last_good_count ?? null);
  if (!validated.ok) {
    logger.error(`[ai-trust-index] feed rejected: ${validated.reason}`);
    return {
      fetched: 0,
      materialChanged: 0,
      newlyRemoved: 0,
      orgsEmailed: 0,
      skipped: validated.reason,
    };
  }

  const { materialChanged, newlyRemoved, wasFirstSeed } = await upsertFeedTx(
    validated.apps,
    validated.presentSlugs,
    validated.rawCount,
  );

  if (wasFirstSeed) {
    logger.info(
      `[ai-trust-index] first seed complete (${validated.apps.length} apps); emails suppressed`,
    );
    return {
      fetched: validated.apps.length,
      materialChanged: 0,
      newlyRemoved: 0,
      orgsEmailed: 0,
    };
  }

  // Map each changed slug to its human-readable change summary (e.g. "grade B →
  // C", "policy updated"). These come from upsertFeedTx, which compares the
  // previous and current records using displayedGrade — the governance grade.
  const changeBySlug = new Map(materialChanged.map((m) => [m.slug, m.changes]));
  const changedSlugs = Array.from(
    new Set([...materialChanged.map((m) => m.slug), ...newlyRemoved]),
  );
  let orgsEmailed = 0;
  if (changedSlugs.length) {
    const affected = await getAffectedOrgsBySlugs(changedSlugs);
    const byOrg = new Map<number, { changed: DigestItem[]; removed: DigestItem[] }>();
    for (const row of affected) {
      const bucket = byOrg.get(row.organization_id) ?? { changed: [], removed: [] };
      // Prefer the human name; fall back to the slug if the join found no row.
      const name = row.name ?? row.app_slug;
      if (newlyRemoved.includes(row.app_slug)) {
        bucket.removed.push({ name });
      } else {
        const changes = changeBySlug.get(row.app_slug);
        bucket.changed.push({
          name,
          detail: changes && changes.length ? changes.join(", ") : undefined,
        });
      }
      byOrg.set(row.organization_id, bucket);
    }
    for (const [orgId, { changed, removed }] of byOrg) {
      const recipients = await resolveRecipients(orgId);
      if (!recipients.length) continue;
      const html = await renderDigest(changed, removed);
      await sendAutomationEmail(recipients, "AI Trust Index — weekly update", html, undefined);
      orgsEmailed++;
    }
  }

  logger.info(
    `[ai-trust-index] sync done: fetched=${validated.apps.length} changed=${materialChanged.length} removed=${newlyRemoved.length} orgsEmailed=${orgsEmailed}`,
  );
  return {
    fetched: validated.apps.length,
    materialChanged: materialChanged.length,
    newlyRemoved: newlyRemoved.length,
    orgsEmailed,
  };
}
