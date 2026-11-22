/**
 * The internal E-23 fix-it list in e23-fixit-pdf.ejs, rendered through the
 * same functions the PDF is printed from (renderFixItHtml for the body,
 * fixItFooterTemplate for the footer Chromium repeats on every page).
 */
jest.mock("playwright", () => ({ chromium: { launch: jest.fn() } }));

import { fixItFooterTemplate, renderFixItHtml } from "../pdfGenerator";
import { buildE23FixItView } from "../e23/fixItView";
import {
  FIX_IT_HEADERS,
  FIX_IT_NOT_COMPLETED,
  FIX_IT_TITLE,
  INTERNAL_MARKING,
} from "../e23/e23Text";
import { FIX_IT_ITEMS, e23FixItReportData } from "../tests/helpers/e23ReportData";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&#34;");

describe("e23-fixit-pdf.ejs", () => {
  const view = buildE23FixItView(e23FixItReportData(), { runId: 77 })!;
  const html = renderFixItHtml(e23FixItReportData(), view);

  it("has the cover: institution, title, internal marking and run", () => {
    expect(html).toContain("Northern Bank of Canada");
    expect(html).toContain(FIX_IT_TITLE);
    expect(html).toContain(escapeHtml(INTERNAL_MARKING));
    expect(html).toContain("Run #77");
  });

  it("lists every item with its columns", () => {
    FIX_IT_HEADERS.forEach((h) => expect(html).toContain(`<th>${h}</th>`));
    for (const item of FIX_IT_ITEMS) {
      expect(html).toContain(escapeHtml(item.what));
      expect(html).toContain(escapeHtml(item.where));
      expect(html).toContain(escapeHtml(item.closesWhen));
    }
  });

  it("contains nothing from the formal report", () => {
    expect(html).not.toContain("Table of contents");
    expect(html).not.toContain("Sign-off");
    expect(html).not.toContain('class="page-footer"');
  });

  it("says what could not be read", () => {
    const data = e23FixItReportData();
    data.sectionNotices = [
      {
        sectionKey: "e23FixItList",
        reason: "collection_failed",
        detail: "Model risk management data",
      },
    ];
    const out = renderFixItHtml(data, buildE23FixItView(data, { runId: 1 })!);

    expect(out).toContain(FIX_IT_NOT_COMPLETED);
    expect(out).toContain("Model risk management data could not be read.");
  });

  it("escapes user text", () => {
    const data = e23FixItReportData({
      items: [{ ...FIX_IT_ITEMS[2], where: "<script>alert(1)</script>" }],
    });
    const out = renderFixItHtml(data, buildE23FixItView(data, { runId: 1 })!);

    expect(out).not.toContain("<script>alert(1)</script>");
  });
});

describe("fixItFooterTemplate", () => {
  it("prints the internal marking and the page number on every page", () => {
    const view = buildE23FixItView(e23FixItReportData(), { runId: 77 })!;
    const footer = fixItFooterTemplate(view);

    expect(footer).toContain(escapeHtml(INTERNAL_MARKING));
    expect(footer).toContain('class="pageNumber"');
    // Chromium's footer has no default font size; without one it prints nothing legible.
    expect(footer).toMatch(/font-size:\s*\d+px/);
  });

  it("escapes the institution name", () => {
    const view = buildE23FixItView(e23FixItReportData({ institutionName: "<b>Bank</b>" }), {
      runId: 1,
    })!;

    expect(fixItFooterTemplate(view)).not.toContain("<b>Bank</b>");
  });
});
