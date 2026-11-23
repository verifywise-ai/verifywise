/**
 * Where the AI blocks of an E-23 run land (spec 8.3 items 8 and 9, 8.6): the
 * e23Gap analysis after the contradictions in the formal report, printed with
 * POSITION_LABELS and the AI label; the recommended actions in the internal
 * fix-it document and never in the formal report. Checked in the shared view
 * and in both renderers.
 */
jest.mock("playwright", () => ({ chromium: { launch: jest.fn() } }));

import JSZip from "jszip";
import { buildE23FormalView, type E23FormalView, type E23Section } from "../formalView";
import { buildE23FixItView } from "../fixItView";
import { AI_GENERATED_LABEL, E23_HEADINGS, POSITION_LABELS } from "../e23Text";
import { ANALYSIS_LABELS } from "../../analyzers/mapToSummaries";
import { renderFixItHtml, renderReportHtml } from "../../pdfGenerator";
import { generateDOCX } from "../../docxGenerator";
import { generateFixItDOCX } from "../../docxFixIt";
import {
  e23FixItReportData,
  E23_GROUP_INVENTORY,
  E23_GROUP_SELF,
} from "../../tests/helpers/e23ReportData";
import { unescapeXml, xmlText } from "../../tests/helpers/xmlText";
import type { ReportData } from "../../../../domain.layer/interfaces/i.reportGeneration";

const GAP_NARRATIVE = "The tiering claim is not borne out by the inventory records.";
const ACTION = "Tier the three untiered models";

function withGap(data: ReportData = e23FixItReportData()): ReportData {
  data.aiSummaries = {
    ...data.aiSummaries!,
    e23Gap: {
      narrative: GAP_NARRATIVE,
      principles: [
        {
          group: E23_GROUP_INVENTORY,
          position: "partly consistent",
          explanation: "Three models carry no MRM tier.",
          basis: "observed",
          what_would_close_this: "Every model carries an MRM tier.",
        },
        {
          group: E23_GROUP_SELF,
          position: "not assessable",
          explanation: "No rule checks this group.",
          basis: "absent",
          what_would_close_this: null,
        },
      ],
    },
  };
  return data;
}

const gapSection = (view: E23FormalView): E23Section | undefined =>
  view.main.find((s) => s.id === "e23gap");

const docxText = async (content: Buffer): Promise<string> => {
  const zip = await JSZip.loadAsync(content);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xmlText(xml);
};

describe("unescapeXml", () => {
  it("decodes each entity once: an escaped entity stays literal", () => {
    expect(unescapeXml("&amp;quot;")).toBe("&quot;");
    expect(unescapeXml("&amp;amp;")).toBe("&amp;");
    expect(unescapeXml("Q&amp;A &lt;b&gt; &quot;x&quot; it&apos;s")).toBe(`Q&A <b> "x" it's`);
  });
});

describe("the e23Gap block in the formal report", () => {
  it("follows the contradictions, labelled as AI, positions printed as labels", () => {
    const view = buildE23FormalView(withGap())!;
    const ids = view.main.map((s) => s.id);
    expect(ids.indexOf("e23gap")).toBe(ids.indexOf("contradictions") + 1);
    expect(view.toc).toContain(ANALYSIS_LABELS.e23Gap);

    const text = JSON.stringify(gapSection(view));
    expect(gapSection(view)!.heading).toBe(ANALYSIS_LABELS.e23Gap);
    expect(text).toContain(AI_GENERATED_LABEL);
    expect(text).toContain(GAP_NARRATIVE);
    expect(text).toContain(POSITION_LABELS["partly consistent"]);
    expect(text).toContain(POSITION_LABELS["not assessable"]);
    expect(text).not.toMatch(/"partly consistent"|"not assessable"/);
  });

  it("is absent when the analysis was not produced", () => {
    expect(gapSection(buildE23FormalView(e23FixItReportData())!)).toBeUndefined();
  });

  it("renders in the PDF with the AI label and position labels", () => {
    const html = renderReportHtml(withGap());
    const section = html.match(/<section class="e23-section" id="e23-e23gap">[\s\S]*?<\/section>/);
    expect(section).not.toBeNull();
    expect(section![0]).toContain(AI_GENERATED_LABEL);
    expect(section![0]).toContain(POSITION_LABELS["partly consistent"]);
    expect(html.indexOf('id="e23-contradictions"')).toBeLessThan(html.indexOf('id="e23-e23gap"'));
  });

  it("renders in the DOCX after the contradictions", async () => {
    const result = await generateDOCX(withGap());
    expect(result.success).toBe(true);
    const text = await docxText(result.content);
    const gapAt = text.lastIndexOf(ANALYSIS_LABELS.e23Gap.toUpperCase());
    expect(gapAt).toBeGreaterThan(text.lastIndexOf(E23_HEADINGS.contradictions.toUpperCase()));
    expect(text).toContain(POSITION_LABELS["partly consistent"]);
    expect(text).toContain(GAP_NARRATIVE);
  });
});

describe("recommended actions on an E-23 run", () => {
  it("are in the fix-it document, labelled as AI, and not in the formal report", () => {
    const data = withGap();
    const fixIt = buildE23FixItView(data, { runId: 3 })!;
    const actions = fixIt.sections.find((s) => s.id === "fixit-actions");
    expect(actions).toBeDefined();
    expect(JSON.stringify(actions)).toContain(ACTION);
    expect(JSON.stringify(actions)).toContain(AI_GENERATED_LABEL);
    expect(JSON.stringify(buildE23FormalView(data))).not.toContain(ACTION);
  });

  it("carry their abstention into the fix-it document when they were not produced", () => {
    const data = e23FixItReportData();
    data.aiSummaries = {
      sectionSummaries: {},
      abstentions: { recommendedActions: "This analysis was not produced." },
    };
    const actions = buildE23FixItView(data, {})!.sections.find((s) => s.id === "fixit-actions");
    expect(JSON.stringify(actions)).toContain("This analysis was not produced.");
  });

  it("are absent from the fix-it document when the block was not run", () => {
    const data = e23FixItReportData();
    data.aiSummaries = { sectionSummaries: {} };
    expect(buildE23FixItView(data, {})!.sections.map((s) => s.id)).toEqual(["fixit-items"]);
  });

  it("render in both fix-it formats and in neither formal report", async () => {
    const data = withGap();
    expect(renderFixItHtml(data, buildE23FixItView(data, {})!)).toContain(ACTION);
    expect(renderReportHtml(data)).not.toContain(ACTION);

    const fixItDocx = await generateFixItDOCX(data);
    expect(await docxText(fixItDocx.content)).toContain(ACTION);
    const formal = await generateDOCX(data);
    expect(await docxText(formal.content)).not.toContain(ACTION);
  });
});
