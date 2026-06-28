import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import { runAdvisorAiSdk } from "../advisor/aiSdkAgent";
import { logFailure } from "./logger/logHelper";
import { getLLMKeysWithKeyQuery, getLLMProviderUrl } from "./llmKey.utils";
import { normalizeSlug } from "./regulationsTracker.utils";

export type EntityType = "system" | "control" | "policy" | "vendor" | "assessment";

export interface Candidate {
  type: EntityType;
  id: number;
  name: string;
  description: string;
}

export interface LlmVerdict {
  type: EntityType;
  id: number;
  affected: boolean;
  why: string;
}

// geography enum: 1 Global, 2 Europe, 3 North America, 4 South America, 5 Asia, 6 Africa
const REGION_BY_COUNTRY: Record<string, number> = {
  "european union": 2,
  germany: 2,
  france: 2,
  italy: 2,
  spain: 2,
  netherlands: 2,
  "united kingdom": 2,
  ireland: 2,
  poland: 2,
  sweden: 2,
  "united states": 3,
  canada: 3,
  mexico: 3,
  brazil: 4,
  argentina: 4,
  chile: 4,
  china: 5,
  japan: 5,
  "south korea": 5,
  india: 5,
  singapore: 5,
  "south africa": 6,
  nigeria: 6,
  kenya: 6,
  egypt: 6,
};

export function regionForCountry(countryName: string): number | null {
  if (!countryName) return null;
  const key = countryName.trim().toLowerCase();
  return REGION_BY_COUNTRY[key] ?? null;
}

const FRAMEWORK_BY_TYPE: Record<string, string[]> = {
  "eu ai act": ["EU AI Act"],
  "iso 42001": ["ISO 42001"],
  "iso/iec 42001": ["ISO 42001"],
  "iso 27001": ["ISO 27001"],
  "iso/iec 27001": ["ISO 27001"],
  "nist ai rmf": ["NIST AI RMF"],
};

export function frameworksForRegulation(reg: { type?: string; country?: string }): string[] {
  const t = (reg.type ?? "").trim().toLowerCase();
  if (FRAMEWORK_BY_TYPE[t]) return FRAMEWORK_BY_TYPE[t];
  // EU-bloc regulations imply the EU AI Act framework even when type is free-text.
  if ((reg.country ?? "").trim().toLowerCase() === "european union") return ["EU AI Act"];
  return [];
}

