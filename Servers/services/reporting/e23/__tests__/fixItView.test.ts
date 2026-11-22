/**
 * The internal fix-it list's content (spec 8.6), decided once for both
 * renderers: cover, items grouped by severity, and the line that says when
 * part of the list could not be built.
 */
import { buildE23FixItView, type E23FixItView } from "../fixItView";
import {
  E23_NOT_ON_FILE,
  FIX_IT_HEADERS,
  FIX_IT_NOT_COMPLETED,
  FIX_IT_OVERDUE,
  FIX_IT_TITLE,
  INTERNAL_MARKING,
  NO_FIX_IT_ITEMS,
} from "../e23Text";
import { NOTICE_TEXT } from "../../noticeText";
import {
  FIX_IT_ITEMS,
  e23FixItReportData,
  nonKindReportData,
} from "../../tests/helpers/e23ReportData";
import type { E23Block } from "../formalView";

const tables = (view: E23FixItView) =>
  view.sections[0].blocks.filter(
    (b): b is Extract<E23Block, { kind: "table" }> => b.kind === "table",
  );

const allText = (view: E23FixItView): string => JSON.stringify(view);

describe("buildE23FixItView", () => {
  it("is null for a report that is not an E-23 kind run", () => {
    expect(buildE23FixItView(nonKindReportData(), { runId: 7 })).toBeNull();
  });

  it("puts institution, title, marking, as-of date and run on the cover", () => {
    const view = buildE23FixItView(e23FixItReportData(), { runId: 77 })!;

    expect(view.institution).toBe("Northern Bank of Canada");
    expect(view.cover.title).toBe(FIX_IT_TITLE);
    expect(view.cover.subtitle).toBe(INTERNAL_MARKING);
    expect(view.cover.lines).toEqual([
      { label: "Position as at", value: "November 20, 2026" },
      { label: "Report run", value: "Run #77" },
    ]);
  });

  it("carries the marking in the footer text, for every page", () => {
    const view = buildE23FixItView(e23FixItReportData(), { runId: 77 })!;

    expect(view.footerText).toContain(INTERNAL_MARKING);
    expect(view.footerText).toContain("Northern Bank of Canada");
  });

  it("groups the items by severity, high first, one table each with the six columns", () => {
    const view = buildE23FixItView(e23FixItReportData(), { runId: 1 })!;
    const t = tables(view);

    expect(t.map((x) => x.title)).toEqual(["High (2)", "Medium (1)", "Low (1)"]);
    t.forEach((x) => expect(x.headers).toEqual(FIX_IT_HEADERS));
    expect(t[0].rows[0]).toEqual([
      "High",
      FIX_IT_ITEMS[0].what,
      FIX_IT_ITEMS[0].where,
      "Rae Rater",
      { main: "—", nowrap: true },
      FIX_IT_ITEMS[0].closesWhen,
    ]);
  });

  it("marks an overdue item under its due date", () => {
    const view = buildE23FixItView(e23FixItReportData(), { runId: 1 })!;

    expect(tables(view)[0].rows[1][4]).toEqual({
      main: "September 30, 2026",
      secondary: FIX_IT_OVERDUE,
      nowrap: true,
    });
  });

  it("states the totals before the tables", () => {
    const view = buildE23FixItView(e23FixItReportData(), { runId: 1 })!;

    expect(view.sections[0].blocks[0]).toEqual({
      kind: "paragraph",
      text: "4 items: 2 high, 1 medium, 1 low.",
    });
  });

  it("says the list is clear when there is nothing to fix", () => {
    const view = buildE23FixItView(e23FixItReportData({ items: [] }), { runId: 1 })!;

    expect(tables(view)).toEqual([]);
    expect(allText(view)).toContain(NO_FIX_IT_ITEMS);
  });

  it("names what could not be read, keeps the items it has, and never says clear", () => {
    const data = e23FixItReportData({ items: [FIX_IT_ITEMS[3]] });
    data.sectionNotices = [
      {
        sectionKey: "e23FixItList",
        reason: "collection_failed",
        detail: "Model risk management data",
      },
      // Another section's failure is not this list's concern.
      { sectionKey: "mrmFleet", reason: "collection_failed", detail: "Something else" },
    ];

    const view = buildE23FixItView(data, { runId: 1 })!;
    const blocks = view.sections[0].blocks;

    expect(blocks[0]).toEqual({ kind: "paragraph", text: FIX_IT_NOT_COMPLETED });
    expect(blocks[1]).toEqual({
      kind: "list",
      items: [`Model risk management data ${NOTICE_TEXT.failedSuffix}`],
    });
    expect(allText(view)).not.toContain("Something else");
    expect(allText(view)).toContain(NOTICE_TEXT.failedGuidance);
    expect(tables(view).map((t) => t.title)).toEqual(["Low (1)"]);
    expect(allText(view)).not.toContain(NO_FIX_IT_ITEMS);
  });

  it("still produces the document when the list itself is missing", () => {
    const data = e23FixItReportData();
    delete data.sections.e23FixItList;
    data.sectionNotices = [
      { sectionKey: "e23FixItList", reason: "collection_failed", detail: "OSFI E-23 checklist" },
    ];

    const view = buildE23FixItView(data, { runId: 1 })!;

    expect(view.sections[0].blocks[0]).toEqual({ kind: "paragraph", text: FIX_IT_NOT_COMPLETED });
    expect(tables(view)).toEqual([]);
    expect(allText(view)).not.toContain(NO_FIX_IT_ITEMS);
  });

  it("says when E-23 is not on file, and does not call the list clear", () => {
    const data = e23FixItReportData({ notOnFile: true, items: [] });
    // The collector raises this on the fix-it list itself when there is no E-23 pairing.
    data.sectionNotices.push({ sectionKey: "e23FixItList", reason: "no_framework_target" });

    const view = buildE23FixItView(data, { runId: 1 })!;

    expect(allText(view)).toContain(E23_NOT_ON_FILE);
    expect(allText(view)).not.toContain(NO_FIX_IT_ITEMS);
  });

  it("reads not-on-file from its own notice, not from other sections' notices", () => {
    // Only the formal sections' notices: the list itself was checked.
    const view = buildE23FixItView(e23FixItReportData({ notOnFile: true, items: [] }), {
      runId: 1,
    })!;

    expect(allText(view)).not.toContain(E23_NOT_ON_FILE);
  });

  it("omits the run line when the run id is not known", () => {
    const view = buildE23FixItView(e23FixItReportData(), {})!;

    expect(view.cover.lines.map((l) => l.label)).toEqual(["Position as at"]);
  });
});
