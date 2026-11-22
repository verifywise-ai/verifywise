/**
 * Building blocks shared by the DOCX renderers (docxGenerator and docxE23):
 * colours, headings, tables and the empty-state line. Kept apart so the E-23
 * module can use them without importing docxGenerator back.
 */

import {
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  Paragraph,
  ShadingType,
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
 * Create a group header (matches PDF group-header style - uppercase with left border)
 */
export function createSectionHeader(title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 400, after: 300 },
    shading: {
      fill: COLORS.backgroundAlt,
      type: ShadingType.CLEAR,
    },
    border: {
      left: {
        color: COLORS.primary,
        size: 24,
        style: BorderStyle.SINGLE,
        space: 8,
      },
    },
    children: [
      new TextRun({
        text: title.toUpperCase(),
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
 * Create a standard table with headers and borders
 */
export function createTable(headers: string[], rows: TableCellInput[][]): Table {
  const borderStyle = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: COLORS.border,
  };

  const headerCells = headers.map(
    (header) =>
      new TableCell({
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
          (cell) =>
            new TableCell({
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