export function validateVerdicts(raw: unknown, sent: Candidate[]): LlmVerdict[] {
  if (!raw || typeof raw !== "object") return [];
  const results = (raw as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const sentKeys = new Set(sent.map((c) => `${c.type}:${c.id}`));
  const out: LlmVerdict[] = [];
  for (const r of results) {
    if (!r || typeof r !== "object") continue;
    const { type, id, affected, why } = r as Record<string, unknown>;
    if (typeof type !== "string" || typeof id !== "number") continue;
    if (!sentKeys.has(`${type}:${id}`)) continue;
    if (typeof affected !== "boolean") continue;
    if (typeof why !== "string" || why.trim() === "") continue;
    out.push({ type: type as EntityType, id, affected, why: why.trim() });
  }
  return out;
}

const EMPTY_BY_TYPE = (): Record<EntityType, Candidate[]> => ({
  system: [],
  control: [],
  policy: [],
  vendor: [],
  assessment: [],
});

export async function getCandidates(
  organizationId: number,
  countryName: string,
  regulation: { type?: string; country?: string },
): Promise<Record<EntityType, Candidate[]>> {
  const region = regionForCountry(countryName);
  const frameworks = frameworksForRegulation({ type: regulation.type, country: countryName });
  const out = EMPTY_BY_TYPE();

  // --- systems (projects): geography region match OR framework match via projects_frameworks ---
  const systems = (await sequelize.query(
    `SELECT DISTINCT p.id, p.project_title AS name,
            COALESCE(p.goal, '') AS description
       FROM projects p
       LEFT JOIN projects_frameworks pf ON pf.project_id = p.id
       LEFT JOIN frameworks f ON f.id = pf.framework_id
      WHERE p.organization_id = :organizationId
        AND ( (:region IS NOT NULL AND p.geography = :region)
              OR f.name IN (:frameworks) )`,
    {
      replacements: {
        organizationId,
        region,
        frameworks: frameworks.length ? frameworks : ["__none__"],
      },
      type: QueryTypes.SELECT,
    },
  )) as { id: number; name: string; description: string }[];
  out.system = systems.map((r) => ({
    type: "system",
    id: r.id,
    name: r.name,
    description: r.description,
  }));

  const candidateProjectIds = systems.map((s) => s.id);

  // --- controls: belong to a project whose framework matches (3-hop) ---
  const controls = (await sequelize.query(
    `SELECT DISTINCT c.id, c.title AS name, COALESCE(c.description, '') AS description
       FROM controls c
       JOIN control_categories cc ON cc.id = c.control_category_id
       JOIN projects_frameworks pf ON pf.project_id = cc.project_id
       JOIN frameworks f ON f.id = pf.framework_id
       JOIN projects p ON p.id = cc.project_id
      WHERE p.organization_id = :organizationId
        AND f.name IN (:frameworks)`,
    {
      replacements: { organizationId, frameworks: frameworks.length ? frameworks : ["__none__"] },
      type: QueryTypes.SELECT,
    },
  )) as { id: number; name: string; description: string }[];
  out.control = controls.map((r) => ({
    type: "control",
    id: r.id,
    name: r.name,
    description: r.description,
  }));

  // --- assessments: project_id in candidate projects ---
  if (candidateProjectIds.length) {
    const assessments = (await sequelize.query(
      `SELECT a.id, COALESCE(p.project_title, 'Assessment') AS name, '' AS description
         FROM assessments a
         JOIN projects p ON p.id = a.project_id
        WHERE p.organization_id = :organizationId
          AND a.project_id IN (:projectIds)`,
      {
        replacements: { organizationId, projectIds: candidateProjectIds },
        type: QueryTypes.SELECT,
      },
    )) as { id: number; name: string; description: string }[];
    out.assessment = assessments.map((r) => ({
      type: "assessment",
      id: r.id,
      name: r.name,
      description: r.description,
    }));
  }

  // --- vendors: regulatory_exposure maps to framework OR linked to a candidate project ---
  const vendors = (await sequelize.query(
    `SELECT DISTINCT v.id, v.vendor_name AS name, COALESCE(v.vendor_provides, '') AS description
       FROM vendors v
       LEFT JOIN vendors_projects vp ON vp.vendor_id = v.id
      WHERE v.organization_id = :organizationId
        AND ( v.regulatory_exposure IN (:frameworkExposure)
              OR (:hasProjects AND vp.project_id IN (:projectIds)) )`,
    {
      replacements: {
        organizationId,
        frameworkExposure: mapFrameworksToExposure(frameworks),
        hasProjects: candidateProjectIds.length > 0,
        projectIds: candidateProjectIds.length > 0 ? candidateProjectIds : [-1],
      },
      type: QueryTypes.SELECT,
    },
  )) as { id: number; name: string; description: string }[];
  out.vendor = vendors.map((r) => ({
    type: "vendor",
    id: r.id,
    name: r.name,
    description: r.description,
  }));

  // --- policies: linked to a candidate control via policy_linked_objects ---
  const controlIds = controls.map((c) => c.id);
  if (controlIds.length) {
    const policies = (await sequelize.query(
      `SELECT DISTINCT pm.id, pm.title AS name, '' AS description
         FROM policy_manager pm
         JOIN policy_linked_objects plo ON plo.policy_id = pm.id
        WHERE pm.organization_id = :organizationId
          AND plo.object_type = 'control'
          AND plo.object_id IN (:controlIds)`,
      { replacements: { organizationId, controlIds }, type: QueryTypes.SELECT },
    )) as { id: number; name: string; description: string }[];
    out.policy = policies.map((r) => ({
      type: "policy",
      id: r.id,
      name: r.name,
      description: r.description,
    }));
  }

  return out;
}

// Maps regulation framework names to the vendor regulatory_exposure enum values.
// NOTE: ISO 42001 and NIST AI RMF are intentionally NOT mapped here — the
// vendor.regulatory_exposure enum (vendor.model.ts) only includes:
//   "GDPR (EU)", "HIPAA (US)", "SOC 2", "ISO 27001", "EU AI act", "CCPA (california)"
// There is no "ISO 42001" or "NIST AI RMF" exposure value, so mapping them
// would be incorrect. Vendors relevant to those frameworks are found via the
// project-link path, not the regulatory_exposure column.
// Returns ["__none__"] when no mapping exists so the caller's IN-clause never
// matches real data (safe sentinel, not a bug).
function mapFrameworksToExposure(frameworks: string[]): string[] {
  const m: Record<string, string> = {
    "EU AI Act": "EU AI act",
    "ISO 27001": "ISO 27001",
  };
  const mapped = frameworks.map((f) => m[f]).filter(Boolean);
  return mapped.length ? mapped : ["__none__"];
}

// ─── Stage B: prompt assembly + per-type LLM call ───────────────────────────

export interface RegulationContext {
  name: string;
  type: string;
  status: string;
  country: string;
  obligations: string[];
  maxPenalty: string;
  changeLines: string[];
}

export interface LlmCreds {
  apiKey: string;
  baseURL: string;
  model: string;
  provider: "Anthropic" | "OpenAI" | "OpenRouter" | "Custom";
}

const TYPE_NOUN: Record<EntityType, string> = {
  system: "AI systems",
  control: "controls",
  policy: "policies",
  vendor: "vendors",
  assessment: "assessments",
};

function systemPrompt(noun: string): string {
  return [
    `You are a compliance analyst assessing how a specific change to an AI regulation affects a list of an organisation's ${noun}.`,
    `You will be given: the regulation's identity and country, the specific change that just occurred (not the whole regulation), and a numbered list of candidate entities, each with a type, id, name and description.`,
    `For each candidate, decide whether this specific change plausibly creates new or altered obligations for that entity.`,
    `Rules you must follow:`,
    `1. Judge the change, not the regulation in general. An entity is "affected" only if the described change alters what the organisation must do about it.`,
    `2. Be conservative — when unsure, mark not affected. A false "affected" wastes the team's time and erodes trust.`,
    `3. Use only the information given. Do not assume facts about an entity beyond its description. Do not infer geography, sector or framework that isn't stated.`,
    `4. Only reason about entities in the provided list. Never introduce an entity, id or name that was not given to you.`,
    `5. For each affected entity, give one sentence stating the concrete reason, citing the specific obligation or change. No generic statements.`,
    `6. If a candidate is not affected, still return it with affected:false and a short reason.`,
    `Return ONLY valid JSON of the form {"results":[{"type":"...","id":N,"affected":true|false,"why":"..."}]}. No prose outside the JSON.`,
  ].join("\n");
}

export const SYSTEM_PROMPTS: Record<EntityType, string> = {
  system: systemPrompt(TYPE_NOUN.system),
  control: systemPrompt(TYPE_NOUN.control),
  policy: systemPrompt(TYPE_NOUN.policy),
  vendor: systemPrompt(TYPE_NOUN.vendor),
  assessment: systemPrompt(TYPE_NOUN.assessment),
};

export function buildUserPrompt(
  _type: EntityType,
  ctx: RegulationContext,
  candidates: Candidate[],
): string {
  const change = ctx.changeLines.length
    ? ctx.changeLines.map((l) => `- ${l}`).join("\n")
    : "- (no structured diff available)";
  const cands = candidates
    .map((c) => `[${c.type}] id=${c.id} "${c.name}" — ${c.description || "(no description)"}`)
    .join("\n");
  return [
    `REGULATION: ${ctx.name} (${ctx.type}, ${ctx.status}) — ${ctx.country}`,
    `THE CHANGE:\n${change}`,
    `KEY OBLIGATIONS: ${ctx.obligations.join("; ") || "(none listed)"}`,
    `MAX PENALTY: ${ctx.maxPenalty || "(not specified)"}`,
    ``,
    `CANDIDATE ENTITIES:\n${cands}`,
  ].join("\n");
}

function parseJsonLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in response");
  return JSON.parse(body.slice(start, end + 1));
}

