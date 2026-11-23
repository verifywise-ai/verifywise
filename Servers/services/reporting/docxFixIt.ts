/**
 * The internal OSFI E-23 fix-it list as a DOCX (spec 8.6). Lays out the
 * content decided in e23/fixItView.ts with the formal report's E-23 blocks
 * (docxE23.ts), so this module holds no report text of its own.
 */

import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  Document,
  Footer,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import type {
  ReportData,
  ReportGenerationResult,
} from "../../domain.layer/interfaces/i.reportGeneration";
import { buildE23FixItView, type E23FixItView } from "./e23/fixItView";
import { createE23Cover, createE23Sections } from "./docxE23";
import { COLORS } from "./docxPrimitives";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The default footer, which Word prints on every page: the internal marking and the page. */
function fixItFooter(view: E23FixItView): Footer {
  const run = (text: string, bold = false) =>
    new TextRun({ text, bold, size: 16, color: COLORS.textSecondary });
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: {
          top: { color: COLORS.border, size: 6, style: BorderStyle.SINGLE, space: 4 },
        },
        children: [
          run(view.footerText, true),
          run(" | Page "),
          new TextRun({
            children: [PageNumber.CURRENT],
            size: 16,
            color: COLORS.textSecondary,
          }),
        ],
      }),
    ],
  });
}

export async function generateFixItDOCX(
  reportData: ReportData,
  runId?: number,
): Promise<ReportGenerationResult> {
  try {
    const view = buildE23FixItView(reportData, { runId });
    if (!view) throw new Error("the fix-it list belongs to an OSFI E-23 report");

    const doc = new Document({
      styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                right: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1),
              },
            },
          },
          footers: { default: fixItFooter(view) },
          children: [
            ...createE23Cover(view),
            ...createE23Sections(view.sections, { breakAfterLast: false }),
          ],
        },
      ],
    });

    return {
      success: true,
      // The caller names the file after the formal report; this is a fallback.
      filename: "fix-it-list.docx",
      content: await Packer.toBuffer(doc),
      mimeType: DOCX_MIME_TYPE,
    };
  } catch (error) {
    console.error("Error generating fix-it list DOCX:", error);
    return {
      success: false,
      filename: "",
      content: Buffer.alloc(0),
      mimeType: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
