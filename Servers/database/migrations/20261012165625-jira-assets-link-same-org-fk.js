"use strict";

/**
 * Jira Assets links can only point at a project in their own organization.
 *
 * jira_assets_use_cases.project_id had a single-column FK to projects(id), so
 * nothing stopped a link in one organization from referencing another
 * organization's project. The app only ever creates a link together with its
 * project, in the same organization and transaction, and never changes
 * project_id afterwards, but the database did not enforce it.
 *
 * Deploy: Servers/start.sh runs migrations on every API boot while the worker
 * and older API replicas keep serving, so up() is built to run under live
 * traffic. It is a series of short transactions, not one. Each holds a lock
 * on one table only, except step 3, which locks the link table and then
 * projects with NOWAIT (so it never waits while holding a lock and cannot
 * deadlock with a sync, which writes links then projects, or with a removal,
 * which locks projects then links). Every lock wait is capped by a 5 s
 * lock_timeout; a busy lock rolls the step back and it is retried (up to 12
 * times with a short backoff, about 1.5 minutes at worst) before up() gives
 * up. Every step is idempotent, so a failed up() is simply re-run on the next
 * boot.
 *
 * Steps, and which writes pause (reads never pause, except in step 5):
 * 1. The composite FK target: a unique index on projects (id,
 *    organization_id), unless an equivalent one already exists (then that
 *    one is used). Plain CREATE UNIQUE INDEX (SHARE on projects): writes to
 *    projects pause while it builds, a single pass over projects. Not
 *    CONCURRENTLY, as in the other migrations here: in the container start
 *    path it would wait on every older transaction, and a failed concurrent
 *    build leaves an INVALID index behind. It is named generically,
 *    projects_id_organization_id_key, as shared infrastructure that any
 *    composite FK to projects (id, organization_id) can rely on, so down()
 *    leaves it in place.
 * 2. An index on jira_assets_use_cases (project_id, organization_id) (SHARE
 *    on the link table): link writes pause while it builds.
 * 3. One transaction: SHARE ROW EXCLUSIVE on jira_assets_use_cases, then on
 *    projects (NOWAIT), row_security off, then
 *    a. links whose project_id is set but has no project in the link's own
 *       organization (missing, or another organization's) are copied into
 *       verifywise.jira_assets_use_cases_fk_cleanup_backup and deleted. The
 *       backup is a plain migration backup, created LIKE the live table (every
 *       column with its real type, but no defaults, so it is not tied to the
 *       live id sequence), plus cleaned_at (default now()) and a primary key
 *       on id. It has no foreign keys. Rows are copied by the live table's
 *       column names. No project is touched. The Jira object is then no
 *       longer linked, so it can be imported again. The count is logged.
 *       (They are deleted, not NULLed: a NULLed link whose object Jira still
 *       returns would have its missing flag cleared by every sync, never
 *       reach the panel's removal list, and block a re-import.)
 *    b. FOREIGN KEY (project_id, organization_id)
 *         REFERENCES projects (id, organization_id) ON DELETE CASCADE NOT VALID
 *       (MATCH SIMPLE, the default, so a NULL project_id still passes).
 *    Writes to both tables pause for this transaction only: one DELETE over
 *    the links plus a catalog change. From its commit on, every new or
 *    changed link is checked, so step 4 only re-checks rows already cleaned.
 * 4. VALIDATE CONSTRAINT, unless pg_constraint already says it is validated
 *    (SHARE UPDATE EXCLUSIVE on the link table, ROW SHARE on projects): no
 *    writes pause; it scans the links and checks each against projects.
 * 5. The old index on project_id is redundant and dropped (ACCESS EXCLUSIVE
 *    on the link table, which also pauses its reads, for the catalog change
 *    only).
 * The old single-column FK is kept: dropping any FK from this table to
 * projects takes ACCESS EXCLUSIVE on projects (it removes triggers there),
 * which up() avoids. It is redundant with the composite FK (which implies
 * it) and harmless; both cascade on delete. organizations is never locked.
 *
 * Row-level security: projects has RLS enabled (20260720100200). Every
 * transaction that reads projects sets row_security = off, so if a policy
 * would ever apply to the migration role, Postgres raises an error instead of
 * hiding rows (a hidden projects table would make every link look orphaned
 * and delete it).
 *
 * down() drops the composite FK, which needs ACCESS EXCLUSIVE on projects
 * (link table first, then projects with NOWAIT, retried as above; reads of
 * projects wait for it too, briefly; a rollback is rare), and its index,
 * recreates the old index, and puts the backed-up links back where the
 * single-column FK allows it (organization and project still exist; ON
 * CONFLICT DO NOTHING). The unique index on projects (id, organization_id)
 * stays. Restored rows are removed from the backup; the backup table is
 * dropped only when nothing is left in it, otherwise it is kept and the
 * remaining count is logged.
 */

