jest.setTimeout(60000);

/**
 * runVendorResearch against the real tables of the test database.
 *
 * The unit tests of the pipeline mock the database, and the tests of the queries feed them input
 * that was written by hand. Nothing else writes what a run really produces and reads it back, and
 * that read path is where the de-duplication gets its input: the sources of the earlier findings
 * come back from JSONB, and the text of the register risks comes from vendorrisks. If either had
 * the wrong shape, the run that reads it would fail as "Unexpected error".
 *
 * The researcher (the web research loop) and the model are fakes that are handed to the pipeline.
 * Everything else is real: the evidence pack, the queries, the validation, the de-duplication and
 * the transaction. There is no network, no model and no Redis use.
 */

// First, and not to be reordered: ./setup registers the mocks of BullMQ and Redis, and they only
// apply to the modules that are loaded after it. Without them, importing the pipeline would open
// a real queue (pipeline -> vendor.utils -> automationProducer).
import "./setup";
import { QueryTypes } from "sequelize";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import { sequelize } from "../../database/db";
import { createTestVendor } from "../factories";
import {
  RESEARCH_CATEGORIES,
  ResearchCategory,
  ResearchTrigger,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { sourceKey } from "../../services/webResearch/urlCanon";
import type { SearchEngineId } from "../../services/webResearch/webSearch";
import type { LedgerEntry } from "../../services/webResearch/webSession";
import { MAX_EVIDENCE_BYTES } from "../../services/vendorResearch/evidence";
import { PipelineDeps, runVendorResearch } from "../../services/vendorResearch/pipeline";
import { type PolicyPage, hashOf, linesOf } from "../../services/vendorResearch/policySnapshots";
import { CREDIBILITY_PROMPT_VERSION } from "../../services/vendorResearch/prompts";
import type { ResearchResult } from "../../services/vendorResearch/researchAgent";
import { ResearchOutput, researchOutputSchema } from "../../services/vendorResearch/schema";
import { calculateRiskLevel } from "../../utils/validations/vendorRiskValidation.utils";
import {
  STALE_RUN_MINUTES,
  createRunQuery,
  finishRunQuery,
  getActiveRunQuery,
  getFindingsForVendorQuery,
  getRunByIdQuery,
  getRunTraceQuery,
} from "../../utils/vendorResearch.utils";

// ---------------------------------------------------------------------------
// The vendor, the search results and the answers of the model
// ---------------------------------------------------------------------------

/** Acme as the vendor row stores it. Its domain makes every category researchable. */
const ACME = { vendor_name: "Acme", website: "acme.com", vendor_provides: "Payroll software" };
const NOW = new Date("2026-10-10T12:00:00Z");

/** A search result as the ledger keeps it, without its category and the marks the loop adds. */
type Hit = Pick<LedgerEntry, "url" | "title" | "content" | "publishedAt">;

/** The result that the security search finds. Its host is not Acme's, so it is one third-party source. */
const BREACH_HIT: Hit = {
  url: "https://news.example.com/acme-breach",
  title: "Acme confirms breach",
  content: "Acme confirmed on Monday that attackers copied customer records from a test system.",
  publishedAt: "2026-09-30",
};
const BREACH_QUOTE = "attackers copied customer records from a test system";

/** The result that the legal search finds, for the run in which the register already has the risk. */
const LAWSUIT_HIT: Hit = {
  url: "https://legal.example.org/acme-overtime-case",
  title: "Acme sued over unpaid overtime",
  content:
    "Former employees sued Acme, saying they were never paid for overtime. Acme has agreed to a settlement.",
  publishedAt: "2026-08-14",
};
const LAWSUIT_QUOTE = "saying they were never paid for overtime";

type ModelFinding = ResearchOutput["findings"][number];

/** The one finding of the canned answer. Both enum values are real, the quote is from S1. */
const BREACH_FINDING: ModelFinding = {
  category: "security_incidents",
  risk_description: "Attackers copied customer records from a vendor test system.",
  impact_description: "Customer data we send to the vendor may have been exposed.",
  likelihood: "Almost certain",
  risk_severity: "Catastrophic",
  action_plan: "Ask the vendor for its incident report and for the data in the test system.",
  rationale: "The vendor confirmed that customer records were copied, so it is almost certain.",
  evidence: [{ source_id: "S1", quote: BREACH_QUOTE }],
};

/** A finding of another category, which has almost no words in common with the one above. */
const LAWSUIT_FINDING: ModelFinding = {
  category: "legal_regulatory",
  risk_description: "Acme was sued over unpaid overtime and agreed to a settlement.",
  impact_description: "Legal costs could raise the price of the payroll service we buy.",
  likelihood: "Possible",
  risk_severity: "Moderate",
  action_plan: "Ask the vendor how the case could change its prices or its service.",
  rationale: "The case is settled, and only the price of the service could change.",
  evidence: [{ source_id: "S1", quote: LAWSUIT_QUOTE }],
};

/**
 * What a person wrote in the register about the same lawsuit: a short description and a fuller
 * impact. The description alone is not close enough to LAWSUIT_FINDING for the threshold of the
 * register (0.25); the description and the impact together are. So the finding is only dropped if
 * the impact is read from the table as well.
 */
const REGISTER_RISK = {
  description: "Lawsuit over unpaid overtime",
  impact: "Legal costs might raise the price of our payroll service",
};

// ---------------------------------------------------------------------------
// The fakes
// ---------------------------------------------------------------------------

type HitsByCategory = Partial<Record<ResearchCategory, Hit[]>>;

/**
 * A research loop that searched each category once, was answered every time, and
 * kept the hits of each category in its ledger as search results; a category without hits found
 * nothing. It says which engine its searches went to when it is told, and says nothing otherwise,
 * like a researcher from before the engine was recorded.
 */
function fakeResearch(
  hits: HitsByCategory,
  policyPages?: PolicyPage[],
  searchEngine?: SearchEngineId | null,
): PipelineDeps["research"] {
  return jest.fn(async ({ trace }): Promise<ResearchResult> => {
    for (const category of RESEARCH_CATEGORIES) {
      trace?.step({
        tool: "search",
        category,
        kind: "news",
        query: `Acme ${category}`,
        outcome: "ok",
        results: (hits[category] ?? []).length,
      });
    }
    return {
      entries: RESEARCH_CATEGORIES.flatMap((category) =>
        (hits[category] ?? []).map((hit) => ({
          category,
          kind: "result" as const,
          onVendorSite: false,
          ...hit,
        })),
      ),
      calls: RESEARCH_CATEGORIES.map((category) => ({
        category,
        tool: "search" as const,
        answered: true,
        failure: null,
      })),
      searchesUsed: RESEARCH_CATEGORIES.length,
      pagesRead: 0,
      stoppedBecause: "finished",
      modelError: null,
      jsonObjectFallback: false,
      ...(policyPages === undefined ? {} : { policyPages }),
      ...(searchEngine === undefined ? {} : { searchEngine }),
    };
  });
}

/**
 * A model that answers with `findings`. The real call holds the answer to the schema before it
 * returns it, so this one is held to it here.
 */
function fakeModelAnswering(findings: ModelFinding[]): PipelineDeps["generate"] {
  const output: ResearchOutput = { findings, category_notes: [] };
  expect(researchOutputSchema.safeParse(output).success).toBe(true);
  return jest.fn(async () => ({
    object: output,
    attempts: 1,
    selfCorrected: false,
  })) as unknown as PipelineDeps["generate"];
}

function makeDeps(
  hits: HitsByCategory,
  generate: PipelineDeps["generate"],
  policyPages?: PolicyPage[],
  searchEngine?: SearchEngineId | null,
): PipelineDeps {
  return {
    research: fakeResearch(hits, policyPages, searchEngine),
    resolveModel: async () => ({ model: {}, modelId: "test-model" }),
    generate,
    now: () => NOW,
  };
}

// ---------------------------------------------------------------------------
// The tables
// ---------------------------------------------------------------------------

interface Seed {
  orgId: number;
  userId: number;
  vendorId: number;
}

/** An organisation with a user, and the vendor Acme. */
async function seedAcme(): Promise<Seed> {
  const orgId = await createTestOrganization("Vendor research org");
  const userId = await createTestUser(orgId, 1, `research-${Date.now()}@test.com`, "Password123!");
  const vendorId = await createTestVendor(orgId, ACME);
  return { orgId, userId, vendorId };
}

/**
 * Queues a run of Acme, researches it, and reads the run back from the table. The job passes the
 * trigger of the run it carries out to the pipeline, and so does this.
 */
async function researchAcme(
  seed: Seed,
  deps: PipelineDeps,
  triggerType: ResearchTrigger = "manual",
) {
  const queued = await createRunQuery({
    organizationId: seed.orgId,
    vendorId: seed.vendorId,
    triggerType,
    requestedBy: triggerType === "manual" ? seed.userId : null,
  });
  const result = await runVendorResearch(
    { organizationId: seed.orgId, vendorId: seed.vendorId, runId: queued.id, triggerType },
    deps,
  );
  const run = await getRunByIdQuery(seed.orgId, queued.id);
  if (run === null) throw new Error(`run ${queued.id} is not in the table`);
  return { result, run };
}

/** Counts in the table itself, not through the queries that the pipeline uses. */
async function countFindings(orgId: number): Promise<number> {
  const [row] = (await sequelize.query(
    "SELECT COUNT(*)::int AS count FROM vendor_risk_findings WHERE organization_id = :orgId",
    { replacements: { orgId }, type: QueryTypes.SELECT },
  )) as Array<{ count: number }>;
  return row.count;
}

async function insertRegisterRisk(seed: Seed): Promise<void> {
  await sequelize.query(
    `INSERT INTO vendorrisks
       (organization_id, vendor_id, risk_description, impact_description, likelihood,
        risk_severity, action_plan, risk_level)
     VALUES
       (:orgId, :vendorId, :description, :impact, 'Possible', 'Moderate', 'Watch the case',
        'Medium Risk')`,
    {
      replacements: {
        orgId: seed.orgId,
        vendorId: seed.vendorId,
        description: REGISTER_RISK.description,
        impact: REGISTER_RISK.impact,
      },
    },
  );
}

// ---------------------------------------------------------------------------

describe("runVendorResearch against the real tables", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("completes a run and stores its evidence, its summary and a pending finding", async () => {
    const seed = await seedAcme();
    const deps = makeDeps(
      { security_incidents: [BREACH_HIT] },
      fakeModelAnswering([BREACH_FINDING]),
    );

    const { result, run } = await researchAcme(seed, deps);

    // The row first: a run that hit an unexpected error says so in its error, which a bare outcome
    // would not.
    expect(run).toMatchObject({ status: "completed", error: null });
    expect(result).toEqual({ outcome: "completed", findingsCreated: 1 });
    expect(deps.research).toHaveBeenCalledTimes(1);

    expect(run).toMatchObject({
      searches_used: RESEARCH_CATEGORIES.length,
      pages_read: 0,
      duplicates_dropped: 0,
      model: "test-model",
      prompt_version: CREDIBILITY_PROMPT_VERSION,
    });
    expect(run.started_at).toBeInstanceOf(Date);
    expect(run.finished_at).toBeInstanceOf(Date);
    expect(run.categories).toEqual([...RESEARCH_CATEGORIES]);

    // JSONB comes back as parsed JSON, not as text.
    expect(Array.isArray(run.category_summary)).toBe(true);
    expect(run.category_summary).toMatchObject([
      { category: "security_incidents", outcome: "findings" },
      { category: "certifications", outcome: "nothing_found" },
      { category: "legal_regulatory", outcome: "nothing_found" },
      { category: "ai_specific", outcome: "nothing_found" },
      { category: "availability", outcome: "nothing_found" },
      { category: "financial_health", outcome: "nothing_found" },
    ]);
    expect(run.evidence).toEqual([
      {
        id: "S1",
        category: "security_incidents",
        kind: "result",
        onVendorSite: false,
        ...BREACH_HIT,
      },
    ]);
    expect(Buffer.byteLength(JSON.stringify(run.evidence))).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);

    const level = calculateRiskLevel("Catastrophic", "Almost certain");
    expect(level).toEqual(expect.any(String));
    const findings = await getFindingsForVendorQuery(seed.orgId, seed.vendorId);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      organization_id: seed.orgId,
      vendor_id: seed.vendorId,
      run_id: run.id,
      category: "security_incidents",
      risk_description: BREACH_FINDING.risk_description,
      impact_description: BREACH_FINDING.impact_description,
      action_plan: BREACH_FINDING.action_plan,
      status: "pending",
      likelihood: "Almost certain",
      risk_severity: "Catastrophic",
      risk_level: `${level} Risk`,
      // A run stores no confidence (M3 Part B1): the label is in the credibility column.
      confidence: null,
      credibility: expect.stringMatching(/^(low|medium|high)$/),
      credibility_basis: { rule: expect.any(String) },
      // The sentence of the model about its rating comes back from its own column.
      rationale: BREACH_FINDING.rationale,
    });
    // The queries fill the label in from the confidence of an old row. With no confidence stored, a
    // label that is there was written by the run, on a rule of the registry.
    expect(findings[0].credibility_basis?.rule).not.toBe("legacy_confidence");
    expect(findings[0].sources).toEqual([
      {
        url: BREACH_HIT.url,
        title: BREACH_HIT.title,
        quote: BREACH_QUOTE,
        published_at: BREACH_HIT.publishedAt,
        // The registry classifies the source and names its publisher when the finding is stored.
        category: "unverified",
        publisher: "example",
      },
    ]);
  });

  it("research never writes confidence: the column of a finding of a run stays NULL", async () => {
    const seed = await seedAcme();
    // A model of the earlier prompt versions answered with a confidence of its own. The run drops
    // it: the label of a finding is worked out from its sources, and the column is not written.
    const withConfidence = { ...BREACH_FINDING, confidence: "high" } as ModelFinding;
    const deps = makeDeps(
      { security_incidents: [BREACH_HIT] },
      fakeModelAnswering([withConfidence]),
    );

    const { result, run } = await researchAcme(seed, deps);

    expect(result).toEqual({ outcome: "completed", findingsCreated: 1 });
    // The table itself, not a query whose read-time fallback fills the label in from a confidence.
    const rows = (await sequelize.query(
      `SELECT confidence, credibility FROM vendor_risk_findings
       WHERE organization_id = :orgId AND run_id = :runId`,
      { replacements: { orgId: seed.orgId, runId: run.id }, type: QueryTypes.SELECT },
    )) as Array<{ confidence: string | null; credibility: string | null }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].confidence).toBeNull();
    expect(rows[0].credibility).toMatch(/^(low|medium|high)$/);
  });

  it("stores the trace of the run, and serves it for the run's own vendor and organization only", async () => {
    const seed = await seedAcme();
    const deps = makeDeps(
      { security_incidents: [BREACH_HIT] },
      fakeModelAnswering([BREACH_FINDING]),
    );

    const { run } = await researchAcme(seed, deps);

    // Not one of the columns that every role reads with a run.
    expect(run).not.toHaveProperty("trace");
    const trace = await getRunTraceQuery(seed.orgId, seed.vendorId, run.id);
    expect(trace).toMatchObject({
      version: 1,
      stoppedBecause: "finished",
      truncated: false,
      modelCalls: [{ purpose: "analysis", attempts: 1, ok: true }],
      totals: { modelCalls: 1 },
    });
    expect(trace?.steps.map((step) => [step.n, step.tool, step.category])).toEqual(
      RESEARCH_CATEGORIES.map((category, index) => [index + 1, "search", category]),
    );
    expect(trace?.phases.map((phase) => phase.name)).toEqual([
      "research",
      "analysis",
      "validation",
    ]);

    // Another organization, another vendor, and a run that does not exist have no trace to read.
    const other = await seedAcme();
    expect(await getRunTraceQuery(other.orgId, seed.vendorId, run.id)).toBeNull();
    expect(await getRunTraceQuery(seed.orgId, other.vendorId, run.id)).toBeNull();
    expect(await getRunTraceQuery(seed.orgId, seed.vendorId, run.id + 1000)).toBeNull();
  });

  it("stores the trace of a run that failed, with the tokens of the call that did", async () => {
    const seed = await seedAcme();
    const refused = Object.assign(new Error("refused"), { statusCode: 429 });
    const deps = makeDeps(
      { security_incidents: [BREACH_HIT] },
      jest.fn().mockRejectedValue(refused) as unknown as PipelineDeps["generate"],
    );

    const { run } = await researchAcme(seed, deps);

    expect(run.status).toBe("failed");
    const trace = await getRunTraceQuery(seed.orgId, seed.vendorId, run.id);
    expect(trace?.modelCalls).toEqual([
      expect.objectContaining({ purpose: "analysis", ok: false }),
    ]);
    expect(trace?.steps).toHaveLength(RESEARCH_CATEGORIES.length);
  });

  it("has no trace to give for a run that has not finished", async () => {
    const seed = await seedAcme();
    const queued = await createRunQuery({
      organizationId: seed.orgId,
      vendorId: seed.vendorId,
      triggerType: "manual",
      requestedBy: seed.userId,
    });

    expect(await getRunTraceQuery(seed.orgId, seed.vendorId, queued.id)).toBeNull();
  });

  it("drops the same finding on a second run, reading the first one back from the table", async () => {
    const seed = await seedAcme();
    const answer = () =>
      makeDeps({ security_incidents: [BREACH_HIT] }, fakeModelAnswering([BREACH_FINDING]));

    const first = await researchAcme(seed, answer());
    expect(first.run).toMatchObject({ status: "completed", error: null });
    expect(first.result).toEqual({ outcome: "completed", findingsCreated: 1 });

    // The first run is completed, so the vendor may have a new one.
    const second = await researchAcme(seed, answer());

    expect(second.run.id).not.toBe(first.run.id);
    expect(second.run).toMatchObject({ status: "completed", error: null, duplicates_dropped: 1 });
    expect(second.result).toEqual({ outcome: "completed", findingsCreated: 0 });
    expect(await countFindings(seed.orgId)).toBe(1);
    const findings = await getFindingsForVendorQuery(seed.orgId, seed.vendorId);
    expect(findings.map((finding) => finding.run_id)).toEqual([first.run.id]);
    // The model proposed a risk and none stayed, so no category shows findings.
    expect(second.run.category_summary).toMatchObject([
      { category: "security_incidents", outcome: "nothing_found" },
      { category: "certifications", outcome: "nothing_found" },
      { category: "legal_regulatory", outcome: "nothing_found" },
      { category: "ai_specific", outcome: "nothing_found" },
      { category: "availability", outcome: "nothing_found" },
      { category: "financial_health", outcome: "nothing_found" },
    ]);
  });

  it("drops a finding that repeats an active risk of the register", async () => {
    const seed = await seedAcme();
    await insertRegisterRisk(seed);
    const deps = makeDeps(
      { legal_regulatory: [LAWSUIT_HIT] },
      fakeModelAnswering([LAWSUIT_FINDING]),
    );

    const { result, run } = await researchAcme(seed, deps);

    expect(run).toMatchObject({ status: "completed", error: null });
    // Only a valid candidate that is dropped as a repeat is counted here, not one that fails
    // validation. The vendor has no earlier finding, so what it repeats is the register risk.
    expect(run.duplicates_dropped).toBe(1);
    expect(result).toEqual({ outcome: "completed", findingsCreated: 0 });
    expect(await countFindings(seed.orgId)).toBe(0);
    const legal = run.category_summary.find((entry) => entry.category === "legal_regulatory");
    expect(legal?.outcome).toBe("nothing_found");
  });

  it("ends the run as failed, without the message of the provider, when the model call is refused", async () => {
    const seed = await seedAcme();
    const refused = Object.assign(new Error("Incorrect API key provided: sk-secret-key"), {
      statusCode: 401,
    });
    const deps = makeDeps(
      { security_incidents: [BREACH_HIT] },
      jest.fn().mockRejectedValue(refused) as unknown as PipelineDeps["generate"],
    );

    const { result, run } = await researchAcme(seed, deps);

    expect(run).toMatchObject({ status: "failed", error: "Model call failed: HTTP 401" });
    expect(result).toEqual({ outcome: "failed", findingsCreated: 0 });
    // The audit trail of the run: what it searched and which model it was about to ask.
    expect(run).toMatchObject({
      searches_used: RESEARCH_CATEGORIES.length,
      pages_read: 0,
      model: "test-model",
    });
    expect(run.categories).toEqual([...RESEARCH_CATEGORIES]);
    expect(run.category_summary).toEqual([]);
    expect(JSON.stringify(run)).not.toContain("sk-secret-key");

    expect(await countFindings(seed.orgId)).toBe(0);
    // Not left running: it has ended, and the vendor has no active run that would block a new one.
    expect(run.finished_at).toBeInstanceOf(Date);
    expect(await getActiveRunQuery(seed.orgId, seed.vendorId)).toBeNull();
  });

  // A queued run that has waited longer than the stale limit no longer counts toward the cooldown
  // and the daily cap, so a worker that picks its job up late must not research it either: the cap
  // would be exceeded by runs it cannot see.
  it("skips a queued run that has waited longer than the stale limit, with no research and no model call", async () => {
    const seed = await seedAcme();
    const queuedMinutesAgo = async (minutes: number) => {
      const queued = await createRunQuery({
        organizationId: seed.orgId,
        vendorId: seed.vendorId,
        triggerType: "auto",
        requestedBy: null,
      });
      await sequelize.query(
        `UPDATE vendor_research_runs SET created_at = NOW() - (:minutes * INTERVAL '1 minute')
         WHERE id = :runId`,
        { replacements: { runId: queued.id, minutes } },
      );
      return queued;
    };
    const research = (runId: number, deps: PipelineDeps) =>
      runVendorResearch({ organizationId: seed.orgId, vendorId: seed.vendorId, runId }, deps);
    const deps = () =>
      makeDeps({ security_incidents: [BREACH_HIT] }, fakeModelAnswering([BREACH_FINDING]));

    // Positive control: a run that waited a minute less than the limit is researched as usual.
    const inside = await queuedMinutesAgo(STALE_RUN_MINUTES - 1);
    const insideDeps = deps();
    expect(await research(inside.id, insideDeps)).toEqual({
      outcome: "completed",
      findingsCreated: 1,
    });
    expect(insideDeps.research).toHaveBeenCalledTimes(1);
    expect(await countFindings(seed.orgId)).toBe(1);

    // The vendor is free again. Its next run waited a minute too long: the job finds nothing to do.
    const outside = await queuedMinutesAgo(STALE_RUN_MINUTES + 1);
    const outsideDeps = deps();
    expect(await research(outside.id, outsideDeps)).toEqual({
      outcome: "skipped",
      findingsCreated: 0,
    });

    expect(outsideDeps.research).not.toHaveBeenCalled();
    expect(outsideDeps.generate).not.toHaveBeenCalled();
    // Left queued: the sweep ends it, as "timed out", without it ever having started.
    expect(await getRunByIdQuery(seed.orgId, outside.id)).toMatchObject({
      status: "queued",
      started_at: null,
      finished_at: null,
      error: null,
    });
    expect(await countFindings(seed.orgId)).toBe(1);
  });
});

