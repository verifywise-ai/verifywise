/**
 * The OSFI E-23 formal report in the DOCX renderer. Same data and the same
 * expectations as the PDF template test, read from the document text.
 */
import JSZip from "jszip";
import { generateDOCX } from "../docxGenerator";
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
  SECTION_NOT_COMPLETED,
  SIGN_OFF_STATEMENT,
} from "../e23/e23Text";
import { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import { e23ReportData, nonKindReportData } from "./helpers/e23ReportData";

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** Visible text of one part of the DOCX, runs joined with newlines. */
async function partText(data: ReportData, part = "word/document.xml"): Promise<string> {
  const result = await generateDOCX(data);
  expect(result.success).toBe(true);
  const zip = await JSZip.loadAsync(result.content);
  const file = zip.file(part);
  if (!file) return "";
  const xml = await file.async("string");
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => unescapeXml(m[1])).join("\n");
}

/** Text of every header part. */
async function headerText(data: ReportData): Promise<string> {
  const result = await generateDOCX(data);
  const zip = await JSZip.loadAsync(result.content);
  const names = Object.keys(zip.files).filter((n) => /^word\/header\d*\.xml$/.test(n));
  const texts = await Promise.all(names.map((n) => partText(data, n)));
  return texts.join("\n");
}

/** Text between two headings (exclusive of the end heading). */
const between = (text: string, start: string, end?: string): string => {
  const from = text.indexOf(start);
  if (from < 0) throw new Error(`${start} not found`);
  const to = end ? text.indexOf(end, from + start.length) : -1;
  return text.slice(from, to < 0 ? undefined : to);
};

const upper = (s: string) => s.toUpperCase();

describe("generateDOCX: general reports", () => {
  it("contains no E-23 text and keeps recommended actions", async () => {
    const text = await partText(nonKindReportData());
    for (const t of [
      E23_REPORT_TITLE,
      E23_HEADINGS.scope,
      E23_HEADINGS.glance,
      E23_HEADINGS.signOff,
    ]) {
      expect(text).not.toContain(t);
      expect(text).not.toContain(upper(t));
    }
    expect(text).toContain("Assign an owner");
    expect(await headerText(nonKindReportData())).not.toContain(DRAFT_WATERMARK);
  });
});

describe("generateDOCX: OSFI E-23 formal report", () => {
  let examiner: string;
  let board: string;
  beforeAll(async () => {
    examiner = await partText(e23ReportData({ withAppendix: true }));
    board = await partText(e23ReportData({ withAppendix: true, audience: "board" }));
  });

  it("puts the institution, title, audience and period on the cover", () => {
    expect(examiner).toContain("Northern Bank of Canada");
    expect(examiner).toContain(E23_REPORT_TITLE);
    expect(examiner).toContain(AUDIENCE_LINES.osfi);
    expect(examiner).toContain("August 1, 2026 to October 31, 2026");
    expect(board).toContain(AUDIENCE_LINES.board);
  });

  it("renders the sections in spec order", () => {
    const order = [
      E23_REPORT_TITLE,
      upper(E23_HEADINGS.scope),
      upper(E23_HEADINGS.glance),
      upper("Executive Summary"),
      upper(E23_HEADINGS.completeness),
      upper(E23_HEADINGS.mrm),
      upper(E23_HEADINGS.contradictions),
      upper(E23_HEADINGS.appendix),
      "Analyses not produced",
      upper(E23_HEADINGS.signOff),
    ].map((marker) => examiner.lastIndexOf(marker));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("shows examiners requirement rows, model names, examples and the appendix", () => {
    expect(examiner).toContain("1.1.1 Model risk management scope");
    expect(examiner).toContain(`Data coverage: ${COVERAGE_LABELS.selfAssessmentOnly}`);
    expect(examiner).toContain("Credit scorer");
    expect(examiner).toContain("Pricing engine");
    expect(examiner).toContain("Legacy scorecard");
  });

  it("gives the board no requirement rows, model names or appendix", () => {
    expect(board).not.toContain("1.1.1 Model risk management scope");
    for (const name of ["Credit scorer", "Fraud detector", "Pricing engine", "Legacy scorecard"]) {
      expect(board).not.toContain(name);
    }
    expect(board).not.toContain(upper(E23_HEADINGS.appendix));
    expect(board).toContain(COVERAGE_LABELS.checked);
  });

  it("shows identical at-a-glance figures to both audiences", () => {
    const glance = (t: string) =>
      between(t, upper(E23_HEADINGS.glance), upper("Executive Summary"));
    expect(glance(board)).toBe(glance(examiner));
    expect(glance(examiner)).toContain("+3 (was 1 of 83)");
  });

  it("prints Not checked for unavailable figures", async () => {
    const text = await partText(e23ReportData({ notOnFile: true, noPrevious: true }));
    expect(between(text, upper(E23_HEADINGS.glance), upper("Executive Summary"))).toContain(
      NOT_CHECKED,
    );
  });

  it("puts the draft watermark in the header and Draft in the sign-off", async () => {
    expect(await headerText(e23ReportData())).toContain(DRAFT_WATERMARK);
    const signOff = between(examiner, upper(E23_HEADINGS.signOff));
    expect(signOff).toContain(SIGN_OFF_STATEMENT);
    expect(signOff).toContain("Draft");
    expect(signOff).not.toContain("Signature");
  });

  it("prints signature lines and no watermark on a final report", async () => {
    const data = e23ReportData({ isFinal: true, withHeadOfValidation: true });
    expect(await headerText(data)).not.toContain(DRAFT_WATERMARK);
    const signOff = between(await partText(data), upper(E23_HEADINGS.signOff));
    expect(signOff).toContain("Signature");
    expect(signOff).toContain("Val Head");
  });

  it("keeps user text intact", async () => {
    const note = `${"Scope & limits. ".repeat(63).slice(0, 999)}!`; // 1000 chars, no edge whitespace
    const text = await partText(
      e23ReportData({ institutionName: "<script>alert(1)</script>", scopeNote: note }),
    );
    expect(text).toContain("<script>alert(1)</script>");
    expect(text).toContain(note);
  });

  it("lists the rules checked when no contradiction fires", async () => {
    const text = await partText(e23ReportData({ noContradictions: true }));
    expect(text).toContain(NO_CONTRADICTIONS);
    expect(text).toContain("2.1.4 Enterprise-level model inventory as system of record");
  });

  it("says E-23 is not on file and that the inventory is empty", async () => {
    expect(await partText(e23ReportData({ notOnFile: true }))).toContain(E23_NOT_ON_FILE);
    expect(await partText(e23ReportData({ noModels: true }))).toContain(NO_MODELS);
  });

  it("keeps a selected section whose data failed, pointing at the notices", async () => {
    const text = await partText(e23ReportData({ mrmFailed: true, withAppendix: true }));
    for (const [start, end] of [
      [upper(E23_HEADINGS.mrm), upper(E23_HEADINGS.contradictions)],
      [upper(E23_HEADINGS.contradictions), upper(E23_HEADINGS.appendix)],
      [upper(E23_HEADINGS.appendix), "Part of these sections could not be read"],
    ]) {
      expect(between(text, start, end)).toContain(SECTION_NOT_COMPLETED);
    }
    expect(text).toContain(`5. ${E23_HEADINGS.mrm}`);
  });

  it("leaves recommended actions and their recommendations list out of the formal report", () => {
    for (const text of [examiner, board]) {
      expect(text).not.toContain("Tier the three untiered models");
      expect(text.toLowerCase()).not.toContain("recommended actions");
      expect(text.toLowerCase()).not.toContain("recommendations");
    }
  });
});
