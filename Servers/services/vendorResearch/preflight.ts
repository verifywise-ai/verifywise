/**
 * The check of the vendor's website before the research loop starts: one guarded read of its home
 * page, to find out whether the site can be read at all and whether it is the vendor's.
 *
 * Without it, the model finds out by reading: a site that does not answer costs a read, a model
 * turn and the time of the request for every page it tries, and a domain that belongs to someone
 * else (a typo in the record, a parked page) is read as the vendor's own statement. The check is
 * made through the run's page reader, so the robots.txt rules and the address policy apply to it as
 * to every other read, but outside the session: it uses none of the budget and puts nothing in the
 * ledger, because a home page is where the pages worth reading are linked and seldom a source in
 * itself.
 *
 * The answer comes in four kinds. `readable`: the home page was read; it says whether the page
 * names the vendor (by its name or by one of its other names, never by the domain, which a parked
 * page repeats), where it ended up when it redirected, the links to the pages worth reading and,
 * for a page that names the vendor on the vendor's own site, what the site says about itself: the
 * other names it gives the vendor and the products it lists (the `profile`, see aliases.ts). A
 * site that moved (the record
 * says `notion.so`, the site answers from `www.notion.com`) is the vendor's when the page it lands
 * on names the vendor and its domain has the brand of the recorded one: that domain is then an
 * alias of the vendor's website, with the same standing (its pages can be read without a search).
 * A redirect to a domain of another brand (a social page, a host of many sites) is only reported. `unreadable`: the site answers
 * but its home page is no use (it does not exist, is no web page, or is built by a script), which
 * says nothing of its other pages. `closed`: the site does not answer, or its robots.txt, the site
 * itself or the address policy refuses us, so the session refuses the reads of its pages from the
 * start. `unchecked`: the check itself broke; the run goes on as if there were none.
 */
import { ResearchCategory } from "../../domain.layer/interfaces/i.vendorResearch";
import { PageLink, relevantLinks } from "../webResearch/pageText";
import { isOnDomain } from "../webResearch/publicUrl";
import { PageReadError, PageReader, ReadFailureReason } from "../webResearch/readPage";
import type { CallFailure, CallRecord } from "../webResearch/webSession";
import { type SiteProfile, profileOf } from "./aliases";
import { SITE_CATEGORIES } from "./categories";
import { brandOf, createVendorMatcher } from "./identity";
import { ResearchTarget } from "./target";
import type { TraceStep } from "./trace";

/** The most links the briefing lists. */
const MAX_BRIEFING_LINKS = 12;

type ClosedReason = Extract<
  ReadFailureReason,
  "blocked_by_robots" | "blocked_by_site" | "not_allowed" | "unreachable"
>;
type UnreadableReason = Extract<
  ReadFailureReason,
  "not_found" | "unsupported_type" | "needs_javascript"
>;

export type WebsiteCheck =
  | { status: "no_website" }
  | { status: "unchecked" }
  | {
      status: "readable";
      /** The address that answered, after redirects. */
      url: string;
      /** True when the title or the text of the home page names the vendor. */
      namesVendor: boolean;
      /** The host the page answered from when that is outside the vendor's domain; else null. */
      redirectedTo: string | null;
      /**
       * The domain of the site the home page moved to, when that site is the vendor's too (see the
       * module comment); else null.
       */
      alias: string | null;
      /**
       * Links to pages worth reading, on the vendor's domain or its alias; none when the page
       * redirected somewhere that is not the vendor's, or does not name the vendor.
       */
      links: PageLink[];
      /**
       * What the home page says about its site, when the page names the vendor on the vendor's own
       * site (the recorded domain or the one it moved to) and says something that is the vendor's:
       * an absent profile means there was nothing to take.
       */
      profile?: SiteProfile;
    }
  | { status: "unreadable"; reason: UnreadableReason }
  | { status: "closed"; reason: ClosedReason };

const CLOSED_REASONS: ReadonlySet<ReadFailureReason> = new Set<ReadFailureReason>([
  "blocked_by_robots",
  "blocked_by_site",
  "not_allowed",
  "unreachable",
]);

/** The home page of a host. */
const homeOf = (host: string): string => `https://${host}/`;

/** How long the whole check may take, the retry at the `www.` form included. */
export const PREFLIGHT_TIMEOUT_MS = 25_000;

/**
 * Reads the home page of the vendor's website with `readPage`. A site that does not answer at its
 * bare domain is tried once more at its `www.` form, because a site with no record for the bare
 * domain is not closed. Anything the reader throws that is not a failed read is a bug of the
 * reader, not an answer of the site, and gives `unchecked`.
 */
