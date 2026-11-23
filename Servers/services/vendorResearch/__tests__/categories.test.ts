import {
  LOOKBACK_MONTHS,
  NO_DOMAIN_NOTE,
  monthsBefore,
  researchableCategories,
} from "../categories";
import { ResearchTarget } from "../target";

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
    "for %s gives %s 24 months back and %s 36 months back, clamping the day to the end of a shorter month",
    (now, twoYears, threeYears) => {
      expect(monthsBefore(new Date(now), 24)).toBe(twoYears);
      expect(monthsBefore(new Date(now), 36)).toBe(threeYears);
    },
  );

  it("always has the YYYY-MM-DD shape, with two digits for the month and the day", () => {
    expect(monthsBefore(new Date("2026-01-05T00:00:00Z"), 24)).toBe("2024-01-05");
    expect(monthsBefore(new Date("2026-01-05T00:00:00Z"), 36)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // Computed in UTC: 23:30 on 10 October in New York is already 11 October in UTC.
  it("uses the UTC date, whatever offset the instant was written with", () => {
    expect(monthsBefore(new Date("2026-10-10T23:30:00-05:00"), 24)).toBe("2024-10-11");
    expect(monthsBefore(new Date("2026-10-11T00:30:00+05:00"), 24)).toBe("2024-10-10");
  });
});

describe("LOOKBACK_MONTHS", () => {
  it("gives each category its window in months", () => {
    expect(LOOKBACK_MONTHS).toEqual({
      security_incidents: 24,
      certifications: 24,
      legal_regulatory: 36,
      ai_specific: 24,
      availability: 12,
      financial_health: 12,
    });
  });
});

describe("researchableCategories", () => {
  it("gives all six categories, in category order, for a target with a domain", () => {
    expect(researchableCategories(target)).toEqual([
      "security_incidents",
      "certifications",
      "legal_regulatory",
      "ai_specific",
      "availability",
      "financial_health",
    ]);
  });

  it.each([[null], [""]])("gives only the four news categories when the domain is %p", (domain) => {
    expect(researchableCategories({ ...target, domain })).toEqual([
      "security_incidents",
      "legal_regulatory",
      "availability",
      "financial_health",
    ]);
  });
});
