/**
 * @fileoverview The two mechanical checks the system template library must
 * pass before it may be seeded.
 *
 * These are not style checks. A template whose gated section no selected
 * framework opens renders empty and silent, and a 21-template migration is
 * expensive to unwind once installs have run it.
 *
 * @module tests/systemReportTemplates
 */

import * as fs from "fs";
import * as path from "path";

const { SYSTEM_REPORT_TEMPLATES, FRAMEWORK_SECTION_GATES } = require("../systemReportTemplates.js");

const CANONICAL_CATEGORIES = ["executive", "compliance", "risk", "operational", "governance"];
const FREQUENCIES = ["daily", "weekly", "monthly"];
const SCOPES = ["project", "organization"];
const KNOWN_FRAMEWORKS = ["EU AI Act", "ISO 42001", "ISO 27001", "NIST AI RMF"];

type Template = {
  name: string;
  slug: string;
  category: string;
  defaultScope: string;
  recommendedFrequency: string;
  frameworkNames: string[];
  sections: Array<{ reportSectionKey: string; defaultEnabled: boolean }>;
  ai: Record<string, boolean>;
};

const templates: Template[] = SYSTEM_REPORT_TEMPLATES;

const enabledSectionKeys = (t: Template) =>
  Array.from(
    new Set(t.sections.filter((s) => s.defaultEnabled !== false).map((s) => s.reportSectionKey)),
  ).sort();

describe("the library ships at least 20 templates", () => {
  it("has 21", () => {
    expect(templates.length).toBe(21);
  });

  it("has unique slugs", () => {
    expect(new Set(templates.map((t) => t.slug)).size).toBe(templates.length);
  });

  it("has unique names", () => {
    // report_templates carries a unique-name constraint per organization and
    // the system rows share organization_id NULL.
    expect(new Set(templates.map((t) => t.name)).size).toBe(templates.length);
  });
});

describe("check 1: every template is a different report", () => {
  it("no two templates share a section set", () => {
    const seen = new Map<string, string>();
    for (const t of templates) {
      const key = enabledSectionKeys(t).join("+");
      const clash = seen.get(key);
      expect(clash === undefined || `${clash} and ${t.slug} share sections: ${key}`).toBe(true);
      seen.set(key, t.slug);
    }
  });

  it("no two templates share a full configuration tuple", () => {
    const tuple = (t: Template) =>
      JSON.stringify([
        enabledSectionKeys(t),
        [...t.frameworkNames].sort(),
        t.defaultScope,
        t.recommendedFrequency,
        Object.keys(t.ai)
          .filter((k) => t.ai[k])
          .sort(),
      ]);
    expect(new Set(templates.map(tuple)).size).toBe(templates.length);
  });
});

describe("check 2: every gated section is reachable from its frameworks", () => {
  it.each(templates.map((t) => [t.slug, t] as const))(
    "%s reaches every framework-gated section it enables",
    (_slug, t) => {
      for (const sectionKey of enabledSectionKeys(t)) {
        const openedBy = (FRAMEWORK_SECTION_GATES as Record<string, string[]>)[sectionKey];
        if (!openedBy) continue; // not framework-gated
        // An empty selection means every framework in scope, so every gate opens.
        if (t.frameworkNames.length === 0) continue;
        expect({
          section: sectionKey,
          selected: t.frameworkNames,
          needsOneOf: openedBy,
          reachable: t.frameworkNames.some((f) => openedBy.includes(f)),
        }).toMatchObject({ reachable: true });
      }
    },
  );
});

/**
 * Check 2 asks "does some framework in this template's selection open the
 * gate". It cannot ask "and does anything then READ that framework's data" —
 * and that is the gap that let templates #7 and #8 ship.
 *
 * FRAMEWORK_SECTION_GATES used to mirror collectAllData's NUMERIC gate
 * (`frameworkId === 2 || frameworkId === 3` for clausesAndAnnexes) rather than
 * the query layer under it. Framework 3 was routed to the ISO 42001 queries,
 * which read clauses_struct_iso / subclauses_iso / annexcategories_iso — an
 * ISO 27001 pairing id matches nothing in those tenant tables. So check 2
 * certified an "ISO 27001 Control Status Report" that rendered an ISO 42001
 * clause skeleton with no statuses, and check 1 waved through an
 * "ISO 42001 + 27001 Coverage" template that printed that skeleton twice.
 *
 * A gate is a promise that the collector can serve the section for that
 * framework. This check makes the promise falsifiable: every framework a gate
 * names must have a query somewhere in the collector's own two source files
 * that reads a table belonging to THAT framework.
 *
 * Source-text assertions on purpose. The alternative — running the collector —
 * needs a database, and the whole failure being pinned is that the queries ran
 * fine and returned nothing.
 */
describe("check 3: every framework a gate names has a query path of its own", () => {
  const serversRoot = path.join(__dirname, "../../..");
  const collectorSource = [
    fs.readFileSync(path.join(serversRoot, "services/reporting/dataCollector.ts"), "utf-8"),
    fs.readFileSync(path.join(serversRoot, "utils/reporting.utils.ts"), "utf-8"),
  ].join("\n");

  /**
   * A tenant table (holding per-pairing STATUS, not just the shared struct)
   * that only this framework has rows in.
   *
   * \b-anchored: "subclauses_iso" is a prefix of "subclauses_iso27001", so a
   * plain substring test for ISO 42001 would be satisfied by the ISO 27001
   * tables and vice versa — precisely the confusion this check exists to catch.
   */
  const FRAMEWORK_OWN_TABLES: Record<string, string[]> = {
    "EU AI Act": ["controls_eu", "answers_eu"],
    "ISO 42001": ["subclauses_iso", "annexcategories_iso"],
    "ISO 27001": ["subclauses_iso27001", "annexcontrols_iso27001"],
    "NIST AI RMF": ["nist_ai_rmf_subcategories"],
  };

  const gatedFrameworks = Array.from(
    new Set(Object.values(FRAMEWORK_SECTION_GATES as Record<string, string[]>).flat()),
  );

  it.each(gatedFrameworks)("%s is read from its own tables", (framework) => {
    const tables = FRAMEWORK_OWN_TABLES[framework];
    // An unlisted framework is a gate naming something this check cannot
    // verify. Fail rather than skip: silence is what shipped the bug.
    expect(tables).toBeDefined();

    for (const table of tables) {
      expect({
        framework,
        table,
        read: new RegExp(`\\b${table}\\b`).test(collectorSource),
      }).toMatchObject({ read: true });
    }
  });

  it("routes ISO 27001 pairings away from the ISO 42001 queries", () => {
    // The gate is numeric (frameworkId 2 or 3 both open clausesAndAnnexes), so
    // the tables above can all be present while framework 3 still walks into
    // getClausesReportQuery. Pin the branch itself.
    const dataCollector = fs.readFileSync(
      path.join(serversRoot, "services/reporting/dataCollector.ts"),
      "utf-8",
    );
    expect(dataCollector).toContain("getClausesReportQueryISO27001");
    expect(dataCollector).toContain("getAnnexesReportQueryISO27001");
  });
});

describe("field validity", () => {
  it.each(templates.map((t) => [t.slug, t] as const))("%s has valid enum fields", (_slug, t) => {
    expect(CANONICAL_CATEGORIES).toContain(t.category);
    expect(FREQUENCIES).toContain(t.recommendedFrequency);
    expect(SCOPES).toContain(t.defaultScope);
    for (const f of t.frameworkNames) expect(KNOWN_FRAMEWORKS).toContain(f);
    expect(t.sections.some((s) => s.defaultEnabled !== false)).toBe(true);
  });
});
