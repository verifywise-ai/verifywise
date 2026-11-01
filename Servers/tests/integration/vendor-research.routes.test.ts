jest.setTimeout(60000);

/**
 * The vendor research endpoints against the real test database: starting a run, reading the
 * latest run of a vendor, the research settings and the list of findings.
 *
 * BullMQ is mocked by ./setup, so no Redis is used: what the start endpoint queues is read back
 * from the mocked queue (the job name, its data and its id), never run. The web and the model are
 * not involved. The limits and the automatic start come from the environment, which this file sets
 * for each test and puts back when it is done.
 */

import http from "http";
import { QueryTypes } from "sequelize";
import { cleanupDatabase, createTestUser } from "./helpers";
import { sequelize } from "../../database/db";
// The harness loads ./setup, which registers the mocks of BullMQ and Redis: keep it before the
// modules that open a queue.
import { seedTwoTenantContexts } from "./tenant-isolation/tenantIsolation.harness";
import type { TenantContext } from "./tenant-isolation/tenantIsolation.harness";
import { createTestApp, testRequest } from "./setup";
import { createTestVendor } from "../factories";
import { vendorResearchQueue } from "../../services/vendorResearch/queue";
import { invalidateRoleMapCache } from "../../utils/roleMap";
import { invalidateRolePermissionsCache } from "../../utils/rolePermissions.utils";
import { createTraceRecorder } from "../../services/vendorResearch/trace";
import type { EvidenceSource, NewFinding } from "../../domain.layer/interfaces/i.vendorResearch";
import {
  createRunQuery,
  finishRunQuery,
  insertFindingsQuery,
  markFindingDismissedQuery,
  markRunRunningQuery,
  RUN_TIME_LIMIT_MINUTES,
  STALE_RUNNING_RUN_MINUTES,
} from "../../utils/vendorResearch.utils";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const FAKE_LLM_KEY = "sk-SENTINEL-integration-51fa";

/** Research starts by itself, and the limits are the defaults. */
const RESEARCH_ENV: Record<string, string> = {
  VENDOR_RESEARCH_AUTO_RUN: "true",
  VENDOR_RESEARCH_MANUAL_COOLDOWN_MINUTES: "10",
  VENDOR_RESEARCH_DAILY_RUN_CAP: "50",
};

/** What the variables held before this file touched them; `undefined` means they were not set. */
const originalEnv: Record<string, string | undefined> = Object.fromEntries(
  Object.keys(RESEARCH_ENV).map((name) => [name, process.env[name]]),
);

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(process.env, RESEARCH_ENV);
});

afterEach(async () => {
  await cleanupDatabase();
});

afterAll(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    // Assigning undefined would store the string "undefined", a truthy key.
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

const EVIDENCE_SENTINEL = "EVIDENCE-SENTINEL-4f2a";
const TRACE_SENTINEL = "TRACE-SENTINEL-77ce";
const MODEL_SENTINEL = "model-sentinel-91b0";
const PROMPT_SENTINEL = "prompt-version-sentinel-c37d";

/** The only fields a run response may carry. */
const RUN_RESPONSE_FIELDS = [
  "id",
  "vendor_id",
  "status",
  "trigger_type",
  "categories",
  "category_summary",
  "coverage",
  "search_engine",
  "searches_used",
  "pages_read",
  "duplicates_dropped",
  "error",
  "progress",
  "started_at",
  "finished_at",
  "created_at",
].sort();

const FINDING: NewFinding = {
  category: "security_incidents",
  risk_description: "Customer records were exposed in a 2026 breach.",
  impact_description: "Personal data we share with the vendor may have been accessed.",
  action_plan: "Ask the vendor for the incident report and confirm remediation.",
  likelihood: "Possible",
  risk_severity: "Major",
  risk_level: "High Risk",
  rationale: "Because of what the sources say.",
  sources: [
    {
      url: "https://example.com/breach-notice",
      title: "Breach notice",
      quote: "We confirmed unauthorised access to customer records.",
      published_at: "2026-09-01",
    },
  ],
};

const SECOND_FINDING: NewFinding = {
  ...FINDING,
  category: "certifications",
  risk_description: "The vendor's SOC 2 report has lapsed.",
};

const EVIDENCE: EvidenceSource[] = [
  {
    id: "S1",
    category: "security_incidents",
    kind: "result",
    onVendorSite: false,
    url: "https://example.com/breach-notice",
    title: "Breach notice",
    content: EVIDENCE_SENTINEL,
    publishedAt: "2026-09-01",
  },
];

/** What a run did, with a query that no response but the trace endpoint may carry. */
const TRACE = (() => {
  const recorder = createTraceRecorder();
  recorder.step({
    tool: "search",
    category: "security_incidents",
    kind: "news",
    query: `Acme ${TRACE_SENTINEL}`,
    outcome: "ok",
    results: 4,
  });
  recorder.modelCall({
    purpose: "analysis",
    ms: 900,
    inputTokens: 1200,
    outputTokens: 80,
    totalTokens: 1280,
    ok: true,
  });
  return recorder.snapshot();
})();

const CATEGORY_SUMMARY = [
  { category: "security_incidents", outcome: "findings", note: "1 finding." },
] as const;

const rows = async <T = Record<string, unknown>>(
  sql: string,
  replacements: Record<string, unknown> = {},
): Promise<T[]> => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT })) as T[];

