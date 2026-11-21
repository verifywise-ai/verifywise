jest.setTimeout(60000);

/**
 * The live progress of a research run, against the real tables of the test database: the query that
 * writes it (only while the run is running, only in its own organization), the queries that end a
 * run and empty it, what the API shows of it, and a whole run that writes it step by step.
 *
 * There is no network, no model and no Redis use: the researcher and the model are fakes that are
 * handed to the pipeline.
 */

// First, and not to be reordered: ./setup registers the mocks of BullMQ and Redis, and they only
// apply to the modules that are loaded after it.
import "./setup";
import http from "http";
import { QueryTypes } from "sequelize";
import { cleanupDatabase } from "./helpers";
import { sequelize } from "../../database/db";
import { createTestVendor } from "../factories";
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import type { TenantContext } from "./tenant-isolation/tenantIsolation.harness";
import { createTestApp, testRequest } from "./setup";
import { RunProgress } from "../../domain.layer/interfaces/i.vendorResearch";
import { PipelineDeps, runVendorResearch } from "../../services/vendorResearch/pipeline";
import { ResearchOutput } from "../../services/vendorResearch/schema";
import {
  createRunQuery,
  failStaleRunsQuery,
  finishRunQuery,
  getLatestRunQuery,
  getRunByIdQuery,
  markRunRunningQuery,
  updateRunProgressQuery,
} from "../../utils/vendorResearch.utils";

afterEach(async () => {
  await cleanupDatabase();
});

const NOW = new Date("2026-10-10T12:00:00Z");

const progressOf = (overrides: Partial<RunProgress> = {}): RunProgress => ({
  phase: "researching",
  steps: 2,
  action: "read",
  category: "certifications",
  searchesUsed: 1,
  pagesRead: 1,
  categories: ["security_incidents", "certifications"],
  updatedAt: NOW.toISOString(),
  ...overrides,
});

const ACME = { vendor_name: "Acme", website: "acme.com", vendor_provides: "Payroll software" };

interface Seed {
  owner: TenantContext;
  attacker: TenantContext;
  vendorId: number;
}

/** Two organizations, and the vendor Acme in the first one. */
async function seed(): Promise<Seed> {
  const { owner, attacker } = await seedTwoTenantContexts(1);
  const vendorId = await createTestVendor(owner.orgId, ACME);
  return { owner, attacker, vendorId };
}

/** A queued run of the vendor. */
async function queuedRun({ owner, vendorId }: Seed): Promise<number> {
  const run = await createRunQuery({
    organizationId: owner.orgId,
    vendorId,
    triggerType: "manual",
    requestedBy: owner.userId,
  });
  return run.id;
}

/** A run that a worker has started. */
async function runningRun(seeded: Seed): Promise<number> {
  const runId = await queuedRun(seeded);
  expect(await markRunRunningQuery(seeded.owner.orgId, runId)).toBe(true);
  return runId;
}

/** The progress column as the database holds it. */
async function storedProgress(orgId: number, runId: number): Promise<unknown> {
  const rows = (await sequelize.query(
    `SELECT progress FROM vendor_research_runs WHERE organization_id = :orgId AND id = :runId`,
    { replacements: { orgId, runId }, type: QueryTypes.SELECT },
  )) as Array<{ progress: unknown }>;
  return rows[0].progress;
}

const finishInput = (
  orgId: number,
  runId: number,
  status: "completed" | "failed",
): Parameters<typeof finishRunQuery>[0] => ({
  organizationId: orgId,
  runId,
  status,
  categories: [],
  categorySummary: [],
  evidence: null,
  model: null,
  promptVersion: null,
  searchesUsed: 0,
  pagesRead: 0,
  duplicatesDropped: 0,
  error: status === "failed" ? "Unexpected error" : null,
  trace: null,
  coverage: null,
  registryVersion: null,
});

