/**
 * @fileoverview The OSFI E-23 formal report as renderer-neutral content
 * (spec 8.3). Every sentence, figure and table cell of the E-23 parts is
 * decided here, once; report-pdf.ejs and docxGenerator only lay the blocks
 * out, so the PDF and the DOCX of one run cannot say different things.
 *
 * The audience decides the level of detail, never the facts: a board view of
 * the same ReportData drops requirement rows, model names and the appendix,
 * and keeps every figure.
 *
 * @module services/reporting/e23/formalView
 */

import type {
  E23Glance,
  FrameworkRequirementRow,
  MrmInventoryAppendixRow,
  MrmTierValue,
  ReportData,
} from "../../../domain.layer/interfaces/i.reportGeneration";
import { ANALYSIS_LABELS } from "../analyzers/mapToSummaries";
import { E23_RULES } from "./contradictionRules";
import { E23_FRAMEWORK_ID, E23_KIND } from "./e23Parameters";
import {
  AI_GENERATED_LABEL,
  AUDIENCE_LINES,
  CLOSES_WHEN_PREFIX,
  COVERAGE_LABELS,
  DRAFT_WATERMARK,
  E23_CHECKS_NOT_READ,
  E23_GAP_HEADERS,
  E23_HEADINGS,
  E23_NOT_ON_FILE,
  E23_REPORT_TITLE,
  NO_CONTRADICTIONS,
  NO_MODELS,
  NOT_CHECKED,
  POSITION_LABELS,
  SECTION_NOT_COMPLETED,
  SIGN_OFF_DRAFT,
  SIGN_OFF_DRAFT_NOTE,
  SIGN_OFF_FIELDS,
  SIGN_OFF_STATEMENT,
  scopeAndMethod,
  textParam,
} from "./e23Text";
import { METRIC_STALE_DAYS } from "./mrmFleet";

/** A table cell: plain text, or a main line with a smaller secondary line. */
export type E23Cell =
  string | { main: string; secondary?: string; indent?: boolean; nowrap?: boolean };

export type E23Block =
  | { kind: "paragraph"; text: string; muted?: boolean }
  /** AI-written prose in the labelled box the general report uses. */
  | { kind: "ai"; label: string; text: string }
  | { kind: "subheading"; text: string; note?: string }
  | { kind: "list"; title?: string; items: string[] }
  | {
      kind: "table";
      title?: string;
      headers: string[];
      rows: E23Cell[][];
      small?: boolean;
      /** Column widths in percent, for the PDF; DOCX sizes columns itself. */
      widths?: number[];
    }
  /** The PDF's completeness chart for frameworkRequirements.frameworks[index]; DOCX has none. */
  | { kind: "chart"; index: number };

export interface E23Section {
  id: string;
  heading: string;
  blocks: E23Block[];
}

export interface E23Signatory {
  role: string;
  name: string;
  title: string;
}

/** A cover page: shared by the formal report and the internal fix-it list. */
export interface E23Cover {
  title: string;
  /** The audience line of the formal report; the internal marking of the fix-it list. */
  subtitle: string;
  lines: Array<{ label: string; value: string }>;
}

export interface E23FormalView {
  board: boolean;
  /** DRAFT_WATERMARK unless the run is final. */
  watermark: string | null;
  institution: string;
  cover: E23Cover;
  /** Headings in body order, for the table of contents. */
  toc: string[];
  /** Before the executive summary: scope and method, at a glance. */
  intro: E23Section[];
  /** After the executive summary: completeness, MRM status, contradictions. */
  main: E23Section[];
  /** After the general sections, before the notices. Never for the board. */
  appendix: E23Section | null;
  /** "Analyses not produced", placed after the notices in this report. */
  abstentionsHeading: string;
  abstentions: Array<{ label: string; reason: string }>;
  signOff: {
    heading: string;
    statement: string;
    fields: typeof SIGN_OFF_FIELDS;
    draft: { label: string; note: string } | null;
    signatories: E23Signatory[];
  } | null;
  /** Footer line of the DOCX: institution and report title. */
  footerTitle: string;
}

const DASH = "—";

