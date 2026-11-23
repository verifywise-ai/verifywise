/**
 * Building blocks shared by the DOCX renderers (docxGenerator and docxE23):
 * colours, headings, tables and the empty-state line. Kept apart so the E-23
 * module can use them without importing docxGenerator back.
 */

import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  HeadingLevel,
  Paragraph,
  ShadingType,
  TableLayoutType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

// Color constants matching VerifyWise theme
export const COLORS = {
  primary: "13715B",
  secondary: "1C2130",
  textPrimary: "1C2130",
  textSecondary: "667085",
  textTertiary: "98A2B3",
  border: "E4E7EC",
  backgroundAlt: "F9FAFB",
  success: "027A48",
  warning: "B54708",
  error: "B42318",
  info: "026AA2",
  // AI analysis styling
  aiBg: "F0FAF7",
  aiWarning: "DC6803",
  aiWarningBg: "FFFCF5",
};

export function createTocEntry(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    border: {
      bottom: {
        style: BorderStyle.DOTTED,
        size: 1,
        color: COLORS.border,
      },
    },
    children: [
      new TextRun({
        text,
        size: 24, // 12pt
        color: COLORS.textPrimary,
      }),
    ],
  });
}

/**
 * Create a section heading (matches the PDF group-header: plain bold text in
 * sentence case, no shading or rail)
 */
export function createSectionHeader(title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 480, after: 240 },
    children: [
      new TextRun({
        text: title,
        bold: true,
        size: 36, // 18pt
        color: COLORS.textPrimary,
      }),
    ],
  });
}

/**
 * Create a subsection header (matches PDF subsection-title style - with border-bottom)
 */
export function createSubsectionHeader(title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 300, after: 200 },
    border: {
      bottom: {
        color: COLORS.border,
        size: 6,
        style: BorderStyle.SINGLE,
        space: 4,
      },
    },
    children: [
      new TextRun({
        text: title,
        bold: true,
        size: 32, // 16pt
        color: COLORS.textPrimary,
      }),
    ],
  });
}

/** A plain string, or a main line plus an optional smaller secondary line. */
export type TableCellInput = string | { main: string; secondary?: string };

/**
 * Main and secondary text of a cell. Collected rows are typed as strings but
 * nullable columns (e.g. a NIST subcategory description) can still arrive as
 * null at runtime, so anything that is not a structured cell prints as text.
 */
function cellParts(cell: TableCellInput | null | undefined): {
  main: string;
  secondary?: string;
} {
  if (cell !== null && typeof cell === "object") return cell;
  return { main: cell == null ? "" : String(cell) };
}

/**
 * Text width of the reports' pages, in twips: the docx default A4 page
 * (11906) less the one-inch margins both generators set.
 */
const CONTENT_WIDTH_TWIPS = 11906 - 2 * 1440;

/**
 * Create a standard table with headers and borders. `fixedWidths` (percent per
 * column) holds the columns at those widths with a fixed layout, so tables
 * sharing them line up; without it Word sizes the columns itself.
 */
export function createTable(
  headers: string[],
  rows: TableCellInput[][],
  opts: { fixedWidths?: number[] } = {},
): Table {
  const columnWidths = opts.fixedWidths?.map((pct) =>
    Math.round((CONTENT_WIDTH_TWIPS * pct) / 100),
  );
  const cellWidth = (i: number) =>
    columnWidths ? { width: { size: columnWidths[i], type: WidthType.DXA } } : {};

  const borderStyle = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: COLORS.border,
  };

  const headerCells = headers.map(
    (header, i) =>
      new TableCell({
        ...cellWidth(i),
        shading: {
          fill: COLORS.backgroundAlt,
          type: ShadingType.CLEAR,
        },
        borders: {
          top: borderStyle,
          bottom: borderStyle,
          left: borderStyle,
          right: borderStyle,
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: header,
                bold: true,
                size: 20,
                color: COLORS.textPrimary,
              }),
            ],
          }),
        ],
        verticalAlign: VerticalAlign.CENTER,
      }),
  );

  const dataRows = rows.map(
    (row, rowIndex) =>
      new TableRow({
        children: row.map(
          (cell, i) =>
            new TableCell({
              ...cellWidth(i),
              shading:
                rowIndex % 2 === 1
                  ? {
                      fill: COLORS.backgroundAlt,
                      type: ShadingType.CLEAR,
                    }
                  : undefined,
              borders: {
                top: borderStyle,
                bottom: borderStyle,
                left: borderStyle,
                right: borderStyle,
              },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cellParts(cell).main || "-",
                      size: 20,
                      color: COLORS.textPrimary,
                    }),
                  ],
                }),
                // Opt-in only: structured cells carry a small secondary line.
                ...(cellParts(cell).secondary
                  ? [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: cellParts(cell).secondary,
                            size: 16,
                            color: COLORS.textSecondary,
                          }),
                        ],
                      }),
                    ]
                  : []),
              ],
              verticalAlign: VerticalAlign.CENTER,
            }),
        ),
      }),
  );

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    ...(columnWidths && { columnWidths, layout: TableLayoutType.FIXED }),
    rows: [
      new TableRow({
        children: headerCells,
        tableHeader: true,
      }),
      ...dataRows,
    ],
  });
}

/**
 * Create spacing paragraph after tables
 */
export function createTableSpacing(): Paragraph {
  return new Paragraph({
    spacing: { after: 200 },
    children: [],
  });
}

/**
 * Create empty state message
 */
export function createEmptyState(message: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    shading: {
      fill: COLORS.backgroundAlt,
      type: ShadingType.CLEAR,
    },
    children: [
      new TextRun({
        text: message,
        size: 22,
        color: COLORS.textSecondary,
        italics: true,
      }),
    ],
  });
}

/** A bulleted line: an optional bold label, then the text. */
export function createBullet(text: string, label?: string): Paragraph {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: convertInchesToTwip(0.3) },
    bullet: { level: 0 },
    children: [
      ...(label
        ? [new TextRun({ text: label, bold: true, size: 20, color: COLORS.textPrimary })]
        : []),
      new TextRun({ text, size: 20, color: COLORS.textPrimary }),
    ],
  });
}

/**
 * Create an AI analysis box (green left border, light green background)
 */
export function createAIAnalysisBox(
  content: string,
  label: string = "AI Analysis",
  borderColor: string = COLORS.primary,
  bgColor: string = COLORS.aiBg,
): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 200, after: 40 },
      border: {
        left: {
          color: borderColor,
          size: 24,
          style: BorderStyle.SINGLE,
          space: 8,
        },
      },
      shading: {
        fill: bgColor,
        type: ShadingType.CLEAR,
      },
      children: [
        new TextRun({
          text: label.toUpperCase(),
          bold: true,
          size: 18,
          color: borderColor,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      border: {
        left: {
          color: borderColor,
          size: 24,
          style: BorderStyle.SINGLE,
          space: 8,
        },
      },
      shading: {
        fill: bgColor,
        type: ShadingType.CLEAR,
      },
      children: content.split("\n").map(
        (line, i) =>
          new TextRun({
            text: line,
            size: 20,
            color: COLORS.textPrimary,
            ...(i > 0 && { break: 1 }),
          }),
      ),
    }),
  ];
}
