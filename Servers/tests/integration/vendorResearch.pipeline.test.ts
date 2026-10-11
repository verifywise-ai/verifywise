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
 * The search provider and the model are fakes that are handed to the pipeline. Everything else is
 * real: the queries, the validation, the de-duplication and the transaction. There is no network,
 * no model and no Redis use.
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
} from "../../domain.layer/interfaces/i.vendorResearch";
import { planCategories } from "../../services/vendorResearch/categories";
import { PipelineDeps, runVendorResearch } from "../../services/vendorResearch/pipeline";
import { PROMPT_VERSION } from "../../services/vendorResearch/prompts";
import { ResearchOutput, researchOutputSchema } from "../../services/vendorResearch/schema";
import { SearchHit, SearchProvider } from "../../services/vendorResearch/searchProvider";
import { buildTarget } from "../../services/vendorResearch/target";
import { calculateRiskLevel } from "../../utils/validations/vendorRiskValidation.utils";
import {
  STALE_RUN_MINUTES,
  createRunQuery,
  getActiveRunQuery,
  getFindingsForVendorQuery,
  getRunByIdQuery,
} from "../../utils/vendorResearch.utils";

// ---------------------------------------------------------------------------
// The vendor, the search results and the answers of the model
// ---------------------------------------------------------------------------

/** Acme as the vendor row stores it. Its domain makes all four categories searchable. */
const ACME = { vendor_name: "Acme", website: "acme.com", vendor_provides: "Payroll software" };
const NOW = new Date("2026-10-10T12:00:00Z");

/** The result that the security search finds. Its host is not Acme's, so it is one third-party source. */
const BREACH_HIT: SearchHit = {
  url: "https://news.example.com/acme-breach",
  title: "Acme confirms breach",
  content: "Acme confirmed on Monday that attackers copied customer records from a test system.",
  publishedAt: "2026-09-30",
};
const BREACH_QUOTE = "attackers copied customer records from a test system";

/** The result that the legal search finds, for the run in which the register already has the risk. */
const LAWSUIT_HIT: SearchHit = {
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
  confidence: "high",
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
  confidence: "medium",
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

/** The category of each query that the pipeline plans for Acme, so that the fake can answer by category. */
const CATEGORY_OF_QUERY = new Map(
  planCategories(buildTarget(ACME), NOW).plans.map((plan) => [plan.query, plan.category] as const),
);

type HitsByCategory = Partial<Record<ResearchCategory, SearchHit[]>>;

/** Answers a search with the hits of its category, and with nothing for a category that has none. */
function fakeSearchProvider(hits: HitsByCategory): SearchProvider {
  return {
    name: "fake",
    search: jest.fn(async (query: string): Promise<SearchHit[]> => {
      const category = CATEGORY_OF_QUERY.get(query);
      if (category === undefined) {
        throw new Error("the pipeline searched for a query that is not in its plan");
      }
      return hits[category] ?? [];
    }),
  };
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

function makeDeps(hits: HitsByCategory, generate: PipelineDeps["generate"]): PipelineDeps {
  return {
    searchProvider: fakeSearchProvider(hits),
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

/** Queues a run of Acme, researches it, and reads the run back from the table. */
async function researchAcme(seed: Seed, deps: PipelineDeps) {
  const queued = await createRunQuery({
    organizationId: seed.orgId,
    vendorId: seed.vendorId,
    triggerType: "manual",
    requestedBy: seed.userId,
  });
  const result = await runVendorResearch(
    { organizationId: seed.orgId, vendorId: seed.vendorId, runId: queued.id },
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
    expect(deps.searchProvider.search).toHaveBeenCalledTimes(4);

    expect(run).toMatchObject({
      searches_used: 4,
      duplicates_dropped: 0,
      model: "test-model",
      prompt_version: PROMPT_VERSION,
      search_provider: "fake",
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
    ]);
    expect(run.evidence).toEqual([{ id: "S1", category: "security_incidents", ...BREACH_HIT }]);
    expect(Buffer.byteLength(JSON.stringify(run.evidence))).toBeLessThanOrEqual(40_000);

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
      // The model said high, and one source of a third party supports no more than low.
      confidence: "low",
    });
    expect(findings[0].sources).toEqual([
      {
        url: BREACH_HIT.url,
        title: BREACH_HIT.title,
        quote: BREACH_QUOTE,
        published_at: BREACH_HIT.publishedAt,
      },
    ]);
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
    expect(run).toMatchObject({ searches_used: 4, model: "test-model", search_provider: "fake" });
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
  it("skips a queued run that has waited longer than the stale limit, with no search and no model call", async () => {
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
    expect(insideDeps.searchProvider.search).toHaveBeenCalledTimes(4);
    expect(await countFindings(seed.orgId)).toBe(1);

    // The vendor is free again. Its next run waited a minute too long: the job finds nothing to do.
    const outside = await queuedMinutesAgo(STALE_RUN_MINUTES + 1);
    const outsideDeps = deps();
    expect(await research(outside.id, outsideDeps)).toEqual({
      outcome: "skipped",
      findingsCreated: 0,
    });

    expect(outsideDeps.searchProvider.search).not.toHaveBeenCalled();
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
