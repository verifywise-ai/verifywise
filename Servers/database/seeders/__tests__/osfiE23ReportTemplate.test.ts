/**
 * @fileoverview Checks on the OSFI E-23 completeness system template seed.
 *
 * The migration inlines its parameter fields as JSON because migrations run
 * from plain JavaScript and must not import TypeScript. These checks keep that
 * copy equal to E23_PARAMETER_FIELDS and keep the seeded sections inside the
 * catalog and its kind gates.
 *
 * @module tests/osfiE23ReportTemplate
 */

import { E23_KIND, E23_PARAMETER_FIELDS } from "../../../services/reporting/e23/e23Parameters";
import {
  REPORT_SECTION_CATALOG,
  SECTION_KEYS,
  kindViolations,
} from "../../../services/reporting/sectionCatalog";

const {
  E23_TEMPLATE,
} = require("../../migrations/20261122130000-seed-osfi-e23-report-template.js");
const { SYSTEM_REPORT_TEMPLATES } = require("../systemReportTemplates.js");

type Section = { reportSectionKey: string; defaultEnabled: boolean; supportedScopes: string[] };

const kindGatedKeys = REPORT_SECTION_CATALOG.filter((e) => e.kinds).map((e) => e.key);
const sectionKeys = (sections: Section[]) => sections.map((s) => s.reportSectionKey);

describe("OSFI E-23 completeness template seed", () => {
  it("inlines exactly E23_PARAMETER_FIELDS, with the osfi_e23 kind", () => {
    expect(E23_TEMPLATE.parametersConfig).toEqual({ kind: E23_KIND, fields: E23_PARAMETER_FIELDS });
  });

  it("seeds only section keys that exist in the catalog", () => {
    for (const key of sectionKeys(E23_TEMPLATE.sections)) {
      expect(SECTION_KEYS).toContain(key);
    }
  });

  it("passes the kind gate for its own kind", () => {
    expect(kindViolations(sectionKeys(E23_TEMPLATE.sections), E23_KIND)).toEqual([]);
  });

  it("turns on the five E-23 sections and leaves the inventory appendix off", () => {
    const enabled = E23_TEMPLATE.sections
      .filter((s: Section) => s.defaultEnabled)
      .map((s: Section) => s.reportSectionKey);
    expect(enabled).toEqual([
      "frameworkRequirements",
      "mrmFleet",
      "e23Contradictions",
      "e23FixItList",
      "signOff",
    ]);
    const appendix = E23_TEMPLATE.sections.find(
      (s: Section) => s.reportSectionKey === "mrmInventoryAppendix",
    );
    expect(appendix?.defaultEnabled).toBe(false);
  });

  it("offers organization scope only", () => {
    expect(E23_TEMPLATE.defaultScope).toBe("organization");
    expect(E23_TEMPLATE.supportedScopes).toEqual(["organization"]);
    for (const s of E23_TEMPLATE.sections as Section[]) {
      expect(s.supportedScopes).toEqual(["organization"]);
    }
  });

  it("selects the bundled E-23 framework and recommends a quarterly run", () => {
    expect(E23_TEMPLATE.frameworkConfig).toEqual({ frameworkIds: ["native:26"] });
    expect(E23_TEMPLATE.recommendedFrequency).toBe("quarterly");
  });

  it("turns on executive summary, key findings, recommended actions and the E-23 gap analysis only", () => {
    const on = Object.keys(E23_TEMPLATE.ai)
      .filter((k) => E23_TEMPLATE.ai[k])
      .sort();
    expect(on).toEqual(["e23Gap", "executiveSummary", "keyFindings", "recommendedActions"]);
  });
});

describe("kind-gated sections and blocks stay in the E-23 template", () => {
  it("no library template uses a kind-gated section", () => {
    for (const t of SYSTEM_REPORT_TEMPLATES) {
      const gated = sectionKeys(t.sections).filter((k) => kindGatedKeys.includes(k));
      expect(gated.length === 0 || `${t.slug} uses ${gated.join(", ")}`).toBe(true);
    }
  });

  it("no library template turns on the E-23 gap analysis", () => {
    for (const t of SYSTEM_REPORT_TEMPLATES) {
      expect(t.ai.e23Gap === true ? `${t.slug} turns on e23Gap` : true).toBe(true);
    }
  });

  it("does not reuse a library slug or name", () => {
    expect(SYSTEM_REPORT_TEMPLATES.map((t: { slug: string }) => t.slug)).not.toContain(
      E23_TEMPLATE.slug,
    );
    expect(SYSTEM_REPORT_TEMPLATES.map((t: { name: string }) => t.name)).not.toContain(
      E23_TEMPLATE.name,
    );
  });
});
