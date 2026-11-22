/**
 * The OSFI E-23 formal report in report-pdf.ejs, rendered through the same
 * function the PDF is printed from (renderReportHtml), plus the guarantee that
 * a general report's HTML is unchanged by the E-23 work.
 */
jest.mock("playwright", () => ({ chromium: { launch: jest.fn() } }));

import { renderReportHtml } from "../pdfGenerator";
import {
  AUDIENCE_LINES,
  COVERAGE_LABELS,
  DRAFT_WATERMARK,
  E23_HEADINGS,
  E23_NOT_ON_FILE,
  E23_REPORT_TITLE,
  NO_CONTRADICTIONS,
  NO_MODELS,
  NOT_CHECKED,
  SIGN_OFF_STATEMENT,
} from "../e23/e23Text";
import { e23ReportData, nonKindReportData } from "../tests/helpers/e23ReportData";

/** The HTML of one E-23 section, by its id. */
const sectionHtml = (html: string, id: string): string => {
  const match = html.match(
    new RegExp(`<section class="e23-section" id="e23-${id}">[\\s\\S]*?</section>`),
  );
  if (!match) throw new Error(`section ${id} not rendered`);
  return match[0];
};

const E23_ONLY_TEXT = [
  E23_REPORT_TITLE,
  E23_HEADINGS.scope,
  E23_HEADINGS.glance,
  E23_HEADINGS.completeness,
  E23_HEADINGS.mrm,
  E23_HEADINGS.contradictions,
  E23_HEADINGS.appendix,
  E23_HEADINGS.signOff,
  DRAFT_WATERMARK,
  "e23-",
];

describe("report-pdf.ejs: general reports", () => {
  it("renders a non-kind report byte for byte as before the E-23 report existed", () => {
    // Recorded from the template before the E-23 blocks were added.
    expect(renderReportHtml(nonKindReportData())).toMatchSnapshot();
  });

  it("shows no E-23 heading, text or class in a non-kind report", () => {
    const html = renderReportHtml(nonKindReportData());
    for (const text of E23_ONLY_TEXT) expect(html).not.toContain(text);
    // The general report keeps its recommended actions.
    expect(html).toContain("Assign an owner");
  });
});