/** The runs of a vendor, oldest first. */
const runsOf = (vendorId: number) =>
  rows<{
    id: number;
    organization_id: number;
    status: string;
    trigger_type: string;
    requested_by: number | null;
    error: string | null;
  }>(
    `SELECT id, organization_id, status, trigger_type, requested_by, error
     FROM vendor_research_runs WHERE vendor_id = :vendorId ORDER BY id`,
    { vendorId },
  );

/** The research jobs queued so far, as [name, data, options]. */
const researchJobs = () =>
  (vendorResearchQueue.add as jest.Mock).mock.calls.filter(([name]) => name === "vendor_research");

const seedLlmKey = (orgId: number) =>
  sequelize.query(
    `INSERT INTO llm_keys (organization_id, key, name, model) VALUES (:orgId, :key, 'OpenAI', 'gpt-4o')`,
    { replacements: { orgId, key: FAKE_LLM_KEY } },
  );

/** A request agent for another role of the same organization and user. */
async function requestAs(role: string, ctx: TenantContext) {
  const app: http.Server = await createTestApp({
    bypassAuth: true,
    mockUser: { userId: ctx.userId, organizationId: ctx.orgId, role },
  });
  return testRequest(app);
}

/**
 * A request agent for a user of a custom role that the organization defined and that holds exactly
 * `permissions`. The roles are written by SQL, behind the caches of the role map and of the role
 * permissions, so both are cleared.
 */
async function requestAsCustomRole(orgId: number, roleName: string, permissions: string[]) {
  const [{ id: roleId }] = await sequelize.query<{ id: number }>(
    `INSERT INTO roles (name, description, organization_id, created_at)
     VALUES (:roleName, 'Custom', :orgId, NOW()) RETURNING id`,
    { replacements: { roleName, orgId }, type: QueryTypes.SELECT },
  );
  for (const permissionKey of permissions) {
    await sequelize.query(
      `INSERT INTO role_permissions (organization_id, role_id, permission_key, allowed)
       VALUES (:orgId, :roleId, :permissionKey, TRUE)`,
      { replacements: { orgId, roleId, permissionKey } },
    );
  }
  invalidateRoleMapCache();
  invalidateRolePermissionsCache(orgId, roleId);
  const email = `${roleName.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}@test.com`;
  const userId = await createTestUser(orgId, roleId, email, "Password123!");
  const app: http.Server = await createTestApp({
    bypassAuth: true,
    mockUser: { userId, organizationId: orgId, role: roleName },
  });
  return testRequest(app);
}

/**
 * A vendor in `ctx`'s organization whose research run finished and stored `findings` as pending,
 * the way the pipeline stores them: both in one transaction.
 */
const seedFindings = async (
  ctx: TenantContext,
  vendorName: string,
  findings: NewFinding[] = [FINDING, SECOND_FINDING],
) => {
  const vendorId = await createTestVendor(ctx.orgId, { vendor_name: vendorName });
  const run = await createRunQuery({
    organizationId: ctx.orgId,
    vendorId,
    triggerType: "auto",
    requestedBy: null,
  });
  await markRunRunningQuery(ctx.orgId, run.id);
  const inserted = await sequelize.transaction(async (transaction) => {
    const stored = await insertFindingsQuery(
      { organizationId: ctx.orgId, vendorId, runId: run.id, findings },
      transaction,
    );
    await finishRunQuery(
      {
        organizationId: ctx.orgId,
        runId: run.id,
        status: "completed",
        categories: ["security_incidents"],
        categorySummary: [...CATEGORY_SUMMARY],
        evidence: EVIDENCE,
        model: MODEL_SENTINEL,
        promptVersion: PROMPT_SENTINEL,
        searchEngine: "gdelt",
        searchesUsed: 4,
        pagesRead: 3,
        duplicatesDropped: 1,
        error: null,
        trace: TRACE,
        coverage: null,
        registryVersion: null,
      },
      transaction,
    );
    return stored;
  });
  return { vendorId, runId: run.id, inserted };
};

// ---------------------------------------------------------------------------
// POST /api/v1/vendors/:id/research
// ---------------------------------------------------------------------------

