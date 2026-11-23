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
import { hasNoActiveOwner } from "../collectors/frameworkRollup";
import {
  oneLine,
  prepareE23Contradictions,
  prepareE23FixItList,
  prepareMrmFleet,
  rulesLine,
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

/** The run's E-23 requirement count: the sum of its groups' totals. */
export const e23RequirementTotal = (rd: ReportData): number =>
  e23Groups(rd).reduce((sum, g) => sum + g.rollup.total, 0);

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

/** "(B.1)" at the end of a group title: its section letter and number. */
const SECTION_SUFFIX = /\(([A-Z])(?:\.(\d+))?\)\s*$/;

/**
 * The section of each group, read off its title. E-23 numbers its groups B.1,
 * B.2, C.1 ... and D.2 holds eight groups of its own, so a letter whose
 * suffixes each hold one group is one section ("B"), and a letter with a
 * suffix shared by several groups keeps the number ("D.1", "D.2"). A title
 * with no suffix ("Appendix 1 – Model information tracking") is its own
 * section, named by the part before the dash.
 */
function sectionsOf(titles: string[]): Map<string, string> {
  const parsed = titles.map((title) => ({ title, m: SECTION_SUFFIX.exec(title) }));
  const perSuffix = new Map<string, number>();
  parsed.forEach(({ m }) => {
    if (m) perSuffix.set(m[0], (perSuffix.get(m[0]) ?? 0) + 1);
  });
  const splitLetters = new Set(
    parsed.filter(({ m }) => m && (perSuffix.get(m[0]) ?? 0) > 1).map(({ m }) => m![1]),
  );
  return new Map(
    parsed.map(({ title, m }) => [
      title,
      !m
        ? title.split(/\s+[–-]\s+/)[0].trim()
        : splitLetters.has(m[1]) && m[2]
          ? `${m[1]}.${m[2]}`
          : m[1],
    ]),
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Figures a live run lacked and then got wrong: requirement due dates and
 * evidence ("no due dates"), groups and requirements per section and by
 * coverage, models and open findings by tier ("does not distribute findings
 * by tier"), and the rules line worded so that 0 fired cannot read as "no
 * result". For the formal analyzers of an E-23 run; "" for any other report.
 */
export function e23DataBlock(rd: ReportData): string {
  if (!isE23Run(rd)) return "";
  const lines: string[] = ["E-23 data for this report, computed from its own records:"];
  const groups = e23Groups(rd);
  if (groups.length > 0) {
    const coverage = coverageOf(rd);
    const rows = groups.flatMap((g) => g.rows);
    const done = rows.filter((r) => r.isDone);
    const statuses = new Map<string, number>();
    done.forEach((r) => statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1));
    const byStatus = [...statuses.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([status, n]) => `${oneLine(status)} ${n}`)
      .join(", ");
    const withEvidence = rows.filter((r) => r.evidenceCount > 0).length;
    lines.push(
      `E-23 requirements: ${rows.length} in total; done ${done.length}${byStatus ? ` (${byStatus})` : ""}; with a due date ${rows.filter((r) => r.dueDate).length}; overdue ${rows.filter((r) => r.isOverdue).length}; with an owner ${rows.filter((r) => !hasNoActiveOwner(r.owner)).length}; with evidence attached ${withEvidence}; without evidence ${rows.length - withEvidence}.`,
    );

    const sections = sectionsOf(groups.map((g) => g.title));
    type Tally = {
      groups: number;
      checked: number;
      self: number;
      reqs: number;
      reqsChecked: number;
      reqsSelf: number;
    };
    const blank = (): Tally => ({
      groups: 0,
      checked: 0,
      self: 0,
      reqs: 0,
      reqsChecked: 0,
      reqsSelf: 0,
    });
    const bySection = new Map<string, Tally>();
    const all = blank();
    const groupLines: string[] = [];
    groups.forEach((g) => {
      const c = coverage(g.title);
      const n = g.rows.length;
      for (const t of [all, bySection.get(sections.get(g.title)!) ?? blank()]) {
        t.groups += 1;
        t.reqs += n;
        if (c === "checked") {
          t.checked += 1;
          t.reqsChecked += n;
        } else if (c === "selfAssessmentOnly") {
          t.self += 1;
          t.reqsSelf += n;
        }
        if (t !== all) bySection.set(sections.get(g.title)!, t);
      }
      groupLines.push(
        `- ${oneLine(g.title)}: ${plural(n, "requirement")}, ${c === "checked" ? "checked" : c ? "self-assessment only" : "coverage unknown"}`,
      );
    });
    const tallyText = (t: Tally) =>
      `${plural(t.groups, "group")} (${t.checked} checked, ${t.self} self-assessment only); ${plural(t.reqs, "requirement")} (${t.reqsChecked} in checked groups, ${t.reqsSelf} in self-assessment-only groups)`;
    lines.push(
      "E-23 groups by section (checked: compared with the model risk management records by the report's rules; the others are self-assessment only by design):",
      ...[...bySection.entries()].map(([name, t]) => `- Section ${oneLine(name)}: ${tallyText(t)}`),
      `- All groups: ${tallyText(all)}`,
      "E-23 groups:",
      ...groupLines,
    );
  }

  const c = rd.sections?.e23Contradictions;
  lines.push(
    c?.available
      ? `${rulesLine(c)}; rules not run: ${c.notRun.length}.`
      : "The contradiction rules did not run, so no rule result is available.",
  );

  const fleet = rd.sections?.mrmFleet;
  if (fleet?.perTier?.length) {
    lines.push(
      "Models by tier, as at the position date:",
      ...fleet.perTier.map((t) => {
        const s = t.openBySeverity;
        const severity = s
          ? ` (critical ${s.critical}, high ${s.high}, medium ${s.medium}, low ${s.low})`
          : "";
        return `- Tier ${t.tier}: models ${t.models}, tiering current ${t.tieringCurrent}, with a passed signed-off validation ${t.validated}, monitoring active ${t.monitoringActive}, open findings ${t.openFindings}${severity}`;
      }),
    );
  }
  return `${lines.join("\n")}\n\n`;
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