export async function checkWebsite(input: {
  target: ResearchTarget;
  readPage: PageReader;
  signal?: AbortSignal;
}): Promise<WebsiteCheck> {
  const { target, readPage, signal } = input;
  const { domain } = target;
  if (domain === null) return { status: "no_website" };

  try {
    let failure: ReadFailureReason;
    try {
      return readable(await readPage(homeOf(domain), signal), target, domain);
    } catch (error) {
      if (!(error instanceof PageReadError)) throw error;
      failure = error.reason;
    }
    if (failure === "unreachable") {
      try {
        return readable(await readPage(homeOf(`www.${domain}`), signal), target, domain);
      } catch (error) {
        if (!(error instanceof PageReadError)) throw error;
        // The reason that says more wins over the one that says only that nothing answered.
        if (error.reason !== "unreachable") failure = error.reason;
      }
    }
    if (CLOSED_REASONS.has(failure)) return { status: "closed", reason: failure as ClosedReason };
    return { status: "unreadable", reason: failure as UnreadableReason };
  } catch {
    return { status: "unchecked" };
  }
}

function readable(
  page: Awaited<ReturnType<PageReader>>,
  target: ResearchTarget,
  domain: string,
): WebsiteCheck {
  // Named by the vendor's name alone: a parked page repeats the domain it is parked on.
  const namesVendor = createVendorMatcher({ ...target, domain: null })({
    title: page.title,
    content: page.text,
  });
  const host = hostOf(page.url);
  const redirectedTo = host !== "" && !isOnDomain(host, domain) ? host : null;
  const alias =
    redirectedTo !== null && namesVendor && sameBrand(redirectedTo, domain)
      ? redirectedTo.replace(/^www\./, "")
      : null;
  // The links of a page on the vendor's own site: the recorded domain, or the one it moved to.
  const ownDomain = redirectedTo === null ? domain : alias;
  const links =
    namesVendor && ownDomain !== null
      ? relevantLinks(page.links, ownDomain, page.url, MAX_BRIEFING_LINKS)
      : [];
  // What the page says about itself is the vendor's only when the page is the vendor's own.
  const site = namesVendor && ownDomain !== null ? profileOf(page.identity, target) : undefined;
  const profile =
    site !== undefined && (site.names.length > 0 || site.products.length > 0)
      ? { profile: site }
      : {};
  return { status: "readable", url: page.url, namesVendor, redirectedTo, alias, links, ...profile };
}

/** The fewest letters a brand needs to be told from the many others that share it. */
const MIN_BRAND_CHARS = 3;

/**
 * True when two hosts have the same brand, or one brand holds the other ("acme" and
 * "acme-analytics"). A brand of fewer than three letters is not told from others, and a host of
 * another brand is another company's, whatever its page says: a social page or a host of many sites
 * names the vendor on a page of its own.
 */
