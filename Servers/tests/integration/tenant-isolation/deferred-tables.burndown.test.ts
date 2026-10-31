/**
 * Deferred-scoped-tables burndown — issue #4680.
 *
 * Servers/scripts/auditTenantIsolationCoverage.ts (owned by another pod;
 * read-only here) carries a `deferredScopedTables` allow-list: tenant-scoped
 * tables that exist in the database but are intentionally deferred to a
 * future isolation wave. That list must only ever shrink: every isolation
 * wave removes entries by adding matrix/registry coverage, never adds them.
 *
 * This test parses the script source (importing it would execute the audit's
 * main()) and asserts the entry count stays at or below the baseline ceiling
 * captured when this test was written. When a wave lands and the count
 * drops, lower DEFERRED_BASELINE_CEILING to the new count — that diff is the
 * burndown proof.
 *
 * No database access: runs anywhere the integration suite runs.
 */

import fs from "node:fs";
import path from "node:path";

const AUDIT_SCRIPT_PATH = path.resolve(
  __dirname,
  "../../../scripts/auditTenantIsolationCoverage.ts",
);

/**
 * Baseline captured 2026-10-20 from
 * scripts/auditTenantIsolationCoverage.ts @ chore/debora-one-fix-to-all.
 *
 * Re-baselined 2026-10-28 at 215: the framework control change-history
 * tables added for #4977 (control_eu / subcontrol_eu / annex_category
 * _change_history) join the deferred list under the same justification as
 * the other change-history tables — they are written only via
 * changeHistory.base.utils, which filters by organization_id — pending a
 * dedicated isolation wave. Unlike a burndown drop, this bump is an
 * intentional, documented addition, not drift.
 */
const DEFERRED_BASELINE_CEILING = 215;

function countDeferredScopedTables(): { count: number; names: string[] } {
  const source = fs.readFileSync(AUDIT_SCRIPT_PATH, "utf8");
  const start = source.indexOf("const deferredScopedTables");
  const end = source.indexOf("];", start);
  if (start === -1 || end === -1) {
    throw new Error("deferredScopedTables block not found in auditTenantIsolationCoverage.ts");
  }
  const block = source.slice(start, end);
  const names = [...block.matchAll(/name:\s*"([^"]+)"/g)].map((match) => match[1]);
  return { count: names.length, names };
}

describe("Deferred scoped-tables burndown (#4680)", () => {
  it("deferredScopedTables only shrinks: count stays under the baseline ceiling", () => {
    const { count } = countDeferredScopedTables();
    if (count > DEFERRED_BASELINE_CEILING) {
      throw new Error(
        `deferredScopedTables has ${count} entries, above the baseline ceiling ` +
          `${DEFERRED_BASELINE_CEILING}. Entries must be REMOVED by isolation waves ` +
          "(with matrix/registry coverage), never added. If a wave just landed, " +
          "lower DEFERRED_BASELINE_CEILING to the new count.",
      );
    }
    expect(count).toBeLessThanOrEqual(DEFERRED_BASELINE_CEILING);
  });

  it("every deferred entry carries a justification (audit-script contract)", () => {
    const source = fs.readFileSync(AUDIT_SCRIPT_PATH, "utf8");
    const { names } = countDeferredScopedTables();
    for (const name of names) {
      const entryPattern = new RegExp(
        `name:\\s*"${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]*?justification:`,
      );
      if (!entryPattern.test(source)) {
        throw new Error(`${name} is missing a justification in auditTenantIsolationCoverage.ts`);
      }
    }
  });
});
