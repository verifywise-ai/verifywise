import {
  LOOKBACK_MONTHS,
  NO_DOMAIN_NOTE,
  monthsBefore,
  planCategories,
  researchableCategories,
} from "../categories";
import { ResearchTarget } from "../target";

// A fixed instant, written in UTC so that the tests do not depend on the machine's time zone.
const NOW = new Date("2026-10-10T12:00:00Z");

const target: ResearchTarget = { name: "Acme", domain: "acme.com", provides: "Cloud hosting" };

describe("NO_DOMAIN_NOTE", () => {
  it("is the stored phrase for a category skipped for want of a domain", () => {
    expect(NO_DOMAIN_NOTE).toBe("Vendor website is missing or not a valid domain");
  });
});

describe("monthsBefore", () => {
  it("gives the same day of the month, the given number of months earlier", () => {
    expect(monthsBefore(new Date("2031-04-20T12:00:00Z"), 24)).toBe("2029-04-20");
  });

  it("gives the last day of a shorter month for a day it does not have", () => {
    expect(monthsBefore(new Date("2028-02-29T00:00:00Z"), 24)).toBe("2026-02-28");
  });
});

describe("LOOKBACK_MONTHS", () => {
  it("gives each category its window in months", () => {
    expect(LOOKBACK_MONTHS).toEqual({
      security_incidents: 24,
      certifications: 24,
      legal_regulatory: 36,
      ai_specific: 24,
    });
  });
});

describe("researchableCategories", () => {
  it("gives all four categories, in category order, for a target with a domain", () => {
    expect(researchableCategories(target)).toEqual([
      "security_incidents",
      "certifications",
      "legal_regulatory",
      "ai_specific",
    ]);
  });

  it.each([[null], [""]])("gives only the two news categories when the domain is %p", (domain) => {
    expect(researchableCategories({ ...target, domain })).toEqual([
      "security_incidents",
      "legal_regulatory",
    ]);
  });
});

function plansByCategory(result: ReturnType<typeof planCategories>) {
  return Object.fromEntries(result.plans.map((plan) => [plan.category, plan]));
}