export type AnalyzeTypeResult = { ok: true; verdicts: LlmVerdict[] } | { ok: false };

export async function analyzeType(
  type: EntityType,
  ctx: RegulationContext,
  candidates: Candidate[],
  creds: LlmCreds,
  tenant: number,
): Promise<AnalyzeTypeResult> {
  try {
    const text = await runAdvisorAiSdk({
      apiKey: creds.apiKey,
      baseURL: creds.baseURL,
      model: creds.model,
      provider: creds.provider,
      tenant,
      userPrompt: `${SYSTEM_PROMPTS[type]}\n\n${buildUserPrompt(type, ctx, candidates)}`,
      availableTools: {},
      toolsDefinition: [],
      enableToolSubsetting: false,
    } as any);
    return { ok: true, verdicts: validateVerdicts(parseJsonLoose(text), candidates) };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    await logFailure({
      eventType: "Error",
      description: `impact analysis ${type} call failed: ${error.message}`,
      functionName: "analyzeType",
      fileName: "regulationImpact.utils.ts",
      error,
      userId: 0, // background job — no user context
    });
    return { ok: false };
  }
}

// ─── Persistence types ────────────────────────────────────────────────────────

export interface AffectedEntity {
  id: number;
  name: string;
  why: string;
}
export interface ImpactResult {
  systems: AffectedEntity[];
  controls: AffectedEntity[];
  policies: AffectedEntity[];
  vendors: AffectedEntity[];
  assessments: AffectedEntity[];
  generatedAt: string;
}

