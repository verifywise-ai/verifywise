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

/**
 * Per-section analytic questions, one entry per SECTION_LABELS key.
 *
 * Replaces the single generic instruction that was reused verbatim for all 12
 * section types — the reason every section summary reads interchangeably. Each
 * body asks for the ratios, distributions and named items that only exist in
 * THAT section's data (see dataCollector.ts for what each one actually holds).
 *
 * A question with no backing field is worse than no question: the model answers
 * it truthfully from absence ("no training record carries a completion date")
 * and a confident false finding lands in a compliance artifact. Every question
 * below names a field the section's projection actually populates, and the
 * three vocabularies below are NOT interchangeable — 'Critical' exists only for
 * model risks (see levelRank's comment), so project and vendor risks say "high
 * and very high" instead.
 */
export const SECTION_INSTRUCTIONS: Record<string, string> = {
  projectRisks: `- How many risks are unmitigated high and very high, and what share of the register is that?
- Which rows carry no named owner, and which combination of impact and likelihood is the worst in the set?
- Does the level distribution match the raw count, or is a large register scored almost entirely at one level?
- Name the single risk that carries the most exposure and say what makes it worse than the next one.`,

  // No mitigation or status field reaches this projection (id, vendorName,
  // riskName, riskLevel, actionOwner, actionPlan), so "unmitigated" is not
  // askable here — the action plan carries the remediation angle instead.
  vendorRisks: `- How many vendor risks sit at high or very high level, and what share of the register is that?
- Which rows have no action owner, and which have no action plan recorded at all?
- Is the exposure spread across vendors or concentrated in one or two named ones?
- Compare the level distribution against the raw count rather than reporting the count on its own.`,

  modelRisks: `- How many model risks are unmitigated high and critical, and what share of the register is that?
- Which models carry more than one risk, and which risks show no mitigation status?
- Compare the level distribution against the raw count rather than reporting the count on its own.
- Name the model whose risk profile is the worst and say what distinguishes it from the rest.`,

  // `category` is the projection's ONE grouping level — there is no family
  // beneath it. `dueDate` goes through isoDate(), unlike the locale-rendered
  // dates in policyManager and incidentManagement, so this is the one body that
  // may ask for day arithmetic against the reference date.
  compliance: `- Which control category has the weakest completion rate, and how does that rate compare with the overall progress figure?
- How many controls have no owner, and do the unowned ones cluster in one category?
- Name the specific control identifiers that are furthest from done, and any whose due date is already past the reference date.
- Say whether overall progress is being carried by one strong category while another lags well behind it.`,

  assessment: `- What share of questions is answered, and which topics sit furthest below that share?
- Do the unanswered questions cluster in one topic, or are they spread evenly across the tracker?
- Name the topics at or near zero progress and say what that gap means under this framework.
- Where an answer is present but thin, say so rather than counting it as coverage.`,

  clausesAndAnnexes: `- What share of clauses and what share of annex controls is complete, and which of the two lags?
- Which clause has the most incomplete sub-clauses, by identifier?
- Do the incomplete items cluster in one clause or annex, or are they scattered across many?
- Name the specific clause or annex identifiers a reader should look at first.`,

  nistSubcategories: `- Which of the four functions has the weakest completion rate, and by how much against the others?
- How many subcategories carry a linked risk, and how many carry none at all?
- Name the specific subcategory identifiers that are furthest behind.
- Say whether the gaps concentrate in one function or run across all of them.`,

  // The projection carries no risk count, so the vendor list cannot be compared
  // against the vendor risk register from inside this section.
  vendors: `- What is the distribution of review status across the list, and how many vendors are unreviewed?
- How many have no assignee, and how many have no named contact person?
- Name the vendors a reader should chase first, and say why those and not the others.
- Do the unreviewed ones concentrate among the vendors with no assignee, or are the two independent?`,

  // model_inventories.status is Approved | Restricted | Pending | Blocked |
  // Rejected (model-inventory-status.enum.ts) — no "reviewed" state to ask for.
  models: `- What is the status distribution across the inventory, and how many models are not Approved?
- How many distinct owners cover the inventory? If one person owns most of it, say so and name the concentration.
- Which models carry no owner, and which carry no version?
- Name the models a reader should look at first and say what makes them urgent.`,

  // Deliberately silent on completion dates and assignees: collectTrainingRegistry
  // selects both as literal NULL, so every row lacks them and any question about
  // them returns a 100% gap for every tenant. `status` and `trainingName` are the
  // projection's only live fields. Restore the questions with the SELECT, not before.
  trainingRegistry: `- What share of records is complete, and how does that compare with the number still planned or in progress?
- Do the incomplete records concentrate in one training, or are they spread across many?
- Name the trainings furthest from complete and say what that leaves uncovered.
- Say plainly whether the registry demonstrates coverage or only demonstrates that rows exist.`,

  // No date arithmetic here or in incidentManagement: `reviewDate` and
  // `reportedDate` reach the model through toLocaleDateString(), so "03/04/2026"
  // is March 4 or April 3 depending on the server locale. An "overdue by N days"
  // claim built on that is wrong silently, since a wrong date is still a valid
  // one — the same reason dateOf refuses to rank on reviewDate.
  policyManager: `- What is the ratio of draft to approved policies, stated as a ratio and not only as two counts?
- Which policies carry no review date, and which carry no owner?
- Does one status dominate the library, or is the work spread across several states?
- Name the policies that need attention first and say what puts them first.`,

  incidentManagement: `- How many incidents are still open, broken down by severity?
- Which severities are over-represented among the open ones compared with the register as a whole?
- Does one type recur, and how many incidents does it account for?
- Name the incident a reader should look at first and say why.`,
};

