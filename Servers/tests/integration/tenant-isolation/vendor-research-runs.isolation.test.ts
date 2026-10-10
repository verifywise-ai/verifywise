jest.setTimeout(60000);

import { cleanupDatabase } from "../helpers";
import { sequelize } from "../../../database/db";
import { seedTwoTenantContexts } from "./tenantIsolation.harness";
import { createTestVendor } from "../../factories";
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * vendor_research_runs — a run belongs to one organization: no other
 * organization can read, start, finish or fail it, even when it names the
 * owner's vendor and run ids. The table also allows only one queued or running
 * run per vendor.
 */
describe("vendor_research_runs tenant isolation", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("returns a run only to its own organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);

    const run = await createRunQuery({
      organizationId: owner.orgId,
      vendorId,
      triggerType: "manual",
      requestedBy: owner.userId,
    });
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
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);
    const newRun = {
      organizationId: owner.orgId,
      vendorId,
      triggerType: "manual" as const,
      requestedBy: owner.userId,
    };
    // Postgres names a unique index, not a constraint, in `constraint`.
    const activeRunViolation = {
      parent: { code: "23505", constraint: "vendor_research_runs_active_uniq" },
    };

    const first = await createRunQuery(newRun);
    await expect(createRunQuery(newRun)).rejects.toMatchObject(activeRunViolation);

    // A running run blocks a new one as well. Another organization cannot start
    // it, and it can only be started once.
    expect(await markRunRunningQuery(attacker.orgId, first.id)).toBe(false);
    expect(await markRunRunningQuery(owner.orgId, first.id)).toBe(true);
    expect(await markRunRunningQuery(owner.orgId, first.id)).toBe(false);
    expect((await getActiveRunQuery(owner.orgId, vendorId))?.status).toBe("running");
    await expect(createRunQuery(newRun)).rejects.toMatchObject(activeRunViolation);

    // Another organization cannot finish it. When the owner does, the run is no
    // longer active and the vendor is free again: the index only covers queued
    // and running runs.
    const completed: FinishRunInput = {
      organizationId: attacker.orgId,
      runId: first.id,
      status: "completed",
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
      error: null,
    };
    await finishRunQuery(completed);
    expect((await getRunByIdQuery(owner.orgId, first.id))?.status).toBe("running");

    await finishRunQuery({ ...completed, organizationId: owner.orgId });
    const finished = await getRunByIdQuery(owner.orgId, first.id);
    expect(finished).toMatchObject({
      status: "completed",
      categories: completed.categories,
      category_summary: completed.categorySummary,
      evidence: completed.evidence,
      search_provider: "tavily",
      model: "test-model",
      prompt_version: "v1",
      searches_used: 2,
      duplicates_dropped: 1,
      error: null,
    });
    expect(finished?.finished_at).toBeInstanceOf(Date);
    expect(await getActiveRunQuery(owner.orgId, vendorId)).toBeNull();

    // The newer run is the active and the latest one; the finished run is kept.
    const second = await createRunQuery(newRun);
    await expect(createRunQuery(newRun)).rejects.toMatchObject(activeRunViolation);
    expect((await getActiveRunQuery(owner.orgId, vendorId))?.id).toBe(second.id);
    expect((await getLatestRunQuery(owner.orgId, vendorId))?.id).toBe(second.id);
    expect((await getRunByIdQuery(owner.orgId, first.id))?.status).toBe("completed");
    expect(await getLastRunCreatedAtQuery(owner.orgId, vendorId)).toEqual(second.created_at);
    expect(await countRunsSinceQuery(owner.orgId, first.created_at)).toBe(2);

    // A failed run frees the vendor too. No categories and no evidence are valid
    // for a run that failed early, and a long error is cut to 500 characters.
    await finishRunQuery({
      ...completed,
      organizationId: owner.orgId,
      runId: second.id,
      status: "failed",
      categories: [],
      categorySummary: [],
      evidence: null,
      error: "x".repeat(600),
    });
    const failed = await getRunByIdQuery(owner.orgId, second.id);
    expect(failed).toMatchObject({
      status: "failed",
      categories: [],
      category_summary: [],
      evidence: null,
    });
    expect(failed?.error).toBe("x".repeat(500));
    // Finishing one run leaves the vendor's other run as it was.
    expect(await getRunByIdQuery(owner.orgId, first.id)).toMatchObject({
      status: "completed",
      categories: completed.categories,
    });
    expect(await getActiveRunQuery(owner.orgId, vendorId)).toBeNull();
    await expect(createRunQuery(newRun)).resolves.toMatchObject({ status: "queued" });
  });

  it("fails only stale runs, only in the caller's organization", async () => {
    const { owner, attacker } = await seedTwoTenantContexts();
    const vendorId = await createTestVendor(owner.orgId);
    const otherVendorId = await createTestVendor(owner.orgId);
    const newRun = {
      organizationId: owner.orgId,
      vendorId,
      triggerType: "auto" as const,
      requestedBy: null,
    };
    const ageBy20Minutes = (runId: number, column: "created_at" | "started_at") =>
      sequelize.query(
        `UPDATE vendor_research_runs SET ${column} = NOW() - INTERVAL '20 minutes' WHERE id = :runId`,
        { replacements: { runId } },
      );

    const queued = await createRunQuery(newRun);
    await ageBy20Minutes(queued.id, "created_at");
    // Another vendor's run, just as old, which is not the vendor being checked.
    const otherVendorsRun = await createRunQuery({ ...newRun, vendorId: otherVendorId });
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
    const started = await createRunQuery(newRun);
    await ageBy20Minutes(started.id, "created_at");
    expect(await markRunRunningQuery(owner.orgId, started.id)).toBe(true);
    expect(await failStaleRunsQuery(owner.orgId, vendorId, 15)).toBe(0);
    await ageBy20Minutes(started.id, "started_at");
    expect(await failStaleRunsQuery(owner.orgId, vendorId, 15)).toBe(1);

    // None of that touched the other vendor's run.
    expect((await getRunByIdQuery(owner.orgId, otherVendorsRun.id))?.status).toBe("queued");
  });
});