describe("updateRunProgressQuery", () => {
  it("writes the progress of a running run", async () => {
    const seeded = await seed();
    const runId = await runningRun(seeded);

    await updateRunProgressQuery(seeded.owner.orgId, runId, progressOf());

    expect(await storedProgress(seeded.owner.orgId, runId)).toEqual(progressOf());
  });

  it("replaces the progress it wrote before: the last write is what the page reads", async () => {
    const seeded = await seed();
    const runId = await runningRun(seeded);

    await updateRunProgressQuery(seeded.owner.orgId, runId, progressOf({ steps: 1 }));
    await updateRunProgressQuery(seeded.owner.orgId, runId, progressOf({ steps: 2 }));

    expect(await storedProgress(seeded.owner.orgId, runId)).toMatchObject({ steps: 2 });
  });

  it("does not write to a run that has not started", async () => {
    const seeded = await seed();
    const runId = await queuedRun(seeded);

    await updateRunProgressQuery(seeded.owner.orgId, runId, progressOf());

    expect(await storedProgress(seeded.owner.orgId, runId)).toBeNull();
  });

  it.each(["completed", "failed"] as const)(
    "cannot bring a %s run back to life: a late write finds a run that is not running",
    async (status) => {
      const seeded = await seed();
      const runId = await runningRun(seeded);
      await finishRunQuery(finishInput(seeded.owner.orgId, runId, status));

      await updateRunProgressQuery(seeded.owner.orgId, runId, progressOf());

      expect(await storedProgress(seeded.owner.orgId, runId)).toBeNull();
    },
  );

  it("writes only in the organization it is given, even for a run id of another organization", async () => {
    const seeded = await seed();
    const runId = await runningRun(seeded);

    await updateRunProgressQuery(seeded.attacker.orgId, runId, progressOf());

    expect(await storedProgress(seeded.owner.orgId, runId)).toBeNull();
  });
});

describe("the end of a run", () => {
  it.each(["completed", "failed"] as const)(
    "empties the progress when the run %s",
    async (status) => {
      const seeded = await seed();
      const runId = await runningRun(seeded);
      await updateRunProgressQuery(seeded.owner.orgId, runId, progressOf());

      await finishRunQuery(finishInput(seeded.owner.orgId, runId, status));

      expect(await storedProgress(seeded.owner.orgId, runId)).toBeNull();
    },
  );

  it("empties the progress of a run that the sweep fails as stuck", async () => {
    const seeded = await seed();
    const runId = await runningRun(seeded);
    await updateRunProgressQuery(seeded.owner.orgId, runId, progressOf());
    await sequelize.query(
      `UPDATE vendor_research_runs SET started_at = NOW() - INTERVAL '1 hour' WHERE id = :runId`,
      { replacements: { runId } },
    );

    const failed = await failStaleRunsQuery(seeded.owner.orgId, seeded.vendorId, 15);

    expect(failed).toBe(1);
    expect(await storedProgress(seeded.owner.orgId, runId)).toBeNull();
  });
});

describe("reading a run", () => {
  it("gives the progress with the run, by id and as the vendor's latest", async () => {
    const seeded = await seed();
    const runId = await runningRun(seeded);
    await updateRunProgressQuery(seeded.owner.orgId, runId, progressOf());

    const byId = await getRunByIdQuery(seeded.owner.orgId, runId);
    const latest = await getLatestRunQuery(seeded.owner.orgId, seeded.vendorId);

    expect(byId?.progress).toEqual(progressOf());
    expect(latest?.progress).toEqual(progressOf());
  });

  it("gives null for a run that is queued or has ended", async () => {
    const seeded = await seed();
    const runId = await queuedRun(seeded);
    expect((await getRunByIdQuery(seeded.owner.orgId, runId))?.progress).toBeNull();
  });
});

