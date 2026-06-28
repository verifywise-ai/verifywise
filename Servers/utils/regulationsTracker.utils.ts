import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import logger from "./logger/fileLogger";
import {
  IManifestCountry,
  RegulationChange,
} from "../domain.layer/interfaces/i.regulationsTracker";

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

export function normalizeSlug(s: string): string {
  return String(s).trim().toLowerCase();
}

export async function getMetaQuery(): Promise<{
  seeded_at: Date | null;
  last_good_count: number | null;
  last_run_week: string | null;
  last_run_at: Date | null;
  last_run_status: string | null;
}> {
  const rows = (await sequelize.query(
    `SELECT seeded_at, last_good_count, last_run_week, last_run_at, last_run_status
     FROM regulation_tracker_meta WHERE id = 1;`,
    { type: QueryTypes.SELECT },
  )) as any[];
  return (
    rows[0] ?? {
      seeded_at: null,
      last_good_count: null,
      last_run_week: null,
      last_run_at: null,
      last_run_status: null,
    }
  );
}

// Clears the week-idempotency watermark so the very next sync run actually
// fetches + diffs (used by the admin "check for updates now" trigger).
export async function clearLastRunWeek(): Promise<void> {
  await sequelize.query(`UPDATE regulation_tracker_meta SET last_run_week = NULL WHERE id = 1;`);
}

// Stamps the most recent sync attempt's time + outcome on the meta singleton.
// Called at every exit point of the weekly job (skip / fail / success) so the
// app can surface freshness and failures.
export async function recordRunStatus(status: string): Promise<void> {
  await sequelize.query(
    `UPDATE regulation_tracker_meta
       SET last_run_at = NOW(), last_run_status = :status
     WHERE id = 1;`,
    { replacements: { status: status.slice(0, 120) } },
  );
}

export interface CountryChange {
  slug: string;
  name: string;
  lines: string[];
  unstructured: boolean;
  /**
   * Number of distinct assessments recorded in the feed's hashHistory since our
   * previously-stored hash. 1 = a single change since last check; >1 means the
   * country changed multiple times between our runs and only the latest change's
   * detail is available from the feed.
   */
  changeCount: number;
  /** ISO dates of those intervening assessments (newest first), for a timeline note. */
  changeDates: string[];
}

// Given the feed country's hashHistory and our previously-stored hash, count how
// many assessments are newer than the stored one and collect their dates. The
// feed only carries structured change detail for the latest change, so this lets
// us tell the user "changed N times since last check" with the dates, even
// though we can only show the most recent change's specifics.
export function countChangesSince(
  history: IManifestCountry["history"],
  storedHash: string | undefined,
): { count: number; dates: string[] } {
  const hh = history?.hashHistory ?? [];
  if (!hh.length) return { count: 1, dates: [] };
  // hashHistory is chronological (oldest first). Find the stored hash; everything
  // after it is new. If not found (or no stored hash), treat the latest entry as
  // the single change we're reporting.
  const idx = storedHash ? hh.findIndex((h) => h.hash === storedHash) : -1;
  const newer = idx >= 0 ? hh.slice(idx + 1) : hh.slice(-1);
  const dates = newer
    .map((h) => h.date)
    .filter((d): d is string => !!d)
    .reverse(); // newest first
  return { count: Math.max(newer.length, 1), dates };
}

// ---------------------------------------------------------------------------
// Global feeds (changelog / deadlines / frameworks) cached on the meta singleton
// ---------------------------------------------------------------------------

export type GlobalFeedColumn = "horizon" | "deadlines" | "frameworks";

// Returns the cached JSONB for one global feed column (parsed object/array), or
// null if never stored. Column name is from a fixed union — never user input —
// so the interpolation is safe.
export async function getGlobalFeed(column: GlobalFeedColumn): Promise<unknown> {
  const rows = (await sequelize.query(
    `SELECT ${column} AS v FROM regulation_tracker_meta WHERE id = 1;`,
    { type: QueryTypes.SELECT },
  )) as { v: unknown }[];
  return rows[0]?.v ?? null;
}