const RESULT_KEY: Record<EntityType, keyof Omit<ImpactResult, "generatedAt">> = {
  system: "systems",
  control: "controls",
  policy: "policies",
  vendor: "vendors",
  assessment: "assessments",
};

// ─── Persistence helpers ──────────────────────────────────────────────────────

export async function getImpactRow(organizationId: number, slug: string) {
  const normalizedSlug = normalizeSlug(slug);
  const rows = (await sequelize.query(
    `SELECT regulation_hash, status, result, refreshed_at
       FROM regulation_impact_analysis
      WHERE organization_id = :organizationId AND country_slug = :slug
      LIMIT 1`,
    { replacements: { organizationId, slug: normalizedSlug }, type: QueryTypes.SELECT },
  )) as {
    regulation_hash: string;
    status: string;
    result: ImpactResult | null;
    refreshed_at: string;
  }[];
  return rows[0] ?? null;
}

async function upsertImpactRow(
  organizationId: number,
  slug: string,
  hash: string,
  status: string,
  result: ImpactResult | null,
  model: string | null,
) {
  await sequelize.query(
    `INSERT INTO regulation_impact_analysis
       (organization_id, country_slug, regulation_hash, status, result, model, refreshed_at)
     VALUES (:organizationId, :slug, :hash, :status, :result::jsonb, :model, NOW())
     ON CONFLICT (organization_id, country_slug) DO UPDATE
        SET regulation_hash = EXCLUDED.regulation_hash,
            status = EXCLUDED.status,
            result = EXCLUDED.result,
            model = EXCLUDED.model,
            refreshed_at = NOW()`,
    {
      replacements: {
        organizationId,
        slug,
        hash,
        status,
        model,
        result: result ? JSON.stringify(result) : null,
      },
    },
  );
}

