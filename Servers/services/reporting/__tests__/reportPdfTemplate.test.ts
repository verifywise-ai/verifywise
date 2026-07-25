/**
 * Regression coverage for Servers/templates/reports/report-pdf.ejs.
 *
 * Renders the ACTUAL template file from disk (not an inlined copy) so a
 * malformed EJS tag, or a block moved back inside the wrong guard, fails
 * this suite instead of breaking every PDF the product generates.
 */
import * as ejs from "ejs";
import * as fs from "fs";
import * as path from "path";
import { AISummaries, ReportData } from "../../../domain.layer/interfaces/i.reportGeneration";
import { ANALYSIS_LABELS } from "../analyzers/mapToSummaries";

const TEMPLATE_PATH = path.join(__dirname, "../../../templates/reports/report-pdf.ejs");
const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");

const SECTION_KEYS: Array<keyof ReportData["sections"]> = [
  "projectRisks", "vendorRisks", "modelRisks", "compliance", "assessment",
  "clausesAndAnnexes", "nistSubcategories", "vendors", "models",
  "trainingRegistry", "policyManager", "incidentManagement",
];

function render(
  aiSummaries?: AISummaries,
  // Sections default to falsy stand-ins; a test that needs a real section
  // passes just that one and leaves its eleven siblings switched off.
  sectionOverrides: Partial<Record<(typeof SECTION_KEYS)[number], unknown>> = {},
): string {
  const data = {
    metadata: {
      projectId: 1,
      projectTitle: "Acme Vision",
      projectOwner: "Jane Doe",
      frameworkId: 1,
      frameworkName: "EU AI Act",
      projectFrameworkId: 1,
      generatedAt: new Date("2026-07-19T00:00:00Z"),
      generatedBy: "Jane Doe",
      organizationId: 1,
      isOrganizational: false,
    },
    branding: { organizationName: "Acme", primaryColor: "#13715B" },
    charts: {},
    renderedCharts: {},
    // Falsy stand-ins for every section so only the AI blocks render.
    sections: {
      ...Object.fromEntries(SECTION_KEYS.map((k) => [k, false])),
      ...sectionOverrides,
    } as unknown as ReportData["sections"],
    aiSummaries,
    // The renderer supplies these; the template must not declare its own copy.
    analysisLabels: ANALYSIS_LABELS,
    include: () => "",
  } satisfies Omit<ReportData, "aiSummaries"> & {
    aiSummaries?: AISummaries;
    analysisLabels: Record<string, string>;
    include: (p: string) => string;
  };
  return ejs.render(template, data);
}

const FULL: AISummaries = {
  sectionSummaries: {},
  recommendedActions: [
    { action: "Close the DPIA gap", priority: "high", suggestedOwner: "Compliance Lead" },
    { action: "Re-review vendor SOC 2" },
  ],
  complianceGap: {
    narrative: "Two controls lack evidence.",
    scores_caveat: "Readiness scores were unavailable for this period.",
    gaps: [{ control: "Art. 9 Risk management", gap: "No documented review cadence", priority: "High" }],
  },
  vendorRisk: {
    narrative: "One vendor processes personal data without a DPA.",
    concerns: [{ vendor: "DataCorp", concern: "No DPA on file", severity: "high" }],
  },
};

