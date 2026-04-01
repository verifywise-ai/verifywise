/**
 * DOCX Generator Service
 * Uses 'docx' library for native Word document generation
 * Following VerifyWise clean architecture patterns
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  PageBreak,
  BorderStyle,
  Footer,
  PageNumber,
  ShadingType,
  VerticalAlign,
  convertInchesToTwip,
} from "docx";
import {
  ReportData,
  ReportGenerationResult,
  AISummaries,
} from "../../domain.layer/interfaces/i.reportGeneration";

// Color constants matching VerifyWise theme
const COLORS = {
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
    })
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
    })
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
    })
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
      })
    );
  }

  // Add vertical space before metadata
  paragraphs.push(
    new Paragraph({
      spacing: { before: 800 },
      children: [],
    })
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
      })
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
      })
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
    })
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
    })
  );

  // Page break after cover
  paragraphs.push(
    new Paragraph({
      children: [new PageBreak()],
    })
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
    })
  );

  let sectionNum = 1;

  // Executive Summary (only when AI summaries exist)
  if (reportData.aiSummaries?.executiveSummary) {
    paragraphs.push(createTocEntry(`${sectionNum++}. Executive summary`));
  }

  // Risk Analysis (lowercase to match PDF)
  if (sections.projectRisks || sections.vendorRisks || sections.modelRisks) {
    paragraphs.push(createTocEntry(`${sectionNum++}. Risk analysis`));
  }

  // Compliance & Governance (lowercase to match PDF)
  if (sections.compliance || sections.assessment || sections.clausesAndAnnexes || sections.nistSubcategories) {
    paragraphs.push(createTocEntry(`${sectionNum++}. Compliance & governance`));
  }

  // Organization (lowercase to match PDF)
  if (sections.vendors || sections.models || sections.trainingRegistry || sections.policyManager || sections.incidentManagement) {
    paragraphs.push(createTocEntry(`${sectionNum++}. Organization`));
  }

  // Page break after TOC
  paragraphs.push(
    new Paragraph({
      children: [new PageBreak()],
    })
  );

  return paragraphs;
}

function createTocEntry(text: string): Paragraph {
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
function createSectionHeader(title: string): Paragraph {
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
function createSubsectionHeader(title: string): Paragraph {
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

/**
 * Create a standard table with headers and borders
 */
function createTable(headers: string[], rows: string[][]): Table {
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
      })
  );

  const dataRows = rows.map(
    (row, rowIndex) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              shading: rowIndex % 2 === 1 ? {
                fill: COLORS.backgroundAlt,
                type: ShadingType.CLEAR,
              } : undefined,
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
                      text: cell || "-",
                      size: 20,
                      color: COLORS.textPrimary,
                    }),
                  ],
                }),
              ],
              verticalAlign: VerticalAlign.CENTER,
            })
        ),
      })
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
function createTableSpacing(): Paragraph {
  return new Paragraph({
    spacing: { after: 200 },
    children: [],
  });
}

/**
 * Create empty state message
 */
function createEmptyState(message: string): Paragraph {
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

/**
 * Create an AI analysis box (green left border, light green background)
 */
function createAIAnalysisBox(
  content: string,
  label: string = "AI Analysis",
  borderColor: string = COLORS.primary,
  bgColor: string = COLORS.aiBg
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
      children: [
        new TextRun({
          text: content,
          size: 20,
          color: COLORS.textPrimary,
        }),
      ],
    }),
  ];
}

/**
 * Create the Executive Summary section from AI summaries
 */