/** Fallback for a section key with no entry above: today's generic text, so an
 *  unmapped section degrades to current behaviour instead of losing its summary. */
export const GENERIC_SECTION_INSTRUCTION = `- Highlights key observations and patterns
- Identifies areas of concern or non-compliance
- Notes strengths and areas of good practice
- Provides context for decision-makers`;

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
 *
 * Exported because `facts.ts` ranks the same vocabularies. It inverts the sign
 * rather than keeping a second table: two tables in one directory drift, and a
 * level missing from one of them is a silent no-op sort, not an error.
 */
export const levelRank = (raw: unknown): number => {
  if (typeof raw !== "string") return 99;
  const level = raw
    .trim()
    .toLowerCase()
    .replace(/\s+risk$/, "");
  return LEVEL_RANK[level] ?? 99;
};

const levelOf = (row: any): number => levelRank(row?.riskLevel ?? row?.severity ?? row?.level);

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

/** Exported for `facts.ts`, which ranks the same status vocabularies and must
 *  recognise the same terminal tokens — a second, narrower copy there would
 *  rank the ISO and training sections on nothing at all. */
export const isTerminalStatus = (status: unknown): boolean =>
  typeof status === "string" && TERMINAL_STATUS.has(status.trim().toLowerCase());

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
const completedLast = (row: any): number => (isTerminalStatus(row?.status) ? 1 : 0);

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
- Arithmetic over the supplied values is expected, not forbidden. Compute ratios, percentages, shares, counts and differences; rank items against one another; and compare dates in the data against the reference date when one is supplied. A value you derived that way is grounded, and citing it is what makes the analysis specific. A value that is neither supplied nor derivable from what is supplied is a fabrication and a serious defect.
- If the supplied data is empty or too thin to support a grounded analysis, set abstain_reason and keep the rest of your output minimal and factual. An honest abstention is correct; an invented finding in a compliance artifact is a serious defect.
- Do not use markdown, bullet characters or headers inside prose fields. Write flowing paragraphs.
- Even when you abstain, write at least one complete sentence in the prose field explaining what is missing.
- Write in professional third-person tone.`;