const TABLE = "verifywise.jira_assets_use_cases";
const BACKUP = "verifywise.jira_assets_use_cases_fk_cleanup_backup";
const NEW_FK = "jira_assets_use_cases_project_org_fkey";
const PROJECTS_UNIQUE = "projects_id_organization_id_key";
const NEW_INDEX = "idx_jira_use_cases_project_org";
const OLD_INDEX = "idx_jira_use_cases_project_id";
const LOG = "[jira-assets-link-same-org-fk]";

const BACKUP_PK = "jira_assets_use_cases_fk_cleanup_backup_pkey";

const LOCK_TIMEOUT = "5s";
const LOCK_ATTEMPTS = 12;
// lock_not_available (lock_timeout or NOWAIT) and deadlock_detected.
const RETRYABLE = new Set(["55P03", "40P01"]);

const quoted = (columns) => columns.map((c) => `"${c}"`).join(", ");
const sqlState = (err) => err?.original?.code ?? err?.parent?.code ?? err?.code;

async function columnsOf(queryInterface, table, transaction) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'verifywise' AND table_name = :table
      ORDER BY ordinal_position;`,
    { replacements: { table }, transaction },
  );
  return rows.map((r) => r.column_name);
}

async function constraintExists(queryInterface, name, transaction) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM pg_constraint WHERE conname = :name LIMIT 1;`,
    { replacements: { name }, transaction },
  );
  return rows.length > 0;
}

/**
 * Runs fn(q, transaction) in a short transaction with lock_timeout set (and
 * row_security off when it reads projects), retrying the whole transaction
 * when a lock is busy. fn must be idempotent.
 */
async function step(queryInterface, label, { readsProjects }, fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await queryInterface.sequelize.transaction(async (transaction) => {
        const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
        await q(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}';`);
        if (readsProjects) await q(`SET LOCAL row_security = off;`);
        return fn(q, transaction);
      });
    } catch (err) {
      if (!RETRYABLE.has(sqlState(err)) || attempt >= LOCK_ATTEMPTS) throw err;
      console.log(`${LOG} ${label}: lock busy (attempt ${attempt}/${LOCK_ATTEMPTS}), retrying`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(250 * attempt, 2000)));
    }
  }
}

/**
 * Locks the link table (waiting at most lock_timeout while holding nothing),
 * then projects with NOWAIT, so this transaction never waits while it holds a
 * lock and cannot be part of a deadlock.
 */
async function lockLinksThenProjects(q, mode) {
  await q(`LOCK TABLE ${TABLE} IN ${mode} MODE;`);
  await q(`LOCK TABLE verifywise.projects IN ${mode} MODE NOWAIT;`);
}

