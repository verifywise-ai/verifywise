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
const MAX_PROMPT_CHARS = 60000;

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

function truncateArray<T>(arr: T[] | undefined, max: number = MAX_DATA_ITEMS): T[] {
  if (!arr) return [];
  return arr.slice(0, max);
}

/**
 * Truncates obj[field] to max items in place and, only when items were
 * actually dropped, stamps a sibling `_<field>Truncated` count. Used for
 * nested arrays (assessment questions, clause/annex sub-items, NIST
 * subcategories) that have no total-count field of their own to signal
 * truncation to the model (Fix 5 — silent truncation reads as "complete").
 */
function truncateWithStamp(obj: any, field: string, max: number): any[] {
  const original = obj[field];
  if (!Array.isArray(original)) return [];
  const truncated = original.slice(0, max);
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
      clone.risks = truncateArray(clone.risks);
      break;
    case "compliance":
      clone.controls = truncateArray(clone.controls);
      break;
    case "assessment":
      // topics/subtopics/questions nest three deep and carry free-text
      // answers — bound every level, not just the top one (Fix 3).
      clone.topics = truncateWithStamp(clone, "topics", 10).map((t: any) => {
        const topic = { ...t };
        topic.subtopics = truncateWithStamp(topic, "subtopics", 5).map((s: any) => {
          const subtopic = { ...s };
          subtopic.questions = truncateWithStamp(subtopic, "questions", 5);
          return subtopic;
        });
        return topic;
      });
      break;
    case "clausesAndAnnexes":
      clone.clauses = truncateWithStamp(clone, "clauses", 30).map((c: any) => {
        const clause = { ...c };
        clause.subClauses = truncateWithStamp(clause, "subClauses", 20);
        return clause;
      });
      clone.annexes = truncateWithStamp(clone, "annexes", 30).map((a: any) => {
        const annex = { ...a };
        annex.controls = truncateWithStamp(annex, "controls", 20);
        return annex;
      });
      break;
    case "nistSubcategories":
      // functions caps at 10 but NIST only has 4 — the real growth is in
      // categories[].subcategories, which was previously unbounded.
      clone.functions = truncateWithStamp(clone, "functions", 10).map((f: any) => {
        const fn = { ...f };
        fn.categories = (fn.categories ?? []).map((c: any) => {
          const category = { ...c };
          category.subcategories = truncateWithStamp(category, "subcategories", 20);
          return category;
        });
        return fn;
      });
      break;
    case "vendors":
      clone.vendors = truncateArray(clone.vendors);
      break;
    case "models":
      clone.models = truncateArray(clone.models);
      break;
    case "trainingRegistry":
      clone.records = truncateArray(clone.records);
      break;
    case "policyManager":
      clone.policies = truncateArray(clone.policies);
      break;
    case "incidentManagement":
      clone.incidents = truncateArray(clone.incidents);
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
const hasContent = (v: any): boolean =>
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