function createExecutiveSummarySection(
  aiSummaries: AISummaries
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  if (!aiSummaries.executiveSummary) {
    return [];
  }

  elements.push(createSectionHeader("Executive Summary"));
  elements.push(
    ...createAIAnalysisBox(
      aiSummaries.executiveSummary,
      "AI-Generated Analysis"
    )
  );

  // Key Findings
  if (aiSummaries.keyFindings && aiSummaries.keyFindings.length > 0) {
    elements.push(createSubsectionHeader("Key Findings"));
    aiSummaries.keyFindings.forEach((finding) => {
      elements.push(
        new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: convertInchesToTwip(0.3) },
          bullet: { level: 0 },
          children: [
            new TextRun({
              text: finding,
              size: 20,
              color: COLORS.textPrimary,
            }),
          ],
        })
      );
    });
  }

  // Recommendations
  if (aiSummaries.recommendations && aiSummaries.recommendations.length > 0) {
    elements.push(createSubsectionHeader("Recommendations"));
    aiSummaries.recommendations.forEach((rec) => {
      elements.push(
        new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: convertInchesToTwip(0.3) },
          bullet: { level: 0 },
          children: [
            new TextRun({
              text: rec,
              size: 20,
              color: COLORS.textPrimary,
            }),
          ],
        })
      );
    });
  }

  // Page break after executive summary
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

    if (reportData.aiSummaries?.sectionSummaries?.['projectRisks']) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries['projectRisks']));
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
      })
    );

    if (sections.projectRisks.risks.length > 0) {
      const headers = ["Risk Name", "Owner", "Severity", "Likelihood", "Mitigation Status", "Risk Level"];
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

    if (reportData.aiSummaries?.sectionSummaries?.['vendorRisks']) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries['vendorRisks']));
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

    if (reportData.aiSummaries?.sectionSummaries?.['modelRisks']) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries['modelRisks']));
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
        COLORS.aiWarningBg
      )
    );
  }

  // Add page break
  elements.push(new Paragraph({ children: [new PageBreak()] }));

  return elements;
}

/**
 * Create Compliance & Governance section
 */
