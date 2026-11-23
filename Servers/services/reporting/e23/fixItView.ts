/**
 * @fileoverview The internal OSFI E-23 fix-it list as renderer-neutral
 * content (spec 8.6): a second file of the run, for the MRM team. Every line
 * is decided here, once; e23-fixit-pdf.ejs and docxFixIt.ts only lay it out,
 * using the same blocks as the formal report (formalView.ts).
 *
 * The items come from sections.e23FixItList, already sorted (fixItList.ts).
 * When part of their data could not be read the document is still produced:
 * the items that could be built, and a line naming what failed.
 *
 * @module services/reporting/e23/fixItView
 */

import type { E23FixItItem, ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import { NOTICE_TEXT } from "../noticeText";
import { ANALYSIS_LABELS } from "../analyzers/mapToSummaries";
import {
  AI_GENERATED_LABEL,
  E23_NOT_ON_FILE,
  FIX_IT_HEADERS,
  FIX_IT_HEADING,
  FIX_IT_NOT_COMPLETED,
  FIX_IT_OVERDUE,
  FIX_IT_SEVERITY_LABELS,
  FIX_IT_TITLE,
  INTERNAL_MARKING,
  NO_FIX_IT_ITEMS,
  RECOMMENDED_ACTIONS_HEADERS,
  RECOMMENDED_ACTIONS_HEADING,
  textParam,
} from "./e23Text";
import {
  type E23Block,
  type E23Cell,
  type E23Cover,
  type E23Section,
  capitalizeOrDash,
  formatReportDate,
  isE23Report,
} from "./formalView";

export interface E23FixItView {
  institution: string;
  cover: E23Cover;
  /** The body: the fix-it items. */
  sections: E23Section[];
  /** Printed in every page footer: institution, title and the internal marking. */
  footerText: string;
}

const SEVERITIES = ["high", "medium", "low"] as const;

/** Columns: severity, what, where, owner, due date, closes when. */
const COLUMN_WIDTHS = [8, 23, 25, 11, 12, 21];

const DASH = "—";

const dueCell = (item: E23FixItItem): E23Cell => ({
  main: item.dueDate ? formatReportDate(item.dueDate) : DASH,
  ...(item.overdue && { secondary: FIX_IT_OVERDUE }),
  nowrap: true,
});

const itemRow = (item: E23FixItItem): E23Cell[] => [
  FIX_IT_SEVERITY_LABELS[item.severity],
  item.what,
  item.where,
  item.owner,
  dueCell(item),
  item.closesWhen,
];

const plural = (n: number) => (n === 1 ? "item" : "items");

/**
 * The parts of the list's data that could not be read: the collection_failed
 * notices raised on e23FixItList (the MRM data, the E-23 checklist), named the
 * way the formal report's notices block names them.
 */
function notCompletedBlocks(data: ReportData): E23Block[] {
  const failed = [
    ...new Set(
      (data.sectionNotices ?? [])
        .filter((n) => n.sectionKey === "e23FixItList" && n.reason === "collection_failed")
        .map((n) => n.detail ?? FIX_IT_HEADING),
    ),
  ];
  if (failed.length === 0) return [];
  return [
    { kind: "paragraph", text: FIX_IT_NOT_COMPLETED },
    { kind: "list", items: failed.map((detail) => `${detail} ${NOTICE_TEXT.failedSuffix}`) },
    { kind: "paragraph", text: NOTICE_TEXT.failedGuidance, muted: true },
  ];
}

/**
 * E-23 was not checked: the collector raises no_framework_target on
 * e23FixItList itself when there is no E-23 pairing, whichever other
 * sections were selected.
 */
const e23NotChecked = (data: ReportData): boolean =>
  (data.sectionNotices ?? []).some(
    (n) => n.sectionKey === "e23FixItList" && n.reason === "no_framework_target",
  );

function itemsSection(data: ReportData): E23Section {
  const list = data.sections.e23FixItList;
  const items = list?.items ?? [];
  const notCompleted = notCompletedBlocks(data);
  const notOnFile = e23NotChecked(data);
  const blocks: E23Block[] = [...notCompleted];
  if (notOnFile) blocks.push({ kind: "paragraph", text: E23_NOT_ON_FILE });

  if (list && items.length > 0) {
    const { high, medium, low } = list.counts;
    blocks.push({
      kind: "paragraph",
      text: `${items.length} ${plural(items.length)}: ${high} high, ${medium} medium, ${low} low.`,
    });
  }
  for (const severity of SEVERITIES) {
    const rows = items.filter((i) => i.severity === severity);
    if (rows.length === 0) continue;
    blocks.push({
      kind: "table",
      title: `${FIX_IT_SEVERITY_LABELS[severity]} (${rows.length})`,
      headers: FIX_IT_HEADERS,
      rows: rows.map(itemRow),
      small: true,
      widths: COLUMN_WIDTHS,
    });
  }
  // "Clear" only when every check ran: a partial list is not a clean one.
  if (items.length === 0 && notCompleted.length === 0 && !notOnFile) {
    blocks.push({ kind: "paragraph", text: NO_FIX_IT_ITEMS });
  }
  return { id: "fixit-items", heading: FIX_IT_HEADING, blocks };
}

/**
 * The AI recommended actions (spec 8.6): moved here from the formal report for
 * this template, because they name suggested owners and read as a to-do list.
 * When they were not produced, their abstention is said here instead, since
 * the formal report leaves it out. Null when the block was not run.
 */
function actionsSection(data: ReportData): E23Section | null {
  const ai = data.aiSummaries;
  const actions = ai?.recommendedActions ?? [];
  const abstention = ai?.abstentions?.recommendedActions;
  if (actions.length === 0 && !abstention) return null;
  const blocks: E23Block[] =
    actions.length > 0
      ? [
          {
            kind: "ai",
            label: AI_GENERATED_LABEL,
            text: "These actions were written by AI from the fix-it items and the report data. Check each one before acting on it.",
          },
          {
            kind: "table",
            headers: RECOMMENDED_ACTIONS_HEADERS,
            small: true,
            widths: [32, 32, 10, 10, 16],
            rows: actions.map((a) => [
              a.action,
              a.sourceSignal || DASH,
              capitalizeOrDash(a.priority),
              capitalizeOrDash(a.basis),
              a.suggestedOwner || "Unassigned",
            ]),
          },
        ]
      : [{ kind: "paragraph", text: `${ANALYSIS_LABELS.recommendedActions}: ${abstention}` }];
  return { id: "fixit-actions", heading: RECOMMENDED_ACTIONS_HEADING, blocks };
}

/** The fix-it document's content, or null for a report that is not an E-23 kind run. */
export function buildE23FixItView(data: ReportData, opts: { runId?: number }): E23FixItView | null {
  if (!isE23Report(data)) return null;
  const params = data.metadata.reportParameters ?? {};
  const institution = textParam(params.institutionName) || data.branding.organizationName;

  const actions = actionsSection(data);
  const sections = [itemsSection(data), ...(actions ? [actions] : [])];

  return {
    institution,
    cover: {
      title: FIX_IT_TITLE,
      subtitle: INTERNAL_MARKING,
      lines: [
        { label: "Position as at", value: formatReportDate(data.metadata.generatedAt) },
        ...(opts.runId != null ? [{ label: "Report run", value: `Run #${opts.runId}` }] : []),
      ],
    },
    sections,
    footerText: `${institution} | ${FIX_IT_TITLE} | ${INTERNAL_MARKING}`,
  };
}
