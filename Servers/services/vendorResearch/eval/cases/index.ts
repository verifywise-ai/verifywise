import type { EvalCase } from "../types";
import { BREACH_TWO_PUBLISHERS } from "./01-breach-two-publishers";
import { UNKNOWN_VENDOR_NOISE } from "./02-unknown-vendor-noise";
import { SAME_STORY_TWO_DOMAINS } from "./03-same-story-two-domains";
import { IDENTICAL_PAGES } from "./04-identical-pages";
import { BROKEN_URL } from "./05-broken-url";
import { ONE_EVENT_THREE_FINDINGS } from "./06-one-event-three-findings";
import { CRAWL_DATED_WEB_RESULTS } from "./07-crawl-dated-web-results";
import { SNIPPET_ONLY_QUOTES } from "./08-snippet-only-quotes";
import { CLEAN_RECORD } from "./09-clean-record";
import { GATHERED_SOURCES } from "./10-gathered-sources";
import { ONE_LOOP_PER_CATEGORY } from "./11-one-loop-per-category";
import { QUOTE_NOT_ON_THE_PAGE } from "./12-quote-not-on-the-page";
import { VERIFIER_DROPS_FINDINGS } from "./13-verifier-drops-findings";
import { LONG_POLICY_PART } from "./14-long-policy-part";
import { OTHER_NAMES } from "./15-other-names";
import { LOCAL_LANGUAGE_NEWS } from "./16-local-language-news";
import { KNOWN_EXPLOITED_VULNERABILITY } from "./17-known-exploited-vulnerability";
import { SEC_CYBERSECURITY_INCIDENT_REPORT } from "./18-sec-cybersecurity-incident-report";
import { STATUS_PAGE_INCIDENT_HISTORY } from "./19-status-page-incident-history";
import { SANCTIONS_LIST_NAME_MATCH } from "./20-sanctions-list-name-match";
import { FINANCIAL_HEALTH_LAYOFFS_AND_SALE } from "./21-financial-health-layoffs-and-sale";
import { TWO_TRUSTED_PUBLISHERS } from "./22-two-trusted-publishers";
import { SYNDICATED_COPIES } from "./23-syndicated-copies";
import { USER_CONTENT_ONLY } from "./24-user-content-only";
import { VENDOR_SELF_CLAIM } from "./25-vendor-self-claim";
import { VENDOR_INCIDENT_NOTICE } from "./26-vendor-incident-notice";
import { REGULATOR_PAGE } from "./27-regulator-page";
import { REJECTED_CVE } from "./28-rejected-cve";
import { DELISTED_SANCTIONS_ENTRY } from "./29-delisted-sanctions-entry";
import { STALE_SOURCE } from "./30-stale-source";
import { SAME_NAME_ON_TWO_LISTS } from "./31-same-name-on-two-lists";
import { UNCONFIRMED_TRUSTED_SNIPPETS } from "./32-unconfirmed-trusted-snippets";
import { CONTRIBUTOR_PAGE } from "./33-contributor-page";
import { PLATFORM_WEBSITE } from "./34-platform-website";
import { REJECTED_CVE_MIRROR } from "./35-rejected-cve-mirror";
import { IDENTIFIER_MATCH } from "./36-identifier-match";
import { NVD_READ_THROUGH } from "./37-nvd-read-through";
import { LEI_MATCH_OTHER_NAME } from "./38-lei-match-other-name";

/**
 * The synthetic cases. Each reproduces a failure of the first real runs (see the roadmap's
 * baseline), and two are controls that must keep passing; the next two check the routine work that
 * the code does before the model's first step, and the loops that run one for each category after
 * it, one checks a finding whose quote the page of its source does not hold, and the last checks the
 * verifier, which takes away what the code could not tell was wrong; one reads a clause from a
 * later part of a long policy, one finds a vendor that the press knows by another name than the
 * record has, one finds the news of a vendor in the language of its country, one finds what the
 * public databases of exploited vulnerabilities and breaches hold when the news has nothing, one
 * finds the incident that a vendor reported to the SEC, one finds the outage that a vendor listed on
 * its status page, one finds the company of a vendor's name on the sanctions list, and one finds a
 * vendor whose finances are in trouble. The last eight check the credibility label of a finding, one
 * worked case of the rule each (spec D5.7): two trusted publishers, the copies of one agency story,
 * a post of a user, a vendor's claim about itself, a vendor's notice of its own incident, the page
 * of a regulator, two trusted publishers whose pages cannot be read, and a contributor's post on
 * the site of a publisher. The four numbered 28 to 31, between them, check what the vendor risk
 * database offers: an entry its list withdrew and one it delisted are offered no more, a copy that
 * is out of date keeps its label and says so, and an entity of the vendor's name on two lists is
 * one finding, by name only. The five numbered 34 to 38 check how a record is tied to the vendor:
 * an entry whose website is a page on the platform that holds the vendor's own page is not
 * offered, a KEV entry whose CVE the CVE Program rejected is offered by no list, an entry with the
 * vendor's name and registration number is the vendor's, High, a CVE that the NVD answered when it
 * was asked at run time is High, as of the day of the answer, and an entry that carries the vendor's
 * LEI under another name is the vendor's, High. They are written by hand, so they
 * are small and say what they test; a case captured from a live run (`--record`) is added beside
 * them.
 */
export const EVAL_CASES: readonly EvalCase[] = [
  BREACH_TWO_PUBLISHERS,
  UNKNOWN_VENDOR_NOISE,
  SAME_STORY_TWO_DOMAINS,
  IDENTICAL_PAGES,
  BROKEN_URL,
  ONE_EVENT_THREE_FINDINGS,
  CRAWL_DATED_WEB_RESULTS,
  SNIPPET_ONLY_QUOTES,
  CLEAN_RECORD,
  GATHERED_SOURCES,
  ONE_LOOP_PER_CATEGORY,
  QUOTE_NOT_ON_THE_PAGE,
  VERIFIER_DROPS_FINDINGS,
  LONG_POLICY_PART,
  OTHER_NAMES,
  LOCAL_LANGUAGE_NEWS,
  KNOWN_EXPLOITED_VULNERABILITY,
  SEC_CYBERSECURITY_INCIDENT_REPORT,
  STATUS_PAGE_INCIDENT_HISTORY,
  SANCTIONS_LIST_NAME_MATCH,
  FINANCIAL_HEALTH_LAYOFFS_AND_SALE,
  TWO_TRUSTED_PUBLISHERS,
  SYNDICATED_COPIES,
  USER_CONTENT_ONLY,
  VENDOR_SELF_CLAIM,
  VENDOR_INCIDENT_NOTICE,
  REGULATOR_PAGE,
  REJECTED_CVE,
  DELISTED_SANCTIONS_ENTRY,
  STALE_SOURCE,
  SAME_NAME_ON_TWO_LISTS,
  UNCONFIRMED_TRUSTED_SNIPPETS,
  CONTRIBUTOR_PAGE,
  PLATFORM_WEBSITE,
  REJECTED_CVE_MIRROR,
  IDENTIFIER_MATCH,
  NVD_READ_THROUGH,
  LEI_MATCH_OTHER_NAME,
];
