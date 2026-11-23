/**
 * DOCX Generator Service
 * Uses 'docx' library for native Word document generation
 * Following VerifyWise clean architecture patterns
 */

import { NOTICE_TEXT } from "./noticeText";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  AlignmentType,
  HeadingLevel,
  PageBreak,
  BorderStyle,
  Footer,
  PageNumber,
  convertInchesToTwip,
} from "docx";
import {
  ReportData,
  ReportGenerationResult,
  AISummaries,
} from "../../domain.layer/interfaces/i.reportGeneration";
import { ANALYSIS_LABELS } from "./analyzers/mapToSummaries";
import {
  COLORS,
  TableCellInput,
  createAIAnalysisBox,
  createBullet,
  createEmptyState,
  createSectionHeader,
  createSubsectionHeader,
  createTable,
  createTableSpacing,
  createTocEntry,
} from "./docxPrimitives";
import {
  createE23Closing,
  createE23Cover,
  createE23DraftHeader,
  createE23Sections,
  createE23Toc,
} from "./docxE23";
import { buildE23FormalView, evidenceLine } from "./e23/formalView";
import { E23_NOTICE_LABELS } from "./e23/e23Text";

/**
 * Copy for the "sections with no data" block. Duplicated in report-pdf.ejs
 * the same way every other section's copy is — the two renderers do not share
 * a template layer. Keep the two copies exactly in step.
 */
const NOTICE_LABELS: Record<string, string> = {
  projectRisks: "Use case risks",
  vendorRisks: "Vendor risks",
  modelRisks: "Model risks",
  compliance: "Requirements",
  assessment: "Assessment tracker",
  clausesAndAnnexes: "Clauses and annexes",
  nistSubcategories: "NIST subcategories",
  frameworkRequirements: "Framework requirements",
  models: "AI models",
  vendors: "Vendors",
  trainingRegistry: "Training registry",
  policyManager: "Policy manager",
  incidentManagement: "Incident management",
};

const NOTICE_REASONS: Record<string, string> = {
  no_framework_target: "No project in scope uses a framework that provides this section.",
  no_data: "No records were found in scope.",
  unresolved_framework:
    "The selected framework is a plugin framework, which reports do not yet cover.",
};

/**
 * Create the cover page section (matching PDF format)
 */
function createCoverPage(reportData: ReportData): Paragraph[] {
  const { metadata, branding } = reportData;
  const paragraphs: Paragraph[] = [];

  // Add spacing at top
  paragraphs.push(
    new Paragraph({
      spacing: { before: 2400 },
      children: [],
    }),
  );

  // Organization name (green, bold - matches PDF)
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({
          text: branding.organizationName,
          bold: true,
          size: 64, // 32pt
          color: COLORS.primary,
        }),
      ],
    }),
  );

  // Framework name + Report (main title - matches PDF)
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `${metadata.frameworkName} Report`,
          bold: true,
          size: 64, // 32pt
          color: COLORS.textPrimary,
        }),
      ],
    }),
  );

  // Project title as subtitle (if not organizational - matches PDF)
  if (!metadata.isOrganizational) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
        children: [
          new TextRun({
            text: metadata.projectTitle,
            size: 36, // 18pt
            color: COLORS.textSecondary,
          }),
        ],
      }),
    );
  }

  // Add vertical space before metadata
  paragraphs.push(
    new Paragraph({
      spacing: { before: 800 },
      children: [],
    }),
  );

  // Metadata section (matches PDF cover-meta)
  if (!metadata.isOrganizational) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: "Project: ",
            bold: true,
            size: 28, // 14pt
            color: COLORS.textPrimary,
          }),
          new TextRun({
            text: metadata.projectTitle,
            size: 28,
            color: COLORS.textPrimary,
          }),
        ],
      }),
    );

    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new TextRun({
            text: "Owner: ",
            bold: true,
            size: 28,
            color: COLORS.textPrimary,
          }),
          new TextRun({
            text: metadata.projectOwner,
            size: 28,
            color: COLORS.textPrimary,
          }),
        ],
      }),
    );
  }

  // Generated date
  const formattedDate = metadata.generatedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "Generated: ",
          bold: true,
          size: 28,
          color: COLORS.textPrimary,
        }),
        new TextRun({
          text: formattedDate,
          size: 28,
          color: COLORS.textPrimary,
        }),
      ],
    }),
  );

  // Prepared by
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "Prepared by: ",
          bold: true,
          size: 28,
          color: COLORS.textPrimary,
        }),
        new TextRun({
          text: metadata.generatedBy,
          size: 28,
          color: COLORS.textPrimary,
        }),
      ],
    }),
  );

  // Page break after cover
  paragraphs.push(
    new Paragraph({
      children: [new PageBreak()],
    }),
  );

  return paragraphs;
}

/**
 * Create table of contents (matching PDF format - lowercase section names)
 */
