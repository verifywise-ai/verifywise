jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import type { TenantContext } from "./tenantIsolation.harness";
import { createTestVendor } from "../../factories";
import type { ResearchTrigger } from "../../../domain.layer/interfaces/i.vendorResearch";
import {
  STALE_RUN_MINUTES,
  countRunsSinceQuery,
  createRunQuery,
  failStaleRunsQuery,
  finishRunQuery,
  getActiveRunQuery,
  getLastRunCreatedAtQuery,
  getLatestRunQuery,
  getRunByIdQuery,
  markRunRunningQuery,
} from "../../../utils/vendorResearch.utils";
import type { FinishRunInput } from "../../../utils/vendorResearch.utils";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A new run of `vendorId`: requested by `ctx` when manual, by the system when automatic. */
const newRun = (ctx: TenantContext, vendorId: number, triggerType: ResearchTrigger = "manual") => ({
  organizationId: ctx.orgId,
  vendorId,
  triggerType,
  requestedBy: triggerType === "manual" ? ctx.userId : null,
});

/** A valid way to end `runId`; a test overrides what it is about. */
const finishOf = (
  organizationId: number,
  runId: number,
  overrides: Partial<FinishRunInput> = {},
): FinishRunInput => ({
  organizationId,
  runId,
  status: "completed",
  categories: [],
  categorySummary: [],
  evidence: null,
  model: null,
  promptVersion: null,
  searchesUsed: 0,
  pagesRead: 0,
  duplicatesDropped: 0,
  error: null,
  trace: null,
  coverage: null,
  registryVersion: null,
  ...overrides,
});

/** Makes `runId` look as if it was created `minutes` ago. */
const ageCreatedBy = (runId: number, minutes: number) =>
  sequelize.query(
    `UPDATE vendor_research_runs SET created_at = NOW() - (:minutes * INTERVAL '1 minute') WHERE id = :runId`,
    { replacements: { runId, minutes } },
  );

/**
 * vendor_research_runs — a run belongs to one organization: no other
 * organization can read, start, finish or fail it, even when it names the
 * owner's vendor and run ids. The table also allows only one queued or running
 * run per vendor. The remaining tests pin what the run queries store and return.
 */