describe("GET /api/v1/vendors/:id/research/latest", () => {
  /** A request agent for another role of the same organization and user. */
  async function requestAs(role: string, ctx: TenantContext) {
    const app: http.Server = await createTestApp({
      bypassAuth: true,
      mockUser: { userId: ctx.userId, organizationId: ctx.orgId, role },
    });
    return testRequest(app);
  }

  it("shows the progress of a running run to every role, and nothing a third party wrote", async () => {
    const seeded = await seed();
    const runId = await runningRun(seeded);
    await updateRunProgressQuery(seeded.owner.orgId, runId, progressOf());

    for (const role of ["Admin", "Editor", "Reviewer", "Auditor"]) {
      const request = await requestAs(role, seeded.owner);
      const res = await request.get(`/api/v1/vendors/${seeded.vendorId}/research/latest`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("running");
      expect(res.body.data.progress).toEqual(progressOf());
    }
  });

  it("shows null once the run has ended", async () => {
    const seeded = await seed();
    const runId = await runningRun(seeded);
    await updateRunProgressQuery(seeded.owner.orgId, runId, progressOf());
    await finishRunQuery(finishInput(seeded.owner.orgId, runId, "completed"));

    const res = await seeded.owner.request.get(
      `/api/v1/vendors/${seeded.vendorId}/research/latest`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("completed");
    expect(res.body.data.progress).toBeNull();
  });
});

describe("a whole run", () => {
  /** Waits until the database holds a progress that satisfies `done`, or fails. */
  async function untilStored(
    orgId: number,
    runId: number,
    done: (progress: RunProgress | null) => boolean,
  ): Promise<RunProgress | null> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const stored = (await storedProgress(orgId, runId)) as RunProgress | null;
      if (done(stored)) return stored;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("The progress did not reach the database.");
  }

  it("writes its progress while it goes and leaves none behind when it ends", async () => {
    const seeded = await seed();
    const runId = await queuedRun(seeded);
    const seen: Array<RunProgress | null> = [];

    const research: PipelineDeps["research"] = async ({ progress }) => {
      seen.push(await untilStored(seeded.owner.orgId, runId, (p) => p?.steps === 0));
      progress?.({
        steps: 1,
        action: "search",
        category: "security_incidents",
        searchesUsed: 1,
        pagesRead: 0,
        categories: ["security_incidents"],
      });
      seen.push(await untilStored(seeded.owner.orgId, runId, (p) => p?.steps === 1));
      progress?.({
        steps: 2,
        action: "read",
        category: "security_incidents",
        searchesUsed: 1,
        pagesRead: 1,
        categories: ["security_incidents"],
      });
      seen.push(await untilStored(seeded.owner.orgId, runId, (p) => p?.steps === 2));
      return {
        entries: [],
        calls: [
          { category: "security_incidents", tool: "search", answered: true, failure: null },
          { category: "security_incidents", tool: "read", answered: true, failure: null },
        ],
        searchesUsed: 1,
        pagesRead: 1,
        stoppedBecause: "finished",
        modelError: null,
        jsonObjectFallback: false,
      };
    };
    const generate = jest.fn(async () => ({
      object: { findings: [], category_notes: [] } as ResearchOutput,
      attempts: 1,
      selfCorrected: false,
    })) as unknown as PipelineDeps["generate"];

    const result = await runVendorResearch(
      { organizationId: seeded.owner.orgId, vendorId: seeded.vendorId, runId },
      {
        research,
        resolveModel: async () => ({ model: {}, modelId: "test-model" }),
        generate,
        now: () => NOW,
      },
    );

    expect(result.outcome).toBe("completed");
    expect(seen.map((progress) => [progress?.phase, progress?.steps, progress?.action])).toEqual([
      ["researching", 0, null],
      ["researching", 1, "search"],
      ["researching", 2, "read"],
    ]);
    // Nothing found, so no analysis: the run ended as it was researching, and holds none now.
    expect(await storedProgress(seeded.owner.orgId, runId)).toBeNull();
    const finished = await getRunByIdQuery(seeded.owner.orgId, runId);
    expect(finished?.status).toBe("completed");
    expect(finished?.progress).toBeNull();
  });
});
