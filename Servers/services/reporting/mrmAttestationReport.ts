/**
 * MRM (Model Risk Management) — Branch 3 attestation report generator.
 *
 * Produces the board/examiner artifact: a DOCX confirming, across the model
 * fleet, tiering currency, validation coverage, open findings, and the per-tier
 * attestation status. Self-contained (does not depend on the project-report
 * ReportData structure) and uses the same `docx` library as the other reporting
 * generators for a consistent output format.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { AttestationSummary, AttestationTierRow } from "../../utils/mrmAttestation.utils";

const COLORS = {
  primary: "13715B",
  textPrimary: "1C2130",
  textSecondary: "475467",
  blocked: "B42318",
  ok: "027A48",
  headerBg: "F2F4F7",
  border: "D0D5DD",
};

const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface AttestationReportResult {
  content: Buffer;
  mimeType: string;
  filename: string;
}

function headingRun(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, color: COLORS.primary, size: 26 })],
  });
}

function bodyLine(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, color: COLORS.textPrimary, size: 20 }),
      new TextRun({ text: value, color: COLORS.textSecondary, size: 20 }),
    ],
  });
}

function headerCell(text: string): TableCell {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, fill: COLORS.headerBg, color: "auto" },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: COLORS.textPrimary, size: 18 })],
      }),
    ],
  });
}

function dataCell(text: string, color: string = COLORS.textSecondary): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, color, size: 18 })],
      }),
    ],
  });
}

function perTierTable(rows: AttestationTierRow[]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell("Tier"),
      headerCell("Models"),
      headerCell("Tiering current"),
      headerCell("Validated"),
      headerCell("Monitoring active"),
      headerCell("Open findings"),
      headerCell("Attestation"),
    ],
  });

  const bodyRows = rows.map(
    (r) =>
      new TableRow({
        children: [
          dataCell(r.tier),
          dataCell(String(r.models)),
          dataCell(`${r.tiering_current} / ${r.models}`),
          dataCell(`${r.validated} / ${r.models}`),
          dataCell(`${r.monitoring_active} / ${r.models}`),
          dataCell(String(r.open_findings)),
          dataCell(
            r.attestation_status === "ok" ? "OK" : "Blocked",
            r.attestation_status === "ok" ? COLORS.ok : COLORS.blocked,
          ),
        ],
      }),
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
      left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
      right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: COLORS.border },
    },
    rows: [headerRow, ...bodyRows],
  });
}

/**
 * Build the attestation DOCX for one org from a computed summary. Returns the
 * buffer, mime type, and a suggested filename.
 */
export async function generateAttestationReport(
  organizationName: string,
  summary: AttestationSummary,
): Promise<AttestationReportResult> {
  const generatedAt = new Date(summary.generated_at);
  const dateLabel = generatedAt.toISOString().slice(0, 10);

  const cov = summary.validation_coverage;
  const sev = summary.open_findings_by_severity;
  const tierLines = Object.entries(summary.models_by_tier)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tier, count]) => `Tier ${tier}: ${count}`)
    .join(", ");

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: "Model Risk Management — Attestation Report",
                bold: true,
                color: COLORS.primary,
                size: 34,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: organizationName,
                bold: true,
                color: COLORS.textPrimary,
                size: 24,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: `Generated ${dateLabel}`,
                color: COLORS.textSecondary,
                size: 20,
              }),
            ],
          }),

          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({
                text:
                  summary.attestation_status === "ok"
                    ? "Overall attestation status: OK — no outstanding tiering, validation, or finding gaps across the fleet."
                    : "Overall attestation status: Blocked — one or more tiers have outstanding tiering, validation, or finding gaps.",
                bold: true,
                color: summary.attestation_status === "ok" ? COLORS.ok : COLORS.blocked,
                size: 22,
              }),
            ],
          }),

          headingRun("Fleet summary"),
          bodyLine("Models total", String(summary.models_total)),
          bodyLine("By tier", tierLines || "none tiered"),
          bodyLine("Untiered models", String(summary.models_untiered)),

          headingRun("Validation coverage"),
          bodyLine("Validated", String(cov.validated)),
          bodyLine("In review", String(cov.in_review)),
          bodyLine("Not started", String(cov.not_started)),
          bodyLine("Overdue", String(cov.overdue)),

          headingRun("Open findings by severity"),
          bodyLine("Critical", String(sev.critical ?? 0)),
          bodyLine("High", String(sev.high ?? 0)),
          bodyLine("Medium", String(sev.medium ?? 0)),
          bodyLine("Low", String(sev.low ?? 0)),

          headingRun("Per-tier attestation"),
          summary.per_tier.length > 0
            ? perTierTable(summary.per_tier)
            : new Paragraph({
                children: [
                  new TextRun({
                    text: "No tiered models in the fleet.",
                    color: COLORS.textSecondary,
                    size: 20,
                  }),
                ],
              }),
        ],
      },
    ],
  });

  const content = await Packer.toBuffer(doc);
  const safeOrg = organizationName.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 40) || "org";
  return {
    content,
    mimeType: MIME_DOCX,
    filename: `mrm-attestation-${safeOrg}-${dateLabel}.docx`,
  };
}
