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

describe("field validity", () => {
  it.each(templates.map((t) => [t.slug, t] as const))("%s has valid enum fields", (_slug, t) => {
    expect(CANONICAL_CATEGORIES).toContain(t.category);
    expect(FREQUENCIES).toContain(t.recommendedFrequency);
    expect(SCOPES).toContain(t.defaultScope);
    for (const f of t.frameworkNames) expect(KNOWN_FRAMEWORKS).toContain(f);
    expect(t.sections.some((s) => s.defaultEnabled !== false)).toBe(true);
  });
});
