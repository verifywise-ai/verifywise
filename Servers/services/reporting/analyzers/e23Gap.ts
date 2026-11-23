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
import { E23_FRAMEWORK_ID, E23_KIND } from "../e23/e23Parameters";
import { COVERAGE_LABELS } from "../e23/e23Text";
import { oneLine, prepareE23Contradictions, prepareE23FixItList, prepareMrmFleet } from "./prompts";

/** A position the code changed after parsing; recorded in audit_metadata. */
export interface PositionCorrection {
  group: string;
  from: string;
  to: string;
}

const isE23Run = (rd: ReportData): boolean => rd?.metadata?.reportKind === E23_KIND;

/**
 * The audience line of an E-23 run, or "" for any other report (whose prompts
 * must stay exactly as they were). OSFI is the default audience.
 */
export function audienceLine(rd: ReportData): string {
  if (!isE23Run(rd)) return "";
  return rd.metadata.reportParameters?.audience === "board"
    ? "Audience: Board of directors. Write in a formal register and lead with the consequences for the institution; summarise models and requirements as counts rather than listing them one by one."
    : "Audience: OSFI supervisory review. Write in a formal register and lead with the evidence: the counts, statuses and records each statement rests on.";
}

/** Most fix-it items the recommendedActions prompt is handed. */
export const MAX_FIX_IT_PROMPT_ITEMS = 20;

/**
 * The fix-it list as recommendedActions input (spec 8.5), so its actions point
 * at real items. "" when the run has no fix-it list, which keeps every other
 * report's prompt unchanged.
 */
export function fixItPromptBlock(rd: ReportData): string {
  const list = rd?.sections?.e23FixItList;
  if (!list?.items?.length) return "";
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

const requirementNumber = (title: string): string => title.trim().split(/\s+/)[0] ?? "";

const flatten = (rows: FrameworkRequirementRow[] = []): FrameworkRequirementRow[] =>
  rows.flatMap((r) => [r, ...flatten(r.children ?? [])]);

interface E23Group {
  title: string;
  rows: FrameworkRequirementRow[];
  rollup: { total: number; done: number; overdue: number; unassigned: number; noEvidence: number };
}

/**
 * The E-23 groups of the run, merged by title: several pairings repeat the
 * same group, and coverage is keyed by title (contradictionRules.ts).
 */
function e23Groups(rd: ReportData): E23Group[] {
  const byTitle = new Map<string, E23Group>();
  (rd?.sections?.frameworkRequirements?.frameworks ?? [])
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
      ? prepareE23Contradictions(contradictions)
      : "The contradiction checks did not run because the model risk management data could not be read. This is not a clean result.",
    "",
    "Model risk management status:",
    fleet ? prepareMrmFleet(fleet) : "The model risk management data could not be read.",
  ].join("\n");
}

/**
 * The two position constraints of spec 8.5, applied to a parsed payload:
 * a self-assessment-only group is "not assessable", and a group holding a
 * requirement a fired rule names is never "consistent". A violating row is
 * corrected to the allowed value, never dropped, and every change is returned
 * for the audit record.
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
    if (coverage(p.group) === "selfAssessmentOnly") to = "not assessable";
    else if (p.position === "consistent" && groupKeys(p.group).some((k) => fired.has(k))) {
      to = "partly consistent";
    }
    if (to === p.position) return p;
    corrections.push({ group: p.group, from: p.position, to });
    return { ...p, position: to };
  });
  return { payload: { ...payload, principles: next }, corrections };
}
