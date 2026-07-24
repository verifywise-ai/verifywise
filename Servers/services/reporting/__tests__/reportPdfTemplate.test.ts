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

const TEMPLATE_PATH = path.join(__dirname, "../../../templates/reports/report-pdf.ejs");
const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");

const SECTION_KEYS: Array<keyof ReportData["sections"]> = [
  "projectRisks", "vendorRisks", "modelRisks", "compliance", "assessment",
  "clausesAndAnnexes", "nistSubcategories", "vendors", "models",
  "trainingRegistry", "policyManager", "incidentManagement",
];

function render(aiSummaries?: AISummaries): string {
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
    sections: Object.fromEntries(SECTION_KEYS.map((k) => [k, false])) as unknown as ReportData["sections"],
    aiSummaries,
    include: () => "",
  } satisfies Omit<ReportData, "aiSummaries"> & { aiSummaries?: AISummaries; include: (p: string) => string };
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
    expect(html).toContain("observed");
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

  it("the template compiles at all", () => {
    expect(() => render()).not.toThrow();
  });
});
