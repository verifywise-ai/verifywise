jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import type { TenantContext } from "./tenantIsolation.harness";
import { createTestVendor } from "../../factories";
import type { ResearchTrigger } from "../../../domain.layer/interfaces/i.vendorResearch";
import {
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
  searchProvider: null,
  model: null,
  promptVersion: null,
  searchesUsed: 0,
  duplicatesDropped: 0,
  error: null,
  ...overrides,
});

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

    // A started run is as old as its start, not as old as when it was queued.
    const started = await createRunQuery(newRun(owner, vendorId, "auto"));
    await ageBy20Minutes(started.id, "created_at");
    expect(await markRunRunningQuery(owner.orgId, started.id)).toBe(true);
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
          url: "https://example.com/incident",
          title: "Incident report",
          content: "Customer records were exposed.",
          publishedAt: null,
        },
      ],
      searchProvider: "tavily",
      model: "test-model",
      promptVersion: "v1",
      searchesUsed: 2,
      duplicatesDropped: 1,
    });
    await finishRunQuery(finish);

    const stored = await getRunByIdQuery(owner.orgId, run.id);
    expect(stored).toMatchObject({
      status: "completed",
      categories: finish.categories,
      category_summary: finish.categorySummary,
      evidence: finish.evidence,
      search_provider: "tavily",
      model: "test-model",
      prompt_version: "v1",
      searches_used: 2,
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
    const createdHoursAgo = (runId: number, hours: number) =>
      sequelize.query(
        `UPDATE vendor_research_runs SET created_at = NOW() - (:hours * INTERVAL '1 hour') WHERE id = :runId`,
        { replacements: { runId, hours } },
      );

    // A vendor has at most one queued or running run, so the runs that ended come first and the
    // queued run comes last.
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

    const queued = await createRunQuery(newRun(owner, vendorId));

    // The run that never started is the newest of all, so the cooldown would show it if it counted.
    await createdHoursAgo(completed.id, 4);
    await createdHoursAgo(queued.id, 3);
    await createdHoursAgo(failedAfterStart.id, 2);
    await createdHoursAgo(neverStarted.id, 1);

    expect(await getRunByIdQuery(owner.orgId, neverStarted.id)).toMatchObject({
      status: "failed",
      started_at: null,
    });
    const afterStart = await getRunByIdQuery(owner.orgId, failedAfterStart.id);
    expect(afterStart).toMatchObject({ status: "failed" });
    expect(afterStart?.started_at).toBeInstanceOf(Date);

    // Four runs exist and three of them count: all but the one that failed before it started.
    expect(await countRunsSinceQuery(owner.orgId, new Date(Date.now() - 5 * HOUR_MS))).toBe(3);
    // The last run for the cooldown is the newest of those three, not the newer run that never
    // started.
    expect(await getLastRunCreatedAtQuery(owner.orgId, vendorId)).toEqual(afterStart?.created_at);
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
