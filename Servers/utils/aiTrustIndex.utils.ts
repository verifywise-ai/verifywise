import { QueryTypes } from "sequelize";
import { sequelize } from "../database/db";
import { computeHashes } from "./aiTrustIndexHash";
import { ITrustIndexAppData } from "../domain.layer/interfaces/i.aiTrustIndex";
import logger from "./logger/fileLogger";

export function normalizeSlug(slug: string): string {
  return String(slug).trim().toLowerCase();
}

// Whitelisted sortable columns. Each maps to a fixed SQL expression — user
// input only ever selects a key here, it is never interpolated into the query.
// NULL scores/values always sort last regardless of direction.
const SORT_COLUMNS: Record<string, { expr: string; defaultDir: "ASC" | "DESC" }> = {
  score: { expr: "score_out_of_100", defaultDir: "DESC" },
  name: { expr: "name", defaultDir: "ASC" },
  vendor: { expr: "vendor", defaultDir: "ASC" },
  category: { expr: "category", defaultDir: "ASC" },
};

export async function getAppsQuery(
  organizationId: number,
  opts: {
    search?: string;
    category?: string;
    grade?: string;
    page: number;
    pageSize: number;
    sort: string;
    dir?: string;
  },
): Promise<{
  apps: any[];
  total: number;
  page: number;
  pageSize: number;
  categories: string[];
  categoryCounts: Record<string, number>;
  gradeCounts: Record<string, number>;
}> {
  const { search, category, grade } = opts;
  const page = Math.max(1, opts.page);
  // Cap is generous (the full catalog is low-hundreds) so a consumer can request
  // the whole set in one page — e.g. the app detail comparison strip needs every
  // app to compute an accurate rank and category average. Still bounded to guard
  // against an unbounded query.
  const pageSize = Math.min(1000, Math.max(1, opts.pageSize));
  const offset = (page - 1) * pageSize;
  const sortCol = SORT_COLUMNS[opts.sort] ?? SORT_COLUMNS.score;
  // Direction is whitelisted to ASC/DESC; anything else falls back to the
  // column's default direction. Never interpolate the raw value.
  const dir = opts.dir === "asc" ? "ASC" : opts.dir === "desc" ? "DESC" : sortCol.defaultDir;
  const orderBy = `${sortCol.expr} ${dir} NULLS LAST`;

  const conditions: string[] = ["a.is_active = TRUE"];
  const replacements: Record<string, unknown> = { organizationId, limit: pageSize, offset };
  if (search) {
    // Escape LIKE metacharacters (\ % _) in user input so they're matched
    // literally rather than acting as wildcards, then wrap with our own %.
    const escaped = search.replace(/[\\%_]/g, "\\$&");
    conditions.push("(a.name ILIKE :search ESCAPE '\\' OR a.vendor ILIKE :search ESCAPE '\\')");
    replacements.search = `%${escaped}%`;
  }
  if (category) {
    conditions.push("a.category = :category");
    replacements.category = category;
  }
  if (grade) {
    conditions.push("a.letter_grade = :grade");
    replacements.grade = grade;
  }
  const where = "WHERE " + conditions.join(" AND ");

  const countSql = `SELECT COUNT(*) AS total FROM ai_trust_index_apps a ${where};`;
  const dataSql = `
    SELECT a.*, (t.app_slug IS NOT NULL) AS is_tracked
    FROM ai_trust_index_apps a
    LEFT JOIN ai_trust_index_tracked_apps t
      ON t.app_slug = a.slug AND t.organization_id = :organizationId
    ${where}
    ORDER BY ${orderBy}, a.id ASC
    LIMIT :limit OFFSET :offset;`;
  // Per-category and per-grade counts are computed over the WHOLE active catalog,
  // not the current filter, so the dropdowns stay stable pickers (selecting one
  // category does not zero out the others). Active apps only.
  const catSql = `SELECT category, COUNT(*) AS n FROM ai_trust_index_apps
    WHERE is_active = TRUE AND category IS NOT NULL
    GROUP BY category ORDER BY category;`;
  const gradeSql = `SELECT letter_grade, COUNT(*) AS n FROM ai_trust_index_apps
    WHERE is_active = TRUE AND letter_grade IS NOT NULL
    GROUP BY letter_grade;`;

  const [countRows, dataRows, catRows, gradeRows] = await Promise.all([
    sequelize.query(countSql, { replacements, type: QueryTypes.SELECT }),
    sequelize.query(dataSql, { replacements, type: QueryTypes.SELECT }),
    sequelize.query(catSql, { type: QueryTypes.SELECT }),
    sequelize.query(gradeSql, { type: QueryTypes.SELECT }),
  ]);

  const categoryCounts: Record<string, number> = {};
  for (const r of catRows as { category: string; n: string }[]) {
    categoryCounts[r.category] = parseInt(r.n, 10);
  }
  const gradeCounts: Record<string, number> = {};
  for (const r of gradeRows as { letter_grade: string; n: string }[]) {
    gradeCounts[r.letter_grade] = parseInt(r.n, 10);
  }

  return {
    apps: dataRows as any[],
    total: parseInt((countRows[0] as { total: string }).total, 10),
    page,
    pageSize,
    categories: (catRows as { category: string }[]).map((r) => r.category),
    categoryCounts,
    gradeCounts,
  };
}