function createComplianceSection(reportData: ReportData): (Paragraph | Table)[] {
  const { sections } = reportData;
  const elements: (Paragraph | Table)[] = [];

  if (!sections.compliance && !sections.assessment && !sections.clausesAndAnnexes && !sections.nistSubcategories) {
    return [];
  }

  elements.push(createSectionHeader("Compliance & Governance"));

  // Controls (EU AI Act)
  if (sections.compliance) {
    elements.push(createSubsectionHeader("Controls"));

    if (reportData.aiSummaries?.sectionSummaries?.['compliance']) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries['compliance']));
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
      })
    );

    if (sections.compliance.controls.length > 0) {
      const headers = ["Control ID", "Title", "Status", "Owner"];
      const rows = sections.compliance.controls.map((control) => [
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

    if (reportData.aiSummaries?.sectionSummaries?.['assessment']) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries['assessment']));
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
      })
    );

    sections.assessment.topics.forEach((topic) => {
      elements.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: `${topic.title} (${topic.progress}%)`,
              bold: true,
              size: 22,
              color: COLORS.textPrimary,
            }),
          ],
        })
      );

      topic.subtopics.forEach((subtopic) => {
        if (subtopic.questions.length > 0) {
          const headers = ["Question", "Answer", "Status"];
          const rows = subtopic.questions.map((q) => [
            q.question,
            q.answer || "-",
            q.status,
          ]);
          elements.push(createTable(headers, rows));
          elements.push(createTableSpacing());
        }
      });
    });
  }

  // Clauses and Annexes (ISO) - matches PDF structure with sub-headers
  if (sections.clausesAndAnnexes) {
    elements.push(createSubsectionHeader("Clauses and annexes"));

    if (reportData.aiSummaries?.sectionSummaries?.['clausesAndAnnexes']) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries['clausesAndAnnexes']));
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
        })
      );
      const headers = ["Clause ID", "Title", "Status"];
      const rows = sections.clausesAndAnnexes.clauses.map((clause) => [
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
        })
      );
      const headers = ["Annex ID", "Title", "Status"];
      const rows = sections.clausesAndAnnexes.annexes.map((annex) => [
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

    if (reportData.aiSummaries?.sectionSummaries?.['nistSubcategories']) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries['nistSubcategories']));
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
        })
      );

      func.categories.forEach((category) => {
        // Category name as sub-header
        elements.push(
          new Paragraph({
            spacing: { before: 120, after: 80 },
            children: [
              new TextRun({
                text: category.name,
                bold: true,
                size: 22,
                color: COLORS.textSecondary,
              }),
            ],
          })
        );

        if (category.subcategories.length > 0) {
          // Include Risks column to match PDF
          const headers = ["ID", "Subcategory", "Status", "Risks"];
          const rows = category.subcategories.map((sub) => [
            sub.subcategoryId,
            sub.name,
            sub.status || "-",
            sub.risks && sub.risks.length > 0
              ? sub.risks.map((r) => r.riskName).join(", ")
              : "-",
          ]);
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

  if (!sections.vendors && !sections.models && !sections.trainingRegistry && !sections.policyManager && !sections.incidentManagement) {
    return [];
  }

  elements.push(createSectionHeader("Organization"));

  // AI Models (first in PDF)
  if (sections.models) {
    elements.push(createSubsectionHeader(`AI models (${sections.models.totalModels})`));

    if (reportData.aiSummaries?.sectionSummaries?.['models']) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries['models']));
    }

    if (sections.models.models.length > 0) {
      const headers = ["Model Name", "Version", "Status", "Owner"];
      const rows = sections.models.models.map((model) => [
        model.name,
        model.version || "-",
        model.status || "-",
        model.owner || "-",
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

    if (reportData.aiSummaries?.sectionSummaries?.['vendors']) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries['vendors']));
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
    elements.push(createSubsectionHeader(`Training registry (${sections.trainingRegistry.totalRecords})`));

    if (reportData.aiSummaries?.sectionSummaries?.['trainingRegistry']) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries['trainingRegistry']));
    }

    if (sections.trainingRegistry.records.length > 0) {
      const headers = ["Training Name", "Completion Date", "Status", "Assignee"];
      const rows = sections.trainingRegistry.records.map((record) => [
        record.trainingName,
        record.completionDate || "-",
        record.status || "-",
        record.assignee || "-",
      ]);
      elements.push(createTable(headers, rows));
      elements.push(createTableSpacing());
    } else {
      elements.push(createEmptyState("No training records have been added."));
    }
  }

  // Policy Manager
  if (sections.policyManager) {
    elements.push(createSubsectionHeader(`Policy manager (${sections.policyManager.totalPolicies})`));

    if (reportData.aiSummaries?.sectionSummaries?.['policyManager']) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries['policyManager']));
    }

    if (sections.policyManager.policies.length > 0) {
      const headers = ["Policy Name", "Version", "Status", "Review Date", "Owner"];
      const rows = sections.policyManager.policies.map((policy) => [
        policy.policyName,
        policy.version || "-",
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
    elements.push(createSubsectionHeader(`Incident management (${sections.incidentManagement.totalIncidents})`));

    if (reportData.aiSummaries?.sectionSummaries?.['incidentManagement']) {
      elements.push(...createAIAnalysisBox(reportData.aiSummaries.sectionSummaries['incidentManagement']));
    }

    if (sections.incidentManagement.incidents.length > 0) {
      const headers = ["Incident ID", "Title", "Type", "Severity", "Status", "Reported", "Assignee"];
      const rows = sections.incidentManagement.incidents.map((incident) => [
        incident.incidentId,
        incident.title,
        incident.type || "-",
        incident.severity || "-",
        incident.status || "-",
        incident.reportedDate || "-",
        incident.assignee || "-",
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
 * Create footer for all pages
 */
function createFooter(reportData: ReportData): Footer {
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
            text: `${branding.organizationName} | ${metadata.frameworkName} Report | Generated: ${formattedDate} | Page `,
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
export async function generateDOCX(
  reportData: ReportData
): Promise<ReportGenerationResult> {
  try {
    // Build document sections
    const coverPage = createCoverPage(reportData);
    const toc = createTableOfContents(reportData);
    const aiExecutiveSummary = reportData.aiSummaries
      ? createExecutiveSummarySection(reportData.aiSummaries)
      : [];
    const riskSection = createRiskAnalysisSection(reportData);
    const complianceSection = createComplianceSection(reportData);
    const organizationSection = createOrganizationSection(reportData);

    // Combine all sections
    const allChildren = [
      ...coverPage,
      ...toc,
      ...aiExecutiveSummary,
      ...riskSection,
      ...complianceSection,
      ...organizationSection,
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
          footers: {
            default: createFooter(reportData),
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
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
  _chartImages: Record<string, string>
): Promise<ReportGenerationResult> {
  // For now, charts are not embedded in DOCX
  // This function exists for API compatibility
  return generateDOCX(reportData);
}
