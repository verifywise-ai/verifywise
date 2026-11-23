/**
 * The five two-column count tables of the "Model risk management status"
 * section (Fleet, Validation coverage, Open findings by severity, Monitoring
 * coverage, Activity) share fixed column widths, so their second columns line
 * up in the PDF and the DOCX. The multi-column "By tier" table keeps its
 * automatic layout.
 */
jest.mock("playwright", () => ({ chromium: { launch: jest.fn() } }));

import JSZip from "jszip";
import { buildE23FormalView, COUNT_TABLE_WIDTHS, type E23Block } from "../formalView";
import { E23_HEADINGS } from "../e23Text";
import { renderReportHtml } from "../../pdfGenerator";
import { generateDOCX } from "../../docxGenerator";
import { e23ReportData } from "../../tests/helpers/e23ReportData";

const COUNT_TITLES = [
  "Fleet",
  "Validation coverage",
  "Open findings by severity",
  "Monitoring coverage",
  "Activity from August 1, 2026 to October 31, 2026",
];

type TableBlock = Extract<E23Block, { kind: "table" }>;

const mrmTables = (): TableBlock[] => {
  const view = buildE23FormalView(e23ReportData())!;
  const mrm = view.main.find((s) => s.id === "mrm")!;
  return mrm.blocks.filter((b): b is TableBlock => b.kind === "table");
};

describe("MRM status count tables", () => {
  it("give all five count tables the same fixed widths, and leave By tier alone", () => {
    const tables = mrmTables();
    const counts = tables.filter((t) => COUNT_TITLES.includes(t.title ?? ""));
    expect(counts.map((t) => t.title)).toEqual(COUNT_TITLES);
    expect(COUNT_TABLE_WIDTHS).toEqual([70, 30]);
    for (const t of counts) {
      expect(t.headers).toHaveLength(2);
      expect(t.widths).toEqual(COUNT_TABLE_WIDTHS);
      expect(t.fixed).toBe(true);
    }
    const byTier = tables.find((t) => t.title === "By tier")!;
    expect(byTier.widths).toBeUndefined();
    expect(byTier.fixed).toBeUndefined();
  });

  it("PDF: renders each count table with a fixed layout and 70/30 columns", () => {
    const html = renderReportHtml(e23ReportData());
    const mrm = html.match(/<section class="e23-section" id="e23-mrm">[\s\S]*?<\/section>/)![0];
    const tables = mrm.match(/<table[\s\S]*?<\/table>/g)!;
    const fixed = tables.filter((t) => t.includes("e23-fixed"));
    expect(fixed).toHaveLength(5);
    for (const t of fixed) {
      expect(t).toMatch(/<colgroup><col style="width: 70%;"><col style="width: 30%;"><\/colgroup>/);
    }
    const byTier = tables.find((t) => t.includes("Tiering current"))!;
    expect(byTier).not.toContain("e23-fixed");
    expect(byTier).not.toContain("<colgroup>");
  });

  it("DOCX: gives each count table a fixed layout and the same column grid", async () => {
    const result = await generateDOCX(e23ReportData());
    expect(result.success).toBe(true);
    const zip = await JSZip.loadAsync(result.content);
    const xml = await zip.file("word/document.xml")!.async("string");
    const from = xml.indexOf(`>${E23_HEADINGS.mrm}</w:t>`);
    const to = xml.indexOf(`>${E23_HEADINGS.contradictions}</w:t>`, from);
    const tables = xml.slice(from, to).match(/<w:tbl>[\s\S]*?<\/w:tbl>/g)!;

    const isCount = (t: string) =>
      [">Measure<", ">Severity<", ">Activity<"].some((h) => t.includes(h));
    const counts = tables.filter(isCount);
    expect(counts).toHaveLength(5);
    const grids = counts.map((t) => t.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)![0]);
    for (const t of counts) expect(t).toContain('<w:tblLayout w:type="fixed"/>');
    expect(new Set(grids).size).toBe(1);
    const cols = [...grids[0].matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));
    expect(cols).toHaveLength(2);
    expect(Math.round((cols[0] / (cols[0] + cols[1])) * 100)).toBe(70);

    const byTier = tables.find((t) => t.includes(">Tiering current<"))!;
    expect(byTier).not.toContain("<w:tblLayout");
  });
});
