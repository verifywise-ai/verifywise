import { promises as fs } from "fs";
import path from "path";
import { fetchFeed, validateFeed } from "../../../utils/aiTrustIndexFeed";
import {
  getMetaQuery,
  upsertFeedTx,
  getAffectedOrgsBySlugs,
  resolveRecipients,
  currentIsoWeek,
  type MaterialDiff,
} from "../../../utils/aiTrustIndex.utils";
import { sendAutomationEmail } from "../../emailService";
import { compileMjmlToHtml } from "../../../tools/mjmlCompiler";
import { emailColorTokens } from "../../../tools/emailColors";
import logger from "../../../utils/logger/fileLogger";
import { escapeHtml } from "../../../utils/sanitization.utils";

const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:5173";
// Deep links surfaced in the digest. The module link lands on Browse (the bare
// /ai-trust-index path redirects there); tracked and settings are direct.
const MODULE_URL = FRONTEND + "/ai-trust-index/browse";
const TRACKED_URL = FRONTEND + "/ai-trust-index/tracked";
const SETTINGS_URL = FRONTEND + "/ai-trust-index/settings";

// A single row in a digest section: the human app name (falls back to the slug
// when no name resolved) and, for changed apps, what moved. Removed apps carry
// no diff.
export interface DigestItem {
  name: string;
  diff?: MaterialDiff;
}

const TEXT = emailColorTokens.colorTextPrimary;
const MUTED = emailColorTokens.colorTextIcon;
const WORSE = emailColorTokens.colorErrorText;
const BETTER = emailColorTokens.colorSuccessText;
const DIVIDER = `1px solid ${emailColorTokens.colorBorderLight}`;
// Outlook and some other clients do not pass the template's font into a table.
// Keep in step with <mj-all font-family> in templates/ai-trust-index-digest.mjml.
const FONT =
  "Geist, Inter, system-ui, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";
const GRADE_ORDER = "ABCDF";

// Positive when the grade got worse, negative when better, 0 when unknown.
function gradeTrend(diff?: MaterialDiff): number {
  if (!diff || diff.grade.from === null) return 0;
  const a = GRADE_ORDER.indexOf(diff.grade.from.charAt(0).toUpperCase());
  const b = GRADE_ORDER.indexOf(diff.grade.to.charAt(0).toUpperCase());
  return a < 0 || b < 0 ? 0 : b - a;
}

// Scores and deltas are shown to one decimal so a fractional feed score never
// prints a float tail.
const round1 = (n: number) => Math.round(n * 10) / 10;

function scoreDelta(diff?: MaterialDiff): number {
  if (!diff || diff.score.from === null || diff.score.to === null) return 0;
  return round1(round1(diff.score.to) - round1(diff.score.from));
}

// "B → F" with the new value coloured by direction, or just the value when it
// did not change.
function transitionHtml(from: string | null, to: string, trend: number): string {
  if (from === null || from === to) return `<span style="color: ${TEXT};">${escapeHtml(to)}</span>`;
  const colour = trend > 0 ? WORSE : trend < 0 ? BETTER : TEXT;
  return `<span style="color: ${MUTED};">${escapeHtml(from)} →</span> <span style="color: ${colour}; font-weight: 600;">${escapeHtml(to)}</span>`;
}

