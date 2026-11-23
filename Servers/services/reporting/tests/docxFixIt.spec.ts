/**
 * The internal E-23 fix-it list as a DOCX: the internal marking on the cover
 * and in the page footer (every page), and every item in the body.
 */
import JSZip from "jszip";
import { generateFixItDOCX } from "../docxFixIt";
import {
  FIX_IT_HEADERS,
  FIX_IT_NOT_COMPLETED,
  FIX_IT_TITLE,
  INTERNAL_MARKING,
} from "../e23/e23Text";
import type { ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import { FIX_IT_ITEMS, e23FixItReportData, nonKindReportData } from "./helpers/e23ReportData";

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const xmlText = (xml: string) =>
  [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => unescapeXml(m[1])).join("\n");

async function parts(data: ReportData) {
  const result = await generateFixItDOCX(data, 77);
  expect(result.success).toBe(true);
  const zip = await JSZip.loadAsync(result.content);
  const read = async (pattern: RegExp) => {
    const names = Object.keys(zip.files).filter((n) => pattern.test(n));
    const xml = await Promise.all(names.map((n) => zip.file(n)!.async("string")));
    return { names, text: xml.map(xmlText).join("\n"), xml: xml.join("\n") };
  };
  return {
    result,
    body: await read(/^word\/document\.xml$/),
    footers: await read(/^word\/footer\d*\.xml$/),
    documentXml: (await read(/^word\/document\.xml$/)).xml,
  };
}

describe("generateFixItDOCX", () => {
  it("is a Word document", async () => {
    const { result } = await parts(e23FixItReportData());
    expect(result.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("puts the internal marking in the page footer, which Word repeats on every page", async () => {
    const { footers, documentXml } = await parts(e23FixItReportData());

    expect(footers.names.length).toBeGreaterThan(0);
    expect(footers.text).toContain(INTERNAL_MARKING);
    // The default footer is the one every page uses (no title page or odd/even variant).
    expect(documentXml).toMatch(/<w:footerReference w:type="default"/);
    expect(documentXml).not.toMatch(/<w:titlePg\b/);
  });

  it("has the cover: institution, title, marking and run", async () => {
    const { body } = await parts(e23FixItReportData());

    expect(body.text).toContain("Northern Bank of Canada");
    expect(body.text).toContain(FIX_IT_TITLE);
    expect(body.text).toContain(INTERNAL_MARKING);
    expect(body.text).toContain("Run #77");
  });

  it("contains every item and every column", async () => {
    const { body } = await parts(e23FixItReportData());

    FIX_IT_HEADERS.forEach((h) => expect(body.text).toContain(h));
    for (const item of FIX_IT_ITEMS) {
      expect(body.text).toContain(item.what);
      expect(body.text).toContain(item.where);
      expect(body.text).toContain(item.owner);
      expect(body.text).toContain(item.closesWhen);
    }
  });

  it("carries the recommended actions the formal report leaves out", async () => {
    const { body } = await parts(e23FixItReportData());

    expect(body.text).toContain("Tier the three untiered models");
  });

  it("says what could not be read", async () => {
    const data = e23FixItReportData();
    data.sectionNotices = [
      { sectionKey: "e23FixItList", reason: "collection_failed", detail: "OSFI E-23 checklist" },
    ];
    const { body } = await parts(data);

    expect(body.text).toContain(FIX_IT_NOT_COMPLETED);
    expect(body.text).toContain("OSFI E-23 checklist could not be read.");
  });

  it("fails, rather than producing an empty file, for a report that is not E-23", async () => {
    const result = await generateFixItDOCX(nonKindReportData(), 1);
    expect(result.success).toBe(false);
  });
});