describe("vendor_research_runs tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("returns a run only to its own organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);

    const run = await createRunQuery(newRun(owner, vendorId));
    const since = new Date(Date.now() - DAY_MS);

    // Positive controls first, so a broken query cannot pass as "isolated".
    expect((await getLatestRunQuery(owner.orgId, vendorId))?.id).toBe(run.id);
    expect((await getActiveRunQuery(owner.orgId, vendorId))?.id).toBe(run.id);
    expect((await getRunByIdQuery(owner.orgId, run.id))?.id).toBe(run.id);
    expect(await getLastRunCreatedAtQuery(owner.orgId, vendorId)).toBeInstanceOf(Date);
    expect(await countRunsSinceQuery(owner.orgId, since)).toBe(1);

    expect(await getLatestRunQuery(attacker.orgId, vendorId)).toBeNull();
    expect(await getActiveRunQuery(attacker.orgId, vendorId)).toBeNull();
    expect(await getRunByIdQuery(attacker.orgId, run.id)).toBeNull();
    expect(await getLastRunCreatedAtQuery(attacker.orgId, vendorId)).toBeNull();
    expect(await countRunsSinceQuery(attacker.orgId, since)).toBe(0);
  });

  it("allows one queued or running run per vendor", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);
    // Postgres names a unique index, not a constraint, in `constraint`.
    const activeRunViolation = {
      parent: { code: "23505", constraint: "vendor_research_runs_active_uniq" },
    };

    const first = await createRunQuery(newRun(owner, vendorId));
    await expect(createRunQuery(newRun(owner, vendorId))).rejects.toMatchObject(activeRunViolation);

    // A running run blocks a new one as well.
    expect(await markRunRunningQuery(owner.orgId, first.id)).toBe(true);
    await expect(createRunQuery(newRun(owner, vendorId))).rejects.toMatchObject(activeRunViolation);

    // A completed run frees the vendor: the index only covers queued and running runs.
    await finishRunQuery(finishOf(owner.orgId, first.id));
    const second = await createRunQuery(newRun(owner, vendorId));
    await expect(createRunQuery(newRun(owner, vendorId))).rejects.toMatchObject(activeRunViolation);

    // A failed run frees it too.
    await finishRunQuery(finishOf(owner.orgId, second.id, { status: "failed", error: "no luck" }));
    await expect(createRunQuery(newRun(owner, vendorId))).resolves.toMatchObject({
      status: "queued",
    });
  });

  it("fails only stale runs, only in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);
    const otherVendorId = await createTestVendor(owner.orgId);
    const ageBy20Minutes = (runId: number, column: "created_at" | "started_at") =>
      sequelize.query(
        `UPDATE vendor_research_runs SET ${column} = NOW() - INTERVAL '20 minutes' WHERE id = :runId`,
        { replacements: { runId } },
      );

    const queued = await createRunQuery(newRun(owner, vendorId, "auto"));
    await ageBy20Minutes(queued.id, "created_at");
    // Another vendor's run, just as old, which is not the vendor being checked.
    const otherVendorsRun = await createRunQuery(newRun(owner, otherVendorId, "auto"));
    await ageBy20Minutes(otherVendorsRun.id, "created_at");

    // 20 minutes is inside a 30 minute limit, so nothing is stale yet.
    expect(await failStaleRunsQuery(owner.orgId, vendorId, 30)).toBe(0);
    // Past the 15 minute limit, but not the attacker's run to fail.
    expect(await failStaleRunsQuery(attacker.orgId, vendorId, 15)).toBe(0);
    expect((await getRunByIdQuery(owner.orgId, queued.id))?.status).toBe("queued");

    expect(await failStaleRunsQuery(owner.orgId, vendorId, 15)).toBe(1);
    const timedOut = await getRunByIdQuery(owner.orgId, queued.id);
    expect(timedOut).toMatchObject({ status: "failed", error: "timed out" });
    expect(timedOut?.finished_at).toBeInstanceOf(Date);

    // A run that has already ended is not failed again.
    expect(await failStaleRunsQuery(owner.orgId, vendorId, 15)).toBe(0);

    // A started run is as old as its start, not as old as when it was queued. (A queued run that
    // has waited longer than the stale limit is not started any more, so this one is started
    // first and its creation is moved back afterwards.)
    const started = await createRunQuery(newRun(owner, vendorId, "auto"));
    expect(await markRunRunningQuery(owner.orgId, started.id)).toBe(true);
    await ageBy20Minutes(started.id, "created_at");
    expect(await failStaleRunsQuery(owner.orgId, vendorId, 15)).toBe(0);
    await ageBy20Minutes(started.id, "started_at");
    expect(await failStaleRunsQuery(owner.orgId, vendorId, 15)).toBe(1);

    // None of that touched the other vendor's run.
    expect((await getRunByIdQuery(owner.orgId, otherVendorsRun.id))?.status).toBe("queued");
  });

  it("does not let another organization start or finish a run", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);
    const run = await createRunQuery(newRun(owner, vendorId));

    // The attacker names the owner's run id directly.
    expect(await markRunRunningQuery(attacker.orgId, run.id)).toBe(false);
    await finishRunQuery(finishOf(attacker.orgId, run.id));
    expect(await getRunByIdQuery(owner.orgId, run.id)).toMatchObject({
      status: "queued",
      started_at: null,
      finished_at: null,
    });

    // Positive controls: the same calls work for the owner.
    expect(await markRunRunningQuery(owner.orgId, run.id)).toBe(true);
    await finishRunQuery(finishOf(owner.orgId, run.id));
    expect((await getRunByIdQuery(owner.orgId, run.id))?.status).toBe("completed");
  });

  it("stores a finished run's evidence and category summary, leaving other runs alone", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);
    const otherVendorId = await createTestVendor(owner.orgId);
    const run = await createRunQuery(newRun(owner, vendorId));
    const bystander = await createRunQuery(newRun(owner, otherVendorId));
    await markRunRunningQuery(owner.orgId, run.id);

    const finish = finishOf(owner.orgId, run.id, {
      categories: ["security_incidents", "certifications"],
      categorySummary: [
        { category: "security_incidents", outcome: "findings", note: "1 finding" },
        { category: "certifications", outcome: "nothing_found", note: "" },
      ],
      evidence: [
        {
          id: "S1",
          category: "security_incidents",
          kind: "result",
          onVendorSite: false,
          url: "https://example.com/incident",
          title: "Incident report",
          content: "Customer records were exposed.",
          publishedAt: null,
        },
      ],
      model: "test-model",
      promptVersion: "v1",
      searchesUsed: 2,
      pagesRead: 4,
      duplicatesDropped: 1,
    });
    await finishRunQuery(finish);

    const stored = await getRunByIdQuery(owner.orgId, run.id);
    expect(stored).toMatchObject({
      status: "completed",
      categories: finish.categories,
      category_summary: finish.categorySummary,
      evidence: finish.evidence,
      model: "test-model",
      prompt_version: "v1",
      searches_used: 2,
      pages_read: 4,
      duplicates_dropped: 1,
      error: null,
    });
    expect(stored?.finished_at).toBeInstanceOf(Date);

    // Finishing one run leaves the organization's other runs as they were.
    expect(await getRunByIdQuery(owner.orgId, bystander.id)).toMatchObject({
      status: "queued",
      categories: [],
      category_summary: [],
      evidence: null,
      finished_at: null,
    });
  });

  it("keeps the run counters and no search provider column", async () => {
    const columns = (await sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'verifywise' AND table_name = 'vendor_research_runs'`,
      { type: QueryTypes.SELECT },
    )) as Array<{ column_name: string }>;
    const names = columns.map((column) => column.column_name);

    expect(names).toEqual(expect.arrayContaining(["searches_used", "pages_read"]));
    expect(names).not.toContain("search_provider");
  });

  it("stores a failed run without categories and cuts its error to 500 characters", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);
    const run = await createRunQuery(newRun(owner, vendorId));

    // A run that failed early has no categories, summary or evidence to record.
    await finishRunQuery(
      finishOf(owner.orgId, run.id, { status: "failed", error: "x".repeat(600) }),
    );

    const failed = await getRunByIdQuery(owner.orgId, run.id);
    expect(failed).toMatchObject({
      status: "failed",
      categories: [],
      category_summary: [],
      evidence: null,
    });
    expect(failed?.error).toBe("x".repeat(500));
  });

  it("reads the active run, the latest run and run counts per organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);
    const attackerVendorId = await createTestVendor(attacker.orgId);

    // A queued and a running run are active; a finished one is not.
    const first = await createRunQuery(newRun(owner, vendorId));
    expect((await getActiveRunQuery(owner.orgId, vendorId))?.id).toBe(first.id);
    expect(await markRunRunningQuery(owner.orgId, first.id)).toBe(true);
    expect((await getActiveRunQuery(owner.orgId, vendorId))?.status).toBe("running");
    await finishRunQuery(finishOf(owner.orgId, first.id));
    expect(await getActiveRunQuery(owner.orgId, vendorId)).toBeNull();

    // The newer run is the active and the latest one; the finished run is kept.
    const second = await createRunQuery(newRun(owner, vendorId, "auto"));
    expect((await getActiveRunQuery(owner.orgId, vendorId))?.id).toBe(second.id);
    expect((await getLatestRunQuery(owner.orgId, vendorId))?.id).toBe(second.id);
    expect((await getRunByIdQuery(owner.orgId, first.id))?.status).toBe("completed");
    expect(await getLastRunCreatedAtQuery(owner.orgId, vendorId)).toEqual(second.created_at);

    // Counts cover runs of any trigger type, and only the organization's own. The next test
    // pins which statuses count.
    const attackersRun = await createRunQuery(newRun(attacker, attackerVendorId, "auto"));
    expect(await countRunsSinceQuery(owner.orgId, first.created_at)).toBe(2);
    expect(await countRunsSinceQuery(attacker.orgId, first.created_at)).toBe(1);
    expect(await getLastRunCreatedAtQuery(attacker.orgId, attackerVendorId)).toEqual(
      attackersRun.created_at,
    );
  });

  it("leaves a run that failed before it started out of the cooldown and the daily count", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);
    const otherVendorId = await createTestVendor(owner.orgId);
    const createdHoursAgo = (runId: number, hours: number) =>
      sequelize.query(
        `UPDATE vendor_research_runs SET created_at = NOW() - (:hours * INTERVAL '1 hour') WHERE id = :runId`,
        { replacements: { runId, hours } },
      );

    // A vendor has at most one queued or running run, so the runs that ended come first.
    const completed = await createRunQuery(newRun(owner, vendorId));
    await markRunRunningQuery(owner.orgId, completed.id);
    await finishRunQuery(finishOf(owner.orgId, completed.id));

    const failedAfterStart = await createRunQuery(newRun(owner, vendorId));
    await markRunRunningQuery(owner.orgId, failedAfterStart.id);
    await finishRunQuery(
      finishOf(owner.orgId, failedAfterStart.id, {
        status: "failed",
        error: "Model call failed: HTTP 500",
      }),
    );

    // Failed while still queued, as when its job could not be queued: it searched nothing.
    const neverStarted = await createRunQuery(newRun(owner, vendorId));
    await finishRunQuery(
      finishOf(owner.orgId, neverStarted.id, { status: "failed", error: "could not enqueue" }),
    );

    // A queued run of another vendor, as young as a run waiting for its job: it counts. (An old
    // one would not: see the test below.)
    const queued = await createRunQuery(newRun(owner, otherVendorId));

    // The run that never started is the newest of the vendor's runs, so the cooldown would show it
    // if it counted.
    await createdHoursAgo(completed.id, 4);
    await createdHoursAgo(failedAfterStart.id, 2);
    await createdHoursAgo(neverStarted.id, 1);

    expect(await getRunByIdQuery(owner.orgId, neverStarted.id)).toMatchObject({
      status: "failed",
      started_at: null,
    });
    const afterStart = await getRunByIdQuery(owner.orgId, failedAfterStart.id);
    expect(afterStart).toMatchObject({ status: "failed" });
    expect(afterStart?.started_at).toBeInstanceOf(Date);
    expect((await getRunByIdQuery(owner.orgId, queued.id))?.status).toBe("queued");

    // Four runs exist and three of them count: all but the one that failed before it started.
    expect(await countRunsSinceQuery(owner.orgId, new Date(Date.now() - 5 * HOUR_MS))).toBe(3);
    // The last run for the cooldown is the newest of the vendor's counted runs, not the newer run
    // that never started.
    expect(await getLastRunCreatedAtQuery(owner.orgId, vendorId)).toEqual(afterStart?.created_at);
  });

  // The job of a queued run can be lost: every API start empties the queue of waiting jobs. Such a
  // run stays `queued`, and the sweep only looks at the vendor that is started or read, so without
  // this rule it would use up a slot of the daily cap for 24 hours although it searched nothing.
  describe("a queued run whose job was lost", () => {
    it("stops counting toward the cooldown and the daily count once it is older than the stale limit", async () => {
      const { owner } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);
      const since = new Date(Date.now() - DAY_MS);
      const queued = await createRunQuery(newRun(owner, vendorId, "auto"));

      // Positive control: the run as it is when it has just been queued counts for both.
      expect(await countRunsSinceQuery(owner.orgId, since)).toBe(1);
      expect(await getLastRunCreatedAtQuery(owner.orgId, vendorId)).toEqual(queued.created_at);

      // Just inside the limit it still counts: its job may be waiting behind others.
      await ageCreatedBy(queued.id, STALE_RUN_MINUTES - 1);
      expect(await countRunsSinceQuery(owner.orgId, since)).toBe(1);
      expect(await getLastRunCreatedAtQuery(owner.orgId, vendorId)).toBeInstanceOf(Date);

      // Just outside the limit, and hours old but still inside the 24-hour window, it does not.
      for (const minutes of [STALE_RUN_MINUTES + 1, 20 * 60]) {
        await ageCreatedBy(queued.id, minutes);
        expect(await countRunsSinceQuery(owner.orgId, since)).toBe(0);
        expect(await getLastRunCreatedAtQuery(owner.orgId, vendorId)).toBeNull();
      }

      // It is still queued: nothing swept it, the query only stopped counting it.
      expect(await getRunByIdQuery(owner.orgId, queued.id)).toMatchObject({
        status: "queued",
        started_at: null,
        finished_at: null,
      });
    });

    it("counts the organization's other runs as before: a running run counts however long it has run", async () => {
      const { owner, attacker } = await seedTwoTenantContexts();
      const lostVendorId = await createTestVendor(owner.orgId);
      const runningVendorId = await createTestVendor(owner.orgId);
      const failedVendorId = await createTestVendor(owner.orgId);
      const attackerVendorId = await createTestVendor(attacker.orgId);
      const since = new Date(Date.now() - DAY_MS);

      const lost = await createRunQuery(newRun(owner, lostVendorId, "auto"));
      await ageCreatedBy(lost.id, STALE_RUN_MINUTES + 5);

      // Started long ago and still running: it did start, and may be using a search and a model.
      const running = await createRunQuery(newRun(owner, runningVendorId, "auto"));
      await markRunRunningQuery(owner.orgId, running.id);
      await sequelize.query(
        `UPDATE vendor_research_runs
         SET created_at = NOW() - INTERVAL '3 hours', started_at = NOW() - INTERVAL '3 hours'
         WHERE id = :runId`,
        { replacements: { runId: running.id } },
      );

      // Started, then failed (as the sweep leaves a run that timed out while running).
      const failed = await createRunQuery(newRun(owner, failedVendorId, "auto"));
      await markRunRunningQuery(owner.orgId, failed.id);
      await finishRunQuery(
        finishOf(owner.orgId, failed.id, { status: "failed", error: "timed out" }),
      );
      await ageCreatedBy(failed.id, 2 * 60);

      // The other organization's lost run is as old: it does not count there either.
      const foreign = await createRunQuery(newRun(attacker, attackerVendorId, "auto"));
      await ageCreatedBy(foreign.id, STALE_RUN_MINUTES + 5);

      // The lost run is the only one of the owner's three that does not count.
      expect(await countRunsSinceQuery(owner.orgId, since)).toBe(2);
      expect(await getLastRunCreatedAtQuery(owner.orgId, lostVendorId)).toBeNull();
      expect(await getLastRunCreatedAtQuery(owner.orgId, runningVendorId)).toBeInstanceOf(Date);
      expect(await getLastRunCreatedAtQuery(owner.orgId, failedVendorId)).toBeInstanceOf(Date);
      expect(await countRunsSinceQuery(attacker.orgId, since)).toBe(0);
    });
  });

  // The 15-minute rule is one rule. A queued run that has waited longer than the stale limit does
  // not count toward the limits (see above), and a worker that picks its job up late does not start
  // it either: otherwise a worker that was down for a while would run all of them as soon as it came
  // back, with their searches and model calls, beyond a cap that no longer saw them.
  describe("a queued run that has waited longer than the stale limit", () => {
    it("is started just inside the limit and not just outside it, and a refused run is left as it was", async () => {
      const { owner } = await seedTwoTenantContexts();
      const insideVendorId = await createTestVendor(owner.orgId);
      const outsideVendorId = await createTestVendor(owner.orgId);
      const inside = await createRunQuery(newRun(owner, insideVendorId, "auto"));
      const outside = await createRunQuery(newRun(owner, outsideVendorId, "auto"));
      await ageCreatedBy(inside.id, STALE_RUN_MINUTES - 1);

      // Positive control: just inside the limit its job is still welcome.
      expect(await markRunRunningQuery(owner.orgId, inside.id)).toBe(true);
      const started = await getRunByIdQuery(owner.orgId, inside.id);
      expect(started?.status).toBe("running");
      expect(started?.started_at).toBeInstanceOf(Date);

      // Just outside the limit, and hours old: the call answers false and changes nothing.
      for (const minutes of [STALE_RUN_MINUTES + 1, 20 * 60]) {
        await ageCreatedBy(outside.id, minutes);
        const before = await getRunByIdQuery(owner.orgId, outside.id);
        expect(before).toMatchObject({ status: "queued", started_at: null });

        expect(await markRunRunningQuery(owner.orgId, outside.id)).toBe(false);

        expect(await getRunByIdQuery(owner.orgId, outside.id)).toEqual(before);
      }
    });

    it("is then failed by the sweep as timed out, never started, and counts for nothing", async () => {
      const { owner } = await seedTwoTenantContexts();
      const vendorId = await createTestVendor(owner.orgId);
      const run = await createRunQuery(newRun(owner, vendorId, "auto"));
      await ageCreatedBy(run.id, STALE_RUN_MINUTES + 1);
      expect(await markRunRunningQuery(owner.orgId, run.id)).toBe(false);

      expect(await failStaleRunsQuery(owner.orgId, vendorId, STALE_RUN_MINUTES)).toBe(1);

      const failed = await getRunByIdQuery(owner.orgId, run.id);
      expect(failed).toMatchObject({ status: "failed", error: "timed out", started_at: null });
      expect(await countRunsSinceQuery(owner.orgId, new Date(Date.now() - DAY_MS))).toBe(0);
      expect(await getLastRunCreatedAtQuery(owner.orgId, vendorId)).toBeNull();
    });

    it("leaves a running run and a finished run as they were, whatever their age", async () => {
      const { owner } = await seedTwoTenantContexts();
      const runningVendorId = await createTestVendor(owner.orgId);
      const failedVendorId = await createTestVendor(owner.orgId);
      const neverStartedVendorId = await createTestVendor(owner.orgId);

      const running = await createRunQuery(newRun(owner, runningVendorId, "auto"));
      expect(await markRunRunningQuery(owner.orgId, running.id)).toBe(true);

      const failed = await createRunQuery(newRun(owner, failedVendorId, "auto"));
      expect(await markRunRunningQuery(owner.orgId, failed.id)).toBe(true);
      await finishRunQuery(
        finishOf(owner.orgId, failed.id, {
          status: "failed",
          error: "Model call failed: HTTP 500",
        }),
      );

      // Failed while still queued, as when its job could not be queued.
      const neverStarted = await createRunQuery(newRun(owner, neverStartedVendorId, "auto"));
      await finishRunQuery(
        finishOf(owner.orgId, neverStarted.id, { status: "failed", error: "could not enqueue" }),
      );

      for (const run of [running, failed, neverStarted]) {
        await ageCreatedBy(run.id, 3 * 60);
        const before = await getRunByIdQuery(owner.orgId, run.id);

        // Not queued, so not started again: the answer is the same at any age.
        expect(await markRunRunningQuery(owner.orgId, run.id)).toBe(false);

        expect(await getRunByIdQuery(owner.orgId, run.id)).toEqual(before);
      }
    });
  });

  it("starts only the named run, and only while it is queued", async () => {
    const { owner } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);
    const otherVendorId = await createTestVendor(owner.orgId);
    const run = await createRunQuery(newRun(owner, vendorId));
    const bystander = await createRunQuery(newRun(owner, otherVendorId));

    expect(await markRunRunningQuery(owner.orgId, run.id)).toBe(true);
    expect((await getRunByIdQuery(owner.orgId, run.id))?.started_at).toBeInstanceOf(Date);
    // The organization's other queued run stays queued.
    expect((await getRunByIdQuery(owner.orgId, bystander.id))?.status).toBe("queued");

    // A running run is not started again, and neither is a finished one.
    expect(await markRunRunningQuery(owner.orgId, run.id)).toBe(false);
    await finishRunQuery(finishOf(owner.orgId, run.id));
    expect(await markRunRunningQuery(owner.orgId, run.id)).toBe(false);
    expect((await getRunByIdQuery(owner.orgId, run.id))?.status).toBe("completed");
  });
});