export function buildContext(slug: string, data: any): RegulationContext {
  const regs = Array.isArray(data?.regulations) ? data.regulations : [];
  const first = regs[0] ?? {};
  const obligations: string[] = [];
  for (const r of regs) if (Array.isArray(r.obligations)) obligations.push(...r.obligations);
  const changeLines: string[] = [];
  const history = data?.history ?? null;
  if (Array.isArray(history?.lastChange?.changes)) {
    for (const ch of history.lastChange.changes) {
      if (ch.field === "status") changeLines.push(`status: ${ch.from} → ${ch.to}`);
      else if (ch.field === "effectiveDate")
        changeLines.push(`effective date ${ch.from} → ${ch.to}`);
      else if (ch.field === "regulation") changeLines.push(`regulation ${ch.change}: ${ch.value}`);
      else if (ch.field === "regulationCount")
        changeLines.push(`regulation count ${ch.from} → ${ch.to}`);
    }
  }
  return {
    name: data?.name ?? slug,
    type: first.type ?? "",
    status: first.status ?? "",
    country: data?.name ?? "",
    obligations,
    maxPenalty: first.maxPenalty ?? "",
    changeLines,
  };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runImpactAnalysis(
  organizationId: number,
  slug: string,
  force = false,
): Promise<{
  status: string;
  result: ImpactResult | null;
  counts: Record<EntityType, number>;
  cached: boolean;
}> {
  const zeroCounts = (): Record<EntityType, number> => ({
    system: 0,
    control: 0,
    policy: 0,
    vendor: 0,
    assessment: 0,
  });

  // BUG 3: Normalize slug at the top so reads and writes always agree.
  const normalizedSlug = normalizeSlug(slug);

  // load the global catalog row
  const regRows = (await sequelize.query(
    `SELECT data, hash FROM regulation_countries WHERE slug = :slug LIMIT 1`,
    { replacements: { slug: normalizedSlug }, type: QueryTypes.SELECT },
  )) as { data: any; hash: string }[];
  if (!regRows.length)
    return { status: "error", result: null, counts: zeroCounts(), cached: false };
  const { data, hash } = regRows[0];

  // key gate
  const keys = await getLLMKeysWithKeyQuery(organizationId);
  if (!keys.length) return { status: "no_key", result: null, counts: zeroCounts(), cached: false };
  const k = keys[0];
  const creds: LlmCreds = {
    apiKey: k.key,
    baseURL: k.url || getLLMProviderUrl(k.name),
    model: k.model,
    provider: k.name,
  };

  // BUG 2: cache check — skipped when force=true (admin forced re-analysis).
  if (!force) {
    const cachedRow = await getImpactRow(organizationId, normalizedSlug);
    if (cachedRow && cachedRow.regulation_hash === hash && cachedRow.status === "ok") {
      return {
        status: "ok",
        result: cachedRow.result,
        counts: countsFromResult(cachedRow.result),
        cached: true,
      };
    }
  }

  const ctx = buildContext(normalizedSlug, data);
  const candidates = await getCandidates(organizationId, ctx.country, {
    type: ctx.type,
    country: ctx.country,
  });

  const nonEmpty = (Object.keys(candidates) as EntityType[]).filter(
    (t) => candidates[t].length > 0,
  );
  if (!nonEmpty.length) {
    await upsertImpactRow(
      organizationId,
      normalizedSlug,
      hash,
      "skipped_no_candidates",
      null,
      null,
    );
    return { status: "skipped_no_candidates", result: null, counts: zeroCounts(), cached: false };
  }

  const verdictsByType = await Promise.all(
    nonEmpty.map((t) =>
      analyzeType(t, ctx, candidates[t], creds, organizationId).then((r) => [t, r] as const),
    ),
  );

  // BUG 1: Only cache as "ok" if at least one type's LLM call actually succeeded.
  // If every analyzeType returned { ok: false }, the result is all-empty due to
  // LLM failures — cache as "error" rather than poisoning with a false "ok".
  const allFailed = verdictsByType.every(([, r]) => !r.ok);
  if (allFailed) {
    await upsertImpactRow(organizationId, normalizedSlug, hash, "error", null, null);
    return { status: "error", result: null, counts: zeroCounts(), cached: false };
  }

  const result: ImpactResult = {
    systems: [],
    controls: [],
    policies: [],
    vendors: [],
    assessments: [],
    generatedAt: new Date().toISOString(),
  };
  for (const [t, r] of verdictsByType) {
    if (!r.ok) continue; // skip failed types; partial success is acceptable
    const byId = new Map(candidates[t].map((c) => [c.id, c.name]));
    for (const v of r.verdicts) {
      if (v.affected)
        result[RESULT_KEY[t]].push({ id: v.id, name: byId.get(v.id) ?? String(v.id), why: v.why });
    }
  }
  await upsertImpactRow(organizationId, normalizedSlug, hash, "ok", result, creds.model);
  return { status: "ok", result, counts: countsFromResult(result), cached: false };
}

function countsFromResult(result: ImpactResult | null): Record<EntityType, number> {
  return {
    system: result?.systems.length ?? 0,
    control: result?.controls.length ?? 0,
    policy: result?.policies.length ?? 0,
    vendor: result?.vendors.length ?? 0,
    assessment: result?.assessments.length ?? 0,
  };
}