describe("planCategories", () => {
  it("plans the four categories in a fixed order and skips nothing when there is a domain", () => {
    const { plans, skipped } = planCategories(target, NOW);

    expect(plans.map((plan) => plan.category)).toEqual([
      "security_incidents",
      "certifications",
      "legal_regulatory",
      "ai_specific",
    ]);
    expect(skipped).toEqual([]);
  });

  it("builds each query as the design specifies, with the vendor name substituted", () => {
    const byCategory = plansByCategory(planCategories(target, NOW));

    expect(byCategory.security_incidents.query).toBe(
      '"Acme" data breach OR security incident OR ransomware OR "security vulnerability"',
    );
    expect(byCategory.certifications.query).toBe(
      "Acme SOC 2 ISO 27001 ISO 42001 certification security trust",
    );
    expect(byCategory.legal_regulatory.query).toBe(
      '"Acme" fine OR lawsuit OR "regulatory action" OR settlement OR enforcement',
    );
    expect(byCategory.ai_specific.query).toBe(
      "Acme AI customer data training privacy policy subprocessors model provider",
    );
  });

  it("gives the news categories a topic and a start date, and the others the vendor's domain", () => {
    const byCategory = plansByCategory(planCategories(target, NOW));

    expect(byCategory.security_incidents.options).toEqual({
      maxResults: 5,
      topic: "news",
      startDate: "2024-10-10",
      timeoutMs: 15000,
    });
    expect(byCategory.legal_regulatory.options).toEqual({
      maxResults: 5,
      topic: "news",
      startDate: "2023-10-10",
      timeoutMs: 15000,
    });
    expect(byCategory.certifications.options).toEqual({
      maxResults: 5,
      includeDomains: ["acme.com"],
      domainsMode: "prefer",
      timeoutMs: 15000,
    });
    expect(byCategory.ai_specific.options).toEqual({
      maxResults: 5,
      includeDomains: ["acme.com"],
      domainsMode: "prefer",
      timeoutMs: 15000,
    });
  });

  it("gives every plan its own domain list, so that one cannot change another", () => {
    const { plans } = planCategories(target, NOW);
    const [, certifications, , aiSpecific] = plans;

    expect(certifications.options.includeDomains).not.toBe(aiSpecific.options.includeDomains);
    certifications.options.includeDomains?.push("evil.test");
    expect(aiSpecific.options.includeDomains).toEqual(["acme.com"]);
  });

  describe("without a usable domain", () => {
    it.each([[null], [""]])("runs only the two news categories when the domain is %p", (domain) => {
      const { plans, skipped } = planCategories({ ...target, domain }, NOW);

      expect(plans.map((plan) => plan.category)).toEqual([
        "security_incidents",
        "legal_regulatory",
      ]);
      expect(skipped).toEqual([
        { category: "certifications", outcome: "skipped", note: NO_DOMAIN_NOTE },
        { category: "ai_specific", outcome: "skipped", note: NO_DOMAIN_NOTE },
      ]);
    });

    it("leaves the news plans exactly as they are with a domain", () => {
      const withDomain = planCategories(target, NOW).plans;
      const withoutDomain = planCategories({ ...target, domain: null }, NOW).plans;

      expect(withoutDomain).toEqual([withDomain[0], withDomain[2]]);
    });
  });

  describe("a vendor name that contains double quotes", () => {
    it("removes them from every query, so that they cannot close the phrase early", () => {
      const quoted = planCategories({ ...target, name: 'Acme "Pro"' }, NOW);
      const byCategory = plansByCategory(quoted);

      expect(byCategory.security_incidents.query).toBe(
        '"Acme Pro" data breach OR security incident OR ransomware OR "security vulnerability"',
      );
      expect(byCategory.legal_regulatory.query).toBe(
        '"Acme Pro" fine OR lawsuit OR "regulatory action" OR settlement OR enforcement',
      );
      expect(byCategory.certifications.query).toBe(
        "Acme Pro SOC 2 ISO 27001 ISO 42001 certification security trust",
      );
      expect(byCategory.ai_specific.query).toBe(
        "Acme Pro AI customer data training privacy policy subprocessors model provider",
      );
    });

    it("leaves no stray space where a quote stood", () => {
      const byCategory = plansByCategory(
        planCategories({ ...target, name: ' "Acme"  Pro " ' }, NOW),
      );

      expect(byCategory.security_incidents.query.startsWith('"Acme Pro" data breach')).toBe(true);
      expect(byCategory.certifications.query.startsWith("Acme Pro SOC 2")).toBe(true);
    });
  });

  it("does not change the target it is given", () => {
    const frozen = Object.freeze({ ...target, name: 'Acme "Pro"' });

    expect(() => planCategories(frozen, NOW)).not.toThrow();
    expect(frozen.name).toBe('Acme "Pro"');
  });

  describe("start dates", () => {
    // 24 and 36 months are whole years, so the only day that can be missing in the target month is
    // 29 February.
    it.each([
      ["2028-02-29T09:00:00Z", "2026-02-28", "2025-02-28"],
      ["2024-02-29T09:00:00Z", "2022-02-28", "2021-02-28"],
      ["2032-02-29T09:00:00Z", "2030-02-28", "2029-02-28"],
      ["2026-02-28T09:00:00Z", "2024-02-28", "2023-02-28"],
      ["2028-03-01T09:00:00Z", "2026-03-01", "2025-03-01"],
      ["2026-03-31T09:00:00Z", "2024-03-31", "2023-03-31"],
      ["2026-01-01T00:00:00Z", "2024-01-01", "2023-01-01"],
      ["2026-12-31T23:59:59Z", "2024-12-31", "2023-12-31"],
    ])(
      "for %s gives %s and %s, clamping the day to the end of a shorter month",
      (now, news, legal) => {
        const byCategory = plansByCategory(planCategories(target, new Date(now)));

        expect(byCategory.security_incidents.options.startDate).toBe(news);
        expect(byCategory.legal_regulatory.options.startDate).toBe(legal);
      },
    );

    it("always has the YYYY-MM-DD shape, with two digits for the month and the day", () => {
      const byCategory = plansByCategory(planCategories(target, new Date("2026-01-05T00:00:00Z")));

      expect(byCategory.security_incidents.options.startDate).toBe("2024-01-05");
      expect(byCategory.legal_regulatory.options.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    // Computed in UTC: 23:30 on 10 October in New York is already 11 October in UTC.
    it("uses the UTC date, whatever offset the instant was written with", () => {
      const lateEvening = new Date("2026-10-10T23:30:00-05:00");
      const justAfterMidnight = new Date("2026-10-11T00:30:00+05:00");

      expect(
        plansByCategory(planCategories(target, lateEvening)).security_incidents.options.startDate,
      ).toBe("2024-10-11");
      expect(
        plansByCategory(planCategories(target, justAfterMidnight)).security_incidents.options
          .startDate,
      ).toBe("2024-10-10");
    });
  });
});
