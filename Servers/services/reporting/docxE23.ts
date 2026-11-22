/**
 * OSFI E-23 formal report blocks for the DOCX renderer. Lays out the content
 * decided in e23/formalView.ts (the PDF template lays out the same view), so
 * this module holds no report text of its own.
 */

import { AlignmentType, Header, PageBreak, Paragraph, Table, TextRun } from "docx";
import type { E23Block, E23Cell, E23FormalView, E23Section } from "./e23/formalView";
import {
  COLORS,
  TableCellInput,
  createBullet,
  createSectionHeader,
  createSubsectionHeader,
  createTable,
  createTableSpacing,
  createTocEntry,
} from "./docxPrimitives";

type Element = Paragraph | Table;

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

const text = (value: string, opts: { muted?: boolean; bold?: boolean } = {}) =>
  new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: value,
        size: opts.muted ? 18 : 20,
        bold: opts.bold,
        color: opts.muted ? COLORS.textSecondary : COLORS.textPrimary,
      }),
    ],
  });

const subheading = (value: string) =>
  new Paragraph({
    spacing: { before: 200, after: 80 },
    keepNext: true,
    children: [new TextRun({ text: value, bold: true, size: 22, color: COLORS.textPrimary })],
  });

const toCell = (cell: E23Cell): TableCellInput =>
  typeof cell === "string"
    ? cell
    : { main: `${cell.indent ? "    " : ""}${cell.main}`, secondary: cell.secondary };

function blockElements(block: E23Block): Element[] {
  switch (block.kind) {
    case "paragraph":
      return [text(block.text, { muted: block.muted })];
    case "subheading":
      return [subheading(block.text), ...(block.note ? [text(block.note, { muted: true })] : [])];
    case "list":
      return [
        ...(block.title ? [subheading(block.title)] : []),
        ...block.items.map((item) => createBullet(item)),
      ];
    case "table":
      return [
        ...(block.title ? [subheading(block.title)] : []),
        createTable(
          block.headers,
          block.rows.map((row) => row.map(toCell)),
        ),
        createTableSpacing(),
      ];
    case "chart":
      // The DOCX renderer embeds no charts; the figures are in the tables.
      return [];
  }
}

/** Each section on its own pages, like the general report's groups. */
export function createE23Sections(sections: E23Section[]): Element[] {
  return sections.flatMap((section) => [
    createSectionHeader(section.heading),
    ...section.blocks.flatMap(blockElements),
    pageBreak(),
  ]);
}

const coverLine = (
  value: string,
  size: number,
  opts: { bold?: boolean; color?: string; after?: number } = {},
) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: opts.after ?? 120 },
    children: [
      new TextRun({ text: value, size, bold: opts.bold, color: opts.color ?? COLORS.textPrimary }),
    ],
  });

export function createE23Cover(view: E23FormalView): Paragraph[] {
  return [
    new Paragraph({ spacing: { before: 2400 }, children: [] }),
    coverLine(view.institution, 56, { bold: true, color: COLORS.primary, after: 600 }),
    coverLine(view.cover.title, 48, { bold: true, after: 300 }),
    coverLine(view.cover.audienceLine, 30, { color: COLORS.textSecondary, after: 800 }),
    ...view.cover.lines.map(
      (line) =>
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: `${line.label}: `,
              bold: true,
              size: 26,
              color: COLORS.textPrimary,
            }),
            new TextRun({ text: line.value, size: 26, color: COLORS.textPrimary }),
          ],
        }),
    ),
    pageBreak(),
  ];
}

export function createE23Toc(view: E23FormalView): Paragraph[] {
  return [
    new Paragraph({
      spacing: { after: 400 },
      children: [
        new TextRun({ text: "Table of contents", bold: true, size: 48, color: COLORS.textPrimary }),
      ],
    }),
    ...view.toc.map((heading, i) => createTocEntry(`${i + 1}. ${heading}`)),
    pageBreak(),
  ];
}

/** After the notices: analyses not produced, then the sign-off page. */
export function createE23Closing(view: E23FormalView): Element[] {
  const elements: Element[] = [];
  if (view.abstentions.length > 0) {
    elements.push(createSubsectionHeader(view.abstentionsHeading));
    view.abstentions.forEach((a) => elements.push(createBullet(a.reason, `${a.label}: `)));
  }

  const signOff = view.signOff;
  if (!signOff) return elements;
  if (elements.length > 0) elements.push(pageBreak());
  elements.push(createSectionHeader(signOff.heading));
  elements.push(text(signOff.statement));
  const { fields } = signOff;
  signOff.signatories.forEach((s) => {
    elements.push(subheading(s.role));
    elements.push(text(`${fields.name}: ${s.name || "—"}`));
    elements.push(text(`${fields.title}: ${s.title || "—"}`));
    if (!signOff.draft) {
      for (const label of [fields.signature, fields.date]) {
        elements.push(
          new Paragraph({
            spacing: { before: 480, after: 120 },
            children: [
              new TextRun({
                text: `${label}: ________________________________________`,
                size: 20,
                color: COLORS.textPrimary,
              }),
            ],
          }),
        );
      }
    }
  });
  if (signOff.draft) {
    elements.push(
      new Paragraph({
        spacing: { before: 300, after: 120 },
        children: [
          new TextRun({ text: signOff.draft.label, bold: true, size: 32, color: COLORS.error }),
        ],
      }),
    );
    elements.push(text(signOff.draft.note, { muted: true }));
  }
  return elements;
}

/** The draft marking: a default header on every page. */
export function createE23DraftHeader(watermark: string): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: watermark, bold: true, size: 20, color: COLORS.error })],
      }),
    ],
  });
}
