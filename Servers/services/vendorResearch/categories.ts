/**
 * The searches of one research run: one per category, with the query and the provider parameters
 * the design fixes. A pure function of the target and the clock, so it is easy to test.
 */
import {
  CategorySummaryEntry,
  ResearchCategory,
} from "../../domain.layer/interfaces/i.vendorResearch";
import { SearchOptions } from "./searchProvider";
import { ResearchTarget } from "./target";

export interface CategoryPlan {
  category: ResearchCategory;
  query: string;
  options: SearchOptions;
}

const MAX_RESULTS = 5;
const SEARCH_TIMEOUT_MS = 15_000;
const SECURITY_LOOKBACK_MONTHS = 24;
const LEGAL_LOOKBACK_MONTHS = 36;

const NO_DOMAIN_NOTE = "Vendor website is missing or not a valid domain";

/**
 * The UTC date `months` calendar months before `now`, as YYYY-MM-DD. A day that the earlier month
 * does not have becomes its last day: 29 February 2028 minus 24 months is 28 February 2026.
 */
function monthsBefore(now: Date, months: number): string {
  const monthNumber = now.getUTCFullYear() * 12 + now.getUTCMonth() - months;
  const year = Math.floor(monthNumber / 12);
  const month = monthNumber - year * 12;
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(now.getUTCDate(), lastDayOfMonth);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/**
 * Plans the searches of a run, in the order security_incidents, certifications, legal_regulatory,
 * ai_specific. The two categories that read the vendor's own pages need its domain; without one
 * they are returned in `skipped` and the two news categories still run.
 */
export function planCategories(
  target: ResearchTarget,
  now: Date,
): { plans: CategoryPlan[]; skipped: CategorySummaryEntry[] } {
  // A double quote in the name would close the phrase in the quoted queries early.
  const name = target.name.replace(/"/g, "").replace(/\s+/g, " ").trim();

  const news = (months: number): SearchOptions => ({
    maxResults: MAX_RESULTS,
    topic: "news",
    startDate: monthsBefore(now, months),
    timeoutMs: SEARCH_TIMEOUT_MS,
  });
  const ownSite = (): SearchOptions | null =>
    target.domain
      ? {
          maxResults: MAX_RESULTS,
          includeDomains: [target.domain],
          domainsMode: "prefer",
          timeoutMs: SEARCH_TIMEOUT_MS,
        }
      : null;

  const wanted: Array<{
    category: ResearchCategory;
    query: string;
    options: SearchOptions | null;
  }> = [
    {
      category: "security_incidents",
      query: `"${name}" data breach OR security incident OR ransomware OR "security vulnerability"`,
      options: news(SECURITY_LOOKBACK_MONTHS),
    },
    {
      category: "certifications",
      query: `${name} SOC 2 ISO 27001 ISO 42001 certification security trust`,
      options: ownSite(),
    },
    {
      category: "legal_regulatory",
      query: `"${name}" fine OR lawsuit OR "regulatory action" OR settlement OR enforcement`,
      options: news(LEGAL_LOOKBACK_MONTHS),
    },
    {
      category: "ai_specific",
      query: `${name} AI customer data training privacy policy subprocessors model provider`,
      options: ownSite(),
    },
  ];

  const plans: CategoryPlan[] = [];
  const skipped: CategorySummaryEntry[] = [];
  for (const { category, query, options } of wanted) {
    if (options === null) {
      skipped.push({ category, outcome: "skipped", note: NO_DOMAIN_NOTE });
    } else {
      plans.push({ category, query, options });
    }
  }
  return { plans, skipped };
}