describe("POST /api/v1/vendors/:id/research", () => {
  it("starts a run for an Editor, and answers a second start with the run that is already active", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    await seedLlmKey(owner.orgId);
    const vendorId = await createTestVendor(owner.orgId, { vendor_name: "Acme Corp" });

    const first = await owner.request.post(`/api/v1/vendors/${vendorId}/research`);

    expect(first.status).toBe(202);
    expect(first.body.message).toBe("Accepted");
    expect(first.body.data.alreadyRunning).toBe(false);
    const run = first.body.data.run;
    expect(Object.keys(run).sort()).toEqual(RUN_RESPONSE_FIELDS);
    expect(run).toMatchObject({
      vendor_id: vendorId,
      status: "queued",
      trigger_type: "manual",
      categories: [],
      category_summary: [],
      searches_used: 0,
      pages_read: 0,
      duplicates_dropped: 0,
      error: null,
      progress: null,
      started_at: null,
      finished_at: null,
    });
    // The run is stored for the caller's organization and user, and its job is queued.
    expect(await runsOf(vendorId)).toEqual([
      {
        id: run.id,
        organization_id: owner.orgId,
        status: "queued",
        trigger_type: "manual",
        requested_by: owner.userId,
        error: null,
      },
    ]);
    expect(researchJobs()).toEqual([
      [
        "vendor_research",
        { organizationId: owner.orgId, vendorId, runId: run.id },
        expect.objectContaining({ jobId: `vendor-research-${owner.orgId}-${vendorId}-${run.id}` }),
      ],
    ]);

    // A second start right after returns the same run, and queues nothing more.
    const second = await owner.request.post(`/api/v1/vendors/${vendorId}/research`);

    expect(second.status).toBe(202);
    expect(second.body.data.alreadyRunning).toBe(true);
    expect(second.body.data.run.id).toBe(run.id);
    expect(Object.keys(second.body.data.run).sort()).toEqual(RUN_RESPONSE_FIELDS);
    expect(await runsOf(vendorId)).toHaveLength(1);
    expect(researchJobs()).toHaveLength(1);
  });

  it.each([
    [2, "Reviewer"],
    [4, "Auditor"],
  ])("refuses the role %i (%s) with 403 and lets it read", async (roleId) => {
    const { owner } = await seedTwoTenantContexts(roleId);
    await seedLlmKey(owner.orgId);
    const vendorId = await createTestVendor(owner.orgId);
    // Positive control: an Editor of the same organization can start the run, so the 403 below
    // is not a missing route or a missing precondition.
    const editor = await requestAs("Editor", owner);
    const started = await editor.post(`/api/v1/vendors/${vendorId}/research`);
    expect(started.status).toBe(202);

    const denied = await owner.request.post(`/api/v1/vendors/${vendorId}/research`);

    expect(denied.status).toBe(403);
    // Still the Editor's single run and single job.
    expect(await runsOf(vendorId)).toHaveLength(1);
    expect(researchJobs()).toHaveLength(1);

    const latest = await owner.request.get(`/api/v1/vendors/${vendorId}/research/latest`);
    expect(latest.status).toBe(200);
    expect(latest.body.data).toMatchObject({ id: started.body.data.run.id, status: "queued" });
    const config = await owner.request.get("/api/v1/vendor-research/config");
    expect(config.status).toBe(200);
    expect(config.body.data).toEqual({ hasLlmKey: true, autoRunEnabled: true });
    const findings = await owner.request.get("/api/v1/vendor-risk-findings");
    expect(findings.status).toBe(200);
    expect(findings.body.data).toEqual({ rows: [], total: 0 });
  });

  it("does not let another organization start research for, or read the latest run of, a vendor", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(3);
    await seedLlmKey(owner.orgId);
    // The attacker passes every other check, so only the organization can refuse it.
    await seedLlmKey(attacker.orgId);
    const vendorId = await createTestVendor(owner.orgId, { vendor_name: "Acme Corp" });

    // Positive controls: the owner can start a run and read it back.
    const started = await owner.request.post(`/api/v1/vendors/${vendorId}/research`);
    expect(started.status).toBe(202);
    const latest = await owner.request.get(`/api/v1/vendors/${vendorId}/research/latest`);
    expect(latest.status).toBe(200);
    expect(latest.body.data.id).toBe(started.body.data.run.id);

    const attackerStart = await attacker.request.post(`/api/v1/vendors/${vendorId}/research`);
    const attackerLatest = await attacker.request.get(
      `/api/v1/vendors/${vendorId}/research/latest`,
    );

    expect(attackerStart.status).toBe(404);
    expect(attackerLatest.status).toBe(404);
    // Nothing about the owner's vendor was created, changed or leaked.
    expect(await runsOf(vendorId)).toHaveLength(1);
    expect(researchJobs()).toHaveLength(1);
    expect(attackerLatest.text).not.toContain("Acme Corp");
  });

  it("refuses with 409 when the LLM key is missing, and with 429 and Retry-After during the cooldown", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const vendorId = await createTestVendor(owner.orgId);
    const url = `/api/v1/vendors/${vendorId}/research`;

    // The organization has no LLM key.
    const noKey = await owner.request.post(url);
    expect(noKey.status).toBe(409);
    expect(noKey.body.data).toEqual({ code: "llm_key_missing" });
    expect(await runsOf(vendorId)).toEqual([]);
    expect(researchJobs()).toEqual([]);

    // The organization has a key: the run starts, and once it is finished the vendor must cool down.
    await seedLlmKey(owner.orgId);
    const started = await owner.request.post(url);
    expect(started.status).toBe(202);
    await sequelize.query(
      `UPDATE vendor_research_runs SET status = 'completed', finished_at = NOW() WHERE vendor_id = :vendorId`,
      { replacements: { vendorId } },
    );

    const cooling = await owner.request.post(url);

    expect(cooling.status).toBe(429);
    expect(cooling.body.data.code).toBe("cooldown");
    const retryAfter = cooling.body.data.retryAfterSeconds;
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(10 * 60);
    expect(cooling.headers["retry-after"]).toBe(String(retryAfter));
    expect(await runsOf(vendorId)).toHaveLength(1);
    expect(researchJobs()).toHaveLength(1);
  });

  // Every API start empties the queue of waiting jobs, which leaves their runs `queued` for good:
  // the stale sweep only runs for the vendor that is started or read. Such runs must not use up
  // the daily cap of the organization for a day.
  it("does not count runs whose jobs were lost against the daily cap once they are stale", async () => {
    process.env.VENDOR_RESEARCH_DAILY_RUN_CAP = "2";
    const { owner } = await seedTwoTenantContexts(3);
    await seedLlmKey(owner.orgId);
    const lostVendors = [
      await createTestVendor(owner.orgId, { vendor_name: "Lost one" }),
      await createTestVendor(owner.orgId, { vendor_name: "Lost two" }),
    ];
    const vendorId = await createTestVendor(owner.orgId, { vendor_name: "Acme Corp" });
    for (const lostVendorId of lostVendors) {
      await createRunQuery({
        organizationId: owner.orgId,
        vendorId: lostVendorId,
        triggerType: "auto",
        requestedBy: null,
      });
    }

    // Positive control: two runs that are waiting for their jobs use up the cap of two.
    const capped = await owner.request.post(`/api/v1/vendors/${vendorId}/research`);
    expect(capped.status).toBe(429);
    expect(capped.body.data).toEqual({ code: "daily_cap" });
    expect(await runsOf(vendorId)).toEqual([]);

    // The same runs 20 minutes later, still queued: nobody started or opened their vendors, so
    // nothing swept them.
    await sequelize.query(
      `UPDATE vendor_research_runs SET created_at = NOW() - INTERVAL '20 minutes'
       WHERE vendor_id IN (:lostVendors)`,
      { replacements: { lostVendors } },
    );
    const started = await owner.request.post(`/api/v1/vendors/${vendorId}/research`);

    expect(started.status).toBe(202);
    expect(started.body.data.alreadyRunning).toBe(false);
    expect(await runsOf(vendorId)).toMatchObject([{ id: started.body.data.run.id }]);
    expect(researchJobs()).toHaveLength(1);
    for (const lostVendorId of lostVendors) {
      expect(await runsOf(lostVendorId)).toMatchObject([{ status: "queued", error: null }]);
    }
  });

  it("answers 400 for a vendor id that is not a number", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const vendorId = await createTestVendor(owner.orgId);
    // Positive control: the same route works with a real id.
    await seedLlmKey(owner.orgId);
    expect((await owner.request.post(`/api/v1/vendors/${vendorId}/research`)).status).toBe(202);

    expect((await owner.request.post("/api/v1/vendors/abc/research")).status).toBe(400);
    expect((await owner.request.get("/api/v1/vendors/abc/research/latest")).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/vendors/:id/research/latest
// ---------------------------------------------------------------------------

describe("GET /api/v1/vendors/:id/research/latest", () => {
  it("answers null for a vendor that was never researched", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const vendorId = await createTestVendor(owner.orgId);

    const res = await owner.request.get(`/api/v1/vendors/${vendorId}/research/latest`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it("fails a run that has been running past its limit and the grace of the sweep, and says so", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const vendorId = await createTestVendor(owner.orgId);
    const run = await createRunQuery({
      organizationId: owner.orgId,
      vendorId,
      triggerType: "manual",
      requestedBy: owner.userId,
    });
    await markRunRunningQuery(owner.orgId, run.id);

    // Positive control: a run that started a moment ago is still running.
    const fresh = await owner.request.get(`/api/v1/vendors/${vendorId}/research/latest`);
    expect(fresh.status).toBe(200);
    expect(fresh.body.data).toMatchObject({
      id: run.id,
      status: "running",
      error: null,
      finished_at: null,
    });

    // A run that runs for as long as its own limit is still working: the read does not fail it.
    const ageStart = (minutes: number) =>
      sequelize.query(
        `UPDATE vendor_research_runs SET started_at = NOW() - (:minutes * INTERVAL '1 minute') WHERE id = :runId`,
        { replacements: { runId: run.id, minutes } },
      );
    await ageStart(RUN_TIME_LIMIT_MINUTES);
    const working = await owner.request.get(`/api/v1/vendors/${vendorId}/research/latest`);
    expect(working.body.data).toMatchObject({ id: run.id, status: "running", error: null });

    await ageStart(STALE_RUNNING_RUN_MINUTES + 1);
    const stale = await owner.request.get(`/api/v1/vendors/${vendorId}/research/latest`);

    expect(stale.status).toBe(200);
    expect(stale.body.data).toMatchObject({ id: run.id, status: "failed", error: "timed out" });
    expect(stale.body.data.finished_at).toEqual(expect.any(String));
    // The run is failed in the table too, not only in the response.
    expect(await runsOf(vendorId)).toMatchObject([
      { id: run.id, status: "failed", error: "timed out" },
    ]);
  });

  it("never returns the evidence or the internals of a finished run", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const { vendorId, runId } = await seedFindings(owner, "Acme Corp");

    const res = await owner.request.get(`/api/v1/vendors/${vendorId}/research/latest`);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(RUN_RESPONSE_FIELDS);
    expect(res.body.data).toMatchObject({
      id: runId,
      vendor_id: vendorId,
      status: "completed",
      trigger_type: "auto",
      categories: ["security_incidents"],
      category_summary: CATEGORY_SUMMARY,
      // The engine the run searched with is sent: the run summary words it, and credits GDELT with it.
      search_engine: "gdelt",
      searches_used: 4,
      pages_read: 3,
      duplicates_dropped: 1,
      error: null,
    });
    for (const sentinel of [EVIDENCE_SENTINEL, MODEL_SENTINEL, PROMPT_SENTINEL, TRACE_SENTINEL]) {
      expect(res.text).not.toContain(sentinel);
    }
    // The run does hold them: it is the response that leaves them out.
    const [stored] = await rows<{ evidence: string; model: string }>(
      `SELECT evidence::text AS evidence, model FROM vendor_research_runs WHERE id = :runId`,
      { runId },
    );
    expect(stored.evidence).toContain(EVIDENCE_SENTINEL);
    expect(stored.model).toBe(MODEL_SENTINEL);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/vendors/:id/research/runs/:runId/trace
// ---------------------------------------------------------------------------

describe("GET /api/v1/vendors/:id/research/runs/:runId/trace", () => {
  it("gives an Admin the trace of a finished run", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const { vendorId, runId } = await seedFindings(owner, "Acme Corp");

    const res = await owner.request.get(`/api/v1/vendors/${vendorId}/research/runs/${runId}/trace`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(TRACE);
    expect(res.text).toContain(TRACE_SENTINEL);
  });

  it("refuses the roles that do not manage the LLM key, with the trace untouched", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const { vendorId, runId } = await seedFindings(owner, "Acme Corp");

    for (const role of ["Editor", "Reviewer", "Auditor"]) {
      const request = await requestAs(role, owner);
      const res = await request.get(`/api/v1/vendors/${vendorId}/research/runs/${runId}/trace`);

      expect(res.status).toBe(403);
      expect(res.text).not.toContain(TRACE_SENTINEL);
    }
  });

  it("does not let another organization read the trace, nor read it through another vendor", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const { vendorId, runId } = await seedFindings(owner, "Acme Corp");
    const otherVendorId = await createTestVendor(owner.orgId, { vendor_name: "Other Corp" });

    const fromAttacker = await attacker.request.get(
      `/api/v1/vendors/${vendorId}/research/runs/${runId}/trace`,
    );
    const throughOtherVendor = await owner.request.get(
      `/api/v1/vendors/${otherVendorId}/research/runs/${runId}/trace`,
    );

    expect(fromAttacker.status).toBe(404);
    expect(throughOtherVendor.status).toBe(404);
    expect(fromAttacker.text).not.toContain(TRACE_SENTINEL);
    expect(throughOtherVendor.text).not.toContain(TRACE_SENTINEL);
  });

  it("answers 404 for a run that has no trace yet, and 400 for ids that are not ids", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    const vendorId = await createTestVendor(owner.orgId);
    const run = await createRunQuery({
      organizationId: owner.orgId,
      vendorId,
      triggerType: "manual",
      requestedBy: owner.userId,
    });

    const queued = await owner.request.get(
      `/api/v1/vendors/${vendorId}/research/runs/${run.id}/trace`,
    );
    const badRun = await owner.request.get(`/api/v1/vendors/${vendorId}/research/runs/abc/trace`);
    const badVendor = await owner.request.get(`/api/v1/vendors/abc/research/runs/${run.id}/trace`);

    expect(queued.status).toBe(404);
    expect(badRun.status).toBe(400);
    expect(badVendor.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/vendor-research/decision-stats
// ---------------------------------------------------------------------------

describe("GET /api/v1/vendor-research/decision-stats", () => {
  it("gives an Admin the decisions of the organization by prompt version, and only its own", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(1);
    const { inserted } = await seedFindings(owner, "Acme Corp");
    await seedFindings(attacker, "Other Corp");
    await markFindingDismissedQuery({
      organizationId: owner.orgId,
      id: inserted[0].id,
      reason: "wrong_vendor",
      note: null,
      userId: owner.userId,
    });

    const res = await owner.request.get("/api/v1/vendor-research/decision-stats");

    expect(res.status).toBe(200);
    // The two findings of the owner's run: one dismissed as a wrong company, one still pending.
    // The other organization's two pending findings are not in it.
    expect(res.body.data.byPromptVersion).toEqual([
      {
        promptVersion: PROMPT_SENTINEL,
        pending: 1,
        accepted: 0,
        dismissed: 1,
        acceptanceRate: 0,
        dismissedByReason: { wrong_vendor: 1 },
      },
    ]);
    expect(res.body.data.byCategory).toHaveLength(2);
  });

  it("refuses the roles that do not manage the LLM key", async () => {
    const { owner } = await seedTwoTenantContexts(1);
    await seedFindings(owner, "Acme Corp");

    for (const role of ["Editor", "Reviewer", "Auditor"]) {
      const request = await requestAs(role, owner);
      const res = await request.get("/api/v1/vendor-research/decision-stats");
      expect(res.status).toBe(403);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/vendor-research/config
// ---------------------------------------------------------------------------

describe("GET /api/v1/vendor-research/config", () => {
  it("tells each organization what is set up for it, and never returns a key", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(3);
    await seedLlmKey(owner.orgId);

    const ownerConfig = await owner.request.get("/api/v1/vendor-research/config");
    const attackerConfig = await attacker.request.get("/api/v1/vendor-research/config");

    expect(ownerConfig.status).toBe(200);
    expect(ownerConfig.body.data).toEqual({ hasLlmKey: true, autoRunEnabled: true });
    // Only the owner's organization has a key.
    expect(attackerConfig.status).toBe(200);
    expect(attackerConfig.body.data).toEqual({ hasLlmKey: false, autoRunEnabled: true });
    for (const res of [ownerConfig, attackerConfig]) {
      expect(res.text).not.toContain(FAKE_LLM_KEY);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/vendor-risk-findings
// ---------------------------------------------------------------------------

describe("GET /api/v1/vendor-risk-findings", () => {
  it("lists the pending findings newest run first and in stored order inside a run, with the vendor name", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const acme = await seedFindings(owner, "Acme Corp");
    const globex = await seedFindings(owner, "Globex", [FINDING]);
    const [first, second] = acme.inserted;
    const [newest] = globex.inserted;

    const res = await owner.request.get("/api/v1/vendor-risk-findings");

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
    // Globex's run is the newest. Acme's two findings share a run, so they come in the order the
    // pipeline stored them.
    expect(res.body.data.rows.map((row: { id: number }) => row.id)).toEqual([
      newest.id,
      first.id,
      second.id,
    ]);
    expect(res.body.data.rows.map((row: { vendor_name: string }) => row.vendor_name)).toEqual([
      "Globex",
      "Acme Corp",
      "Acme Corp",
    ]);
    expect(res.body.data.rows[1]).toMatchObject({
      id: first.id,
      organization_id: owner.orgId,
      vendor_id: acme.vendorId,
      run_id: acme.runId,
      category: FINDING.category,
      risk_description: FINDING.risk_description,
      likelihood: "Possible",
      risk_severity: "Major",
      risk_level: "High Risk",
      // A run stores no confidence (M3 Part B1).
      confidence: null,
      rationale: "Because of what the sources say.",
      sources: FINDING.sources,
      snippet_only: false,
      status: "pending",
      vendor_name: "Acme Corp",
    });
  });

  it("serves whether a finding rests on a snippet that nobody confirmed on a page", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const marked: NewFinding = { ...SECOND_FINDING, snippet_only: true };
    await seedFindings(owner, "Acme Corp", [FINDING, marked]);

    const res = await owner.request.get("/api/v1/vendor-risk-findings");

    expect(res.status).toBe(200);
    // A finding that was never marked is stored as false, not as null.
    expect(res.body.data.rows.map((row: { snippet_only: boolean }) => row.snippet_only)).toEqual([
      false,
      true,
    ]);
  });

  it("filters by status and vendor, and returns one page of the list with the total of all of it", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    const acme = await seedFindings(owner, "Acme Corp");
    const globex = await seedFindings(owner, "Globex", [FINDING]);
    const [first, second] = acme.inserted;
    const [newest] = globex.inserted;
    await markFindingDismissedQuery({
      organizationId: owner.orgId,
      id: first.id,
      reason: "not_applicable",
      note: null,
      userId: owner.userId,
    });
    const idsOf = (res: { body: { data: { rows: Array<{ id: number }> } } }) =>
      res.body.data.rows.map((row) => row.id);

    // Pending is the default.
    const pending = await owner.request.get("/api/v1/vendor-risk-findings");
    expect(idsOf(pending)).toEqual([newest.id, second.id]);
    expect(pending.body.data.total).toBe(2);

    const dismissed = await owner.request.get("/api/v1/vendor-risk-findings?status=dismissed");
    expect(idsOf(dismissed)).toEqual([first.id]);
    expect(dismissed.body.data.rows[0]).toMatchObject({
      status: "dismissed",
      dismissed_reason: "not_applicable",
      vendor_name: "Acme Corp",
    });

    const accepted = await owner.request.get("/api/v1/vendor-risk-findings?status=accepted");
    expect(accepted.body.data).toEqual({ rows: [], total: 0 });

    const ofAcme = await owner.request.get(
      `/api/v1/vendor-risk-findings?vendorId=${acme.vendorId}&status=dismissed`,
    );
    expect(idsOf(ofAcme)).toEqual([first.id]);

    const page = await owner.request.get("/api/v1/vendor-risk-findings?limit=1&offset=1");
    expect(idsOf(page)).toEqual([second.id]);
    expect(page.body.data.total).toBe(2);

    // A bad parameter is the caller's mistake, not an empty list.
    expect((await owner.request.get("/api/v1/vendor-risk-findings?limit=abc")).status).toBe(400);
    expect((await owner.request.get("/api/v1/vendor-risk-findings?status=open")).status).toBe(400);
  });

  it("lists only the findings of the caller's organization, also when it names another organization's vendor", async () => {
    const { owner, attacker } = await seedTwoTenantContexts(3);
    const acme = await seedFindings(owner, "Acme Corp");
    const globex = await seedFindings(attacker, "Globex", [FINDING]);

    // Positive controls: each organization sees its own findings.
    const ownerList = await owner.request.get("/api/v1/vendor-risk-findings");
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.data.rows.map((row: { id: number }) => row.id)).toEqual(
      acme.inserted.map((finding) => finding.id),
    );

    const attackerList = await attacker.request.get("/api/v1/vendor-risk-findings");
    expect(attackerList.status).toBe(200);
    expect(attackerList.body.data.rows.map((row: { id: number }) => row.id)).toEqual(
      globex.inserted.map((finding) => finding.id),
    );
    expect(attackerList.body.data.total).toBe(1);
    expect(attackerList.text).not.toContain("Acme Corp");

    const named = await attacker.request.get(
      `/api/v1/vendor-risk-findings?vendorId=${acme.vendorId}&status=pending`,
    );
    expect(named.status).toBe(200);
    expect(named.body.data).toEqual({ rows: [], total: 0 });
  });
});

// ---------------------------------------------------------------------------
// The versioned API (ADR 0001, section 11)
// ---------------------------------------------------------------------------

/**
 * The ten endpoints of the research API, as [method, path]. The ids need not exist: the token is
 * checked before anything looks at them.
 */
const RESEARCH_ENDPOINTS: Array<[method: "get" | "post" | "put", path: string]> = [
  ["post", "/api/v1/vendors/1/research"],
  ["get", "/api/v1/vendors/1/research/latest"],
  ["get", "/api/v1/vendors/1/research/runs/1/trace"],
  ["get", "/api/v1/vendor-research/config"],
  ["get", "/api/v1/vendor-research/decision-stats"],
  ["get", "/api/v1/vendor-research/settings"],
  ["put", "/api/v1/vendor-research/settings"],
  ["get", "/api/v1/vendor-risk-findings"],
  ["post", "/api/v1/vendor-risk-findings/1/accept"],
  ["post", "/api/v1/vendor-risk-findings/1/dismiss"],
];

describe("the research API is served under /api/v1", () => {
  // The real authenticateJWT: no bypass, so the token decides.
  let anonymous: ReturnType<typeof testRequest>;

  beforeAll(async () => {
    anonymous = testRequest(await createTestApp());
  });

  it.each(RESEARCH_ENDPOINTS)("%s %s: no token is a 400, Token not found", async (method, path) => {
    const res = await anonymous[method](path);

    expect(res.status).toBe(400);
    expect(res.body.data.message).toBe("Token not found");
  });

  it.each(RESEARCH_ENDPOINTS)("%s %s: a token that is not valid is a 401", async (method, path) => {
    const res = await anonymous[method](path).set("Authorization", "Bearer invalid");

    expect(res.status).toBe(401);
  });

  it("has no copy on the unversioned paths", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    await seedLlmKey(owner.orgId);
    const vendorId = await createTestVendor(owner.orgId);
    // Positive control: the same Editor reaches the versioned config. The vendor exists and the
    // key is set, so a router that still served an unversioned call below would answer it 200 or
    // 202, and a 404 can only mean that there is no route.
    expect((await owner.request.get("/api/v1/vendor-research/config")).status).toBe(200);

    const answers = [
      await owner.request.get("/api/vendor-research/config"),
      await owner.request.get("/api/vendor-risk-findings"),
      await owner.request.post(`/api/vendors/${vendorId}/research`),
      await owner.request.get(`/api/vendors/${vendorId}/research/latest`),
    ];

    expect(answers.map((res) => res.status)).toEqual([404, 404, 404, 404]);
    expect(await runsOf(vendorId)).toEqual([]);
    expect(researchJobs()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The writes of the research API and the roles an organization defines
// ---------------------------------------------------------------------------

// Starting a run and deciding a finding are writes to the vendors' side of the register: accepting
// a finding creates a vendor risk, and creating a vendor already starts a run. So they need
// vendor.edit, the key of POST /vendorRisks and of createVendor. risks.edit is the key of the
// project risks and does not stand in for it, whichever way a custom role is configured.
describe("the research writes need vendor.edit, not risks.edit", () => {
  it("lets a role with vendor.edit start a run and accept and dismiss findings", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    await seedLlmKey(owner.orgId);
    const fresh = await createTestVendor(owner.orgId, { vendor_name: "Fresh Corp" });
    const { inserted } = await seedFindings(owner, "Acme Corp");
    const vendorEditor = await requestAsCustomRole(owner.orgId, "Vendor editor", ["vendor.edit"]);

    const started = await vendorEditor.post(`/api/v1/vendors/${fresh}/research`);
    const accepted = await vendorEditor.post(
      `/api/v1/vendor-risk-findings/${inserted[0].id}/accept`,
    );
    const dismissed = await vendorEditor
      .post(`/api/v1/vendor-risk-findings/${inserted[1].id}/dismiss`)
      .send({ reason: "not_applicable" });

    expect(started.status).toBe(202);
    expect(accepted.status).toBe(200);
    expect(dismissed.status).toBe(200);
    expect(await runsOf(fresh)).toHaveLength(1);
    expect(accepted.body.data.finding.status).toBe("accepted");
    expect(dismissed.body.data.status).toBe("dismissed");
  });

  it("refuses a role with risks.edit alone all three, and changes nothing", async () => {
    const { owner } = await seedTwoTenantContexts(3);
    await seedLlmKey(owner.orgId);
    const fresh = await createTestVendor(owner.orgId, { vendor_name: "Fresh Corp" });
    const { inserted } = await seedFindings(owner, "Acme Corp");
    const riskEditor = await requestAsCustomRole(owner.orgId, "Risk editor", ["risks.edit"]);
    // Positive control for the start (the test above does the same for the two decisions): a role
    // with vendor.edit passes the same checks, so the 403s below are the permission and not a
    // missing route, vendor or key.
    const vendorEditor = await requestAsCustomRole(owner.orgId, "Vendor editor", ["vendor.edit"]);
    expect((await vendorEditor.post(`/api/v1/vendors/${fresh}/research`)).status).toBe(202);
    const jobsBefore = researchJobs().length;

    const started = await riskEditor.post(`/api/v1/vendors/${fresh}/research`);
    const accepted = await riskEditor.post(`/api/v1/vendor-risk-findings/${inserted[0].id}/accept`);
    const dismissed = await riskEditor
      .post(`/api/v1/vendor-risk-findings/${inserted[1].id}/dismiss`)
      .send({ reason: "not_applicable" });

    expect([started.status, accepted.status, dismissed.status]).toEqual([403, 403, 403]);
    // Still the one run and job of the vendor editor, and both findings still wait for a decision.
    expect(await runsOf(fresh)).toHaveLength(1);
    expect(researchJobs()).toHaveLength(jobsBefore);
    const stored = await rows<{ status: string }>(
      "SELECT status FROM vendor_risk_findings WHERE id IN (:ids) ORDER BY id",
      { ids: inserted.map((finding) => finding.id) },
    );
    expect(stored.map((row) => row.status)).toEqual(["pending", "pending"]);
    expect(
      await rows("SELECT id FROM vendorrisks WHERE organization_id = :orgId", {
        orgId: owner.orgId,
      }),
    ).toEqual([]);
  });
});
