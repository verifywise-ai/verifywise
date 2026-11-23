/**
 * The OSFI E-23 parts of the analyzers (spec 8.5): the audience line every
 * prompt of an E-23 run carries, the e23Gap analyzer's data block, and the two
 * position constraints that are enforced in code after parsing rather than
 * only asked for in the prompt.
 */
import type {
  FrameworkRequirementRow,
  ReportData,
} from "../../../domain.layer/interfaces/i.reportGeneration";
import { requirementNumber } from "../e23/contradictionRules";
import { E23_FRAMEWORK_ID, E23_KIND } from "../e23/e23Parameters";
import { COVERAGE_LABELS } from "../e23/e23Text";
import { METRIC_STALE_DAYS } from "../e23/mrmFleet";
import { utcDay } from "../dateUtils";
import {
  oneLine,
  prepareE23Contradictions,
  prepareE23FixItList,
  prepareMrmFleet,
  SECTION_LABELS,
} from "./prompts";

/** A position the code changed after parsing; recorded in audit_metadata. */
export interface PositionCorrection {
  group: string;
  from: string;
  to: string;
}

export const isE23Run = (rd: ReportData): boolean => rd?.metadata?.reportKind === E23_KIND;

/** The board version of an E-23 report, whose prompts name no model (spec 8.3). */
export const isBoardRun = (rd: ReportData): boolean =>
  isE23Run(rd) && rd.metadata.reportParameters?.audience === "board";

/**
 * The audience line of an E-23 run, or "" for any other report (whose prompts
 * must stay exactly as they were). OSFI is the default audience.
 */
function audienceLine(rd: ReportData): string {
  return isBoardRun(rd)
    ? "Audience: Board of directors. Write in a formal register and lead with the consequences for the institution; summarise models and requirements as counts rather than listing them one by one."
    : "Audience: OSFI supervisory review. Write in a formal register and lead with the evidence: the counts, statuses and records each statement rests on.";
}

/**
 * Spec §3: the report is a self-assessment, never a compliance opinion. Lives
 * in the shared header so every analyzer of an E-23 run carries it, not only
 * e23Gap: a real run's executive summary claimed "complete fulfillment" of
 * E-23 and "complete alignment with OSFI's expectations".
 */
export const E23_NO_COMPLIANCE_RULE =
  "This report sets the institution's self-assessed E-23 statuses against its model risk management records. Never state or imply that the institution complies with E-23, that the guideline or any requirement is fulfilled, met or fully aligned with, or what OSFI's view or expectations are; say only what the records show against the self-assessed statuses.";

/**
 * The report's rules compare only some groups with the MRM records; the rest
 * are self-assessment only by design. A real run called that a verification
 * gap the institution should close.
 */
export const E23_SELF_ASSESSMENT_ONLY_LINE =
  "Groups marked 'self-assessment only' are outside what this report's rules check by design; do not describe them as a gap, weakness or verification shortfall of the institution.";

/** The run's E-23 group count, and how many the rules check against the MRM records. */
export function e23GroupCounts(rd: ReportData): {
  total: number;
  checked: number;
  selfAssessmentOnly: number;
} {
  const coverage = coverageOf(rd);
  const values = e23Groups(rd).map((g) => coverage(g.title));
  return {
    total: values.length,
    checked: values.filter((c) => c === "checked").length,
    selfAssessmentOnly: values.filter((c) => c === "selfAssessmentOnly").length,
  };
}

/**
 * Which date each figure is tied to. A real run attributed the period's
 * activity counts to the 90-day monitoring window, and dated a position by the
 * period's end.
 */
function datesLine(rd: ReportData): string {
  const asAt = utcDay(rd.metadata?.generatedAt);
  const params = rd.metadata?.reportParameters;
  const position = asAt
    ? `Position as at ${asAt}: the counts of models, tiers, validations, open findings and monitoring are as at this date.`
    : null;
  const period =
    params?.periodStart && params?.periodEnd
      ? `Activity counts (validations signed off, findings opened and closed, threshold breaches, revalidation events) cover the reporting period ${params.periodStart} to ${params.periodEnd} only; the ${METRIC_STALE_DAYS}-day monitoring window applies only to the count of models with a recently received metric.`
      : "No reporting period was set, so no activity is counted.";
  return [position, period].filter(Boolean).join(" ");
}

/**
 * The E-23 lines of the shared prompt header: audience, the no-compliance rule,
 * the self-assessment-only rule, the exact number of requirement groups (a
 * real run counted the framework line as a seventeenth group) and which date
 * each figure is tied to. "" for any other report, whose prompts must stay
 * exactly as they were. OSFI is the default audience.
 */
