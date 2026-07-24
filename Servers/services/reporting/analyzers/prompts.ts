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
  "very serious": 1,
  high: 2,
  serious: 2,
  medium: 3,
  low: 4,
  minor: 4,
  "very low": 5,
};

/**
 * Three level vocabularies reach this function and all three must rank:
 * - project risks carry the `risk_level_autocalculated` enum WITH a " risk"
 *   suffix — 'No risk' | 'Very low risk' | 'Low risk' | 'Medium risk' |
 *   'High risk' | 'Very high risk' — and so do vendor risks, whose free-text
 *   `risk_level` the UI fills from the same labels;
 * - model risks use the bare words 'Low' | 'Medium' | 'High' | 'Critical';
 * - incidents use their own severity words 'Minor' | 'Serious' | 'Very serious'
 *   (ai-incident-management.enum.ts), and carry no deadline field at all, so
 *   the level is the only thing that orders them.
 * Stripping the suffix before lookup lets one table cover all three. 'No risk'
 * maps to 'no', which is deliberately absent from the table and so ranks last.
 *
 * Not covered: the NIST subcategory risks. They read the same suffixed column
 * but never reach here — only `category.subcategories` is ranked, and a
 * subcategory row carries no level of its own; its nested `risks` array is
 * neither ranked nor capped.
 */
const levelOf = (row: any): number => {
  const raw = row?.riskLevel ?? row?.severity ?? row?.level;
  if (typeof raw !== "string") return 99;
  const level = raw
    .trim()
    .toLowerCase()
    .replace(/\s+risk$/, "");
  return LEVEL_RANK[level] ?? 99;
};

/**
 * The terminal token of every `status` vocabulary that reaches this file, read
 * off the enums rather than guessed at. No vocabulary shares one with another:
 * - compliance controls: 'Waiting' | 'In progress' | 'Done';
 * - assessment questions: the collector rewrites `q.status` to 'Answered' |
 *   'Pending' before ranking (dataCollector.collectAssessment), so "Done" never
 *   arrives here — "Answered" does;
 * - ISO sub-clauses, annex categories and NIST subcategories: 'Not started' |
 *   'Draft' | 'In progress' | 'Awaiting review' | 'Awaiting approval' |
 *   'Implemented' | 'Audited' | 'Needs rework' — two terminal values, no "Done";
 * - training records: 'Planned' | 'In Progress' | 'Completed'.
 *
 * Deliberately absent: the incident vocabulary ('Open' | 'Investigating' |
 * 'Mitigated' | 'Closed'). Incidents rank on `severity`, which is their own
 * materiality axis, and whether 'Mitigated' counts as finished is a lifecycle
 * judgement this helper has no business making.
 */
const TERMINAL_STATUS = new Set(["done", "answered", "implemented", "audited", "completed"]);

/**
 * Completed work is the least material thing in a gap analysis, so it ranks
 * behind open work. This is what orders the sections that carry no level at
 * all — compliance controls above all, where without it the cap kept the 50
 * earliest due dates and those skew towards long-closed rows. Every array it
 * actually orders is capped below its real row count (controls at 50,
 * sub-clauses and annex categories at 20, assessment questions at 5 per
 * subtopic — those arrive rewritten to 'Answered'/'Pending'), so without it the
 * finished rows crowd the open ones out of the prompt entirely.
 *
 * The TOP-LEVEL clause and annex arrays are NOT among them, despite being
 * capped at 30. `clauses_struct_iso` and `annex_struct_iso` have no `status`
 * column at all, so the collector's `clause.status || "Unknown"` is always
 * literally "Unknown": the status lives one level down, on `subclauses_iso` and
 * `annexcategories_iso`, whose enums do carry 'Implemented' and 'Audited'.
 *
 * Rows whose status is not terminal — and rows with no `status` at all — score
 * 0 uniformly and are unaffected, including every risk section, whose collector
 * projection names the field `mitigationStatus`, not `status`.
 */
const completedLast = (row: any): number =>
  typeof row?.status === "string" && TERMINAL_STATUS.has(row.status.trim().toLowerCase()) ? 1 : 0;

/** Deadline-shaped fields only. Sooner = more urgent, unambiguously; a
 * "reported" or "completed" date does not order that way, so it is left out
 * rather than sorted backwards. Undated rows get MAX_SAFE_INTEGER — a finite
 * sentinel, so the comparator's subtraction never produces NaN.
 *
 * `reviewDate` is deliberately NOT one of the keys. dataCollector emits it
 * through `toLocaleDateString()` rather than the `isoDate()` its two siblings
 * here go through, so on any server whose locale is not en-US `new Date()`
 * reads the rendering back as a different day — silently, since a wrong date
 * is still a valid one. A field this helper cannot parse reliably must not
 * order anything. Policies do carry a `status`, but none of the values the UI
 * writes ('Draft' | 'Under Review' | 'Approved' | 'Published' | 'Archived' |
 * 'Deprecated') is in TERMINAL_STATUS, so with `reviewDate` out they rank on
 * nothing and keep query order.
 */
const dateOf = (row: any): number => {
  const raw = row?.targetDate ?? row?.dueDate;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
};

/**
 * Rank by materiality BEFORE truncating. The collector's queries order by
 * `id ASC` / `name ASC`, so a plain slice hands the model the OLDEST rows and
 * it then writes confident prose about "the inventory".
 *
 * Copies rather than sorting in place: these arrays are the live section
 * objects the renderers also consume. Every key is finite, so rows carrying
 * none of them compare equal and the stable sort keeps them in their original
 * query order.
 *
 * Several arrays still land in that no-op, and NOT for want of a `status` key —
 * most have one, so grepping for the field answers nothing. Vendors (the
 * projection names it `riskStatus`) and assessment topics/subtopics carry no
 * `status` at all; models and policies carry one whose every value is outside
 * TERMINAL_STATUS; the top-level clause and annex arrays carry one that is
 * always the literal "Unknown", because their struct tables have no status
 * column to read. Nothing enforces any of those conditions —
 * `policy_manager.status` is a free VARCHAR(50) — so adding a terminal-sounding
 * value to one of those vocabularies, or a level or deadline key to one of
 * those projections, silently reorders that section here.
 */
function rankByMateriality<T>(arr: T[]): T[] {
  return [...arr].sort(
    (a, b) =>
      levelOf(a) - levelOf(b) || completedLast(a) - completedLast(b) || dateOf(a) - dateOf(b),
  );
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
 * Note the ranking half is not order-preserving. For an array with no level
 * field at all (compliance controls) `status` decides it first — a finished row
 * never outranks an open one — and the deadline only breaks ties within each
 * of those two groups, where an undated row still loses to a dated one and is
 * the first dropped at the cap.
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