export async function getAppBySlugQuery(organizationId: number, slugRaw: string) {
  const slug = normalizeSlug(slugRaw);
  const rows = (await sequelize.query(
    `SELECT a.*, (t.app_slug IS NOT NULL) AS is_tracked
     FROM ai_trust_index_apps a
     LEFT JOIN ai_trust_index_tracked_apps t
       ON t.app_slug = a.slug AND t.organization_id = :organizationId
     WHERE a.slug = :slug;`,
    { replacements: { organizationId, slug }, type: QueryTypes.SELECT },
  )) as any[];
  if (!rows.length) return null;
  const row = rows[0];
  return { ...row, no_longer_in_index: row.is_active === false };
}

export async function getTrackedQuery(organizationId: number) {
  return (await sequelize.query(
    `SELECT t.app_slug, a.id, a.name, a.vendor, a.category, a.letter_grade,
            a.score_out_of_100, a.data, a.is_active,
            (a.id IS NULL OR a.is_active = FALSE) AS no_longer_in_index
     FROM ai_trust_index_tracked_apps t
     LEFT JOIN ai_trust_index_apps a ON a.slug = t.app_slug
     WHERE t.organization_id = :organizationId
     ORDER BY a.score_out_of_100 DESC NULLS LAST, t.app_slug ASC;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as any[];
}

export async function trackAppQuery(organizationId: number, slugRaw: string, userId: number) {
  const slug = normalizeSlug(slugRaw);
  const active = (await sequelize.query(
    `SELECT 1 FROM ai_trust_index_apps WHERE slug = :slug AND is_active = TRUE;`,
    { replacements: { slug }, type: QueryTypes.SELECT },
  )) as unknown[];
  if (!active.length) return { tracked: false };
  await sequelize.query(
    `INSERT INTO ai_trust_index_tracked_apps (organization_id, app_slug, tracked_by, created_at)
     VALUES (:organizationId, :slug, :userId, NOW())
     ON CONFLICT (organization_id, app_slug) DO NOTHING;`,
    { replacements: { organizationId, slug, userId } },
  );
  return { tracked: true };
}

export async function trackAppsBulkQuery(
  organizationId: number,
  slugsRaw: string[],
  userId: number,
) {
  const slugs = Array.from(new Set(slugsRaw.map(normalizeSlug))).slice(0, 200);
  const tracked: string[] = [];
  const skipped: string[] = [];
  await sequelize.transaction(async (transaction) => {
    for (const slug of slugs) {
      const active = (await sequelize.query(
        `SELECT 1 FROM ai_trust_index_apps WHERE slug = :slug AND is_active = TRUE;`,
        { replacements: { slug }, type: QueryTypes.SELECT, transaction },
      )) as unknown[];
      if (!active.length) {
        skipped.push(slug);
        continue;
      }
      // RETURNING makes "inserted vs. already-tracked" deterministic: a conflict
      // (DO NOTHING) returns zero rows; a real insert returns one row.
      const inserted = (await sequelize.query(
        `INSERT INTO ai_trust_index_tracked_apps (organization_id, app_slug, tracked_by, created_at)
         VALUES (:organizationId, :slug, :userId, NOW())
         ON CONFLICT (organization_id, app_slug) DO NOTHING
         RETURNING id;`,
        { replacements: { organizationId, slug, userId }, type: QueryTypes.SELECT, transaction },
      )) as unknown[];
      if (inserted.length) tracked.push(slug);
      else skipped.push(slug);
    }
  });
  return { tracked, skipped };
}

export async function untrackAppQuery(organizationId: number, slugRaw: string) {
  const slug = normalizeSlug(slugRaw);
  await sequelize.query(
    `DELETE FROM ai_trust_index_tracked_apps WHERE organization_id = :organizationId AND app_slug = :slug;`,
    { replacements: { organizationId, slug } },
  );
}

export async function getSettingsQuery(organizationId: number) {
  const rows = (await sequelize.query(
    `SELECT recipient_user_ids, recipient_emails FROM ai_trust_index_settings WHERE organization_id = :organizationId;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as any[];
  // The weekly-sync cadence is org-independent (the meta row is global), but the
  // Settings page surfaces it per org so an admin can see the index is checked
  // automatically and when it last ran.
  const metaRows = (await sequelize.query(
    `SELECT seeded_at, last_run_week FROM ai_trust_index_meta WHERE id = 1;`,
    { type: QueryTypes.SELECT },
  )) as any[];
  const meta = metaRows[0] ?? {};
  const base = rows.length
    ? {
        recipientUserIds: rows[0].recipient_user_ids ?? [],
        recipientEmails: rows[0].recipient_emails ?? [],
      }
    : { recipientUserIds: [], recipientEmails: [] };
  return {
    ...base,
    lastRunWeek: meta.last_run_week ?? null,
    seededAt: meta.seeded_at ?? null,
  };
}

export async function upsertSettingsQuery(
  organizationId: number,
  userId: number,
  recipientUserIds: number[],
  recipientEmails: string[],
) {
  await sequelize.query(
    `INSERT INTO ai_trust_index_settings (organization_id, recipient_user_ids, recipient_emails, updated_by, updated_at)
     VALUES (:organizationId, :userIds::jsonb, :emails::jsonb, :userId, NOW())
     ON CONFLICT (organization_id) DO UPDATE
       SET recipient_user_ids = :userIds::jsonb, recipient_emails = :emails::jsonb,
           updated_by = :userId, updated_at = NOW();`,
    {
      replacements: {
        organizationId,
        userId,
        userIds: JSON.stringify(recipientUserIds),
        emails: JSON.stringify(recipientEmails),
      },
    },
  );
}

export function currentIsoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function getMetaQuery() {
  const rows = (await sequelize.query(
    `SELECT seeded_at, last_good_count, last_run_week FROM ai_trust_index_meta WHERE id = 1;`,
    { type: QueryTypes.SELECT },
  )) as any[];
  return rows[0] ?? { seeded_at: null, last_good_count: null, last_run_week: null };
}

// Human-readable description of what changed on a tracked app, surfaced in the
// weekly digest. `changes` reads like "grade B → C", "score 78 → 71", "policy
// updated" — built from the material fields so a recipient sees what moved, not
// just the current grade. Grade comparisons use displayedGrade (the B-capped,
// governance-relevant grade), never the raw letterGrade.
export interface MaterialChange {
  slug: string;
  changes: string[];
}

// Compare the material fields of the previous and current app records and
// return human-readable change lines. Grade uses displayedGrade (B-capped) so
// the digest matches the grade shown everywhere else in the product.
export function describeMaterialChanges(
  prev: Partial<ITrustIndexAppData> | null | undefined,
  next: ITrustIndexAppData,
): string[] {
  const out: string[] = [];
  const prevGrade = prev?.displayedGrade ?? null;
  if (prevGrade && prevGrade !== next.displayedGrade) {
    out.push(`grade ${prevGrade} → ${next.displayedGrade}`);
  } else if (!prevGrade && next.displayedGrade) {
    out.push(`grade ${next.displayedGrade}`);
  }
  if (prev?.scoreOutOf100 != null && prev.scoreOutOf100 !== next.scoreOutOf100) {
    out.push(`score ${prev.scoreOutOf100} → ${next.scoreOutOf100}`);
  }
  const prevFlags = (prev?.dealbreakerFlags ?? []).length;
  const nextFlags = (next.dealbreakerFlags ?? []).length;
  if (prevFlags !== nextFlags) {
    out.push(nextFlags > prevFlags ? "new dealbreaker flag" : "dealbreaker flag cleared");
  }
  if ((prev?.policyLastUpdated ?? null) !== (next.policyLastUpdated ?? null)) {
    out.push("policy updated");
  }
  if (prev?.processesBiometrics != null && prev.processesBiometrics !== next.processesBiometrics) {
    out.push(
      next.processesBiometrics ? "now processes biometrics" : "no longer processes biometrics",
    );
  }
  // Fall back to the current grade if the material hash differed but none of the
  // mapped fields explain it (defensive — keeps the line meaningful).
  if (!out.length) out.push(`grade ${next.displayedGrade}`);
  return out;
}

export async function upsertFeedTx(
  apps: ITrustIndexAppData[],
  // Every slug present in the raw feed, including apps dropped for a missing
  // required field. The soft-delete excludes these so a transiently-malformed-
  // but-present app is left untouched (not marked removed). When omitted, the
  // present set defaults to the upserted apps — i.e. today's behavior.
  presentSlugs?: string[],
  // Total number of apps in the raw feed (before any were dropped for a missing
  // required field). Stored as last_good_count so the metric reflects the feed
  // size, not just the subset that survived validation. Defaults to the upserted
  // count when omitted — i.e. today's behavior.
  rawCount?: number,
): Promise<{
  materialChanged: MaterialChange[];
  newlyRemoved: string[];
  wasFirstSeed: boolean;
}> {
  if (!apps.length) {
    return { materialChanged: [], newlyRemoved: [], wasFirstSeed: false };
  }

  const materialChanged: MaterialChange[] = [];
  const newlyRemoved: string[] = [];
  let wasFirstSeed = false;

  await sequelize.transaction(async (transaction) => {
    const metaRows = (await sequelize.query(
      `SELECT seeded_at FROM ai_trust_index_meta WHERE id = 1 FOR UPDATE;`,
      { type: QueryTypes.SELECT, transaction },
    )) as any[];
    wasFirstSeed = !metaRows[0]?.seeded_at;

    const upsertedSlugs: string[] = [];
    for (const app of apps) {
      const slug = normalizeSlug(app.slug);
      upsertedSlugs.push(slug);
      const { materialHash, fullHash } = computeHashes(app);
      const existing = (await sequelize.query(
        `SELECT material_hash, full_hash, data FROM ai_trust_index_apps WHERE slug = :slug;`,
        { replacements: { slug }, type: QueryTypes.SELECT, transaction },
      )) as any[];

      if (existing.length) {
        if (existing[0].material_hash !== materialHash) {
          // `data` is JSONB — the driver returns it parsed. Read the previous
          // material fields from it so the digest can show old → new.
          const prev = existing[0].data as Partial<ITrustIndexAppData> | null;
          materialChanged.push({ slug, changes: describeMaterialChanges(prev, app) });
        }
        const fullChanged = existing[0].full_hash !== fullHash;
        await sequelize.query(
          `UPDATE ai_trust_index_apps SET
             name = :name, vendor = :vendor, category = :category,
             letter_grade = :grade, score_out_of_100 = :score,
             data = :data::jsonb, material_hash = :mh, full_hash = :fh,
             is_active = TRUE, removed_at = NULL, last_fetched_at = NOW()
             ${fullChanged ? ", last_changed_at = NOW()" : ""}
           WHERE slug = :slug;`,
          {
            replacements: {
              slug,
              name: app.name,
              vendor: app.vendor ?? null,
              category: app.category ?? null,
              grade: app.letterGrade ?? null,
              score: app.scoreOutOf100 ?? null,
              data: JSON.stringify(app),
              mh: materialHash,
              fh: fullHash,
            },
            transaction,
          },
        );
      } else {
        await sequelize.query(
          `INSERT INTO ai_trust_index_apps
             (slug, name, vendor, category, letter_grade, score_out_of_100, data,
              material_hash, full_hash, is_active, last_changed_at, last_fetched_at)
           VALUES (:slug, :name, :vendor, :category, :grade, :score, :data::jsonb,
              :mh, :fh, TRUE, NOW(), NOW());`,
          {
            replacements: {
              slug,
              name: app.name,
              vendor: app.vendor ?? null,
              category: app.category ?? null,
              grade: app.letterGrade ?? null,
              score: app.scoreOutOf100 ?? null,
              data: JSON.stringify(app),
              mh: materialHash,
              fh: fullHash,
            },
            transaction,
          },
        );
      }
    }

    // Soft-delete is keyed on slugs PRESENT IN THE RAW FEED (upserted ∪
    // dropped-but-present), not just the upserted ones. An app that appeared in
    // the feed but was dropped for a missing field is left alone — it retains
    // its prior state until it's either valid again or genuinely absent.
    const seenSlugs = Array.from(
      new Set([...upsertedSlugs, ...(presentSlugs ?? []).map(normalizeSlug)]),
    );
    const removedRows = (await sequelize.query(
      `UPDATE ai_trust_index_apps
         SET is_active = FALSE, removed_at = NOW()
       WHERE is_active = TRUE AND slug <> ALL(ARRAY[:seen]::varchar[])
       RETURNING slug;`,
      { replacements: { seen: seenSlugs }, type: QueryTypes.SELECT, transaction },
    )) as any[];
    for (const r of removedRows) newlyRemoved.push(r.slug);

    await sequelize.query(
      `UPDATE ai_trust_index_meta
         SET last_good_count = :count, last_run_week = :week
             ${wasFirstSeed ? ", seeded_at = NOW()" : ""}
       WHERE id = 1;`,
      {
        replacements: { count: rawCount ?? apps.length, week: currentIsoWeek(new Date()) },
        transaction,
      },
    );
  });

  return { materialChanged, newlyRemoved, wasFirstSeed };
}

export async function getAffectedOrgsBySlugs(slugs: string[]) {
  if (!slugs.length)
    return [] as {
      organization_id: number;
      app_slug: string;
      name: string | null;
    }[];
  // Join the apps table so the digest can show the human name instead of the raw
  // slug. LEFT JOIN keeps a tracked-but-since-removed app in the result (the apps
  // row is soft-deleted, not deleted, so its name still resolves). The grade is
  // no longer read here — the digest's per-app change summary (built from
  // displayedGrade in upsertFeedTx) carries the grade now.
  return (await sequelize.query(
    `SELECT DISTINCT t.organization_id, t.app_slug, a.name
     FROM ai_trust_index_tracked_apps t
     LEFT JOIN ai_trust_index_apps a ON a.slug = t.app_slug
     WHERE t.app_slug = ANY(ARRAY[:slugs]::varchar[]);`,
    { replacements: { slugs }, type: QueryTypes.SELECT },
  )) as {
    organization_id: number;
    app_slug: string;
    name: string | null;
  }[];
}

export async function resolveRecipients(organizationId: number): Promise<string[]> {
  const settings = (await sequelize.query(
    `SELECT recipient_user_ids, recipient_emails FROM ai_trust_index_settings WHERE organization_id = :organizationId;`,
    { replacements: { organizationId }, type: QueryTypes.SELECT },
  )) as any[];
  const userIds: number[] = settings[0]?.recipient_user_ids ?? [];
  const freeText: string[] = settings[0]?.recipient_emails ?? [];

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
  // No Admin/SuperAdmin fallback by design: digests go only to the recipients an
  // org explicitly configures. Managing the recipient list is the admin's duty
  // (via AI Trust Index → Settings). An org with no configured recipients
  // receives no digest rather than mailing every Admin or platform SuperAdmin.
  if (recipients.length === 0) {
    logger.info(
      `[ai-trust-index] org ${organizationId} has a tracked-app change but no configured recipients; digest skipped`,
    );
  }
  return recipients;
}