// ---------------------------------------------------------------------------

/** The engine of a run as the column itself holds it, not as the select list of the queries has it. */
async function storedEngine(orgId: number, runId: number): Promise<string | null> {
  const [row] = (await sequelize.query(
    `SELECT search_engine FROM vendor_research_runs
     WHERE organization_id = :orgId AND id = :runId`,
    { replacements: { orgId, runId }, type: QueryTypes.SELECT },
  )) as Array<{ search_engine: string | null }>;
  return row.search_engine;
}

describe("the search engine of a run against the real tables", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("has no engine while the run is queued", async () => {
    const seed = await seedAcme();

    const queued = await createRunQuery({
      organizationId: seed.orgId,
      vendorId: seed.vendorId,
      triggerType: "manual",
      requestedBy: seed.userId,
    });

    expect(queued.search_engine).toBeNull();
    expect(await storedEngine(seed.orgId, queued.id)).toBeNull();
  });

  it.each(["anthropic", "gdelt"] as const)(
    "stores %s on a completed run, and reads it back with the run",
    async (engine) => {
      const seed = await seedAcme();
      const deps = makeDeps(
        { security_incidents: [BREACH_HIT] },
        fakeModelAnswering([BREACH_FINDING]),
        undefined,
        engine,
      );

      const { result, run } = await researchAcme(seed, deps);

      expect(result).toEqual({ outcome: "completed", findingsCreated: 1 });
      expect(run).toMatchObject({ status: "completed", error: null, search_engine: engine });
      expect(await storedEngine(seed.orgId, run.id)).toBe(engine);
    },
  );

  it("stores no engine for a run that searched nothing", async () => {
    const seed = await seedAcme();
    const deps = makeDeps(
      { security_incidents: [BREACH_HIT] },
      fakeModelAnswering([BREACH_FINDING]),
      undefined,
      null,
    );

    const { run } = await researchAcme(seed, deps);

    expect(run).toMatchObject({ status: "completed", search_engine: null });
    expect(await storedEngine(seed.orgId, run.id)).toBeNull();
  });

  it("stores no engine for a run whose researcher does not say where it searched", async () => {
    const seed = await seedAcme();
    const deps = makeDeps(
      { security_incidents: [BREACH_HIT] },
      fakeModelAnswering([BREACH_FINDING]),
    );

    const { run } = await researchAcme(seed, deps);

    expect(run).toMatchObject({ status: "completed", search_engine: null });
    expect(await storedEngine(seed.orgId, run.id)).toBeNull();
  });

  it("keeps the engine on a run that failed after it searched", async () => {
    const seed = await seedAcme();
    const refused = Object.assign(new Error("refused"), { statusCode: 429 });
    const deps = makeDeps(
      { security_incidents: [BREACH_HIT] },
      jest.fn().mockRejectedValue(refused) as unknown as PipelineDeps["generate"],
      undefined,
      "gdelt",
    );

    const { run } = await researchAcme(seed, deps);

    expect(run).toMatchObject({
      status: "failed",
      error: "Model call failed: HTTP 429",
      search_engine: "gdelt",
    });
    expect(await storedEngine(seed.orgId, run.id)).toBe("gdelt");
  });

  it("leaves the engine empty when a caller that does not know it ends the run", async () => {
    const seed = await seedAcme();
    const queued = await createRunQuery({
      organizationId: seed.orgId,
      vendorId: seed.vendorId,
      triggerType: "auto",
      requestedBy: null,
    });

    // The shape of a finish from before the column, as the callers that never searched send it.
    await finishRunQuery({
      organizationId: seed.orgId,
      runId: queued.id,
      status: "failed",
      categories: [],
      categorySummary: [],
      evidence: null,
      model: null,
      promptVersion: null,
      searchesUsed: 0,
      pagesRead: 0,
      duplicatesDropped: 0,
      error: "The job could not be queued",
      trace: null,
      coverage: null,
      registryVersion: null,
    });

    expect(await getRunByIdQuery(seed.orgId, queued.id)).toMatchObject({
      status: "failed",
      search_engine: null,
    });
  });

  // The pipeline never writes anything else, but the table is the last word: a run that was given
  // an engine nobody built (or the old Bing feed) would otherwise read back as one.
  it("accepts the three engines and refuses every other word", async () => {
    const seed = await seedAcme();
    const queued = await createRunQuery({
      organizationId: seed.orgId,
      vendorId: seed.vendorId,
      triggerType: "manual",
      requestedBy: seed.userId,
    });
    const setEngine = (engine: string | null) =>
      sequelize.query(
        `UPDATE vendor_research_runs SET search_engine = :engine
         WHERE organization_id = :orgId AND id = :runId`,
        { replacements: { engine, orgId: seed.orgId, runId: queued.id } },
      );

    for (const engine of ["anthropic", "openai", "gdelt", null]) {
      await setEngine(engine);
      expect(await storedEngine(seed.orgId, queued.id)).toBe(engine);
    }
    for (const engine of ["bing", "replay", "", "GDELT", "gdelt "]) {
      await expect(setEngine(engine)).rejects.toMatchObject({
        parent: { code: "23514", constraint: "vendor_research_runs_search_engine_check" },
      });
    }
    // The last accepted word is still there: a refused write changed nothing.
    expect(await storedEngine(seed.orgId, queued.id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------

/** The keys that the table remembers for the vendor, in the order of the keys. */
async function rememberedKeys(seed: Seed): Promise<string[]> {
  const rows = (await sequelize.query(
    `SELECT source_key FROM vendor_research_sources
     WHERE organization_id = :orgId AND vendor_id = :vendorId
     ORDER BY source_key`,
    { replacements: { orgId: seed.orgId, vendorId: seed.vendorId }, type: QueryTypes.SELECT },
  )) as Array<{ source_key: string }>;
  return rows.map((row) => row.source_key);
}

/** The prompt that the analysis of a run sent to the model. */
const promptOf = (deps: PipelineDeps): string =>
  (deps.generate as unknown as jest.Mock).mock.calls[0][0].prompt;

describe("the memory of the sources against the real tables", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("remembers the sources that a completed run showed to the model, whoever started it", async () => {
    const seed = await seedAcme();
    const deps = makeDeps(
      { security_incidents: [BREACH_HIT] },
      fakeModelAnswering([BREACH_FINDING]),
    );

    const { run } = await researchAcme(seed, deps, "manual");

    expect(run.status).toBe("completed");
    expect(await rememberedKeys(seed)).toEqual([sourceKey(BREACH_HIT.url)]);
    const [row] = (await sequelize.query(
      "SELECT first_seen_run_id FROM vendor_research_sources WHERE organization_id = :orgId",
      { replacements: { orgId: seed.orgId }, type: QueryTypes.SELECT },
    )) as Array<{ first_seen_run_id: number }>;
    expect(row.first_seen_run_id).toBe(run.id);
  });

  it("shows a manual run every source again, and keeps the run that saw each source first", async () => {
    const seed = await seedAcme();
    const answer = () =>
      makeDeps({ security_incidents: [BREACH_HIT] }, fakeModelAnswering([BREACH_FINDING]));
    const first = await researchAcme(seed, answer(), "manual");

    const secondDeps = answer();
    const second = await researchAcme(seed, secondDeps, "manual");

    // The model was asked about the source again, and the repeat finding was dropped by the usual
    // de-duplication.
    expect(secondDeps.generate).toHaveBeenCalledTimes(1);
    expect(second.run.duplicates_dropped).toBe(1);
    expect(await rememberedKeys(seed)).toEqual([sourceKey(BREACH_HIT.url)]);
    const [row] = (await sequelize.query(
      "SELECT first_seen_run_id FROM vendor_research_sources WHERE organization_id = :orgId",
      { replacements: { orgId: seed.orgId }, type: QueryTypes.SELECT },
    )) as Array<{ first_seen_run_id: number }>;
    expect(row.first_seen_run_id).toBe(first.run.id);
  });

  it("does not ask the model about a source that an earlier run showed to it, and says so in the summary", async () => {
    const seed = await seedAcme();
    await researchAcme(
      seed,
      makeDeps({ security_incidents: [BREACH_HIT] }, fakeModelAnswering([BREACH_FINDING])),
      "manual",
    );

    const deps = makeDeps(
      { security_incidents: [BREACH_HIT] },
      fakeModelAnswering([BREACH_FINDING]),
    );
    const { result, run } = await researchAcme(seed, deps, "scheduled");

    expect(run).toMatchObject({ status: "completed", error: null, trigger_type: "scheduled" });
    expect(result).toEqual({ outcome: "completed", findingsCreated: 0 });
    expect(deps.research).toHaveBeenCalledTimes(1);
    expect(deps.generate).not.toHaveBeenCalled();
    expect(run.evidence).toBeNull();
    expect(run.category_summary).toHaveLength(RESEARCH_CATEGORIES.length);
    for (const entry of run.category_summary) {
      expect(entry).toMatchObject({
        outcome: "nothing_found",
        note: "No new sources since the last run",
      });
    }
    // The search was done: the run says what it cost, and what it set apart.
    expect(run.searches_used).toBe(RESEARCH_CATEGORIES.length);
    expect((await getRunTraceQuery(seed.orgId, seed.vendorId, run.id))?.dropped).toEqual({
      "source.already_seen": 1,
    });
    expect(await countFindings(seed.orgId)).toBe(1);
    expect(await rememberedKeys(seed)).toEqual([sourceKey(BREACH_HIT.url)]);
  });

  it("analyses a new source alone, and remembers it beside the old one", async () => {
    const seed = await seedAcme();
    await researchAcme(
      seed,
      makeDeps({ security_incidents: [BREACH_HIT] }, fakeModelAnswering([BREACH_FINDING])),
      "manual",
    );

    const deps = makeDeps(
      { security_incidents: [BREACH_HIT], legal_regulatory: [LAWSUIT_HIT] },
      fakeModelAnswering([LAWSUIT_FINDING]),
    );
    const { result, run } = await researchAcme(seed, deps, "scheduled");

    expect(run).toMatchObject({ status: "completed", error: null });
    expect(result).toEqual({ outcome: "completed", findingsCreated: 1 });
    expect(deps.generate).toHaveBeenCalledTimes(1);
    // Only the new source reaches the model, numbered from the start.
    expect(promptOf(deps)).toContain(LAWSUIT_HIT.url);
    expect(promptOf(deps)).not.toContain(BREACH_HIT.url);
    expect(run.evidence).toEqual([
      expect.objectContaining({ id: "S1", category: "legal_regulatory", url: LAWSUIT_HIT.url }),
    ]);
    expect(run.category_summary).toMatchObject([
      {
        category: "security_incidents",
        outcome: "nothing_found",
        note: "No new sources since the last run",
      },
      {
        category: "certifications",
        outcome: "nothing_found",
        note: "No new sources since the last run",
      },
      { category: "legal_regulatory", outcome: "findings" },
      {
        category: "ai_specific",
        outcome: "nothing_found",
        note: "No new sources since the last run",
      },
      {
        category: "availability",
        outcome: "nothing_found",
        note: "No new sources since the last run",
      },
      {
        category: "financial_health",
        outcome: "nothing_found",
        note: "No new sources since the last run",
      },
    ]);
    expect(await rememberedKeys(seed)).toEqual(
      [sourceKey(BREACH_HIT.url), sourceKey(LAWSUIT_HIT.url)].sort(),
    );
    expect((await getRunTraceQuery(seed.orgId, seed.vendorId, run.id))?.dropped).toEqual({
      "source.already_seen": 1,
    });
  });

  // No backfill: a vendor that was researched before the memory existed has nothing remembered, so
  // its first scheduled run is a full one and starts the memory.
  it("analyses everything in the first scheduled run of a vendor with no memory", async () => {
    const seed = await seedAcme();
    const deps = makeDeps(
      { security_incidents: [BREACH_HIT] },
      fakeModelAnswering([BREACH_FINDING]),
    );

    const { result, run } = await researchAcme(seed, deps, "scheduled");

    expect(run).toMatchObject({ status: "completed", error: null });
    expect(result).toEqual({ outcome: "completed", findingsCreated: 1 });
    expect(deps.generate).toHaveBeenCalledTimes(1);
    expect(await rememberedKeys(seed)).toEqual([sourceKey(BREACH_HIT.url)]);
  });

  // A source is remembered because the model saw it. A run that failed before the model could
  // answer showed it nothing it could judge, and the next scheduled run must show it again.
  it("remembers nothing of a run that failed, so that the next scheduled run shows the source", async () => {
    const seed = await seedAcme();
    const refused = Object.assign(new Error("refused"), { statusCode: 429 });
    const failing = makeDeps(
      { security_incidents: [BREACH_HIT] },
      jest.fn().mockRejectedValue(refused) as unknown as PipelineDeps["generate"],
    );
    const failed = await researchAcme(seed, failing, "scheduled");
    expect(failed.run.status).toBe("failed");
    expect(await rememberedKeys(seed)).toEqual([]);

    const deps = makeDeps(
      { security_incidents: [BREACH_HIT] },
      fakeModelAnswering([BREACH_FINDING]),
    );
    const { result } = await researchAcme(seed, deps, "scheduled");

    expect(result).toEqual({ outcome: "completed", findingsCreated: 1 });
    expect(deps.generate).toHaveBeenCalledTimes(1);
  });

  it("keeps the memory of one vendor from another vendor of the same organization", async () => {
    const seed = await seedAcme();
    await researchAcme(
      seed,
      makeDeps({ security_incidents: [BREACH_HIT] }, fakeModelAnswering([BREACH_FINDING])),
      "manual",
    );
    const otherVendorId = await createTestVendor(seed.orgId, {
      ...ACME,
      vendor_name: "Acme Two",
      website: "acme-two.com",
    });
    const other: Seed = { ...seed, vendorId: otherVendorId };
    const deps = makeDeps(
      { security_incidents: [BREACH_HIT] },
      fakeModelAnswering([BREACH_FINDING]),
    );

    const { result } = await researchAcme(other, deps, "scheduled");

    // The same article, found for a vendor that has not been shown it: the model is asked.
    expect(deps.generate).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe("completed");
    expect(await rememberedKeys(other)).toEqual([sourceKey(BREACH_HIT.url)]);
  });
});

// ---------------------------------------------------------------------------

/** A row of the table of the pages where the vendor states its terms. */
interface SnapshotRow {
  page_key: string;
  url: string;
  kind: string;
  title: string;
  text_hash: string;
  body: string;
  captured_run_id: number | null;
  first_seen_at: Date;
  captured_at: Date;
  last_seen_at: Date;
}

async function snapshotsOf(seed: Seed): Promise<SnapshotRow[]> {
  return (await sequelize.query(
    `SELECT page_key, url, kind, title, text_hash, body, captured_run_id,
            first_seen_at, captured_at, last_seen_at
     FROM vendor_research_snapshots
     WHERE organization_id = :orgId AND vendor_id = :vendorId
     ORDER BY page_key`,
    { replacements: { orgId: seed.orgId, vendorId: seed.vendorId }, type: QueryTypes.SELECT },
  )) as SnapshotRow[];
}

const PRIVACY_URL = "https://acme.com/privacy";
const PRIVACY_TITLE = "Privacy policy | Acme";
const TRAIN_OLD = "We do not use customer content to train our models.";
const TRAIN_NEW = "We may use customer content to train our models and share it with partners.";
const RETENTION = "We keep customer content for 30 days after the end of the contract.";

/** The privacy policy of Acme, as the research reads it, with these lines. */
const privacyPolicy = (...lines: string[]): PolicyPage => ({
  url: PRIVACY_URL,
  key: sourceKey(PRIVACY_URL) as string,
  kind: "privacy",
  title: PRIVACY_TITLE,
  text: lines.join("\n"),
});

/** The finding that cites the change of the policy, which is the only source of its run (S1). */
const POLICY_FINDING: ModelFinding = {
  category: "ai_specific",
  risk_description: "The privacy policy now allows the use of customer content for training.",
  impact_description: "Our customer content may be used to train the vendor's models.",
  likelihood: "Likely",
  risk_severity: "Major",
  action_plan: "Ask the vendor to exclude our content from training, in writing.",
  rationale: "The vendor's own policy now says it may train on customer content.",
  evidence: [{ source_id: "S1", quote: TRAIN_NEW }],
};

describe("the pages where the vendor states its terms against the real tables", () => {
  afterEach(async () => {
    await cleanupDatabase();
  });

  it("keeps the page of a completed run, and shows the model nothing for a first visit", async () => {
    const seed = await seedAcme();
    const deps = makeDeps(
      { security_incidents: [BREACH_HIT] },
      fakeModelAnswering([BREACH_FINDING]),
      [privacyPolicy(TRAIN_OLD, RETENTION)],
    );

    const { run } = await researchAcme(seed, deps, "manual");

    expect(run.status).toBe("completed");
    const normalised = linesOf([TRAIN_OLD, RETENTION].join("\n"));
    expect(await snapshotsOf(seed)).toEqual([
      expect.objectContaining({
        page_key: sourceKey(PRIVACY_URL),
        url: PRIVACY_URL,
        kind: "privacy",
        title: PRIVACY_TITLE,
        text_hash: hashOf(normalised),
        body: normalised.join("\n"),
        captured_run_id: run.id,
      }),
    ]);
    expect(promptOf(deps)).not.toContain("#changed-");
    expect((await getRunTraceQuery(seed.orgId, seed.vendorId, run.id))?.dropped).toEqual({
      "page.first_visit": 1,
    });
  });

  it.each(["manual", "auto", "scheduled"] as const)(
    "shows the model the change on the next run, and a finding of an %s run can cite it",
    async (trigger) => {
      const seed = await seedAcme();
      await researchAcme(
        seed,
        makeDeps({}, fakeModelAnswering([]), [privacyPolicy(TRAIN_OLD, RETENTION)]),
        "manual",
      );
      const deps = makeDeps({}, fakeModelAnswering([POLICY_FINDING]), [
        privacyPolicy(TRAIN_NEW, RETENTION),
      ]);

      const { result, run } = await researchAcme(seed, deps, trigger);

      expect(run).toMatchObject({ status: "completed", error: null, trigger_type: trigger });
      expect(result).toEqual({ outcome: "completed", findingsCreated: 1 });
      const prompt = promptOf(deps);
      expect(prompt).toContain("Page change:");
      expect(prompt).toContain(`Added:\n- ${TRAIN_NEW}`);
      expect(prompt).toContain(`Removed:\n- ${TRAIN_OLD}`);
      expect(prompt).not.toContain(RETENTION);
      expect(run.evidence).toEqual([
        expect.objectContaining({
          id: "S1",
          category: "ai_specific",
          kind: "page",
          onVendorSite: true,
          title: `Change to ${PRIVACY_TITLE}`,
          url: expect.stringMatching(/^https:\/\/acme\.com\/privacy#changed-[0-9a-f]{8}$/),
        }),
      ]);
      const [finding] = await getFindingsForVendorQuery(seed.orgId, seed.vendorId);
      expect(finding.category).toBe("ai_specific");
      expect(finding.sources).toEqual([
        expect.objectContaining({ url: run.evidence?.[0].url, quote: TRAIN_NEW }),
      ]);
      // The new text is the page now, kept by the run that showed its change.
      const normalised = linesOf([TRAIN_NEW, RETENTION].join("\n"));
      expect(await snapshotsOf(seed)).toEqual([
        expect.objectContaining({
          text_hash: hashOf(normalised),
          body: normalised.join("\n"),
          captured_run_id: run.id,
        }),
      ]);
    },
  );

  it("shows a scheduled run the change of a page whose address it knows", async () => {
    const seed = await seedAcme();
    const privacyHit = (content: string): Hit => ({
      url: PRIVACY_URL,
      title: PRIVACY_TITLE,
      content,
      publishedAt: null,
    });
    await researchAcme(
      seed,
      makeDeps({ ai_specific: [privacyHit(TRAIN_OLD)] }, fakeModelAnswering([]), [
        privacyPolicy(TRAIN_OLD, RETENTION),
      ]),
      "manual",
    );
    // The address is remembered as a source that the model saw.
    expect(await rememberedKeys(seed)).toEqual([sourceKey(PRIVACY_URL)]);

    const deps = makeDeps(
      { ai_specific: [privacyHit(TRAIN_NEW)] },
      fakeModelAnswering([POLICY_FINDING]),
      [privacyPolicy(TRAIN_NEW, RETENTION)],
    );
    const { result, run } = await researchAcme(seed, deps, "scheduled");

    // The page itself is set apart as a source that was shown; its change is not.
    expect(result).toEqual({ outcome: "completed", findingsCreated: 1 });
    expect(run.evidence).toHaveLength(1);
    expect(run.evidence?.[0].url).toMatch(/#changed-[0-9a-f]{8}$/);
    expect((await getRunTraceQuery(seed.orgId, seed.vendorId, run.id))?.dropped).toEqual({
      "source.already_seen": 1,
    });
  });

  it("does not show a page that has not changed, and moves the day it was last seen", async () => {
    const seed = await seedAcme();
    const answer = () =>
      makeDeps({ security_incidents: [BREACH_HIT] }, fakeModelAnswering([BREACH_FINDING]), [
        privacyPolicy(TRAIN_OLD, RETENTION),
      ]);
    const first = await researchAcme(seed, answer(), "manual");
    await sequelize.query(
      `UPDATE vendor_research_snapshots SET last_seen_at = NOW() - INTERVAL '10 days'
       WHERE organization_id = :orgId`,
      { replacements: { orgId: seed.orgId } },
    );

    const deps = answer();
    const second = await researchAcme(seed, deps, "manual");

    expect(promptOf(deps)).not.toContain("#changed-");
    // The breach the second run found again is dropped as the finding of an earlier run.
    expect((await getRunTraceQuery(seed.orgId, seed.vendorId, second.run.id))?.dropped).toEqual({
      "page.unchanged": 1,
      "duplicate.earlier_finding": 1,
    });
    const [row] = await snapshotsOf(seed);
    // Not the run that wrote the text again, and seen a moment ago and not ten days ago.
    expect(row.captured_run_id).toBe(first.run.id);
    expect(Date.now() - row.last_seen_at.getTime()).toBeLessThan(60_000);
  });

  it("keeps the old page when the run that read the new one failed, so that the next run shows the change", async () => {
    const seed = await seedAcme();
    const first = await researchAcme(
      seed,
      makeDeps({}, fakeModelAnswering([]), [privacyPolicy(TRAIN_OLD, RETENTION)]),
      "manual",
    );
    const refused = Object.assign(new Error("refused"), { statusCode: 429 });
    const failing = makeDeps(
      { security_incidents: [BREACH_HIT] },
      jest.fn().mockRejectedValue(refused) as unknown as PipelineDeps["generate"],
      [privacyPolicy(TRAIN_NEW, RETENTION)],
    );

    const failed = await researchAcme(seed, failing, "manual");

    expect(failed.run.status).toBe("failed");
    const [kept] = await snapshotsOf(seed);
    expect(kept.captured_run_id).toBe(first.run.id);
    expect(kept.body).toContain(TRAIN_OLD);

    const deps = makeDeps({}, fakeModelAnswering([POLICY_FINDING]), [
      privacyPolicy(TRAIN_NEW, RETENTION),
    ]);
    const { result } = await researchAcme(seed, deps, "manual");

    expect(result).toEqual({ outcome: "completed", findingsCreated: 1 });
    expect(promptOf(deps)).toContain(`Added:\n- ${TRAIN_NEW}`);
  });

  it("keeps the pages of one vendor from another vendor of the same organization", async () => {
    const seed = await seedAcme();
    await researchAcme(
      seed,
      makeDeps({}, fakeModelAnswering([]), [privacyPolicy(TRAIN_OLD, RETENTION)]),
      "manual",
    );
    const otherVendorId = await createTestVendor(seed.orgId, {
      ...ACME,
      vendor_name: "Acme Two",
      website: "acme-two.com",
    });
    const other: Seed = { ...seed, vendorId: otherVendorId };
    const deps = makeDeps({ security_incidents: [BREACH_HIT] }, fakeModelAnswering([]), [
      privacyPolicy(TRAIN_NEW, RETENTION),
    ]);

    const { run } = await researchAcme(other, deps, "manual");

    // The same address, a page the other vendor has not been compared on: a first visit.
    expect(promptOf(deps)).not.toContain("#changed-");
    expect((await getRunTraceQuery(other.orgId, other.vendorId, run.id))?.dropped).toEqual({
      "page.first_visit": 1,
    });
    expect((await snapshotsOf(seed))[0].body).toContain(TRAIN_OLD);
    expect((await snapshotsOf(other))[0].body).toContain(TRAIN_NEW);
  });
});
