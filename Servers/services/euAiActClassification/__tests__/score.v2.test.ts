// Servers/services/euAiActClassification/__tests__/score.v2.test.ts
import { describe, it, expect } from "@jest/globals";
import { scoreV2 } from "../score.v2";
import { Answers } from "../types";

const BASE: Answers = {
  scope: "in_scope",
  role: "deployer",
  art5_practices: ["none"],
  rbi_law_enforcement: "no",
  intimate_content: "no",
  safety_function: "no",
  annex_iii_areas: ["none"],
  transparency: ["none"],
};
const BEFORE_OMNIBUS = new Date("2026-12-01T12:00:00Z");
const AFTER_OMNIBUS = new Date("2026-12-02T12:00:00Z");
const score = (overrides: Answers, now = AFTER_OMNIBUS) => scoreV2({ ...BASE, ...overrides }, now);

describe("scoreV2", () => {
  it("research-only systems are out of scope", () => {
    const result = scoreV2({ scope: "research_only" });
    expect(result.level).toBe("Out of scope");
    expect(result.role).toBeNull();
    expect(result.obligations).toEqual([]);
  });

  it("a system with nothing to report is minimal risk with AI literacy", () => {
    const result = score({});
    expect(result.level).toBe("Minimal risk");
    expect(result.role).toBe("Deployer");
    expect(result.obligations.map((o) => o.article)).toContain("Article 4");
  });

  it.each([
    "manipulation",
    "exploit_vulnerabilities",
    "social_scoring",
    "crime_prediction",
    "facial_scraping",
    "emotion_workplace_education",
    "biometric_categorisation",
  ])("Article 5 practice %s is prohibited", (practice) => {
    expect(score({ art5_practices: [practice] }).level).toBe("Prohibited");
  });

  // Regression: the old wizard prohibited real-time biometric identification
  // outside law enforcement and made it high risk inside.
  it("real-time remote biometric identification for law enforcement without an objective is prohibited", () => {
    expect(score({ rbi_law_enforcement: "yes", rbi_objective: "none" }).level).toBe("Prohibited");
  });

  it("real-time remote biometric identification for an authorised objective is high risk", () => {
    expect(score({ rbi_law_enforcement: "yes", rbi_objective: "victims_missing" }).level).toBe(
      "High risk",
    );
  });

  it("intimate content without safeguards is prohibited, with the start date before 2 Dec 2026", () => {
    const before = score(
      { intimate_content: "yes", intimate_content_safeguards: "no" },
      BEFORE_OMNIBUS,
    );
    const after = score(
      { intimate_content: "yes", intimate_content_safeguards: "no" },
      AFTER_OMNIBUS,
    );
    expect(before.level).toBe("Prohibited");
    expect(after.level).toBe("Prohibited");
    expect(before.reasons[0].text).toMatch(/^Prohibited from 2 December 2026/);
    expect(after.reasons[0].text).not.toMatch(/^Prohibited from/);
    expect(before.reasons[0].appliesFrom).toBe("2026-12-02");
  });

  it("intimate content with safeguards is not prohibited", () => {
    expect(score({ intimate_content: "yes", intimate_content_safeguards: "yes" }).level).toBe(
      "Minimal risk",
    );
  });

  it.each(["section_a", "section_b"])(
    "an Annex I product (%s) is high risk from 2 Aug 2028",
    (section) => {
      const result = score({ safety_function: section });
      expect(result.level).toBe("High risk");
      expect(result.reasons[0].appliesFrom).toBe("2028-08-02");
    },
  );

  it.each([
    ["biometrics", "biometrics_use", "remote_identification"],
    ["critical_infrastructure", "critical_infrastructure_use", "safety_component"],
    ["education", "education_use", "admission"],
    ["employment", "employment_use", "recruitment"],
    ["essential_services", "essential_services_use", "creditworthiness"],
    ["law_enforcement", "law_enforcement_use", "victim_risk"],
    ["migration", "migration_use", "application_examination"],
    ["justice_democracy", "justice_democracy_use", "election_influence"],
  ])("Annex III area %s with use %s is high risk from 2 Dec 2027", (area, question, use) => {
    const result = score({
      annex_iii_areas: [area],
      [question]: [use],
      profiling: "no",
      derogation: "none",
    });
    expect(result.level).toBe("High risk");
    expect(result.reasons.some((r) => r.appliesFrom === "2027-12-02")).toBe(true);
  });

  it.each([
    ["biometrics", "biometrics_use", "verification_only"],
    ["essential_services", "essential_services_use", "fraud_detection"],
    ["migration", "migration_use", "travel_document_verification"],
    ["justice_democracy", "justice_democracy_use", "campaign_logistics"],
  ])("the %s carve-out %s is not high risk and is explained", (area, question, use) => {
    const result = score({ annex_iii_areas: [area], [question]: [use] });
    expect(result.level).toBe("Minimal risk");
    expect(result.reasons.some((r) => r.text.includes("excluded"))).toBe(true);
  });

  // Regression: the old wizard gave High for any decision domain, including "other".
  it("another use in an Annex III area is not high risk", () => {
    expect(score({ annex_iii_areas: ["employment"], employment_use: ["other"] }).level).toBe(
      "Minimal risk",
    );
  });

  // Regression: the old wizard gave High to any critical-infrastructure deployer.
  it("a critical-infrastructure organisation using AI outside a safety function is not high risk", () => {
    expect(
      score({
        annex_iii_areas: ["critical_infrastructure"],
        critical_infrastructure_use: ["other"],
      }).level,
    ).toBe("Minimal risk");
  });

  it("a high-risk use selected alongside a carve-out is still high risk and the carve-out is noted", () => {
    const result = score({
      annex_iii_areas: ["essential_services"],
      essential_services_use: ["fraud_detection", "creditworthiness"],
      profiling: "no",
      derogation: "none",
    });
    expect(result.level).toBe("High risk");
    expect(result.reasons.some((r) => r.article === "Annex III, point 5(b)")).toBe(true);
  });

  it("a carve-out selected alone is not high risk", () => {
    const result = score({
      annex_iii_areas: ["essential_services"],
      essential_services_use: ["fraud_detection"],
    });
    expect(result.level).toBe("Minimal risk");
  });

  it("profiling keeps an Annex III system high risk", () => {
    const result = score({
      annex_iii_areas: ["employment"],
      employment_use: ["recruitment"],
      profiling: "yes",
    });
    expect(result.level).toBe("High risk");
    expect(result.reasons[0].text).toContain("profiles");
  });

  it("an Article 6(3) derogation is not high risk but must be documented and registered", () => {
    const result = score({
      role: "provider",
      annex_iii_areas: ["employment"],
      employment_use: ["recruitment"],
      profiling: "no",
      derogation: "narrow_procedural",
    });
    expect(result.level).toBe("Minimal risk");
    expect(result.obligations.map((o) => o.article)).toEqual(
      expect.arrayContaining(["Article 6(4)", "Article 49(2)"]),
    );
  });

  it("transparency triggers make it limited risk with role-specific obligations", () => {
    const provider = score({ role: "provider", transparency: ["interacts", "generates"] });
    const deployer = score({ role: "deployer", transparency: ["deepfake"] });
    expect(provider.level).toBe("Limited risk");
    expect(provider.obligations.map((o) => o.article)).toEqual(
      expect.arrayContaining(["Article 50(1)", "Article 50(2)"]),
    );
    expect(deployer.obligations.map((o) => o.article)).toContain("Article 50(4)");
    expect(deployer.obligations.map((o) => o.article)).not.toContain("Article 50(1)");
  });

  it("a high-risk system keeps its level and adds transparency obligations", () => {
    const result = score({
      safety_function: "section_a",
      role: "provider",
      transparency: ["interacts"],
    });
    expect(result.level).toBe("High risk");
    expect(result.obligations.map((o) => o.article)).toEqual(
      expect.arrayContaining(["Article 9", "Article 50(1)"]),
    );
  });

  it("high-risk obligations differ for providers and deployers", () => {
    const provider = score({ role: "provider", safety_function: "section_a" });
    const deployer = score({ role: "deployer", safety_function: "section_a" });
    expect(provider.obligations.map((o) => o.article)).toContain("Article 43(3)");
    expect(deployer.obligations.map((o) => o.article)).toContain("Article 26(1)");
    expect(deployer.obligations.map((o) => o.article)).not.toContain("Article 43(3)");
  });

  it("the Omnibus ban switches exactly at 2 December 2026 00:00 UTC", () => {
    const answers = { intimate_content: "yes", intimate_content_safeguards: "no" };
    const lastSecond = score(answers, new Date("2026-12-01T23:59:59Z"));
    const firstSecond = score(answers, new Date("2026-12-02T00:00:00Z"));
    expect(lastSecond.level).toBe("Prohibited");
    expect(firstSecond.level).toBe("Prohibited");
    expect(lastSecond.reasons[0].text).toMatch(/^Prohibited from 2 December 2026/);
    expect(firstSecond.reasons[0].text).not.toMatch(/^Prohibited from/);
  });

  it("an upcoming Omnibus ban alone says the obligation applies from 2 December 2026", () => {
    const answers = { intimate_content: "yes", intimate_content_safeguards: "no" };
    const before = score(answers, BEFORE_OMNIBUS);
    const after = score(answers, AFTER_OMNIBUS);
    expect(before.obligations).toEqual([
      expect.objectContaining({ article: "Article 5", appliesFrom: "2026-12-02" }),
    ]);
    expect(before.obligations[0].text).toMatch(/^From 2 December 2026/);
    expect(after.obligations[0].text).not.toMatch(/2 December 2026/);
    const withArticle5 = score({ ...answers, art5_practices: ["manipulation"] }, BEFORE_OMNIBUS);
    expect(withArticle5.obligations[0].text).not.toMatch(/2 December 2026/);
  });

  describe("high-risk obligations follow the route", () => {
    const articles = (r: { obligations: { article: string }[] }) =>
      r.obligations.map((o) => o.article);

    it.each(["provider", "deployer"])(
      "Annex I Section B (%s) only meets the sectoral legislation requirements",
      (role) => {
        const result = score({ role, safety_function: "section_b" });
        const high = result.obligations.filter((o) => o.article !== "Article 4");
        expect(high).toEqual([
          {
            article: "Article 2(2) and Articles 102-109",
            text: "Meet the AI requirements set through the product's sectoral legislation.",
            appliesFrom: "2028-08-02",
          },
        ]);
        expect(articles(result).some((a) => /^Article (9|43|49|26)/.test(a))).toBe(false);
      },
    );

    it("Annex I Section A providers do not register and use the sectoral conformity procedure", () => {
      const result = score({ role: "provider", safety_function: "section_a" });
      expect(articles(result).some((a) => a.startsWith("Article 49"))).toBe(false);
      expect(articles(result)).toContain("Article 43(3)");
      expect(articles(result)).not.toContain("Article 43");
      expect(result.obligations.find((o) => o.article === "Article 9")?.appliesFrom).toBe(
        "2028-08-02",
      );
    });

    it("Annex I deployers have no Article 26(11) or 27 duties", () => {
      const result = score({ role: "deployer", safety_function: "section_a" });
      expect(articles(result)).toContain("Article 26(1)");
      expect(articles(result)).not.toContain("Article 26(11)");
      expect(articles(result)).not.toContain("Article 27");
    });

    const criticalInfrastructure = {
      annex_iii_areas: ["critical_infrastructure"],
      critical_infrastructure_use: ["safety_component"],
      profiling: "no",
      derogation: "none",
    };

    it("Annex III point 2 providers register at national level", () => {
      const result = score({ role: "provider", ...criticalInfrastructure });
      expect(articles(result)).toContain("Article 49(5)");
      expect(articles(result)).not.toContain("Article 49(1)");
      expect(result.obligations.find((o) => o.article === "Article 9")?.appliesFrom).toBe(
        "2027-12-02",
      );
    });

    it("other Annex III providers register in the EU database", () => {
      const result = score({
        role: "provider",
        annex_iii_areas: ["employment"],
        employment_use: ["recruitment"],
        profiling: "no",
        derogation: "none",
      });
      expect(articles(result)).toEqual(
        expect.arrayContaining(["Article 9", "Article 43", "Article 49(1)", "Article 72"]),
      );
      expect(articles(result)).not.toContain("Article 49(5)");
    });

    it("Annex III deployers inform affected people and assess fundamental rights", () => {
      const result = score({
        role: "deployer",
        annex_iii_areas: ["employment"],
        employment_use: ["recruitment"],
        profiling: "no",
        derogation: "none",
      });
      expect(articles(result)).toEqual(expect.arrayContaining(["Article 26(11)", "Article 27"]));
    });

    it("Annex III point 2 deployers have no fundamental rights impact assessment (Article 27(1))", () => {
      const result = score({ role: "deployer", ...criticalInfrastructure });
      expect(articles(result)).toContain("Article 26(11)");
      expect(articles(result)).not.toContain("Article 27");
    });

    it("the RBI route is an Annex III route", () => {
      const result = score({
        role: "deployer",
        rbi_law_enforcement: "yes",
        rbi_objective: "victims_missing",
      });
      expect(articles(result)).toEqual(expect.arrayContaining(["Article 26(11)", "Article 27"]));
    });

    it("each matched route adds its obligations once, with its own date", () => {
      const result = score({
        role: "provider",
        rbi_law_enforcement: "yes",
        rbi_objective: "victims_missing",
        safety_function: "section_a",
      });
      const list = articles(result);
      expect(list.filter((a) => a === "Article 9")).toHaveLength(1);
      expect(list).toEqual(
        expect.arrayContaining(["Article 43", "Article 43(3)", "Article 49(1)"]),
      );
      expect(result.obligations.find((o) => o.article === "Article 49(1)")?.appliesFrom).toBe(
        "2027-12-02",
      );
      expect(result.obligations.find((o) => o.article === "Article 43(3)")?.appliesFrom).toBe(
        "2028-08-02",
      );
    });
  });

  it("an Article 6(3) derogation is ignored when the RBI route makes the system high risk", () => {
    const result = score({
      role: "provider",
      rbi_law_enforcement: "yes",
      rbi_objective: "victims_missing",
      annex_iii_areas: ["biometrics"],
      biometrics_use: ["remote_identification"],
      profiling: "no",
      derogation: "narrow_procedural",
    });
    expect(result.level).toBe("High risk");
    expect(result.reasons.some((r) => r.text.includes("not high risk"))).toBe(false);
    expect(result.obligations.map((o) => o.article)).not.toEqual(
      expect.arrayContaining(["Article 6(4)"]),
    );
    expect(result.obligations.map((o) => o.article)).not.toContain("Article 49(2)");
  });
});