// Persists the three global feed blobs on the meta singleton in one update.
// Pass undefined for a feed to leave it unchanged.
export async function setGlobalFeeds(feeds: {
  horizon?: unknown;
  deadlines?: unknown;
  frameworks?: unknown;
}): Promise<void> {
  const sets: string[] = [];
  const repl: Record<string, unknown> = {};
  if (feeds.horizon !== undefined) {
    sets.push("horizon = :horizon::jsonb");
    repl.horizon = JSON.stringify(feeds.horizon);
  }
  if (feeds.deadlines !== undefined) {
    sets.push("deadlines = :deadlines::jsonb");
    repl.deadlines = JSON.stringify(feeds.deadlines);
  }
  if (feeds.frameworks !== undefined) {
    sets.push("frameworks = :frameworks::jsonb");
    repl.frameworks = JSON.stringify(feeds.frameworks);
  }
  if (!sets.length) return;
  await sequelize.query(`UPDATE regulation_tracker_meta SET ${sets.join(", ")} WHERE id = 1;`, {
    replacements: repl,
  });
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
): Promise<{
  changed: CountryChange[];
  newlyAdded: string[];
  newlyRemoved: string[];
  wasFirstSeed: boolean;
}> {
  if (!countries.length)
    return { changed: [], newlyAdded: [], newlyRemoved: [], wasFirstSeed: false };

  const changed: CountryChange[] = [];
  const newlyAdded: string[] = [];
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
          const { count, dates } = countChangesSince(c.history, existingHash);
          changed.push({
            slug,
            name: c.name,
            lines: lines.length ? lines : ["Updated — see source"],
            unstructured: lines.length === 0,
            changeCount: count,
            changeDates: dates,
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
              slug,
              name: c.name,
              region: c.region ?? null,
              rc: c.regulationCount ?? null,
              data: JSON.stringify(storedData),
              hash: c.hash,
            },
            transaction,
          },
        );
      } else {
        newlyAdded.push(slug);
        await sequelize.query(
          `INSERT INTO regulation_countries
             (slug, name, region, regulation_count, data, hash, is_active, last_changed_at, last_fetched_at)
           VALUES (:slug, :name, :region, :rc, :data::jsonb, :hash, TRUE, NOW(), NOW());`,
          {
            replacements: {
              slug,
              name: c.name,
              region: c.region ?? null,
              rc: c.regulationCount ?? null,
              data: JSON.stringify(storedData),
              hash: c.hash,
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
      {
        replacements: { count: rawCount ?? countries.length, week: currentIsoWeek(new Date()) },
        transaction,
      },
    );
  });

  logger.info(
    `[regulationsTracker] upsertFeedTx complete: changed=${changed.length}, removed=${newlyRemoved.length}, firstSeed=${wasFirstSeed}`,
  );

  return { changed, newlyAdded, newlyRemoved, wasFirstSeed };
}

// ---------------------------------------------------------------------------
// CRUD: country catalogue
// ---------------------------------------------------------------------------

export async function listCountries(
  organizationId: number,
  filters: { region?: string; q?: string } = {},
) {
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
    `SELECT recipient_user_ids, recipient_emails, updated_by, updated_at,
            impact_enabled, last_impact_run_at
     FROM regulation_tracker_settings WHERE organization_id = :organizationId;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as {
    recipient_user_ids: number[] | null;
    recipient_emails: string[] | null;
    updated_by: number | null;
    updated_at: Date | null;
    impact_enabled: boolean | null;
    last_impact_run_at: Date | null;
  }[];
  return (
    rows[0] ?? {
      recipient_user_ids: [],
      recipient_emails: [],
      updated_by: null,
      updated_at: null,
      impact_enabled: true,
      last_impact_run_at: null,
    }
  );
}

export async function upsertSettings(
  organizationId: number,
  userIds: number[],
  emails: string[],
  userId: number,
  impactEnabled?: boolean,
) {
  await sequelize.query(
    `INSERT INTO regulation_tracker_settings
       (organization_id, recipient_user_ids, recipient_emails, updated_by, updated_at, impact_enabled)
     VALUES (:organizationId, :userIds::jsonb, :emails::jsonb, :userId, NOW(), COALESCE(:impactEnabled, true))
     ON CONFLICT (organization_id) DO UPDATE SET
       recipient_user_ids = :userIds::jsonb, recipient_emails = :emails::jsonb,
       updated_by = :userId, updated_at = NOW(),
       impact_enabled = COALESCE(:impactEnabled, regulation_tracker_settings.impact_enabled);`,
    {
      replacements: {
        organizationId,
        userId,
        userIds: JSON.stringify(userIds ?? []),
        emails: JSON.stringify(emails ?? []),
        impactEnabled: impactEnabled === undefined ? null : impactEnabled,
      },
    },
  );
  return getSettings(organizationId);
}

export async function setLastImpactRunAt(organizationId: number): Promise<void> {
  await sequelize.query(
    `INSERT INTO regulation_tracker_settings (organization_id, last_impact_run_at, updated_at)
     VALUES (:organizationId, NOW(), NOW())
     ON CONFLICT (organization_id) DO UPDATE SET last_impact_run_at = NOW();`,
    { replacements: { organizationId } },
  );
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
    logger.info(
      `[regulations-tracker] org ${organizationId} changed but no email recipients configured; skipped`,
    );
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

// Every (org, admin user) pair across all organizations. Used to notify admins
// when brand-new countries appear in the feed — those aren't tracked by anyone
// yet, so the alert is org-agnostic (goes to each org's admins).
export async function getAllOrgAdmins(): Promise<{ organization_id: number; user_id: number }[]> {
  return (await sequelize.query(
    `SELECT u.organization_id, u.id AS user_id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name IN ('Admin', 'SuperAdmin');`,
    { type: QueryTypes.SELECT },
  )) as { organization_id: number; user_id: number }[];
}

// ---------------------------------------------------------------------------
// Deadline flag enrichment
// ---------------------------------------------------------------------------

/**
 * Enriches a deadlines/unscheduled array with `countryFlag` fetched from the
 * regulation_countries catalog. Uses a single batched query for all distinct
 * slugs. Best-effort: never throws — if the query fails the original items are
 * returned unchanged.
 *
 * Moved here from the controller per the thin-controller convention (raw SQL
 * belongs in utils, not controllers).
 */
export async function enrichWithFlags(items: unknown[]): Promise<unknown[]> {
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
      `SELECT slug, data->>'flag' AS flag FROM regulation_countries WHERE slug IN (:slugs)`,
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
