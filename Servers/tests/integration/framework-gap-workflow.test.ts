// Integration suites share one Postgres instance and truncate between
// tests; the default 5s hook timeout is not enough once several suites
// run in the same --runInBand pass. Same value as the isolation matrix.
jest.setTimeout(60000);

/**
 * The framework-gap workflow must stay silent when there is no gap.
 *
 * `skip` does not terminate a run — the engine marks the step and advances — so
 * `check_any_low`'s "Skip if no framework is below threshold" short-circuit
 * never short-circuited. Execution walked on to notify_admins, which read an
 * empty scan result and broadcast "Frameworks below 70%: ." to every admin in
 * the org. runFrameworkGapScan starts one run per org daily at 07:00 with no
 * dedup, so a new org with no readiness rows at all got this every morning
 * from day one.
 *
 * The existing definition tests exercise the handlers in isolation, which is
 * exactly why they could not see it: the defect only exists once the engine
 * decides what a `skip` means. This suite runs the real workflow end to end.
 */

import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { startWorkflow } from "../../services/workflows/engine";
import { frameworkGapWorkflow } from "../../services/workflows/definitions/frameworkGap.workflow";
import { createTestOrganization, createTestUser, cleanupDatabase } from "./helpers";

async function notificationCount(orgId: number): Promise<number> {
  const rows = (await sequelize.query(
    `SELECT COUNT(*)::int AS n FROM notifications WHERE organization_id = :orgId`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as Array<{ n: number }>;
  return rows[0].n;
}

describe("framework gap remediation workflow", () => {
  let orgId: number;

  beforeEach(async () => {
    await cleanupDatabase();
    orgId = await createTestOrganization("Gap scan org");
    // An admin must exist, otherwise notify_admins skips for an unrelated
    // reason and the test would pass without proving anything.
    await createTestUser(orgId, 1, `gap-admin-${Date.now()}@test.com`, "Password123!");
  });

  afterAll(async () => {
    await cleanupDatabase();
    // Release the pool. Each test file gets its own module registry and so its
    // own sequelize instance; leaving connections open makes the NEXT file's
    // cleanupDatabase() TRUNCATE wait on them and time out.
    await sequelize.close();
  });

  it("completes without notifying anyone when no framework is below threshold", async () => {
    // No rows in framework_readiness_scores at all — the new-organization case.
    const run = await startWorkflow(frameworkGapWorkflow, { organizationId: orgId });

    expect(run.state).toBe("completed");
    expect(await notificationCount(orgId)).toBe(0);
  });

  it("ends at the terminal step rather than falling through to the notify step", async () => {
    const run = await startWorkflow(frameworkGapWorkflow, { organizationId: orgId });

    const executed = run.results.map((r) => r.stepId);
    expect(executed).toContain("check_any_low");
    expect(executed).toContain("no_gaps");
    // The two steps between the branch and the terminal no-op must not run:
    // fetch_weakest_controls is wasted work and notify_admins is the broadcast.
    expect(executed).not.toContain("fetch_weakest_controls");
    expect(executed).not.toContain("notify_admins");
  });
});