module.exports = {
  async up(queryInterface) {
    // 1. The composite FK target, unless an equivalent one already exists:
    // a valid, immediate, unique, non-partial, non-expression index whose
    // key columns (INCLUDE columns excluded) are exactly id, organization_id.
    await step(queryInterface, "projects unique key", { readsProjects: false }, async (q) => {
      const [equivalent] = await q(
        `SELECT 1
           FROM pg_index i
          WHERE i.indrelid = 'verifywise.projects'::regclass
            AND i.indisunique AND i.indisvalid AND i.indimmediate
            AND i.indpred IS NULL AND i.indexprs IS NULL
            AND i.indnkeyatts = 2
            AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
                   FROM unnest((i.indkey::int2[])[0:i.indnkeyatts - 1]) AS k(attnum)
                   JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum)
                = ARRAY['id', 'organization_id']
          LIMIT 1;`,
      );
      if (equivalent.length === 0) {
        await q(
          `CREATE UNIQUE INDEX ${PROJECTS_UNIQUE} ON verifywise.projects (id, organization_id);`,
        );
      }
    });

    // 2. The link table's index for the composite FK.
    await step(queryInterface, "link index", { readsProjects: false }, (q) =>
      q(
        `CREATE INDEX IF NOT EXISTS ${NEW_INDEX}
           ON ${TABLE} (project_id, organization_id)
           WHERE project_id IS NOT NULL;`,
      ),
    );

    // 3. Clean up and add the FK NOT VALID in one short transaction, so no
    // unchecked link can be written between the two.
    await step(
      queryInterface,
      "cleanup and foreign key",
      { readsProjects: true },
      async (q, transaction) => {
        await lockLinksThenProjects(q, "SHARE ROW EXCLUSIVE");

        // The backup has the live table's columns with their real types, but
        // no defaults (the id default would tie it to the live sequence) and
        // no FKs (one to organizations would lock it).
        const live = await columnsOf(queryInterface, "jira_assets_use_cases", transaction);
        await q(`CREATE TABLE IF NOT EXISTS ${BACKUP} (LIKE ${TABLE});`);
        await q(
          `ALTER TABLE ${BACKUP} ADD COLUMN IF NOT EXISTS cleaned_at TIMESTAMPTZ NOT NULL DEFAULT now();`,
        );
        // An existing backup must hold the same columns (as a set) as the
        // live table, or copying by name would lose or misplace data.
        const backupColumns = (
          await columnsOf(queryInterface, "jira_assets_use_cases_fk_cleanup_backup", transaction)
        ).filter((c) => c !== "cleaned_at");
        const sameSet =
          backupColumns.length === live.length && live.every((c) => backupColumns.includes(c));
        if (!sameSet) {
          throw new Error(
            `${LOG} ${BACKUP} already exists with columns [${backupColumns.join(", ")}], but jira_assets_use_cases has [${live.join(", ")}]; inspect the backup and drop or rename it before running this migration.`,
          );
        }
        if (!(await constraintExists(queryInterface, BACKUP_PK, transaction))) {
          await q(`ALTER TABLE ${BACKUP} ADD CONSTRAINT ${BACKUP_PK} PRIMARY KEY (id);`);
        }
        const columnList = quoted(live);
        const [moved] = await q(
          `WITH removed AS (
             DELETE FROM ${TABLE} j
              WHERE j.project_id IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM verifywise.projects p
                   WHERE p.id = j.project_id AND p.organization_id = j.organization_id
                )
              RETURNING ${live.map((c) => `j."${c}"`).join(", ")}
           ), backed_up AS (
             INSERT INTO ${BACKUP} (${columnList})
             SELECT ${columnList} FROM removed
             RETURNING 1
           )
           SELECT COUNT(*)::int AS count FROM backed_up;`,
        );
        console.log(
          `${LOG} deleted ${moved[0]?.count ?? 0} link(s) whose project is not in their organization; copies kept in ${BACKUP}`,
        );

        if (!(await constraintExists(queryInterface, NEW_FK, transaction))) {
          await q(
            `ALTER TABLE ${TABLE}
               ADD CONSTRAINT ${NEW_FK}
               FOREIGN KEY (project_id, organization_id)
               REFERENCES verifywise.projects (id, organization_id)
               ON DELETE CASCADE
               NOT VALID;`,
          );
        }
      },
    );

    // 4. Validate the existing rows; normal writes continue meanwhile.
    await step(queryInterface, "validate foreign key", { readsProjects: true }, async (q) => {
      const [state] = await q(
        `SELECT convalidated FROM pg_constraint
          WHERE conname = '${NEW_FK}' AND conrelid = '${TABLE}'::regclass;`,
      );
      if (state.length === 0) throw new Error(`${LOG} ${NEW_FK} is missing after it was added`);
      if (!state[0].convalidated) {
        await q(`ALTER TABLE ${TABLE} VALIDATE CONSTRAINT ${NEW_FK};`);
      }
    });

    // 5. The old index on project_id is now redundant.
    await step(queryInterface, "drop old index", { readsProjects: false }, (q) =>
      q(`DROP INDEX IF EXISTS verifywise.${OLD_INDEX};`),
    );
  },

  async down(queryInterface) {
    await step(queryInterface, "rollback", { readsProjects: true }, async (q, transaction) => {
      // Dropping the composite FK removes its triggers on projects, which
      // needs ACCESS EXCLUSIVE there.
      await lockLinksThenProjects(q, "ACCESS EXCLUSIVE");

      await q(`ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS ${NEW_FK};`);
      await q(`DROP INDEX IF EXISTS verifywise.${NEW_INDEX};`);
      // The unique index on projects (id, organization_id) stays: it is
      // shared infrastructure other composite FKs to projects may rely on.
      await q(
        `CREATE INDEX IF NOT EXISTS ${OLD_INDEX}
             ON ${TABLE} (project_id)
             WHERE project_id IS NOT NULL;`,
      );

      const [present] = await q(`SELECT to_regclass('${BACKUP}') IS NOT NULL AS present;`);
      if (!present[0]?.present) return;

      // Restore by the columns the live table and the backup share now.
      const liveNow = await columnsOf(queryInterface, "jira_assets_use_cases", transaction);
      const backupNow = await columnsOf(
        queryInterface,
        "jira_assets_use_cases_fk_cleanup_backup",
        transaction,
      );
      const restoreList = quoted(liveNow.filter((c) => backupNow.includes(c)));

      // Put back what the single-column FK allows: the organization and the
      // project (if any) still exist; a conflicting link (e.g. re-imported
      // since) wins. Restored rows leave the backup.
      const [result] = await q(
        `WITH restored AS (
             INSERT INTO ${TABLE} (${restoreList})
             SELECT ${restoreList} FROM ${BACKUP} b
              WHERE EXISTS (SELECT 1 FROM verifywise.organizations o WHERE o.id = b.organization_id)
                AND (b.project_id IS NULL
                     OR EXISTS (SELECT 1 FROM verifywise.projects p WHERE p.id = b.project_id))
             ON CONFLICT DO NOTHING
             RETURNING id
           ), cleared AS (
             DELETE FROM ${BACKUP} b USING restored r WHERE b.id = r.id RETURNING 1
           )
           SELECT (SELECT COUNT(*)::int FROM cleared) AS restored,
                  (SELECT COUNT(*)::int FROM ${BACKUP}) - (SELECT COUNT(*)::int FROM cleared)
                    AS remaining;`,
      );
      const restored = result[0]?.restored ?? 0;
      const remaining = result[0]?.remaining ?? 0;

      // Keep the id sequence ahead of every id, never moving it backwards.
      const [seq] = await q(`SELECT pg_get_serial_sequence('${TABLE}', 'id') AS name;`);
      if (seq[0]?.name) {
        await q(
          `SELECT setval('${seq[0].name}',
                           GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${TABLE}),
                                    (SELECT last_value FROM ${seq[0].name})));`,
        );
      }

      if (remaining === 0) {
        await q(`DROP TABLE ${BACKUP};`);
        console.log(`${LOG} restored ${restored} backed-up link(s); backup table dropped`);
      } else {
        console.log(
          `${LOG} restored ${restored} backed-up link(s); ${remaining} kept in ${BACKUP} (their project no longer exists, or their Jira object was linked again)`,
        );
      }
    });
  },
};
