/**
 * @fileoverview Parity and sanity checks for the system policy template
 * library (VW-CQ-09).
 *
 * The seed migration inserts exactly what this module exports, so a drift
 * between Clients/public/data/PolicyTemplates.json (the canonical static
 * seed source) and SYSTEM_POLICY_TEMPLATES would mean the DB library and the
 * static file disagree — the failure these checks exist to prevent.
 *
 * @module tests/systemPolicyTemplates
 */

import * as fs from "fs";
import * as path from "path";

const { SYSTEM_POLICY_TEMPLATES } = require("../systemPolicyTemplates.js");

const CANONICAL_CATEGORIES = [
  "Core AI governance policies",
  "Model lifecycle policies",
  "Data and security AI policies",
  "Legal and compliance",
  "People and organization",
  "Industry packs",
];

type Template = {
  id: number;
  name: string;
  description: string;
  content: string;
  tags: string[];
  category: string;
};

const templates: Template[] = SYSTEM_POLICY_TEMPLATES;

const staticJsonPath = path.join(__dirname, "../../../../Clients/public/data/PolicyTemplates.json");

describe("the library ships the 15 static templates", () => {
  it("has 15 templates", () => {
    expect(templates.length).toBe(15);
  });

  it("stays in sync with Clients/public/data/PolicyTemplates.json", () => {
    const staticTemplates = JSON.parse(fs.readFileSync(staticJsonPath, "utf-8"));
    expect(staticTemplates.length).toBe(templates.length);
    const byId = new Map(templates.map((t) => [t.id, t]));
    for (const s of staticTemplates) {
      const seeded = byId.get(s.id);
      if (!seeded) throw new Error(`template id ${s.id} missing from the seeder module`);
      expect(seeded).toBeDefined();
      expect(seeded!.name).toBe(s.title);
      expect(seeded!.description).toBe(s.description);
      expect(seeded!.content).toBe(s.content);
      expect(seeded!.tags).toEqual(s.tags);
      expect(seeded!.category).toBe(s.category);
    }
  });

  it("has unique ids", () => {
    expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length);
  });

  it("has unique names", () => {
    // policy_templates carries a unique-name index per organization and the
    // system rows share organization_id NULL (COALESCE(organization_id, 0)).
    expect(new Set(templates.map((t) => t.name)).size).toBe(templates.length);
  });

  it("has unique non-empty categories from the advisor's canonical list", () => {
    const categories = new Set(templates.map((t) => t.category));
    expect(categories.size).toBeGreaterThan(1);
    for (const c of categories) {
      expect(CANONICAL_CATEGORIES).toContain(c);
    }
  });

  it("every template carries content and at least one tag", () => {
    for (const t of templates) {
      expect(t.content.length).toBeGreaterThan(0);
      expect(t.tags.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it("content is HTML like policy_manager content_html", () => {
    for (const t of templates) {
      expect(t.content).toMatch(/<\w+>/);
    }
  });
});
