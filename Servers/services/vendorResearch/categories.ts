/**
 * The categories of a research run: which of them can be researched for a vendor, and how far back
 * a source of each may have been published. Pure functions of the target and the clock.
 */
import {
  RESEARCH_CATEGORIES,
  ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { ResearchTarget } from "./target";

/**
 * How many months back a source of each category may have been published. A page on the vendor's
 * own domain is exempt.
 */
export const LOOKBACK_MONTHS: Record<ResearchCategory, number> = {
  security_incidents: 24,
  certifications: 24,
  legal_regulatory: 36,
  ai_specific: 24,
  availability: 12,
  financial_health: 12,
};

/** The categories that read the vendor's own pages, so a run needs the vendor's domain for them. */
export const SITE_CATEGORIES: readonly ResearchCategory[] = ["certifications", "ai_specific"];

export const NO_DOMAIN_NOTE = "Vendor website is missing or not a valid domain";

/**
 * The categories a run can research for the target, in category order: all six with a domain,
 * and without one only the four that search the news.
 */
export function researchableCategories(target: ResearchTarget): ResearchCategory[] {
  return RESEARCH_CATEGORIES.filter(
    (category) => Boolean(target.domain) || !SITE_CATEGORIES.includes(category),
  );
}

/**
 * The UTC date `months` calendar months before `now`, as YYYY-MM-DD. A day that the earlier month
 * does not have becomes its last day: 29 February 2028 minus 24 months is 28 February 2026.
 */
export function monthsBefore(now: Date, months: number): string {
  const monthNumber = now.getUTCFullYear() * 12 + now.getUTCMonth() - months;
  const year = Math.floor(monthNumber / 12);
  const month = monthNumber - year * 12;
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(now.getUTCDate(), lastDayOfMonth);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}