/** "November 20, 2026" from a Date or an ISO date/timestamp; dash when absent or unreadable. */
export function formatReportDate(value: Date | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return DASH;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : DASH;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

const tierLabel = (tier: MrmTierValue | null): string => (tier ? `Tier ${tier}` : "Untiered");

/** A short value (date, tier) that must not wrap mid-value. */
const nowrap = (main: string): E23Cell => ({ main, nowrap: true });

/** "validated_with_findings" -> "Validated with findings". */
const humanize = (value: string | null): string => {
  if (!value) return DASH;
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const orDash = (value: string | null | undefined): string => value || DASH;

const withTitle = (name: string, title: string): string =>
  [name, title].filter(Boolean).join(", ") || DASH;

/** Evidence file names for a requirement row, with "and N more" past the listed ten. */
export function evidenceLine(row: FrameworkRequirementRow): string | undefined {
  if (row.evidenceFiles.length === 0) return undefined;
  const more = row.evidenceCount - row.evidenceFiles.length;
  return `Evidence: ${row.evidenceFiles.join(", ")}${more > 0 ? `, and ${more} more` : ""}`;
}

/** True when the report is an OSFI E-23 kind run. */
export const isE23Report = (data: ReportData): boolean => data.metadata.reportKind === E23_KIND;

/**
 * E-23 has no pairing in scope: the collector said so with a
 * no_framework_target notice on the completeness or contradictions section.
 */
const e23NotOnFile = (data: ReportData): boolean =>
  (data.sectionNotices ?? []).some(
    (n) =>
      (n.sectionKey === "frameworkRequirements" || n.sectionKey === "e23Contradictions") &&
      n.reason === "no_framework_target",
  );

/** The section was selected but its data could not be read (collection_failed). */
const collectionFailed = (data: ReportData, sectionKey: string): boolean =>
  (data.sectionNotices ?? []).some(
    (n) => n.sectionKey === sectionKey && n.reason === "collection_failed",
  );

/**
 * A selected section whose data failed keeps its heading and place, so the
 * reader sees it was asked for and is pointed at the notice, never at a gap.
 */
const notCompletedSection = (id: string, heading: string): E23Section => ({
  id,
  heading,
  blocks: [{ kind: "paragraph", text: SECTION_NOT_COMPLETED }],
});

// ---------------------------------------------------------------------------
// At a glance
// ---------------------------------------------------------------------------

const ofText = (n: number, m: number) => `${n} of ${m}`;

const signed = (delta: number) => (delta > 0 ? `+${delta}` : String(delta));

const numberChange = (now: number, prev: number | null): string => {
  if (prev === null) return DASH;
  return now === prev ? "No change" : `${signed(now - prev)} (was ${prev})`;
};

const ofChange = (n: number, m: number, pn: number | null, pm: number | null): string => {
  if (pn === null || pm === null) return DASH;
  if (n === pn && m === pm) return "No change";
  return `${signed(n - pn)} (was ${ofText(pn, pm)})`;
};

const fixItText = (f: E23Glance["fixIt"]) => `${f.high} high, ${f.medium} medium, ${f.low} low`;

function glanceSection(glance: E23Glance): E23Section {
  const reqOk = glance.requirementsAvailable;
  const mrmOk = !glance.mrmUnavailable;
  const both = reqOk && mrmOk;
  const prev = glance.previous;
  const rows: Array<{ label: string; value: string; change: string }> = [
    {
      label: "E-23 requirements implemented or audited",
      value: reqOk ? ofText(glance.requirementsDone, glance.requirementsTotal) : NOT_CHECKED,
      change: prev
        ? ofChange(
            glance.requirementsDone,
            glance.requirementsTotal,
            prev.requirementsDone,
            prev.requirementsTotal,
          )
        : DASH,
    },
    {
      label: "Requirement groups checked against MRM data",
      value: both ? ofText(glance.groupsChecked, glance.groupsTotal) : NOT_CHECKED,
      change: prev
        ? ofChange(glance.groupsChecked, glance.groupsTotal, prev.groupsChecked, prev.groupsTotal)
        : DASH,
    },
    {
      label: "Contradiction rules fired",
      value: both ? ofText(glance.rulesFired, glance.rulesTotal) : NOT_CHECKED,
      change: prev
        ? ofChange(glance.rulesFired, glance.rulesTotal, prev.rulesFired, prev.rulesTotal)
        : DASH,
    },
    {
      label: "Models in scope",
      value: mrmOk ? String(glance.modelsInScope) : NOT_CHECKED,
      change: prev ? numberChange(glance.modelsInScope, prev.modelsInScope) : DASH,
    },
    {
      label: "Untiered models",
      value: mrmOk ? String(glance.untiered) : NOT_CHECKED,
      change: prev ? numberChange(glance.untiered, prev.untiered) : DASH,
    },
    {
      label: "Overdue validations",
      value: mrmOk ? String(glance.overdueValidations) : NOT_CHECKED,
      change: prev ? numberChange(glance.overdueValidations, prev.overdueValidations) : DASH,
    },
    {
      label: "Open critical or high findings",
      value: mrmOk ? String(glance.openCriticalHigh) : NOT_CHECKED,
      change: prev ? numberChange(glance.openCriticalHigh, prev.openCriticalHigh) : DASH,
    },
    {
      label: "Fix-it items by severity",
      value: both ? fixItText(glance.fixIt) : NOT_CHECKED,
      change:
        prev && prev.fixIt
          ? fixItText(prev.fixIt) === fixItText(glance.fixIt)
            ? "No change"
            : `Was ${fixItText(prev.fixIt)}`
          : DASH,
    },
  ];

  const headers = ["Figure", "Position"];
  if (prev) headers.push(`Change since previous run (${formatReportDate(prev.generatedAt)})`);
  return {
    id: "glance",
    heading: E23_HEADINGS.glance,
    blocks: [
      {
        kind: "table",
        headers,
        // A figure not measured now has no change, whatever the previous run held.
        rows: rows.map((r) => {
          const measured = r.value !== NOT_CHECKED;
          const value = measured ? r.value : nowrap(r.value);
          return prev ? [r.label, value, measured ? r.change : DASH] : [r.label, value];
        }),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// E-23 program completeness
// ---------------------------------------------------------------------------

function completenessSection(
  data: ReportData,
  board: boolean,
  notOnFile: boolean,
): E23Section | null {
  const fr = data.sections.frameworkRequirements;
  if (!fr && !notOnFile) return null;
  const coverage = data.sections.e23Contradictions?.coverage ?? {};
  const blocks: E23Block[] = [];
  if (notOnFile) blocks.push({ kind: "paragraph", text: E23_NOT_ON_FILE });

  (fr?.frameworks ?? []).forEach((fw, index) => {
    const isE23 = fw.frameworkId === E23_FRAMEWORK_ID;
    const coverageOf = (title: string): string | undefined => {
      const c = isE23 ? coverage[title] : undefined;
      return c ? COVERAGE_LABELS[c] : undefined;
    };
    blocks.push({ kind: "subheading", text: fw.frameworkName });
    blocks.push({
      kind: "paragraph",
      text: `${fw.rollup.done} of ${fw.rollup.total} requirements implemented or audited`,
      muted: true,
    });
    blocks.push({ kind: "chart", index });

    if (board) {
      const withCoverage = isE23 && Object.keys(coverage).length > 0;
      blocks.push({
        kind: "table",
        headers: withCoverage
          ? ["Group", "Implemented or audited", "Data coverage"]
          : ["Group", "Implemented or audited"],
        rows: fw.groups.map((g) => {
          const cells = [
            `${g.useCase ? `${g.useCase} · ` : ""}${g.title}`,
            `${g.rollup.done} of ${g.rollup.total}`,
          ];
          return withCoverage ? [...cells, coverageOf(g.title) ?? DASH] : cells;
        }),
      });
      return;
    }

    fw.groups.forEach((g) => {
      const label = coverageOf(g.title);
      blocks.push({
        kind: "subheading",
        text: `${g.useCase ? `${g.useCase} · ` : ""}${g.title}`,
        ...(label && { note: `Data coverage: ${label}` }),
      });
      if (g.requirements.length === 0) return;
      blocks.push({
        kind: "table",
        small: true,
        headers: ["Requirement", "Status", "Owner", "Due date", "Evidence"],
        rows: g.requirements
          .flatMap((req) => [req, ...(req.children ?? [])])
          .map((r) => [
            { main: r.title, secondary: evidenceLine(r), indent: r.level === 3 },
            r.status,
            orDash(r.owner),
            nowrap(orDash(r.dueDate)),
            String(r.evidenceCount),
          ]),
      });
    });
  });

  return { id: "completeness", heading: E23_HEADINGS.completeness, blocks };
}

// ---------------------------------------------------------------------------
// Model risk management status
// ---------------------------------------------------------------------------

function mrmSection(data: ReportData, board: boolean): E23Section | null {
  const fleet = data.sections.mrmFleet;
  if (!fleet) {
    return collectionFailed(data, "mrmFleet") ? notCompletedSection("mrm", E23_HEADINGS.mrm) : null;
  }
  const heading = E23_HEADINGS.mrm;
  if (fleet.totals.models === 0) {
    return { id: "mrm", heading, blocks: [{ kind: "paragraph", text: NO_MODELS }] };
  }

  const kv = (title: string, rows: Array<[string, number]>): E23Block => ({
    kind: "table",
    title,
    headers: ["Measure", "Models"],
    rows: rows.map(([label, n]) => [label, String(n)]),
  });

  const { totals, validationCoverage: v, openFindingsBySeverity: f, monitoring, activity } = fleet;
  const blocks: E23Block[] = [
    kv("Fleet", [
      ["Models in scope (not retired)", totals.models],
      ["Tier 1", totals.byTier["1"]],
      ["Tier 2", totals.byTier["2"]],
      ["Tier 3", totals.byTier["3"]],
      ["Untiered", totals.untiered],
    ]),
    kv("Validation coverage", [
      ["Validated", v.validated],
      ["In review", v.inReview],
      ["Not started", v.notStarted],
      ["Overdue", v.overdue],
    ]),
    {
      kind: "table",
      title: "Open findings by severity",
      headers: ["Severity", "Findings"],
      rows: [
        ["Critical", String(f.critical)],
        ["High", String(f.high)],
        ["Medium", String(f.medium)],
        ["Low", String(f.low)],
      ],
    },
    kv("Monitoring coverage", [
      ["With active thresholds", monitoring.withActiveThresholds],
      [`With a metric received in the last ${METRIC_STALE_DAYS} days`, monitoring.withRecentMetric],
    ]),
  ];

  if (activity.period) {
    blocks.push({
      kind: "table",
      title: `Activity from ${formatReportDate(activity.period.start)} to ${formatReportDate(
        activity.period.end,
      )}`,
      headers: ["Activity", "Count"],
      rows: [
        ["Validations signed off", String(activity.validationsSignedOff)],
        ["Findings opened", String(activity.findingsOpened)],
        ["Findings closed", String(activity.findingsClosed)],
        ["Threshold breaches", String(activity.breaches)],
        ["Revalidation events", String(activity.revalidationEvents)],
      ],
    });
  } else {
    blocks.push({
      kind: "paragraph",
      text: "No report period was set, so activity in a period is not counted.",
      muted: true,
    });
  }

  blocks.push({
    kind: "table",
    title: "By tier",
    headers: [
      "Tier",
      "Models",
      "Tiering current",
      "Validated",
      "Monitoring active",
      "Open findings",
      "Critical or high findings",
    ],
    rows: fleet.perTier.map((t) => [
      nowrap(tierLabel(t.tier)),
      String(t.models),
      String(t.tieringCurrent),
      String(t.validated),
      String(t.monitoringActive),
      String(t.openFindings),
      String(t.criticalHighFindings),
    ]),
  });

  const exceptionsTitle = "Models with exceptions";
  const exceptionScope =
    "An exception is an untiered model, an overdue validation, no owner role, or an open critical or high finding.";
  if (fleet.exceptions.length === 0) {
    blocks.push({ kind: "subheading", text: exceptionsTitle });
    blocks.push({ kind: "paragraph", text: `No model has an exception. ${exceptionScope}` });
  } else if (board) {
    blocks.push({ kind: "subheading", text: exceptionsTitle });
    blocks.push({
      kind: "paragraph",
      text: `${fleet.exceptions.length} of ${totals.models} models have at least one exception. ${exceptionScope}`,
    });
  } else {
    blocks.push({
      kind: "table",
      title: exceptionsTitle,
      headers: ["Model", "Tier", "Exceptions"],
      rows: fleet.exceptions.map((e) => [e.name, nowrap(tierLabel(e.tier)), e.issues.join(", ")]),
    });
    blocks.push({ kind: "paragraph", text: exceptionScope, muted: true });
  }

  return { id: "mrm", heading, blocks };
}

// ---------------------------------------------------------------------------
// Where the checklist and the data disagree
// ---------------------------------------------------------------------------

/** The structure title already starts with the number; print it once. */
const requirementLabel = (requirement: string, title: string): string => {
  const trimmed = title.trim();
  return trimmed.startsWith(requirement) ? trimmed : `${requirement} ${trimmed}`.trim();
};

const ruleLabel = (ruleId: string): string => {
  const rule = E23_RULES.find((r) => r.id === ruleId);
  return rule ? `${rule.requirement} ${rule.description}` : ruleId;
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function contradictionsSection(
  data: ReportData,
  board: boolean,
  notOnFile: boolean,
): E23Section | null {
  const c = data.sections.e23Contradictions;
  if (!c && !notOnFile) {
    return collectionFailed(data, "e23Contradictions")
      ? notCompletedSection("contradictions", E23_HEADINGS.contradictions)
      : null;
  }
  const heading = E23_HEADINGS.contradictions;
  if (notOnFile) {
    return {
      id: "contradictions",
      heading,
      blocks: [{ kind: "paragraph", text: E23_NOT_ON_FILE }],
    };
  }
  if (!c || !c.available) {
    return {
      id: "contradictions",
      heading,
      blocks: [{ kind: "paragraph", text: E23_CHECKS_NOT_READ }],
    };
  }

  const blocks: E23Block[] = [];
  if (c.fired.length === 0) {
    blocks.push({ kind: "paragraph", text: NO_CONTRADICTIONS });
    blocks.push({
      kind: "list",
      title: "Rules checked",
      items: E23_RULES.filter((r) => c.checked.includes(r.id)).map(
        (r) => `${r.requirement} ${r.description}: ${r.dataCondition}`,
      ),
    });
  } else {
    const headers = ["Requirement", "Claimed status", "What the data shows", "Models affected"];
    if (!board) headers.push("Examples");
    blocks.push({
      kind: "table",
      headers,
      widths: board ? [36, 16, 34, 14] : [26, 13, 25, 11, 25],
      rows: c.fired.map((f) => {
        const cells: E23Cell[] = [
          requirementLabel(f.requirement, f.requirementTitle),
          f.claimedStatus,
          f.finding,
          String(f.affectedCount),
        ];
        if (!board) {
          cells.push(
            f.examples.length > 0
              ? `${f.examples.join(", ")}${f.moreCount > 0 ? `, and ${f.moreCount} more` : ""}`
              : DASH,
          );
        }
        return cells;
      }),
    });
  }

  if (c.notRun.length > 0) {
    blocks.push({
      kind: "list",
      title: "Rules not run",
      items: c.notRun.map((n) => `${ruleLabel(n.ruleId)}: ${capitalize(n.reason)}`),
    });
  }

  return { id: "contradictions", heading, blocks };
}

// ---------------------------------------------------------------------------
// E-23 gap analysis (AI)
// ---------------------------------------------------------------------------

/** "partly consistent" -> "Partly consistent"; dash when absent. */
export const capitalizeOrDash = (value: string | null | undefined): string =>
  value ? capitalize(value) : DASH;

/**
 * The e23Gap analysis (spec 8.3 item 8), or null when it was not produced (its
 * abstention is listed with the others). The whole section is AI-written: the
 * narrative sits in the labelled box and the table title says so too.
 * Positions are printed through POSITION_LABELS, never as the raw value.
 */
function e23GapSection(data: ReportData): E23Section | null {
  const gap = data.aiSummaries?.e23Gap;
  if (!gap) return null;
  const blocks: E23Block[] = [{ kind: "ai", label: AI_GENERATED_LABEL, text: gap.narrative }];
  if (gap.principles.length > 0) {
    blocks.push({
      kind: "table",
      title: `Position by requirement group (${AI_GENERATED_LABEL})`,
      headers: E23_GAP_HEADERS,
      widths: [28, 20, 40, 12],
      rows: gap.principles.map((p) => [
        p.group,
        POSITION_LABELS[p.position] ?? DASH,
        {
          main: p.explanation,
          ...(p.what_would_close_this && {
            secondary: `${CLOSES_WHEN_PREFIX} ${p.what_would_close_this}`,
          }),
        },
        capitalizeOrDash(p.basis),
      ]),
    });
  }
  return { id: "e23gap", heading: ANALYSIS_LABELS.e23Gap, blocks };
}

// ---------------------------------------------------------------------------
// Model inventory appendix
// ---------------------------------------------------------------------------

/**
 * One inventory list as three tables (spec 8.7 allows splitting): identity,
 * governance and monitoring, then use and validation, so prose columns get
 * room on a portrait page.
 */
function appendixTables(title: string, rows: MrmInventoryAppendixRow[]): E23Block[] {
  if (rows.length === 0) {
    return [
      { kind: "subheading", text: title },
      { kind: "paragraph", text: "None." },
    ];
  }
  return [
    {
      kind: "table",
      title,
      small: true,
      headers: ["Model", "Version", "Provider", "Type", "Tier", "Status"],
      rows: rows.map((r) => [
        r.name,
        orDash(r.version),
        orDash(r.provider),
        orDash(r.type),
        nowrap(tierLabel(r.tier)),
        orDash(r.status),
      ]),
    },
    {
      kind: "table",
      title: `${title}: governance and monitoring`,
      small: true,
      headers: [
        "Model",
        "Owner",
        "Approver",
        "Next review due",
        "Active thresholds",
        "Open findings",
      ],
      rows: rows.map((r) => [
        r.name,
        orDash(r.owner),
        orDash(r.approver),
        nowrap(formatReportDate(r.nextReviewDue)),
        r.activeThresholds ? "Yes" : "No",
        String(r.openFindings),
      ]),
    },
    {
      kind: "table",
      title: `${title}: use and validation`,
      small: true,
      widths: [18, 24, 38, 20],
      headers: ["Model", "Intended use", "Limitations", "Latest validation"],
      rows: rows.map((r) => [
        r.name,
        orDash(r.intendedUse),
        orDash(r.limitations),
        r.latestOutcome
          ? `${humanize(r.latestOutcome)}, ${formatReportDate(r.latestSignedOffAt)}`
          : DASH,
      ]),
    },
  ];
}

function appendixSection(data: ReportData, board: boolean): E23Section | null {
  const a = data.sections.mrmInventoryAppendix;
  if (board) return null;
  if (!a) {
    return collectionFailed(data, "mrmInventoryAppendix")
      ? notCompletedSection("appendix", E23_HEADINGS.appendix)
      : null;
  }
  return {
    id: "appendix",
    heading: E23_HEADINGS.appendix,
    blocks: [
      ...appendixTables("Models in use", a.active),
      ...appendixTables("Retired models", a.retired),
    ],
  };
}

// ---------------------------------------------------------------------------
// The whole view
// ---------------------------------------------------------------------------

/** The formal report's content, or null for a report that is not an E-23 kind run. */
export function buildE23FormalView(data: ReportData): E23FormalView | null {
  if (!isE23Report(data)) return null;
  const params = data.metadata.reportParameters ?? {};
  const board = params.audience === "board";
  const isFinal = params.isFinal === true;
  const institution = textParam(params.institutionName) || data.branding.organizationName;
  const generated = formatReportDate(data.metadata.generatedAt);
  const periodStart = formatReportDate(textParam(params.periodStart) || null);
  const periodEnd = formatReportDate(textParam(params.periodEnd) || null);
  const notOnFile = e23NotOnFile(data);

  const scope = scopeAndMethod(params, { board, generatedAt: generated, periodStart, periodEnd });
  const intro: E23Section[] = [
    {
      id: "scope",
      heading: E23_HEADINGS.scope,
      blocks: [
        ...scope.paragraphs.map((text): E23Block => ({ kind: "paragraph", text })),
        { kind: "list", title: E23_HEADINGS.limitations, items: scope.limitations },
      ],
    },
  ];
  if (data.sections.e23Glance) intro.push(glanceSection(data.sections.e23Glance));

  const main = [
    completenessSection(data, board, notOnFile),
    mrmSection(data, board),
    contradictionsSection(data, board, notOnFile),
    // The AI gap analysis follows the contradictions it explains (spec 8.3 item 8).
    e23GapSection(data),
  ].filter((s): s is E23Section => s !== null);
  const appendix = appendixSection(data, board);

  const signatories: E23Signatory[] = [
    {
      role: "Accountable executive",
      name: textParam(params.accountableExecutiveName),
      title: textParam(params.accountableExecutiveTitle),
    },
  ];
  const hovName = textParam(params.headOfValidationName);
  if (hovName) {
    signatories.push({
      role: "Head of model validation",
      name: hovName,
      title: textParam(params.headOfValidationTitle),
    });
  }

  const ai = data.aiSummaries;
  const s = data.sections;
  const toc = [
    ...intro.map((x) => x.heading),
    ...(ai?.executiveSummary ? [ANALYSIS_LABELS.executiveSummary] : []),
    ...main.map((x) => x.heading),
    ...(ai?.complianceGap ? [ANALYSIS_LABELS.complianceGap] : []),
    ...(ai?.vendorRisk ? [ANALYSIS_LABELS.vendorRisk] : []),
    ...(s.projectRisks || s.vendorRisks || s.modelRisks ? ["Risk analysis"] : []),
    ...(s.compliance || s.assessment || s.clausesAndAnnexes || s.nistSubcategories
      ? ["Compliance & governance"]
      : []),
    ...(s.vendors || s.models || s.trainingRegistry || s.policyManager || s.incidentManagement
      ? ["Organization"]
      : []),
    ...(appendix ? [appendix.heading] : []),
    ...(s.signOff ? [E23_HEADINGS.signOff] : []),
  ];

  return {
    board,
    watermark: isFinal ? null : DRAFT_WATERMARK,
    institution,
    cover: {
      title: E23_REPORT_TITLE,
      subtitle: board ? AUDIENCE_LINES.board : AUDIENCE_LINES.osfi,
      lines: [
        { label: "Period", value: `${periodStart} to ${periodEnd}` },
        { label: "Position as at", value: generated },
        {
          label: "Prepared by",
          value: withTitle(textParam(params.preparedByName), textParam(params.preparedByTitle)),
        },
        {
          label: "Accountable executive",
          value: withTitle(
            textParam(params.accountableExecutiveName),
            textParam(params.accountableExecutiveTitle),
          ),
        },
        ...(isFinal ? [] : [{ label: "Version", value: SIGN_OFF_DRAFT }]),
      ],
    },
    toc,
    intro,
    main,
    appendix,
    // Recommended actions belong to the internal fix-it list for this report,
    // so their abstention does too.
    abstentionsHeading: "Analyses not produced",
    abstentions: Object.entries(ai?.abstentions ?? {})
      .filter(([key]) => key !== "recommendedActions")
      .map(([key, reason]) => ({ label: ANALYSIS_LABELS[key] ?? key, reason })),
    signOff: s.signOff
      ? {
          heading: E23_HEADINGS.signOff,
          statement: SIGN_OFF_STATEMENT,
          fields: SIGN_OFF_FIELDS,
          draft: isFinal ? null : { label: SIGN_OFF_DRAFT, note: SIGN_OFF_DRAFT_NOTE },
          signatories,
        }
      : null,
    footerTitle: `${institution} | ${E23_REPORT_TITLE}`,
  };
}