function createTableOfContents(reportData: ReportData): Paragraph[] {
  const { sections } = reportData;
  const paragraphs: Paragraph[] = [];

  // TOC Title (matches PDF toc-title)
  paragraphs.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: "Table of contents",
          bold: true,
          size: 48, // 24pt
          color: COLORS.textPrimary,
        }),
      ],
    }),
  );

  let sectionNum = 1;

  // Executive Summary (only when AI summaries exist)
  if (reportData.aiSummaries?.executiveSummary) {
    paragraphs.push(createTocEntry(`${sectionNum++}. Executive summary`));
  }

  // Recommended Actions (only when the analyzer produced any)
  if (reportData.aiSummaries?.recommendedActions?.length) {
    paragraphs.push(createTocEntry(`${sectionNum++}. Recommended actions`));
  }

  // Compliance Gap Analysis (only when the analyzer produced one)
  if (reportData.aiSummaries?.complianceGap) {
    paragraphs.push(createTocEntry(`${sectionNum++}. Compliance gap analysis`));
  }

  // Third-Party Risk Analysis (only when the analyzer produced one)
  if (reportData.aiSummaries?.vendorRisk) {
    paragraphs.push(createTocEntry(`${sectionNum++}. Third-party risk analysis`));
  }

  // Risk Analysis (lowercase to match PDF)
  if (sections.projectRisks || sections.vendorRisks || sections.modelRisks) {
    paragraphs.push(createTocEntry(`${sectionNum++}. Risk analysis`));
  }

  // Compliance & Governance (lowercase to match PDF)
  if (
    sections.compliance ||
    sections.assessment ||
    sections.clausesAndAnnexes ||
    sections.nistSubcategories ||
    sections.frameworkRequirements
  ) {
    paragraphs.push(createTocEntry(`${sectionNum++}. Compliance & governance`));
  }

  // Organization (lowercase to match PDF)
  if (
    sections.vendors ||
    sections.models ||
    sections.trainingRegistry ||
    sections.policyManager ||
    sections.incidentManagement
  ) {
    paragraphs.push(createTocEntry(`${sectionNum++}. Organization`));
  }

  // Page break after TOC
  paragraphs.push(
    new Paragraph({
      children: [new PageBreak()],
    }),
  );

  return paragraphs;
}

/**
 * Create the Executive Summary section from AI summaries
 */