describe("report-pdf.ejs template", () => {
  it("recommendedActions renders without executiveSummary (its own top-level guard)", () => {
    const html = render({ sectionSummaries: {}, recommendedActions: FULL.recommendedActions });
    expect(html).not.toContain("Executive Summary");
    expect(html).toContain("Recommended actions");
    expect(html).toContain("Close the DPIA gap");
    expect(html).toContain("Compliance Lead");
    expect(html).toContain("Unassigned");
    expect(html).toContain("—");
  });

  it("complianceGap renders narrative, caveat and gap rows", () => {
    const html = render({ sectionSummaries: {}, complianceGap: FULL.complianceGap });
    expect(html).toContain("Compliance Gap Analysis");
    expect(html).toContain("Two controls lack evidence.");
    expect(html).toContain("Scope note");
    expect(html).toContain("Readiness scores were unavailable");
    expect(html).toContain("Prioritised gaps");
    expect(html).toContain("Art. 9 Risk management");
    expect(html).toContain("chip chip-high");
  });

  it("vendorRisk renders narrative and concerns", () => {
    const html = render({ sectionSummaries: {}, vendorRisk: FULL.vendorRisk });
    expect(html).toContain("Third-party risk analysis");
    expect(html).toContain("One vendor processes personal data without a DPA.");
    expect(html).toContain("DataCorp");
    expect(html).toContain("No DPA on file");
  });

  it("TOC lists all three sections with sequential numbers", () => {
    const html = render(FULL);
    const toc = html.slice(html.indexOf('<ul class="toc-list">'), html.indexOf("</ul>"));
    expect(toc).toContain("Recommended actions");
    expect(toc).toContain("Compliance gap analysis");
    expect(toc).toContain("Third-party risk analysis");
    expect(toc).toContain('class="toc-item-number">1.');
    expect(toc).toContain('class="toc-item-number">2.');
    expect(toc).toContain('class="toc-item-number">3.');
    expect(toc).not.toContain('class="toc-entry"');
  });

  // Rendered one at a time so no two siblings are ever simultaneously truthy —
  // otherwise a TOC guard swapped to a sibling key stays green and the document
  // ships a TOC entry for a section it does not contain.
  it("each of the three AI sections is listed in the TOC only when it is the one present", () => {
    const siblings: Array<{ summaries: AISummaries; toc: string; body: string }> = [
      {
        summaries: { sectionSummaries: {}, recommendedActions: FULL.recommendedActions },
        toc: "Recommended actions",
        body: "Recommended actions",
      },
      {
        summaries: { sectionSummaries: {}, complianceGap: FULL.complianceGap },
        toc: "Compliance gap analysis",
        body: "Compliance Gap Analysis",
      },
      {
        summaries: { sectionSummaries: {}, vendorRisk: FULL.vendorRisk },
        toc: "Third-party risk analysis",
        body: "Third-party risk analysis",
      },
    ];

    for (const self of siblings) {
      const html = render(self.summaries);
      const tocEnd = html.indexOf("</ul>");
      const toc = html.slice(html.indexOf('<ul class="toc-list">'), tocEnd);
      const body = html.slice(tocEnd);

      expect(toc).toContain(self.toc);
      expect(body).toContain(self.body);

      for (const other of siblings.filter((s) => s !== self)) {
        expect(toc).not.toContain(other.toc);
        expect(body).not.toContain(other.body);
      }
    }
  });

  it("body order matches the TOC order: vendorRisk renders before the risk-analysis group, right after compliance gap", () => {
    const html = render(FULL);
    const body = html.slice(html.indexOf("</ul>"));
    // "RISK ANALYSIS GROUP" is an HTML comment outside the sections guard, so
    // it always prints — a stable anchor even when every section is falsy.
    expect(body.indexOf("Compliance Gap Analysis")).toBeLessThan(
      body.indexOf("Third-party risk analysis"),
    );
    expect(body.indexOf("Third-party risk analysis")).toBeLessThan(
      body.indexOf("RISK ANALYSIS GROUP"),
    );
  });

  it("abstained sections render nothing at all", () => {
    const html = render({ sectionSummaries: {} });
    for (const s of [
      "Recommended actions", "Compliance Gap Analysis", "Compliance gap analysis",
      "Third-party risk analysis", "Prioritised gaps", "Scope note",
    ]) {
      expect(html).not.toContain(s);
    }
  });

  it("empty gaps/concerns/actions arrays print no table or list, but the narrative still renders", () => {
    const html = render({
      sectionSummaries: {},
      recommendedActions: [],
      complianceGap: { narrative: "All clear.", gaps: [], scores_caveat: null },
      vendorRisk: { narrative: "No vendors of concern.", concerns: [] },
    });
    expect(html).not.toContain("Recommended actions");
    expect(html).not.toContain("Prioritised gaps");
    expect(html).not.toContain("Scope note");
    expect(html).toContain("All clear.");
    expect(html).toContain("No vendors of concern.");
  });

  it("renders structured findings with severity, basis, counterfactual and related sections", () => {
    const html = render({
      sectionSummaries: {},
      executiveSummary: "Posture is uneven.",
      keyFindings: ["flat fallback text"],
      keyFindingsDetailed: [
        {
          text: "Only 3 of 25 models name an owner",
          section: "models",
          severity: "high",
          basis: "observed",
          related_sections: ["modelRisks", "policyManager"],
          what_would_close_this: "An owner recorded on every model inventory row",
        },
      ],
    });

    expect(html).toContain("Only 3 of 25 models name an owner");
    expect(html).toContain("chip chip-high");
    // basis is a disclosure field: it says whether the claim was read off the
    // data or inferred from it. Two bare tokens ("models · observed") let a
    // reader take "observed" for a property of the section, so both are
    // labelled — the same phrasing the DOCX renderer uses.
    expect(html).toContain("Section: models &middot; Basis: observed");
    expect(html).toContain("Closes when: An owner recorded on every model inventory row");
    expect(html).toContain("modelRisks, policyManager");
    // The structured list replaces the flat one rather than printing both.
    expect(html).not.toContain("flat fallback text");
  });

  it("falls back to the flat keyFindings list when no structured findings exist", () => {
    const html = render({
      sectionSummaries: {},
      executiveSummary: "Posture is uneven.",
      keyFindings: ["flat fallback text"],
    });
    expect(html).toContain("flat fallback text");
  });

  it("avoids page breaks per finding, not around the whole executive summary block", () => {
    const html = render({ sectionSummaries: {}, executiveSummary: "Posture is uneven." });
    // include() returns "" in this harness, so the <style> slice is the
    // template's own inline CSS and nothing from pdf.css.
    const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
    expect(css.replace(/\s+/g, " ")).toContain(".ai-finding { page-break-inside: avoid;");
    // A block taller than a page cannot honour the rule; it only pushes a blank
    // page ahead of itself.
    expect(css).not.toContain(".ai-executive-summary");
  });

  it("does not wrap a whole AI block in one page-break-avoid container", () => {
    // FULL leaves every report section falsy, so the only avoid-break markup
    // that could appear here is the three AI wrappers — the per-topic
    // avoid-break inside the sections.assessment guard is deliberately kept.
    const html = render(FULL);
    const body = html.slice(html.indexOf("</style>"));
    expect(body).not.toContain("avoid-break");
    // The blocks themselves must still render.
    expect(body).toContain("Recommended actions");
    expect(body).toContain("Compliance Gap Analysis");
    expect(body).toContain("Third-party risk analysis");
  });

  it("renders the action rationale and basis label", () => {
    const html = render({
      sectionSummaries: {},
      recommendedActions: [
        {
          action: "Assign owners to the 22 ownerless models",
          priority: "high",
          sourceSignal: "22 of 25 model rows have no owner",
          basis: "observed",
        },
      ],
    });

    expect(html).toContain("<th>Why</th>");
    expect(html).toContain("<th>Basis</th>");
    expect(html).toContain("22 of 25 model rows have no owner");
    expect(html).toContain(">observed<");
  });

  it("renders the top_risks table the riskAnalysis analyzer has always produced", () => {
    const html = render({
      sectionSummaries: {},
      riskHighlights: "Concentration risk dominates.",
      riskAnalysis: {
        narrative: "Concentration risk dominates.",
        top_risks: [
          { name: "Single model owner", level: "Very high risk", why: "25 of 25 models share one owner" },
        ],
      },
    });

    expect(html).toContain("Most material risks");
    expect(html).toContain("Single model owner");
    // The level is copied verbatim from the collectors, which suffix the
    // project/vendor enum with " risk". The chip palette has no
    // `.chip-very-high-risk`, so the suffix must come off the class name —
    // hence the closing quote, which a `chip-very-high-risk` would fail.
    expect(html).toContain('class="chip chip-very-high"');
    expect(html).toContain("25 of 25 models share one owner");
  });

  it("prints no top-risk table when the analyzer named no risks", () => {
    const html = render({
      sectionSummaries: {},
      riskAnalysis: { narrative: "Nothing material.", top_risks: [] },
    });
    expect(html).not.toContain("Most material risks");
  });

  it("renders gap basis and counterfactual, and the concern basis label", () => {
    const html = render({
      sectionSummaries: {},
      complianceGap: {
        narrative: "Two controls lack evidence.",
        scores_caveat: null,
        gaps: [
          {
            control: "Art. 9 Risk management",
            gap: "No documented review cadence",
            priority: "high",
            basis: "absent",
            what_would_close_this: "A dated review record against Art. 9",
          },
        ],
      },
      vendorRisk: {
        narrative: "One processor lacks a DPA.",
        concerns: [
          { vendor: "DataCorp", concern: "No DPA on file", severity: "high", basis: "inferred" },
        ],
      },
    });

    expect(html).toContain("<th>Basis</th>");
    expect(html).toContain(">absent<");
    expect(html).toContain("Closes when: A dated review record against Art. 9");
    // The gap basis has a labelled column; the concern basis is inline, so it
    // carries the label itself rather than trailing the severity unannounced.
    expect(html).toContain("(high, Basis: inferred)");
  });

  it("prints abstention reasons instead of leaving a silent hole", () => {
    const html = render({
      sectionSummaries: {},
      abstentions: {
        vendorRisk: "No vendors were in scope for this report.",
        riskAnalysis: "No risk rows were supplied.",
      },
    });

    expect(html).toContain("Analyses not produced");
    // Labels come from ANALYSIS_LABELS via render data, not from the template.
    expect(html).toContain("Third-party risk analysis");
    expect(html).toContain("No vendors were in scope for this report.");
    expect(html).toContain("Risk analysis");
    expect(html).toContain("No risk rows were supplied.");
  });

  it("prints no abstention block when every enabled analyzer produced output", () => {
    expect(render(FULL)).not.toContain("Analyses not produced");
  });

  it("the template compiles at all", () => {
    expect(() => render()).not.toThrow();
  });

  // The project-risk enum and the vendor-risk free text both carry a " risk"
  // suffix ('No risk' | 'Very low risk' | ... | 'Very high risk'), and the NIST
  // subcategory rows read that same project-risk column. pdf.css has no
  // `.chip-very-high-risk`, so a class built from the whole string colours
  // nothing. Every risk chip goes through one expression so the four tables
  // cannot drift apart again.
  describe("risk chip classes", () => {
    const projectRisks = (riskLevel: string) => ({
      totalRisks: 1,
      risksByLevel: [],
      risks: [
        {
          name: "Model drift",
          owner: "Jane Ops",
          impact: "Major",
          likelihood: "Likely",
          mitigationStatus: "In Progress",
          riskLevel,
        },
      ],
    });
    const vendorRisks = (riskLevel: string) => ({
      totalRisks: 1,
      risks: [{ vendorName: "DataCorp", riskName: "No DPA", riskLevel }],
    });
    const nistSubcategories = (riskLevel: string) => ({
      functions: [
        {
          name: "GOVERN",
          categories: [
            {
              name: "GOVERN 1",
              subcategories: [
                {
                  subcategoryId: "GV-1.1",
                  name: "Legal requirements are understood",
                  status: "Completed",
                  risks: [{ riskName: "Unmapped obligations", riskLevel }],
                },
              ],
            },
          ],
        },
      ],
    });

    it.each([
      ["projectRisks", projectRisks],
      ["vendorRisks", vendorRisks],
      ["nistSubcategories", nistSubcategories],
    ])("%s strips the ' risk' suffix before building the class", (key, build) => {
      const html = render(undefined, { [key]: build("Very high risk") } as never);
      expect(html).toContain('class="chip chip-very-high"');
      expect(html).not.toContain("chip-very-high-risk");
    });

    // model_risks is the one bare vocabulary ('Low' | 'Medium' | 'High' |
    // 'Critical'). It shares the expression so a fifth copy cannot drift, and
    // the suffix strip must leave a bare level alone.
    it("model risks keep their unsuffixed level", () => {
      const html = render(undefined, {
        modelRisks: {
          totalRisks: 1,
          risks: [
            {
              modelName: "gpt-4o",
              riskName: "Prompt injection",
              riskLevel: "Critical",
              mitigationStatus: "In Progress",
            },
          ],
        },
      } as never);
      expect(html).toContain('class="chip chip-critical"');
    });

    it("the AI top-risk table lands on the same class as the collector tables", () => {
      const html = render({
        sectionSummaries: {},
        riskAnalysis: {
          narrative: "Concentration risk dominates.",
          top_risks: [{ name: "Single approver", level: "Very high risk", why: "25 of 25" }],
        },
      });
      expect(html).toContain('class="chip chip-very-high"');
    });

    // The defect was never a wrong-looking class name, it was a class name with
    // no rule behind it. Assert against the real stylesheet rather than against
    // a second copy of the palette list.
    it("every level in the project-risk enum lands on a class pdf.css styles", () => {
      const css = fs.readFileSync(
        path.join(__dirname, "../../../templates/reports/styles/pdf.css"),
        "utf-8",
      );
      const levels = [
        "No risk",
        "Very low risk",
        "Low risk",
        "Medium risk",
        "High risk",
        "Very high risk",
        "Unknown", // the collectors' fallback for a NULL level
      ];
      for (const level of levels) {
        const html = render(undefined, { projectRisks: projectRisks(level) } as never);
        // Anchored on the chip's own text: the mitigation-status chip sits in
        // the same row and is not what this asserts.
        const emitted = new RegExp(`class="chip (chip-[a-z-]+)">${level}<`).exec(html);
        expect(emitted).not.toBeNull();
        expect(css).toContain(`.${emitted![1]} {`);
      }
    });

    it.each([
      ["Very low risk", "chip-very-low"],
      ["Medium risk", "chip-medium"],
      // 'No risk' has no palette entry of its own, and neither does the
      // collector's "Unknown" fallback for a NULL level. Both fall back to the
      // grey `chip-default`, which does have a rule, rather than to a class
      // name that renders as unstyled text.
      ["No risk", "chip-default"],
      ["Unknown", "chip-default"],
    ])("%s renders as %s", (level, expected) => {
      const html = render(undefined, { projectRisks: projectRisks(level) } as never);
      expect(html).toContain(`class="chip ${expected}"`);
    });
  });
});