export function e23HeaderLines(rd: ReportData): string {
  if (!isE23Run(rd)) return "";
  const groups = e23GroupCounts(rd);
  return [
    audienceLine(rd),
    E23_NO_COMPLIANCE_RULE,
    E23_SELF_ASSESSMENT_ONLY_LINE,
    groups.total > 0
      ? `E-23 requirement groups in this report: ${groups.total} (${groups.checked} checked against the model risk management records, ${groups.selfAssessmentOnly} self-assessment only). The framework itself is not a group.`
      : null,
    datesLine(rd),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Most fix-it items the recommendedActions prompt is handed. */
export const MAX_FIX_IT_PROMPT_ITEMS = 20;

/** The fix-it list could not be read in full: a notice sits on its section. */
const fixItIncomplete = (rd: ReportData): boolean =>
  (rd?.sectionNotices ?? []).some((n) => n.sectionKey === "e23FixItList");

/**
 * True when recommendedActions has nothing to act on: an E-23 run whose fix-it
 * list was read in full and holds no items. The fixed rules found nothing to
 * remediate, so the analyzer abstains rather than inventing work.
 */
export function fixItListEmptyAndComplete(rd: ReportData): boolean {
  const list = rd?.sections?.e23FixItList;
  return !!list && (list.items?.length ?? 0) === 0 && !fixItIncomplete(rd);
}

/**
 * The fix-it list as recommendedActions input (spec 8.5), so its actions point
 * at real items. "" when the run has no fix-it list, which keeps every other
 * report's prompt unchanged. An empty list that is incomplete (a notice says
 * part of it could not be read) gets an explicit block instead of silence, so
 * the model does not fill the gap with remediation nothing supports.
 */
export function fixItPromptBlock(rd: ReportData): string {
  const list = rd?.sections?.e23FixItList;
  if (!list) return "";
  if (!list.items?.length) {
    return "\n\nThe fix-it list has no items, but part of its data could not be read, so it may be incomplete: do not invent remediation. At most recommend restoring the missing data or keeping current controls, or set abstain_reason.";
  }
  return `\n\nFix-it items from the internal fix-it list (fixed rules, highest severity first). Point each action at one or more of these items:\n${prepareE23FixItList(list, MAX_FIX_IT_PROMPT_ITEMS)}`;
}

/** Case-insensitive, whitespace-collapsed, like the provenance check. */
const norm = (s: unknown): string =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** The group's own key, and its title alone when the model wrote "Use case · Group". */
const groupKeys = (group: unknown): string[] => {
  const key = norm(group);
  const at = key.lastIndexOf(" · ");
  return at >= 0 ? [key, key.slice(at + 3)] : [key];
};

const flatten = (rows: FrameworkRequirementRow[] = []): FrameworkRequirementRow[] =>
  rows.flatMap((r) => [r, ...flatten(r.children ?? [])]);

interface E23Group {
  title: string;
  rows: FrameworkRequirementRow[];
  rollup: { total: number; done: number; overdue: number; unassigned: number; noEvidence: number };
}

/**
 * The E-23 groups of the run, merged by title: several pairings repeat the
 * same group, and coverage is keyed by title (contradictionRules.ts). Read off
 * the completeness section when it was selected, else off the rows the
 * collector gathered for the rules (ReportData.e23Requirements), so the
 * analysis does not depend on which sections were picked.
 */
function e23Groups(rd: ReportData): E23Group[] {
  const byTitle = new Map<string, E23Group>();
  const source = rd?.sections?.frameworkRequirements ?? rd?.e23Requirements;
  (source?.frameworks ?? [])
    .filter((fw) => fw.frameworkId === E23_FRAMEWORK_ID)
    .forEach((fw) =>
      fw.groups.forEach((g) => {
        const entry = byTitle.get(g.title) ?? {
          title: g.title,
          rows: [],
          rollup: { total: 0, done: 0, overdue: 0, unassigned: 0, noEvidence: 0 },
        };
        entry.rows.push(...flatten(g.requirements));
        for (const f of ["total", "done", "overdue", "unassigned", "noEvidence"] as const) {
          entry.rollup[f] += Number(g.rollup?.[f]) || 0;
        }
        byTitle.set(g.title, entry);
      }),
    );
  return [...byTitle.values()];
}

/**
 * A group's data coverage. When the comparison with the MRM data did not run
 * at all (E-23 checklist or MRM data unreadable), no group was checked, so
 * every group counts as self-assessment only.
 */
function coverageOf(rd: ReportData): (group: string) => "checked" | "selfAssessmentOnly" | null {
  const c = rd?.sections?.e23Contradictions;
  if (!c || !c.available) return () => "selfAssessmentOnly";
  const table = new Map(Object.entries(c.coverage).map(([title, v]) => [norm(title), v]));
  return (group) => {
    for (const key of groupKeys(group)) {
      const value = table.get(key);
      if (value) return value;
    }
    return null;
  };
}

/** Normalised titles of the groups holding a requirement a fired rule names. */
function firedGroups(rd: ReportData): Set<string> {
  const fired = new Set((rd?.sections?.e23Contradictions?.fired ?? []).map((f) => f.requirement));
  const out = new Set<string>();
  if (fired.size === 0) return out;
  e23Groups(rd).forEach((g) => {
    if (g.rows.some((r) => fired.has(requirementNumber(r.title)))) out.add(norm(g.title));
  });
  return out;
}

/**
 * The data block of the e23Gap user prompt, or "" (abstain without a call)
 * when the run is not an E-23 report or has no E-23 requirements.
 */
export function e23GapData(rd: ReportData): string {
  if (!isE23Run(rd)) return "";
  const groups = e23Groups(rd);
  if (groups.length === 0) return "";

  const opts = { board: isBoardRun(rd) };
  const coverage = coverageOf(rd);
  const groupLines = groups.map((g) => {
    const c = coverage(g.title);
    const r = g.rollup;
    return `- ${oneLine(g.title)}: ${r.done}/${r.total} done, overdue ${r.overdue}, unassigned ${r.unassigned}, no evidence ${r.noEvidence}; data coverage: ${c ? COVERAGE_LABELS[c] : "unknown"}`;
  });

  const contradictions = rd.sections.e23Contradictions;
  const fleet = rd.sections.mrmFleet;
  return [
    "E-23 requirement groups (statuses are self-assessed; data coverage says whether the fixed rules compare the group with the model risk management records):",
    ...groupLines,
    "",
    "Contradictions found by the fixed rules:",
    contradictions
      ? prepareE23Contradictions(contradictions, opts)
      : "The contradiction checks did not run because the model risk management data could not be read. This is not a clean result.",
    "",
    "Model risk management status:",
    fleet ? prepareMrmFleet(fleet, opts) : "The model risk management data could not be read.",
  ].join("\n");
}

/**
 * The two position constraints of spec 8.5, applied to a parsed payload:
 * a self-assessment-only group is "not assessable", and a group holding a
 * requirement a fired rule names is never "consistent". A violating row is
 * corrected to the allowed value, never dropped, and every change is returned
 * for the audit record.
 *
 * Fails closed: provenance accepts any substring of the prompt, so a shortened
 * or paraphrased group ("Model inventory") can pass it while matching no E-23
 * group, and would otherwise escape both constraints. A group that resolves to
 * no known coverage entry is "not assessable", the same as a group nothing
 * compared.
 */
export function enforceE23GapPositions(
  payload: any,
  rd: ReportData,
): { payload: any; corrections: PositionCorrection[] } {
  const principles: any[] = Array.isArray(payload?.principles) ? payload.principles : [];
  if (principles.length === 0) return { payload, corrections: [] };

  const coverage = coverageOf(rd);
  const fired = firedGroups(rd);
  const corrections: PositionCorrection[] = [];
  const next = principles.map((p) => {
    let to: string = p.position;
    const c = coverage(p.group);
    if (c === null || c === "selfAssessmentOnly") to = "not assessable";
    else if (p.position === "consistent" && groupKeys(p.group).some((k) => fired.has(k))) {
      to = "partly consistent";
    }
    if (to === p.position) return p;
    corrections.push({ group: p.group, from: p.position, to });
    return { ...p, position: to };
  });
  return { payload: { ...payload, principles: next }, corrections };
}

/** Every section key, and its label, normalised to the key. */
const SECTION_KEY_LOOKUP = new Map<string, string>(
  Object.entries(SECTION_LABELS).flatMap(([key, label]) => [
    [norm(key), key],
    [norm(label), key],
  ]),
);

/** The section key a value names, by key or label; the value itself when it names none. */
const toSectionKey = (value: unknown): unknown =>
  typeof value === "string" ? (SECTION_KEY_LOOKUP.get(norm(value)) ?? value) : value;

/**
 * keyFindings on an E-23 run: a `section` or `related_sections` entry the model
 * wrote as a section label is mapped back to the key the field holds. Nothing
 * is dropped and no other field changes; a general report's payload is
 * returned as it is.
 */
export function enforceE23SectionKeys(
  payload: any,
  rd: ReportData,
): { payload: any; corrections: PositionCorrection[] } {
  const findings: any[] = Array.isArray(payload?.findings) ? payload.findings : [];
  if (!isE23Run(rd) || findings.length === 0) return { payload, corrections: [] };
  const next = findings.map((f) => ({
    ...f,
    section: toSectionKey(f.section),
    ...(Array.isArray(f.related_sections) && {
      related_sections: f.related_sections.map(toSectionKey),
    }),
  }));
  return { payload: { ...payload, findings: next }, corrections: [] };
}
