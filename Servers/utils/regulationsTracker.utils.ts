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

// Returns a map of normalized slug -> stored hash for the given slugs. Used by
// the weekly sync to decide which countries' full detail needs re-fetching
// (new or hash-changed) before upserting.
export async function getStoredHashes(slugs: string[]): Promise<Map<string, string>> {
  if (!slugs.length) return new Map();
  const normalized = slugs.map(normalizeSlug);
  const rows = (await sequelize.query(
    `SELECT slug, hash FROM regulation_countries WHERE slug = ANY(ARRAY[:slugs]::varchar[]);`,
    { replacements: { slugs: normalized }, type: QueryTypes.SELECT },
  )) as { slug: string; hash: string }[];
  return new Map(rows.map((r) => [r.slug, r.hash]));
}

export async function upsertFeedTx(
  countries: IManifestCountry[],
  presentSlugs?: string[],
  rawCount?: number,
  // Optional full per-country detail (regulations/timeline/meta), keyed by
  // normalized slug. When present for a slug, the row's `data` stores the full
  // detail so the detail page renders complete content from our DB; otherwise it
  // falls back to the manifest summary entry. Lets a fresh install / sync mirror
  // the website's full data instead of summary-only.
  detailBySlug?: Map<string, unknown>,
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

    // Prefetch all existing slugs + hashes in a single query to avoid N+1 SELECTs.
    const normalizedSlugs = countries.map((c) => normalizeSlug(c.slug));
    const prefetchRows = (await sequelize.query(
      `SELECT slug, hash FROM regulation_countries WHERE slug = ANY(ARRAY[:slugs]::varchar[]);`,
      { replacements: { slugs: normalizedSlugs }, type: QueryTypes.SELECT, transaction },
    )) as { slug: string; hash: string }[];
    const existingMap = new Map<string, string>(prefetchRows.map((r) => [r.slug, r.hash]));

    const upsertedSlugs: string[] = [];
    for (const c of countries) {
      const slug = normalizeSlug(c.slug);
      upsertedSlugs.push(slug);
      const existingHash = existingMap.get(slug);
      // Prefer the full detail object (regulations/timeline/meta) when the caller
      // supplied it; otherwise store the manifest summary entry.
      const storedData = detailBySlug?.get(slug) ?? c;

      if (existingHash !== undefined) {
        const hashMoved = existingHash !== c.hash;
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
              rc: c.regulationCount ?? null, data: JSON.stringify(storedData), hash: c.hash,
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
              rc: c.regulationCount ?? null, data: JSON.stringify(storedData), hash: c.hash,
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

// ---------------------------------------------------------------------------
// CRUD: country catalogue
// ---------------------------------------------------------------------------

export async function listCountries(organizationId: number, filters: { region?: string; q?: string } = {}) {
  const where: string[] = ["c.is_active = TRUE"];
  const repl: Record<string, unknown> = { organizationId };
  if (filters.region) {
    where.push("c.region = :region");
    repl.region = filters.region;
  }
  if (filters.q) {
    where.push("c.name ILIKE :q");
    repl.q = `%${filters.q}%`;
  }
  return sequelize.query(
    `SELECT c.slug, c.name, c.region, c.regulation_count, c.hash, c.last_changed_at,
            c.data->>'flag' AS flag,
            (t.id IS NOT NULL) AS is_tracked
     FROM regulation_countries c
     LEFT JOIN regulation_tracked_countries t
       ON t.country_slug = c.slug AND t.organization_id = :organizationId
     WHERE ${where.join(" AND ")} ORDER BY c.name ASC;`,
    { replacements: repl, type: QueryTypes.SELECT },
  );
}

export async function getCountryRow(slug: string, organizationId: number) {
  const rows = (await sequelize.query(
    `SELECT c.slug, c.name, c.region, c.regulation_count, c.data, c.hash, c.is_active, c.last_changed_at,
            (t.id IS NOT NULL) AS is_tracked
     FROM regulation_countries c
     LEFT JOIN regulation_tracked_countries t
       ON t.country_slug = c.slug AND t.organization_id = :organizationId
     WHERE c.slug = :slug;`,
    { replacements: { slug: normalizeSlug(slug), organizationId }, type: QueryTypes.SELECT },
  )) as any[];
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// CRUD: tracked countries (per-org)
// ---------------------------------------------------------------------------

export async function listTracked(organizationId: number) {
  return sequelize.query(
    `SELECT t.country_slug, t.country_slug AS slug, t.created_at,
            c.name, c.region, c.regulation_count, c.is_active, c.last_changed_at,
            c.data->>'flag' AS flag
     FROM regulation_tracked_countries t
     LEFT JOIN regulation_countries c ON c.slug = t.country_slug
     WHERE t.organization_id = :organizationId ORDER BY c.name ASC;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  );
}

export async function trackCountry(organizationId: number, slug: string, userId: number) {
  await sequelize.query(
    `INSERT INTO regulation_tracked_countries (organization_id, country_slug, tracked_by, created_at)
     VALUES (:organizationId, :slug, :userId, NOW())
     ON CONFLICT (organization_id, country_slug) DO NOTHING;`,
    { replacements: { organizationId, slug: normalizeSlug(slug), userId } },
  );
  return { tracked: true };
}

export async function trackCountriesBulk(organizationId: number, slugs: string[], userId: number) {
  for (const s of slugs) await trackCountry(organizationId, s, userId);
  return { tracked: slugs.length };
}

export async function untrackCountry(organizationId: number, slug: string) {
  await sequelize.query(
    `DELETE FROM regulation_tracked_countries
     WHERE organization_id = :organizationId AND country_slug = :slug;`,
    { replacements: { organizationId, slug: normalizeSlug(slug) } },
  );
  return { untracked: true };
}

// ---------------------------------------------------------------------------
// CRUD: notification settings (per-org)
// ---------------------------------------------------------------------------

export async function getSettings(organizationId: number) {
  const rows = (await sequelize.query(
    `SELECT recipient_user_ids, recipient_emails, updated_by, updated_at
     FROM regulation_tracker_settings WHERE organization_id = :organizationId;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as { recipient_user_ids: number[] | null; recipient_emails: string[] | null; updated_by: number | null; updated_at: Date | null }[];
  return rows[0] ?? { recipient_user_ids: [], recipient_emails: [], updated_by: null, updated_at: null };
}

export async function upsertSettings(
  organizationId: number,
  userIds: number[],
  emails: string[],
  userId: number,
) {
  await sequelize.query(
    `INSERT INTO regulation_tracker_settings
       (organization_id, recipient_user_ids, recipient_emails, updated_by, updated_at)
     VALUES (:organizationId, :userIds::jsonb, :emails::jsonb, :userId, NOW())
     ON CONFLICT (organization_id) DO UPDATE SET
       recipient_user_ids = :userIds::jsonb, recipient_emails = :emails::jsonb,
       updated_by = :userId, updated_at = NOW();`,
    {
      replacements: {
        organizationId,
        userId,
        userIds: JSON.stringify(userIds ?? []),
        emails: JSON.stringify(emails ?? []),
      },
    },
  );
  return getSettings(organizationId);
}

// ---------------------------------------------------------------------------
// Query: orgs tracking any of the given slugs (used by the weekly job)
// ---------------------------------------------------------------------------

export async function getAffectedOrgsBySlugs(
  slugs: string[],
): Promise<{ organization_id: number; country_slug: string; name: string | null }[]> {
  if (!slugs.length) return [];
  return (await sequelize.query(
    `SELECT DISTINCT t.organization_id, t.country_slug, c.name
     FROM regulation_tracked_countries t
     LEFT JOIN regulation_countries c ON c.slug = t.country_slug
     WHERE t.country_slug = ANY(ARRAY[:slugs]::varchar[]);`,
    { replacements: { slugs }, type: QueryTypes.SELECT },
  )) as { organization_id: number; country_slug: string; name: string | null }[];
}

// ---------------------------------------------------------------------------
// Recipient resolution
// ---------------------------------------------------------------------------

// EMAIL recipients: configured only, NO admin fallback (matches AI Trust Index pattern).
export async function resolveEmailRecipients(organizationId: number): Promise<string[]> {
  const s = await getSettings(organizationId);
  const userIds: number[] = s.recipient_user_ids ?? [];
  const freeText: string[] = s.recipient_emails ?? [];
  let userEmails: string[] = [];
  if (userIds.length) {
    const rows = (await sequelize.query(
      `SELECT email FROM users WHERE organization_id = :organizationId AND id = ANY(ARRAY[:ids]::int[]);`,
      { replacements: { organizationId, ids: userIds }, type: QueryTypes.SELECT },
    )) as { email: string }[];
    userEmails = rows.map((r) => r.email);
  }
  const recipients = Array.from(
    new Set([...userEmails, ...freeText].map((e) => e.trim().toLowerCase()).filter(Boolean)),
  );
  if (!recipients.length) {
    logger.info(`[regulations-tracker] org ${organizationId} changed but no email recipients configured; skipped`);
  }
  return recipients;
}

// IN-APP recipients: org Admins ∪ configured recipient_user_ids (deduped).
// Uses JOIN roles r ON r.id = u.role_id — confirmed pattern from invitation.utils.ts / user.utils.ts.
export async function resolveInAppUserIds(organizationId: number): Promise<number[]> {
  const s = await getSettings(organizationId);
  const configured: number[] = s.recipient_user_ids ?? [];
  const admins = (await sequelize.query(
    `SELECT u.id FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.organization_id = :organizationId AND r.name IN ('Admin', 'SuperAdmin');`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as { id: number }[];
  return Array.from(new Set([...admins.map((a) => a.id), ...configured]));
}
