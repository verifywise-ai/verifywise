/**
 * Report analyzers — prompt builders.
 *
 * ANALYZER_VERSION is stamped into report_run_analyses.audit_metadata and MUST
 * be bumped on any prompt or schema change, so stored analyses stay traceable
 * to the prompt that produced them.
 */

export const ANALYZER_VERSION = "report-analyzer-v1";

const MAX_DATA_ITEMS = 50;
/** Hard backstop on the joined section body, independent of the per-array
 * caps below — nested structures (assessment questions, NIST subcategories)
 * can still add up past a tenant's context window even when each level is
 * individually capped. */
export const MAX_PROMPT_CHARS = 60000;

/** Ported verbatim from aiSummarizer.ts:131-144. */
export const SECTION_LABELS: Record<string, string> = {
  projectRisks: "Use Case Risks",
  vendorRisks: "Vendor Risks",
  modelRisks: "Model Risks",
  compliance: "Compliance Controls",
  assessment: "Assessment Tracker",
  clausesAndAnnexes: "Clauses & Annexes",
  nistSubcategories: "NIST AI RMF Subcategories",
  vendors: "Vendors",
  models: "AI Models",
  trainingRegistry: "Training Registry",
  policyManager: "Policy Manager",
  incidentManagement: "Incident Management",
};

/** Materiality order for the level/severity vocabularies used across sections.
 * Lower index = more material. */
const LEVEL_RANK: Record<string, number> = {
  critical: 0,
  "very high": 1,
  high: 2,
  medium: 3,
  low: 4,
  "very low": 5,
};

/**
 * Two level vocabularies reach this function and both must rank:
 * - project risks (and the NIST subcategory risks read from the same
 *   `risk_level_autocalculated` column) carry the enum WITH a " risk" suffix —
 *   'No risk' | 'Very low risk' | 'Low risk' | 'Medium risk' | 'High risk' |
 *   'Very high risk' — and so do vendor risks, whose free-text `risk_level` the
 *   UI fills from the same labels;
 * - model risks use the bare words 'Low' | 'Medium' | 'High' | 'Critical'.
 * Stripping the suffix before lookup lets one table cover both. 'No risk' maps
 * to 'no', which is deliberately absent from the table and so ranks last.
 */
const levelOf = (row: any): number => {
  const raw = row?.riskLevel ?? row?.severity ?? row?.level;
  if (typeof raw !== "string") return 99;
  return LEVEL_RANK[raw.trim().toLowerCase().replace(/\s+risk$/, "")] ?? 99;
};

/** Deadline-shaped fields only. Sooner = more urgent, unambiguously; a
 * "reported" or "completed" date does not order that way, so it is left out
 * rather than sorted backwards. Undated rows get MAX_SAFE_INTEGER — a finite
 * sentinel, so the comparator's subtraction never produces NaN. */
const dateOf = (row: any): number => {
  const raw = row?.targetDate ?? row?.dueDate ?? row?.reviewDate;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
};

/**
 * Rank by materiality BEFORE truncating. The collector's queries order by
 * `id ASC` / `name ASC`, so a plain slice hands the model the OLDEST rows and
 * it then writes confident prose about "the inventory".
 *
 * Copies rather than sorting in place: these arrays are the live section
 * objects the renderers also consume. Both keys are finite, so rows carrying
 * neither a level nor a deadline compare equal and the stable sort keeps them
 * in their original query order.
 */
function rankByMateriality<T>(arr: T[]): T[] {
  return [...arr].sort((a, b) => levelOf(a) - levelOf(b) || dateOf(a) - dateOf(b));
}

/**
 * Ranks obj[field], truncates it to max items and, only when items were
 * actually dropped, stamps a sibling `_<field>Truncated` count on obj. Used
 * for every capped array — the top-level ones (risks, controls, vendors,
 * models, records, policies, incidents) and the nested ones (assessment
 * questions, clause/annex sub-items, NIST subcategories) alike, none of which
 * have a total-count field of their own to signal truncation to the model
 * (Fix 5 — silent truncation reads as "complete").
 *
 * Note the ranking half is not order-preserving: undated rows sort last and
 * are therefore the first dropped at the cap. For an array with no level field
 * at all (compliance controls) that means an undated control loses to a dated
 * one, even though an unplanned control is often the more interesting row.
 */
function rankTruncateAndStamp(obj: any, field: string, max: number): any[] {
  const original = obj[field];
  if (!Array.isArray(original)) return [];
  const truncated = rankByMateriality(original).slice(0, max);
  if (truncated.length < original.length) {
    obj[`_${field}Truncated`] = `showing ${truncated.length} of ${original.length}`;
  }
  return truncated;
}