function createExecutiveSummarySection(aiSummaries: AISummaries): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  if (!aiSummaries.executiveSummary) {
    return [];
  }

  elements.push(createSectionHeader("Executive Summary"));
  elements.push(...createAIAnalysisBox(aiSummaries.executiveSummary, "AI-Generated Analysis"));

  // Key Findings. Prefer the structured list; the flat strings remain the
  // fallback for a payload that carries no detail.
  const detailed = aiSummaries.keyFindingsDetailed;
  if (detailed && detailed.length > 0) {
    elements.push(createSubsectionHeader("Key Findings"));
    detailed.forEach((f) => {
      elements.push(
        new Paragraph({
          spacing: { before: 60, after: 20 },
          indent: { left: convertInchesToTwip(0.3) },
          bullet: { level: 0 },
          children: [
            new TextRun({
              text: `[${f.severity}] `,
              bold: true,
              size: 20,
              color: COLORS.textPrimary,
            }),
            new TextRun({ text: f.text, size: 20, color: COLORS.textPrimary }),
          ],
        }),
      );

      // basis is optional: an older stored payload predates it and the schema
      // field is nullable. An absent label prints nothing rather than a
      // fabricated provenance claim.
      const meta = [
        `Section: ${f.section}`,
        f.basis ? `Basis: ${f.basis}` : null,
        f.related_sections?.length ? `Related: ${f.related_sections.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      elements.push(
        new Paragraph({
          spacing: { after: 20 },
          indent: { left: convertInchesToTwip(0.6) },
          children: [new TextRun({ text: meta, size: 18, color: COLORS.textSecondary })],
        }),
      );

      if (f.what_would_close_this) {
        elements.push(
          new Paragraph({
            spacing: { after: 60 },
            indent: { left: convertInchesToTwip(0.6) },
            children: [
              new TextRun({
                text: `Closes when: ${f.what_would_close_this}`,
                size: 18,
                color: COLORS.textSecondary,
              }),
            ],
          }),
        );
      }
    });
  } else if (aiSummaries.keyFindings && aiSummaries.keyFindings.length > 0) {
    elements.push(createSubsectionHeader("Key Findings"));
    aiSummaries.keyFindings.forEach((finding) => {
      elements.push(createBullet(finding));
    });
  }

  // Recommendations
  if (aiSummaries.recommendations && aiSummaries.recommendations.length > 0) {
    elements.push(createSubsectionHeader("Recommendations"));
    aiSummaries.recommendations.forEach((rec) => {
      elements.push(createBullet(rec));
    });
  }

  // Page break after executive summary
  elements.push(new Paragraph({ children: [new PageBreak()] }));

  return elements;
}

/**
 * Recommended Actions section. Standalone rather than nested in the executive
 * summary: the two analyzers are gated and abstain independently.
 */
function createRecommendedActionsSection(reportData: ReportData): (Paragraph | Table)[] {
  const recommendedActions = reportData.aiSummaries?.recommendedActions;
  const elements: (Paragraph | Table)[] = [];
  if (!recommendedActions || recommendedActions.length === 0) {
    return [];
  }

  elements.push(createSectionHeader("Recommended Actions"));
  recommendedActions.forEach((a) => {
    elements.push(
      new Paragraph({
        spacing: { before: 60, after: 20 },
        indent: { left: convertInchesToTwip(0.3) },
        bullet: { level: 0 },
        children: [
          new TextRun({ text: a.action, size: 20, color: COLORS.textPrimary }),
          new TextRun({
            text: `  [${a.priority ?? "—"} · ${a.suggestedOwner ?? "Unassigned"}${a.basis ? ` · Basis: ${a.basis}` : ""}]`,
            size: 18,
            color: COLORS.textSecondary,
          }),
        ],
      }),
    );

    // The analyzer's one sentence tying this action to a signal in the input.
    if (a.sourceSignal) {
      elements.push(
        new Paragraph({
          spacing: { after: 60 },
          indent: { left: convertInchesToTwip(0.6) },
          children: [
            new TextRun({
              text: `Why: ${a.sourceSignal}`,
              size: 18,
              color: COLORS.textSecondary,
            }),
          ],
        }),
      );
    }
  });

  elements.push(new Paragraph({ children: [new PageBreak()] }));
  return elements;
}

/**
 * Compliance Gap Analysis section (AI-generated). Explains the STORED
 * readiness scores; it never re-scores anything.
 */
function createComplianceGapSection(reportData: ReportData): (Paragraph | Table)[] {
  const gap = reportData.aiSummaries?.complianceGap;
  if (!gap) return [];

  const elements: (Paragraph | Table)[] = [];
  elements.push(createSectionHeader("Compliance Gap Analysis"));
  elements.push(...createAIAnalysisBox(gap.narrative, "AI-Generated Analysis"));

  if (gap.scores_caveat) {
    elements.push(
      ...createAIAnalysisBox(gap.scores_caveat, "Scope note", COLORS.aiWarning, COLORS.aiWarningBg),
    );
  }

  if (gap.gaps && gap.gaps.length > 0) {
    elements.push(createSubsectionHeader("Prioritised gaps"));
    gap.gaps.forEach((g) => {
      elements.push(
        new Paragraph({
          spacing: { before: 60, after: 20 },
          indent: { left: convertInchesToTwip(0.3) },
          bullet: { level: 0 },
          children: [
            new TextRun({
              text: `${g.control}: `,
              bold: true,
              size: 20,
              color: COLORS.textPrimary,
            }),
            new TextRun({
              text: `${g.gap} (${g.priority}${g.basis ? `, Basis: ${g.basis}` : ""})`,
              size: 20,
              color: COLORS.textPrimary,
            }),
          ],
        }),
      );

      if (g.what_would_close_this) {
        elements.push(
          new Paragraph({
            spacing: { after: 60 },
            indent: { left: convertInchesToTwip(0.6) },
            children: [
              new TextRun({
                text: `Closes when: ${g.what_would_close_this}`,
                size: 18,
                color: COLORS.textSecondary,
              }),
            ],
          }),
        );
      }
    });
  }

  elements.push(new Paragraph({ children: [new PageBreak()] }));
  return elements;
}

/**
 * Third-party risk analysis. Standalone: createRiskAnalysisSection returns []
 * when no risk section is selected, and a vendors-only report still needs this.
 */
function createVendorRiskSection(reportData: ReportData): (Paragraph | Table)[] {
  const vendorRisk = reportData.aiSummaries?.vendorRisk;
  if (!vendorRisk) return [];

  const elements: (Paragraph | Table)[] = [];
  elements.push(createSectionHeader("Third-Party Risk Analysis"));
  elements.push(...createAIAnalysisBox(vendorRisk.narrative, "AI-Generated Analysis"));
  (vendorRisk.concerns ?? []).forEach((c) => {
    elements.push(
      createBullet(
        `${c.concern} (${c.severity}${c.basis ? `, Basis: ${c.basis}` : ""})`,
        `${c.vendor}: `,
      ),
    );
  });

  elements.push(new Paragraph({ children: [new PageBreak()] }));
  return elements;
}

/**
 * Analyzer abstentions. Until now an abstention was completely silent in the
 * document: a missing block with no explanation, indistinguishable from a
 * block that was never enabled.
 *
 * The reasons arrive already filtered for presentation by
 * mapAnalysesToSummaries — an operational failure has been replaced there, in
 * one place, so this renderer and the PDF cannot disagree about what a reader
 * is told. Headings come from the shared ANALYSIS_LABELS map for the same
 * reason.
 */
function createAbstentionsSection(reportData: ReportData): (Paragraph | Table)[] {
  const abstentions = reportData.aiSummaries?.abstentions;
  if (!abstentions || Object.keys(abstentions).length === 0) return [];

  const elements: (Paragraph | Table)[] = [];
  elements.push(createSubsectionHeader("Analyses not produced"));
  Object.entries(abstentions).forEach(([key, reason]) => {
    elements.push(createBullet(reason, `${ANALYSIS_LABELS[key] ?? key}: `));
  });

  elements.push(new Paragraph({ children: [new PageBreak()] }));
  return elements;
}

/**
 * Create Risk Analysis section
 */
function createRiskAnalysisSection(reportData: ReportData): (Paragraph | Table)[] {
  const { sections } = reportData;
  const elements: (Paragraph | Table)[] = [];

  if (!sections.projectRisks && !sections.vendorRisks && !sections.modelRisks) {
    return [];
  }

  elements.push(createSectionHeader("Risk Analysis"));

  // Project/Use Case Risks
  if (sections.projectRisks) {
    elements.push(createSubsectionHeader("Use case risks"));

    if (reportData.aiSummaries?.sectionSummaries?.["projectRisks"]) {
      elements.push(
        ...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries["projectRisks"]),
      );
    }

    elements.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: `Total Risks: ${sections.projectRisks.totalRisks}`,
            bold: true,
            size: 22,
          }),
        ],
      }),
    );

    if (sections.projectRisks.risks.length > 0) {
      const headers = [
        "Risk Name",
        "Owner",
        "Severity",
        "Likelihood",
        "Mitigation Status",
        "Risk Level",
      ];
      const rows = sections.projectRisks.risks.map((risk) => [
        risk.name,
        risk.owner || "-",
        risk.impact || "-",
        risk.likelihood || "-",
        risk.mitigationStatus || "-",
        risk.riskLevel || "-",
      ]);
      elements.push(createTable(headers, rows));
      elements.push(createTableSpacing());
    } else {
      elements.push(createEmptyState("No use case risks have been identified."));
    }
  }

  // Vendor Risks
  if (sections.vendorRisks) {
    elements.push(createSubsectionHeader(`Vendor risks (${sections.vendorRisks.totalRisks})`));

    if (reportData.aiSummaries?.sectionSummaries?.["vendorRisks"]) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries["vendorRisks"]));
    }

    if (sections.vendorRisks.risks.length > 0) {
      const headers = ["Vendor", "Risk", "Risk Level", "Action Owner", "Action Plan"];
      const rows = sections.vendorRisks.risks.map((risk) => [
        risk.vendorName,
        risk.riskName,
        risk.riskLevel || "-",
        risk.actionOwner || "-",
        risk.actionPlan || "-",
      ]);
      elements.push(createTable(headers, rows));
      elements.push(createTableSpacing());
    } else {
      elements.push(createEmptyState("No vendor risks have been identified."));
    }
  }

  // Model Risks
  if (sections.modelRisks) {
    elements.push(createSubsectionHeader(`Model risks (${sections.modelRisks.totalRisks})`));

    if (reportData.aiSummaries?.sectionSummaries?.["modelRisks"]) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries["modelRisks"]));
    }

    if (sections.modelRisks.risks.length > 0) {
      const headers = ["Model", "Risk", "Risk Level", "Mitigation Status"];
      const rows = sections.modelRisks.risks.map((risk) => [
        risk.modelName,
        risk.riskName,
        risk.riskLevel || "-",
        risk.mitigationStatus || "-",
      ]);
      elements.push(createTable(headers, rows));
      elements.push(createTableSpacing());
    } else {
      elements.push(createEmptyState("No model risks have been identified."));
    }
  }

  // Risk Highlights (AI-generated)
  if (reportData.aiSummaries?.riskHighlights) {
    elements.push(
      ...createAIAnalysisBox(
        reportData.aiSummaries.riskHighlights,
        "Risk Highlights",
        COLORS.aiWarning,
        COLORS.aiWarningBg,
      ),
    );
  }

  // Most material risks. The analyzer has always produced top_risks; until now
  // nothing rendered them in either format.
  const topRisks = reportData.aiSummaries?.riskAnalysis?.top_risks;
  if (topRisks && topRisks.length > 0) {
    elements.push(createSubsectionHeader("Most material risks"));
    elements.push(
      createTable(
        ["Risk", "Level", "Why it ranks here"],
        topRisks.map((r) => [r.name, r.level || "-", r.why]),
      ),
    );
    elements.push(createTableSpacing());
  }

  // Add page break
  elements.push(new Paragraph({ children: [new PageBreak()] }));

  return elements;
}

/**
 * Create Compliance & Governance section
 */
function createComplianceSection(
  reportData: ReportData,
  // An E-23 report shows the requirements in its own completeness section.
  opts: { withFrameworkRequirements: boolean } = { withFrameworkRequirements: true },
): (Paragraph | Table)[] {
  const sections = opts.withFrameworkRequirements
    ? reportData.sections
    : { ...reportData.sections, frameworkRequirements: undefined };
  const elements: (Paragraph | Table)[] = [];

  if (
    !sections.compliance &&
    !sections.assessment &&
    !sections.clausesAndAnnexes &&
    !sections.nistSubcategories &&
    !sections.frameworkRequirements
  ) {
    return [];
  }

  elements.push(createSectionHeader("Compliance & Governance"));

  // Controls (EU AI Act)
  if (sections.compliance) {
    elements.push(createSubsectionHeader("Controls"));

    if (reportData.aiSummaries?.sectionSummaries?.["compliance"]) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries["compliance"]));
    }

    elements.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: `Overall Progress: ${sections.compliance.overallProgress}% (${sections.compliance.completedControls}/${sections.compliance.totalControls} controls)`,
            bold: true,
            size: 22,
          }),
        ],
      }),
    );

    if (sections.compliance.controls.length > 0) {
      // An organization report merges this table across every use case, and
      // control ids repeat -- each project has its own C1. mergeSections
      // labels rows only when more than one contributed, so the column shows
      // up exactly when it is needed. Mirrors report-pdf.ejs.
      const showUseCase = sections.compliance.controls.some((c) => c.useCase);
      const headers = showUseCase
        ? ["Use case", "Control ID", "Title", "Status", "Owner"]
        : ["Control ID", "Title", "Status", "Owner"];
      const rows = sections.compliance.controls.map((control) => [
        ...(showUseCase ? [control.useCase || "-"] : []),
        control.controlId,
        control.title,
        control.status || "-",
        control.owner || "-",
      ]);
      elements.push(createTable(headers, rows));
      elements.push(createTableSpacing());
    } else {
      elements.push(createEmptyState("No controls have been defined."));
    }
  }

  // Assessment (EU AI Act)
  if (sections.assessment) {
    elements.push(createSubsectionHeader("Assessment tracker"));

    if (reportData.aiSummaries?.sectionSummaries?.["assessment"]) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries["assessment"]));
    }

    elements.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: `Progress: ${sections.assessment.answeredQuestions}/${sections.assessment.totalQuestions} questions answered`,
            bold: true,
            size: 22,
          }),
        ],
      }),
    );

    sections.assessment.topics.forEach((topic) => {
      elements.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: `${topic.useCase ? `${topic.useCase} — ` : ""}${topic.title} (${topic.progress}%)`,
              bold: true,
              size: 22,
              color: COLORS.textPrimary,
            }),
          ],
        }),
      );

      topic.subtopics.forEach((subtopic) => {
        if (subtopic.questions.length > 0) {
          const headers = ["Question", "Answer", "Status"];
          const rows = subtopic.questions.map((q) => [q.question, q.answer || "-", q.status]);
          elements.push(createTable(headers, rows));
          elements.push(createTableSpacing());
        }
      });
    });
  }

  // Clauses and Annexes (ISO) - matches PDF structure with sub-headers
  if (sections.clausesAndAnnexes) {
    elements.push(createSubsectionHeader("Clauses and annexes"));

    if (reportData.aiSummaries?.sectionSummaries?.["clausesAndAnnexes"]) {
      elements.push(
        ...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries["clausesAndAnnexes"]),
      );
    }

    // Clauses sub-header (matching PDF section-subtitle)
    if (sections.clausesAndAnnexes.clauses.length > 0) {
      elements.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: "Clauses",
              bold: true,
              size: 24,
              color: COLORS.textPrimary,
            }),
          ],
        }),
      );
      // Merged across use cases, and across ISO 42001 and ISO 27001, which
      // both render into this section.
      const showClauseUseCase = sections.clausesAndAnnexes.clauses.some((c) => c.useCase);
      const headers = showClauseUseCase
        ? ["Use case", "Clause ID", "Title", "Status"]
        : ["Clause ID", "Title", "Status"];
      const rows = sections.clausesAndAnnexes.clauses.map((clause) => [
        ...(showClauseUseCase ? [clause.useCase || "-"] : []),
        clause.clauseId,
        clause.title,
        clause.status || "-",
      ]);
      elements.push(createTable(headers, rows));
      elements.push(createTableSpacing());
    }

    // Annexes sub-header (matching PDF section-subtitle)
    if (sections.clausesAndAnnexes.annexes.length > 0) {
      elements.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: "Annexes",
              bold: true,
              size: 24,
              color: COLORS.textPrimary,
            }),
          ],
        }),
      );
      const showAnnexUseCase = sections.clausesAndAnnexes.annexes.some((a) => a.useCase);
      const headers = showAnnexUseCase
        ? ["Use case", "Annex ID", "Title", "Status"]
        : ["Annex ID", "Title", "Status"];
      const rows = sections.clausesAndAnnexes.annexes.map((annex) => [
        ...(showAnnexUseCase ? [annex.useCase || "-"] : []),
        annex.annexId,
        annex.title,
        annex.status || "-",
      ]);
      elements.push(createTable(headers, rows));
      elements.push(createTableSpacing());
    }

    // Show empty state only if both are empty
    if (
      sections.clausesAndAnnexes.clauses.length === 0 &&
      sections.clausesAndAnnexes.annexes.length === 0
    ) {
      elements.push(createEmptyState("No clauses or annexes have been defined."));
    }
  }

  // NIST Subcategories
  if (sections.nistSubcategories) {
    elements.push(createSubsectionHeader("NIST AI RMF subcategories"));

    if (reportData.aiSummaries?.sectionSummaries?.["nistSubcategories"]) {
      elements.push(
        ...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries["nistSubcategories"]),
      );
    }

    sections.nistSubcategories.functions.forEach((func) => {
      // Function name as section subtitle (matching PDF)
      elements.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: func.name,
              bold: true,
              size: 24,
              color: COLORS.primary,
            }),
          ],
        }),
      );

      func.categories.forEach((category) => {
        // Category name as sub-header
        elements.push(
          new Paragraph({
            spacing: { before: 120, after: 80 },
            children: [
              new TextRun({
                text: `${category.useCase ? `${category.useCase} — ` : ""}${category.name}`,
                bold: true,
                size: 22,
                color: COLORS.textSecondary,
              }),
            ],
          }),
        );

        if (category.subcategories.length > 0) {
          // Include Risks column to match PDF
          const headers = ["ID", "Subcategory", "Status", "Risks"];
          const rows = category.subcategories.map((sub) => [
            sub.subcategoryId,
            sub.name,
            sub.status || "-",
            sub.risks && sub.risks.length > 0 ? sub.risks.map((r) => r.riskName).join(", ") : "-",
          ]);
          elements.push(createTable(headers, rows));
          elements.push(createTableSpacing());
        }
      });
    });
  }

  // Framework requirements (bundled frameworks)
  if (sections.frameworkRequirements) {
    elements.push(createSubsectionHeader("Framework requirements"));

    if (reportData.aiSummaries?.sectionSummaries?.["frameworkRequirements"]) {
      elements.push(
        ...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries["frameworkRequirements"]),
      );
    }

    sections.frameworkRequirements.frameworks.forEach((fw) => {
      elements.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({ text: fw.frameworkName, bold: true, size: 24, color: COLORS.primary }),
          ],
        }),
      );
      elements.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: `${fw.rollup.done} of ${fw.rollup.total} requirements implemented or audited`,
              size: 20,
              color: COLORS.textSecondary,
            }),
          ],
        }),
      );

      fw.groups.forEach((group) => {
        elements.push(
          new Paragraph({
            spacing: { before: 120, after: 80 },
            children: [
              new TextRun({
                text: `${group.useCase ? `${group.useCase} · ` : ""}${group.title}`,
                bold: true,
                size: 22,
                color: COLORS.textSecondary,
              }),
            ],
          }),
        );

        if (group.requirements.length > 0) {
          const headers = ["Requirement", "Status", "Owner", "Due date", "Evidence"];
          const rows: TableCellInput[][] = [];
          group.requirements.forEach((req) => {
            [req, ...(req.children ?? [])].forEach((r) => {
              rows.push([
                {
                  main: `${r.level === 3 ? "    " : ""}${r.title}`,
                  secondary: evidenceLine(r),
                },
                r.status,
                r.owner || "—",
                r.dueDate || "—",
                String(r.evidenceCount),
              ]);
            });
          });
          elements.push(createTable(headers, rows));
          elements.push(createTableSpacing());
        }
      });
    });
  }

  // Add page break
  elements.push(new Paragraph({ children: [new PageBreak()] }));

  return elements;
}

/**
 * Create Organization section
 */
function createOrganizationSection(reportData: ReportData): (Paragraph | Table)[] {
  const { sections } = reportData;
  const elements: (Paragraph | Table)[] = [];

  if (
    !sections.vendors &&
    !sections.models &&
    !sections.trainingRegistry &&
    !sections.policyManager &&
    !sections.incidentManagement
  ) {
    return [];
  }

  elements.push(createSectionHeader("Organization"));

  // AI Models (first in PDF)
  if (sections.models) {
    elements.push(createSubsectionHeader(`AI models (${sections.models.totalModels})`));

    if (reportData.aiSummaries?.sectionSummaries?.["models"]) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries["models"]));
    }

    if (sections.models.models.length > 0) {
      const headers = ["Model Name", "Version", "Status", "Approver"];
      const rows = sections.models.models.map((model) => [
        model.name,
        model.version || "-",
        model.status || "-",
        model.approver || "-",
      ]);
      elements.push(createTable(headers, rows));
      elements.push(createTableSpacing());
    } else {
      elements.push(createEmptyState("No AI models have been registered."));
    }
  }

  // Vendors (second in PDF)
  if (sections.vendors) {
    elements.push(createSubsectionHeader(`Vendors (${sections.vendors.totalVendors})`));

    if (reportData.aiSummaries?.sectionSummaries?.["vendors"]) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries["vendors"]));
    }

    if (sections.vendors.vendors.length > 0) {
      const headers = ["Vendor Name", "Website", "Contact", "Risk Status", "Assignee"];
      const rows = sections.vendors.vendors.map((vendor) => [
        vendor.name,
        vendor.website || "-",
        vendor.contactPerson || "-",
        vendor.riskStatus || "-",
        vendor.assignee || "-",
      ]);
      elements.push(createTable(headers, rows));
      elements.push(createTableSpacing());
    } else {
      elements.push(createEmptyState("No vendors have been added."));
    }
  }

  // Training Registry
  if (sections.trainingRegistry) {
    elements.push(
      createSubsectionHeader(`Training registry (${sections.trainingRegistry.totalRecords})`),
    );

    if (reportData.aiSummaries?.sectionSummaries?.["trainingRegistry"]) {
      elements.push(
        ...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries["trainingRegistry"]),
      );
    }

    if (sections.trainingRegistry.records.length > 0) {
      const headers = ["Training Name", "Status"];
      const rows = sections.trainingRegistry.records.map((record) => [
        record.trainingName,
        record.status || "-",
      ]);
      elements.push(createTable(headers, rows));
      elements.push(createTableSpacing());
    } else {
      elements.push(createEmptyState("No training records have been added."));
    }
  }

  // Policy Manager
  if (sections.policyManager) {
    elements.push(
      createSubsectionHeader(`Policy manager (${sections.policyManager.totalPolicies})`),
    );

    if (reportData.aiSummaries?.sectionSummaries?.["policyManager"]) {
      elements.push(
        ...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries["policyManager"]),
      );
    }

    if (sections.policyManager.policies.length > 0) {
      const headers = ["Policy Name", "Status", "Review Date", "Owner"];
      const rows = sections.policyManager.policies.map((policy) => [
        policy.policyName,
        policy.status || "-",
        policy.reviewDate || "-",
        policy.owner || "-",
      ]);
      elements.push(createTable(headers, rows));
      elements.push(createTableSpacing());
    } else {
      elements.push(createEmptyState("No policies have been created."));
    }
  }

  // Incident Management (matches PDF table headers)
  if (sections.incidentManagement) {
    elements.push(
      createSubsectionHeader(`Incident management (${sections.incidentManagement.totalIncidents})`),
    );

    if (reportData.aiSummaries?.sectionSummaries?.["incidentManagement"]) {
      elements.push(
        ...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries["incidentManagement"]),
      );
    }

    if (sections.incidentManagement.incidents.length > 0) {
      const headers = ["Incident ID", "Type", "Severity", "Status", "Reported", "Reporter"];
      const rows = sections.incidentManagement.incidents.map((incident) => [
        incident.incidentId,
        incident.type || "-",
        incident.severity || "-",
        incident.status || "-",
        incident.reportedDate || "-",
        incident.reporter || "-",
      ]);
      elements.push(createTable(headers, rows));
      elements.push(createTableSpacing());
    } else {
      elements.push(createEmptyState("No incidents have been reported."));
    }
  }

  return elements;
}

/**
 * Create the "sections with no data" block.
 *
 * Deliberately its own top-level section rather than a tail on
 * createOrganizationSection: that function returns [] when no organization
 * section is present, so a report whose only content is notices would print
 * nothing at all. The two "has any section" guards stay untouched.
 */
function createSectionNoticesSection(reportData: ReportData): (Paragraph | Table)[] {
  // `?? []` so a caller constructing ReportData without sectionNotices — every
  // caller that predates the field — renders nothing rather than throwing.
  const notices = reportData.sectionNotices ?? [];
  if (notices.length === 0) return [];

  const elements: (Paragraph | Table)[] = [];
  const failed = notices.filter((n) => n.reason === "collection_failed");
  const empty = notices.filter((n) => n.reason !== "collection_failed");

  const intro = (text: string) =>
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text, size: 20, color: COLORS.textSecondary })],
    });
  const bullet = (label: string, text: string) => createBullet(` — ${text}`, label);

  if (failed.length > 0) {
    elements.push(createSubsectionHeader(NOTICE_TEXT.failedTitle));
    elements.push(intro(NOTICE_TEXT.failedIntro));
    for (const notice of failed) {
      elements.push(
        bullet(
          NOTICE_LABELS[notice.sectionKey] ??
            E23_NOTICE_LABELS[notice.sectionKey] ??
            notice.sectionKey,
          `${notice.detail ? `${notice.detail}: ` : ""}${NOTICE_TEXT.failedSuffix}`,
        ),
      );
    }
    elements.push(intro(NOTICE_TEXT.failedGuidance));
  }

  if (empty.length > 0) {
    elements.push(createSubsectionHeader("Sections with no data"));
    elements.push(
      intro(
        "These sections were requested but produced nothing. They are listed so an " +
          "empty report is never mistaken for a clean one.",
      ),
    );
    for (const notice of empty) {
      elements.push(
        bullet(
          NOTICE_LABELS[notice.sectionKey] ??
            E23_NOTICE_LABELS[notice.sectionKey] ??
            notice.sectionKey,
          NOTICE_REASONS[notice.reason] ?? notice.reason,
        ),
      );
    }
  }

  return elements;
}

/**
 * Create footer for all pages
 */
function createFooter(reportData: ReportData, title?: string): Footer {
  const { metadata, branding } = reportData;
  const formattedDate = metadata.generatedAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: {
          top: {
            color: COLORS.border,
            size: 6,
            style: BorderStyle.SINGLE,
            space: 4,
          },
        },
        children: [
          new TextRun({
            text: `${title ?? `${branding.organizationName} | ${metadata.frameworkName} Report`} | Generated: ${formattedDate} | Page `,
            size: 18,
            color: COLORS.textTertiary,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            size: 18,
            color: COLORS.textTertiary,
          }),
        ],
      }),
    ],
  });
}

/**
 * Generate DOCX from report data
 */
export async function generateDOCX(reportData: ReportData): Promise<ReportGenerationResult> {
  try {
    // Build document sections
    const coverPage = createCoverPage(reportData);
    const toc = createTableOfContents(reportData);
    const e23 = buildE23FormalView(reportData);
    // An E-23 report prints its view's summaries, which leave out the
    // recommendations that belong to the internal fix-it list.
    const aiSummaries = e23 ? e23.aiSummaries : reportData.aiSummaries;
    const aiExecutiveSummary = aiSummaries ? createExecutiveSummarySection(aiSummaries) : [];
    const riskSection = createRiskAnalysisSection(reportData);
    const complianceSection = createComplianceSection(reportData, {
      withFrameworkRequirements: !e23,
    });
    const organizationSection = createOrganizationSection(reportData);

    // An OSFI E-23 report (spec 8.3 order). Recommended actions go to its
    // internal fix-it list, and the abstentions follow the notices.
    const e23Children = e23 && [
      ...createE23Cover(e23),
      ...createE23Toc(e23),
      ...createE23Sections(e23.intro),
      ...aiExecutiveSummary,
      ...createE23Sections(e23.main),
      ...createComplianceGapSection(reportData),
      ...createVendorRiskSection(reportData),
      ...riskSection,
      ...complianceSection,
      ...organizationSection,
      ...(e23.appendix ? createE23Sections([e23.appendix]) : []),
      ...createSectionNoticesSection(reportData),
      ...createE23Closing(e23),
    ];

    // Combine all sections
    const allChildren = e23Children || [
      ...coverPage,
      ...toc,
      ...aiExecutiveSummary,
      ...createRecommendedActionsSection(reportData),
      ...createComplianceGapSection(reportData),
      ...createVendorRiskSection(reportData),
      ...createAbstentionsSection(reportData),
      ...riskSection,
      ...complianceSection,
      ...organizationSection,
      ...createSectionNoticesSection(reportData),
    ];

    // Create document
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: "Arial",
              size: 22,
            },
          },
        },
      },
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
          ...(e23?.watermark && { headers: { default: createE23DraftHeader(e23.watermark) } }),
          footers: {
            default: createFooter(reportData, e23?.footerTitle),
          },
          children: allChildren,
        },
      ],
    });

    // Generate buffer
    const buffer = await Packer.toBuffer(doc);

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `${reportData.metadata.projectTitle.replace(/[^a-zA-Z0-9]/g, "_")}_${reportData.metadata.frameworkName.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}.docx`;

    return {
      success: true,
      filename,
      content: buffer,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  } catch (error) {
    console.error("Error generating DOCX:", error);
    return {
      success: false,
      filename: "",
      content: Buffer.alloc(0),
      mimeType: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate DOCX with embedded chart images
 * This is used when chart images are pre-generated
 */
export async function generateDOCXWithCharts(
  reportData: ReportData,
  _chartImages: Record<string, string>,
): Promise<ReportGenerationResult> {
  // For now, charts are not embedded in DOCX
  // This function exists for API compatibility
  return generateDOCX(reportData);
}
