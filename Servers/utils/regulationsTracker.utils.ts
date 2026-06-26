import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import logger from "./logger/fileLogger";
import { IManifestCountry, RegulationChange } from "../domain.layer/interfaces/i.regulationsTracker";

export function renderChangeLine(c: RegulationChange): string {
  switch (c.field) {
    case "regulation.status":
      return `${c.regulation}: status ${c.from} → ${c.to}`;
    case "regulation.effectiveDate":
      return `${c.regulation}: effective date ${c.from} → ${c.to}`;
    case "regulation":
      return c.change === "added" ? `Added: ${c.value}` : `Removed: ${c.value}`;
    case "regulationCount":
      return `Regulation count ${c.from} → ${c.to}`;
    default:
      return JSON.stringify(c);
  }
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ISO-8601 week, e.g. "2026-W26". Matches the AI Trust Index week-idempotency key.
export function currentIsoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normalizeSlug(s: string): string {
  return String(s).trim().toLowerCase();
}

export async function getMetaQuery(): Promise<{
  seeded_at: Date | null;
  last_good_count: number | null;
  last_run_week: string | null;
}> {
  const rows = (await sequelize.query(
    `SELECT seeded_at, last_good_count, last_run_week FROM regulation_tracker_meta WHERE id = 1;`,
    { type: QueryTypes.SELECT },
  )) as any[];
  return rows[0] ?? { seeded_at: null, last_good_count: null, last_run_week: null };
}

export interface CountryChange {
  slug: string;
  name: string;
  lines: string[];
  unstructured: boolean;
}

export async function upsertFeedTx(
  countries: IManifestCountry[],
  presentSlugs?: string[],
  rawCount?: number,
): Promise<{ changed: CountryChange[]; newlyRemoved: string[]; wasFirstSeed: boolean }> {
  if (!countries.length) return { changed: [], newlyRemoved: [], wasFirstSeed: false };

  const changed: CountryChange[] = [];
  const newlyRemoved: string[] = [];
  let wasFirstSeed = false;

  await sequelize.transaction(async (transaction) => {
    const metaRows = (await sequelize.query(
      `SELECT seeded_at FROM regulation_tracker_meta WHERE id = 1 FOR UPDATE;`,
      { type: QueryTypes.SELECT, transaction },
    )) as any[];
    wasFirstSeed = !metaRows[0]?.seeded_at;

    const upsertedSlugs: string[] = [];
    for (const c of countries) {
      const slug = normalizeSlug(c.slug);
      upsertedSlugs.push(slug);
      const existing = (await sequelize.query(
        `SELECT hash FROM regulation_countries WHERE slug = :slug;`,
        { replacements: { slug }, type: QueryTypes.SELECT, transaction },
      )) as any[];

      if (existing.length) {
        const hashMoved = existing[0].hash !== c.hash;
        if (hashMoved) {
          const lc = c.history?.lastChange ?? null;
          const lines = (lc?.changes ?? []).map(renderChangeLine);
          changed.push({
            slug,
            name: c.name,
            lines: lines.length ? lines : ["Updated — see source"],
            unstructured: lines.length === 0,
          });
        }
        await sequelize.query(
          `UPDATE regulation_countries SET
             name = :name, region = :region, regulation_count = :rc,
             data = :data::jsonb, hash = :hash, is_active = TRUE, removed_at = NULL,
             last_fetched_at = NOW() ${hashMoved ? ", last_changed_at = NOW()" : ""}
           WHERE slug = :slug;`,
          {
            replacements: {
              slug, name: c.name, region: c.region ?? null,
              rc: c.regulationCount ?? null, data: JSON.stringify(c), hash: c.hash,
            },
            transaction,
          },
        );
      } else {
        await sequelize.query(
          `INSERT INTO regulation_countries
             (slug, name, region, regulation_count, data, hash, is_active, last_changed_at, last_fetched_at)
           VALUES (:slug, :name, :region, :rc, :data::jsonb, :hash, TRUE, NOW(), NOW());`,
          {
            replacements: {
              slug, name: c.name, region: c.region ?? null,
              rc: c.regulationCount ?? null, data: JSON.stringify(c), hash: c.hash,
            },
            transaction,
          },
        );
      }
    }

    const seenSlugs = Array.from(
      new Set([...upsertedSlugs, ...(presentSlugs ?? []).map(normalizeSlug)]),
    );
    const removedRows = (await sequelize.query(
      `UPDATE regulation_countries
         SET is_active = FALSE, removed_at = NOW()
       WHERE is_active = TRUE AND slug <> ALL(ARRAY[:seen]::varchar[])
       RETURNING slug;`,
      { replacements: { seen: seenSlugs }, type: QueryTypes.SELECT, transaction },
    )) as any[];
    for (const r of removedRows) newlyRemoved.push(r.slug);

    await sequelize.query(
      `UPDATE regulation_tracker_meta
         SET last_good_count = :count, last_run_week = :week
             ${wasFirstSeed ? ", seeded_at = NOW()" : ""}
       WHERE id = 1;`,
      { replacements: { count: rawCount ?? countries.length, week: currentIsoWeek(new Date()) }, transaction },
    );
  });

  logger.info(`[regulationsTracker] upsertFeedTx complete: changed=${changed.length}, removed=${newlyRemoved.length}, firstSeed=${wasFirstSeed}`);

  return { changed, newlyRemoved, wasFirstSeed };
}