function scoreHtml(diff: MaterialDiff): string {
  const { from, to } = diff.score;
  if (to === null) return `<span style="color: ${MUTED};">—</span>`;
  const delta = scoreDelta(diff);
  const cell = transitionHtml(
    from === null ? null : String(round1(from)),
    String(round1(to)),
    -delta,
  );
  if (!delta) return cell;
  const sign = delta > 0 ? "+" : "−";
  return `${cell}<br><span style="color: ${delta > 0 ? BETTER : WORSE}; font-size: 12px;">${sign}${Math.abs(delta)}</span>`;
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const cellStyle = (extra = "") =>
  `padding: 10px 12px 10px 0; border-top: ${DIVIDER}; vertical-align: top; text-align: left;${extra}`;
const headStyle = (extra = "") =>
  `padding: 0 12px 8px 0; color: ${MUTED}; font-size: 12px; font-weight: 500; text-align: left;${extra}`;

function appCellHtml(item: DigestItem): string {
  const name = `<span style="color: ${TEXT}; font-weight: 500;">${escapeHtml(item.name)}</span>`;
  const notes = item.diff?.notes.length
    ? `<br><span style="color: ${MUTED}; font-size: 13px;">${escapeHtml(item.diff.notes.map(sentenceCase).join(" · "))}</span>`
    : "";
  return `<td style="${cellStyle()}">${name}${notes}</td>`;
}

function sectionTitleHtml(title: string): string {
  return `<p style="color: ${TEXT}; font-size: 15px; font-weight: 600; margin: 8px 0 12px 0;">${escapeHtml(title)}</p>`;
}

function tableHtml(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 0 0 24px 0; font-family: ${FONT}; font-size: 14px; line-height: 20px; color: ${TEXT};">${inner}</table>`;
}

// The digest sections are HTML tables injected into {{...}} slots inside the
// template's <mj-text>, so they must be plain HTML: <mj-*> tags nested in
// <mj-text> do not render as blocks and the rows run together. Exported for
// unit testing.

// Changed apps: App / Grade / Score, worst grade change first, then biggest
// score drop. An app whose diff did not resolve still fills all three columns.
export function changedSectionHtml(items: DigestItem[]): string {
  if (!items.length) return "";
  const ordered = [...items].sort(
    (a, b) => gradeTrend(b.diff) - gradeTrend(a.diff) || scoreDelta(a.diff) - scoreDelta(b.diff),
  );
  const gradeStyle = cellStyle(" white-space: nowrap;");
  const scoreStyle = cellStyle(" white-space: nowrap; padding-right: 0;");
  const rows = ordered
    .map((it) => {
      const gradeCell = it.diff
        ? transitionHtml(it.diff.grade.from, it.diff.grade.to, gradeTrend(it.diff))
        : "";
      const scoreCell = it.diff ? scoreHtml(it.diff) : "";
      return (
        `<tr>${appCellHtml(it)}` +
        `<td style="${gradeStyle}">${gradeCell}</td>` +
        `<td style="${scoreStyle}">${scoreCell}</td></tr>`
      );
    })
    .join("");
  const head =
    `<tr><th style="${headStyle()}">App</th>` +
    `<th style="${headStyle(" width: 64px;")}">Grade</th>` +
    `<th style="${headStyle(" width: 88px; padding-right: 0;")}">Score</th></tr>`;
  return sectionTitleHtml("Changed") + tableHtml(head + rows);
}

// Apps no longer assessed: one name per row, no columns.
export function removedSectionHtml(items: DigestItem[]): string {
  if (!items.length) return "";
  const rows = items.map((it) => `<tr>${appCellHtml(it)}</tr>`).join("");
  return sectionTitleHtml("No longer assessed") + tableHtml(rows);
}

async function renderDigest(orgChanged: DigestItem[], orgRemoved: DigestItem[]): Promise<string> {
  const tmplPath = path.join(__dirname, "../../../templates/ai-trust-index-digest.mjml");
  const template = await fs.readFile(tmplPath, "utf8");
  return compileMjmlToHtml(template, {
    changedSectionHtml: changedSectionHtml(orgChanged),
    removedSectionHtml: removedSectionHtml(orgRemoved),
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

  // Map each changed slug to what moved (grade, score, notes). These come from
  // upsertFeedTx, which compares the previous and current records using
  // displayedGrade — the governance grade.
  const diffBySlug = new Map(materialChanged.map((m) => [m.slug, m.diff]));
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
        bucket.changed.push({ name, diff: diffBySlug.get(row.app_slug) });
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