function sameBrand(first: string, second: string): boolean {
  const a = brandOf(first);
  const b = brandOf(second);
  if (a.length < MIN_BRAND_CHARS || b.length < MIN_BRAND_CHARS) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * The hosts whose pages the session refuses to read: the bare domain and its `www.` form, for a
 * closed site. Its other subdomains answer for themselves (a trust center on its own host can be
 * open when the main site is not), and so does any host when the site is not closed.
 */
export function closedHostsOf(check: WebsiteCheck, target: ResearchTarget): string[] {
  if (check.status !== "closed" || target.domain === null) return [];
  return [target.domain, `www.${target.domain}`];
}

/** The domains that are the vendor's website too: the one a home page that moved landed on. */
export function aliasesOf(check: WebsiteCheck): string[] {
  return check.status === "readable" && check.alias !== null ? [check.alias] : [];
}

/**
 * The domains the check verified as the vendor's: the recorded one when its home page was read and
 * names the vendor, with the domain the page moved to when that is the vendor's too. None when the
 * page could not be read, does not name the vendor or moved to another company's domain; a match
 * by website is strong only against these (spec D2.3, D4.5).
 */
export function verifiedDomainsOf(check: WebsiteCheck, target: ResearchTarget): string[] {
  if (target.domain === null || check.status !== "readable" || !check.namesVendor) return [];
  if (check.redirectedTo !== null && check.alias === null) return [];
  return [target.domain, ...aliasesOf(check)];
}

/** The other names of the vendor that its home page gave (see aliases.ts); none for any other check. */
export function siteNamesOf(check: WebsiteCheck): string[] {
  return check.status === "readable" ? (check.profile?.names ?? []) : [];
}

const CLOSED_BECAUSE: Record<ClosedReason, string> = {
  blocked_by_robots: "its robots.txt does not allow it",
  blocked_by_site: "the site refused the request",
  not_allowed: "its address is not a public web address",
  unreachable: "the site did not answer",
};

const UNREADABLE_BECAUSE: Record<UnreadableReason, string> = {
  not_found: "was not found",
  unsupported_type: "is not a page that can be read",
  needs_javascript: "is built by a script and shows no text without running it",
};

/**
 * What the model is told about the website before its first step, as text for the loop's
 * briefing; null when there is nothing to tell. The links are the page's own words, so the loop
 * escapes the whole briefing like a result.
 */
export function describeWebsite(check: WebsiteCheck, target: ResearchTarget): string | null {
  if (check.status === "no_website" || check.status === "unchecked") return null;
  const lines = [`The vendor's website, ${target.domain}, was checked before your first step.`];

  if (check.status === "closed") {
    lines.push(
      `Its home page could not be read: ${CLOSED_BECAUSE[check.reason]}.`,
      "The website is closed for this run: a read of one of its pages is refused. Research the " +
        "vendor with searches, and read only pages that a search returned from other sites.",
    );
  } else if (check.status === "unreadable") {
    lines.push(
      `Its home page ${UNREADABLE_BECAUSE[check.reason]}. The site does answer, so other pages of ` +
        "it may exist.",
    );
  } else if (check.alias !== null) {
    lines.push(
      `Its home page redirects to ${check.redirectedTo} and names the vendor, so ${check.alias} ` +
        "counts as the vendor's website too: you can read its pages, and those of its " +
        "subdomains, without a search.",
      ...(check.links.length === 0
        ? ["It shows no link to a security, privacy or legal page."]
        : ["It links to these pages, which you can read directly:"]),
      ...check.links.map((link) => `- ${link.text} - ${link.url}`),
    );
  } else if (check.redirectedTo !== null) {
    lines.push(
      `Its home page redirects to ${check.redirectedTo}, which is outside the vendor's website, ` +
        "so the pages there are not the vendor's own.",
    );
  } else if (!check.namesVendor) {
    lines.push(
      `Its home page (${check.url}) was read, but it does not mention the vendor, so the website ` +
        "may belong to another company. Rely on a page of it as the vendor's own statement only " +
        "when the page names the vendor.",
    );
  } else if (check.links.length === 0) {
    lines.push(
      `Its home page (${check.url}) was read and names the vendor. It shows no link to a ` +
        "security, privacy or legal page.",
    );
  } else {
    lines.push(
      `Its home page (${check.url}) was read and names the vendor. It links to these pages, ` +
        "which you can read directly:",
      ...check.links.map((link) => `- ${link.text} - ${link.url}`),
    );
  }
  if (check.status === "readable" && check.profile !== undefined) {
    const { names, products } = check.profile;
    if (names.length > 0) {
      lines.push(
        `The site gives these names for itself: ${names.join(", ")}. Sources may name the vendor ` +
          "by any of them.",
      );
    }
    if (products.length > 0) lines.push(`It lists these products: ${products.join(", ")}.`);
  }
  return lines.join("\n");
}

/**
 * The calls to record for the categories that read the vendor's website when the site is closed:
 * a read that failed, for each of them that the run made no call for. The summary then says that
 * the pages could not be read, and not that the research ended before it got there. A category the
 * model worked on by a search keeps the outcome of that work.
 */
export function callsOfClosedSite(
  check: WebsiteCheck,
  researchable: readonly ResearchCategory[],
  calls: readonly CallRecord<ResearchCategory>[],
): CallRecord<ResearchCategory>[] {
  if (check.status !== "closed") return [];
  // A refusal of the address policy never reaches the web, so a call cannot record it as one.
  const failure: CallFailure = check.reason === "not_allowed" ? "unreachable" : check.reason;
  return SITE_CATEGORIES.filter(
    (category) =>
      researchable.includes(category) && calls.every((call) => call.category !== category),
  ).map((category) => ({ category, tool: "read", answered: false, failure }));
}

/**
 * The step of the trace for the check; null when there was none to make. `reason` says why the
 * check is not a plain success, from a closed set of words.
 */
export function traceStepOf(
  check: WebsiteCheck,
  target: ResearchTarget,
  ms: number,
): Omit<TraceStep, "n"> | null {
  if (check.status === "no_website" || target.domain === null) return null;
  const home = homeOf(target.domain);
  switch (check.status) {
    case "unchecked":
      return { tool: "preflight", url: home, outcome: "failed", reason: "check_failed", ms };
    case "unreadable":
    case "closed":
      return { tool: "preflight", url: home, outcome: "failed", reason: check.reason, ms };
    case "readable":
      return {
        tool: "preflight",
        url: check.url,
        outcome: "ok",
        results: check.links.length,
        ...(check.alias !== null
          ? { reason: "redirected_to_alias" }
          : check.redirectedTo !== null
            ? { reason: "redirected_off_site" }
            : check.namesVendor
              ? {}
              : { reason: "does_not_name_vendor" }),
        ms,
      };
  }
}