/**
 * Ported from aiSummarizer.ts:74-125. The per-section caps are load-bearing:
 * without them a large tenant's report exceeds the model context window and
 * every analyzer fails at once.
 */
export function prepareSectionData(key: string, data: any): string {
  if (!data) return "No data available for this section.";

  const clone = { ...data };

  switch (key) {
    case "projectRisks":
    case "vendorRisks":
    case "modelRisks":
      clone.risks = rankTruncateAndStamp(clone, "risks", MAX_DATA_ITEMS);
      break;
    case "compliance":
      clone.controls = rankTruncateAndStamp(clone, "controls", MAX_DATA_ITEMS);
      break;
    case "assessment":
      // topics/subtopics/questions nest three deep and carry free-text
      // answers — bound every level, not just the top one (Fix 3).
      clone.topics = rankTruncateAndStamp(clone, "topics", 10).map((t: any) => {
        const topic = { ...t };
        topic.subtopics = rankTruncateAndStamp(topic, "subtopics", 5).map((s: any) => {
          const subtopic = { ...s };
          subtopic.questions = rankTruncateAndStamp(subtopic, "questions", 5);
          return subtopic;
        });
        return topic;
      });
      break;
    case "clausesAndAnnexes":
      clone.clauses = rankTruncateAndStamp(clone, "clauses", 30).map((c: any) => {
        const clause = { ...c };
        clause.subClauses = rankTruncateAndStamp(clause, "subClauses", 20);
        return clause;
      });
      clone.annexes = rankTruncateAndStamp(clone, "annexes", 30).map((a: any) => {
        const annex = { ...a };
        annex.controls = rankTruncateAndStamp(annex, "controls", 20);
        return annex;
      });
      break;
    case "nistSubcategories":
      // functions caps at 10 but NIST only has 4 — the real growth is in
      // categories[].subcategories, which was previously unbounded.
      clone.functions = rankTruncateAndStamp(clone, "functions", 10).map((f: any) => {
        const fn = { ...f };
        fn.categories = (fn.categories ?? []).map((c: any) => {
          const category = { ...c };
          category.subcategories = rankTruncateAndStamp(category, "subcategories", 20);
          return category;
        });
        return fn;
      });
      break;
    case "vendors":
      clone.vendors = rankTruncateAndStamp(clone, "vendors", MAX_DATA_ITEMS);
      break;
    case "models":
      clone.models = rankTruncateAndStamp(clone, "models", MAX_DATA_ITEMS);
      break;
    case "trainingRegistry":
      clone.records = rankTruncateAndStamp(clone, "records", MAX_DATA_ITEMS);
      break;
    case "policyManager":
      clone.policies = rankTruncateAndStamp(clone, "policies", MAX_DATA_ITEMS);
      break;
    case "incidentManagement":
      clone.incidents = rankTruncateAndStamp(clone, "incidents", MAX_DATA_ITEMS);
      break;
  }

  return JSON.stringify(clone, null, 2);
}

/**
 * True when a value carries data worth sending to the LLM. dataCollector
 * assigns a section object even for empty projects (e.g. { totalRisks: 0,
 * risks: [] }), which is truthy — a plain presence check never filters those
 * out (Fix 2).
 */
export const hasContent = (v: any): boolean =>
  Array.isArray(v)
    ? v.length > 0
    : v && typeof v === "object"
      ? Object.values(v).some(hasContent)
      : v !== undefined && v !== null && v !== "" && v !== 0;

/** Render the selected sections as a single labelled block for the user prompt. */
export function renderSections(sections: Record<string, any>, keys: string[]): string {
  const body = keys
    .filter((k) => hasContent(sections?.[k]))
    .map((k) => `[${SECTION_LABELS[k] || k}]\n${prepareSectionData(k, sections[k])}`)
    .join("\n\n");
  return body.length > MAX_PROMPT_CHARS
    ? `${body.slice(0, MAX_PROMPT_CHARS)}\n\n[TRUNCATED: section data exceeded the prompt budget]`
    : body;
}

/** Shared anti-fabrication preamble applied to every analyzer. */
export const GROUNDING_RULES = `You are an AI governance analyst producing a section of a formal compliance report.

Absolute rules:
- Use ONLY the data supplied below. Never introduce a fact, name, number, control, vendor or risk that does not appear in it.
- If the supplied data is empty or too thin to support a grounded analysis, set abstain_reason and keep the rest of your output minimal and factual. An honest abstention is correct; an invented finding in a compliance artifact is a serious defect.
- Do not use markdown, bullet characters or headers inside prose fields. Write flowing paragraphs.
- Even when you abstain, write at least one complete sentence in the prose field explaining what is missing.
- Write in professional third-person tone.`;