describe("report-pdf.ejs: OSFI E-23 formal report", () => {
  const examiner = renderReportHtml(e23ReportData({ withAppendix: true }));
  const board = renderReportHtml(e23ReportData({ withAppendix: true, audience: "board" }));

  it("puts the institution, title, audience, period and signatories on the cover", () => {
    expect(examiner).toContain("Northern Bank of Canada");
    expect(examiner).toContain(E23_REPORT_TITLE);
    expect(examiner).toContain(AUDIENCE_LINES.osfi);
    expect(examiner).toContain("August 1, 2026 to October 31, 2026");
    expect(examiner).toContain("Pat Preparer, MRM Lead");
    expect(examiner).toContain("Alex Exec, Chief Risk Officer");
    expect(board).toContain(AUDIENCE_LINES.board);
    expect(board).not.toContain(AUDIENCE_LINES.osfi);
  });

  it("renders the sections in spec order", () => {
    const order = [
      E23_REPORT_TITLE,
      'id="e23-scope"',
      'id="e23-glance"',
      "Executive Summary",
      'id="e23-completeness"',
      'id="e23-mrm"',
      'id="e23-contradictions"',
      'id="e23-appendix"',
      "Analyses not produced",
      'id="e23-signoff"',
    ].map((marker) => examiner.lastIndexOf(marker));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("states the period rule, cadence and metric window in scope and method", () => {
    const scope = sectionHtml(examiner, "scope");
    expect(scope).toContain(
      "Position as at November 20, 2026. Activity counts cover August 1, 2026 to October 31, 2026.",
    );
    expect(scope).toContain("tier 1 12 months, tier 2 18, tier 3 24");
    expect(scope).toContain("90 days");
    expect(scope).toContain("Covers retail credit models only.");
    expect(scope).toContain("not tracked in VerifyWise");
  });

  it("shows examiners requirement rows, coverage, model names, examples and the appendix", () => {
    expect(examiner).toContain("1.1.1 Model risk management scope");
    expect(examiner).toContain(COVERAGE_LABELS.checked);
    expect(examiner).toContain(COVERAGE_LABELS.selfAssessmentOnly);
    expect(sectionHtml(examiner, "mrm")).toContain("Credit scorer");
    expect(sectionHtml(examiner, "contradictions")).toContain("Pricing engine");
    expect(sectionHtml(examiner, "contradictions")).toContain(", and 2 more");
    expect(sectionHtml(examiner, "appendix")).toContain("Legacy scorecard");
  });

  it("prints a fired rule's requirement number once, trimmed", () => {
    const c = sectionHtml(examiner, "contradictions");
    expect(c).toContain("2.2.3 Every model rated through a defined process");
    expect(c).not.toContain("2.2.3 2.2.3");
    expect(c).toContain("Requirement 3.6.4 not found");
  });

  it("gives the board group lines and counts but no requirement rows, model names or appendix", () => {
    expect(board).not.toContain("1.1.1 Model risk management scope");
    for (const name of ["Credit scorer", "Fraud detector", "Pricing engine", "Legacy scorecard"]) {
      expect(board).not.toContain(name);
    }
    expect(board).not.toContain('id="e23-appendix"');
    expect(sectionHtml(board, "completeness")).toContain(COVERAGE_LABELS.checked);
    expect(sectionHtml(board, "contradictions")).toContain("2.2.3 Every model rated");
    expect(sectionHtml(board, "mrm")).toContain("2 of 9 models have at least one exception");
  });

  it("shows identical at-a-glance figures to both audiences", () => {
    expect(sectionHtml(board, "glance")).toBe(sectionHtml(examiner, "glance"));
    const glance = sectionHtml(examiner, "glance");
    expect(glance).toContain("4 of 83");
    expect(glance).toContain("Change since previous run (August 20, 2026)");
    expect(glance).toContain("+3 (was 1 of 83)");
  });

  it("prints Not checked for unavailable figures and no change column without a previous run", () => {
    const html = renderReportHtml(e23ReportData({ notOnFile: true, noPrevious: true }));
    const glance = sectionHtml(html, "glance");
    expect(glance).toContain(NOT_CHECKED);
    expect(glance).not.toContain("Change since previous run");
  });

  it("shows no change against a previous run for a figure that is not checked now", () => {
    const glance = sectionHtml(renderReportHtml(e23ReportData({ notOnFile: true })), "glance");
    expect(glance).toContain("Change since previous run");
    expect(glance).toContain(NOT_CHECKED);
    expect(glance).not.toContain("(was 1 of 83)");
    expect(glance).toContain("No change");
  });

  it("marks a draft with a fixed watermark and a Draft sign-off", () => {
    expect(examiner).toContain(`<div class="e23-watermark">${DRAFT_WATERMARK}</div>`);
    expect(examiner).toMatch(/\.e23-watermark\s*\{[^}]*position:\s*fixed/);
    const signOff = sectionHtml(examiner, "signoff");
    expect(signOff).toContain(SIGN_OFF_STATEMENT);
    expect(signOff).toContain("Draft");
    expect(signOff).not.toContain("Signature");
  });

  it("prints signature lines and no watermark on a final report", () => {
    const html = renderReportHtml(e23ReportData({ isFinal: true, withHeadOfValidation: true }));
    expect(html).not.toContain(DRAFT_WATERMARK);
    expect(html).not.toContain('class="e23-watermark"');
    const signOff = sectionHtml(html, "signoff");
    expect(signOff).toContain("Signature");
    expect(signOff).toContain("Alex Exec");
    expect(signOff).toContain("Head of model validation");
    expect(signOff).toContain("Val Head");
  });

  it("escapes user text and keeps a long scope note intact", () => {
    const note = `${"Scope & limits. ".repeat(63).slice(0, 999)}!`; // 1000 chars, no edge whitespace
    const html = renderReportHtml(
      e23ReportData({ institutionName: "<script>alert(1)</script>", scopeNote: note }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain(note.replace(/&/g, "&amp;"));
  });

  it("lists the rules checked when no contradiction fires", () => {
    const c = sectionHtml(
      renderReportHtml(e23ReportData({ noContradictions: true })),
      "contradictions",
    );
    expect(c).toContain(NO_CONTRADICTIONS);
    expect(c).toContain("Rules checked");
    expect(c).toContain("2.1.4 Enterprise-level model inventory as system of record");
    expect(c).toContain("3.4.2 Review depth and frequency set by rating");
  });

  it("says E-23 is not on file instead of rendering empty checks, and keeps the notices", () => {
    const html = renderReportHtml(e23ReportData({ notOnFile: true }));
    expect(sectionHtml(html, "completeness")).toContain(E23_NOT_ON_FILE);
    expect(sectionHtml(html, "contradictions")).toContain(E23_NOT_ON_FILE);
    expect(html).toContain("Sections with no data");
  });

  it("says the inventory is empty rather than printing empty tables", () => {
    const mrm = sectionHtml(renderReportHtml(e23ReportData({ noModels: true })), "mrm");
    expect(mrm).toContain(NO_MODELS);
    expect(mrm).not.toContain("<table");
  });

  it("leaves recommended actions out of the formal report", () => {
    expect(examiner).not.toContain("Tier the three untiered models");
    expect(examiner).not.toContain("Recommended actions");
  });
});
