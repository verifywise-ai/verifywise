import type { EvalCase } from "../types";
import { NOW, finish, page, read, result, search } from "./builders";

const OLD = "https://www.securityarchive.org/pelican-cloud-2019-breach";

/**
 * The web feed gives a date for each result: the day it crawled the page. A story from 2019, crawled
 * last week, looks like news from last week, passes the lookback window and is shown to the model
 * with a recent date.
 */
export const CRAWL_DATED_WEB_RESULTS: EvalCase = {
  id: "crawl-dated-web-results",
  title: "An old story with the date of its crawl",
  reproduces: "Web results carry crawl dates, not publication dates.",
  vendor: {
    name: "Pelican Cloud",
    website: "pelicancloud.com",
    provides: "Cloud file storage",
  },
  now: NOW,
  recording: {
    steps: [
      search("security_incidents", "Pelican Cloud data breach", "news"),
      search(
        "security_incidents",
        "Pelican Cloud data breach",
        "web",
        "The news has nothing: search the web",
      ),
      search("legal_regulatory", "Pelican Cloud lawsuit", "news"),
      read("certifications", "https://pelicancloud.com/trust"),
      read("ai_specific", "https://pelicancloud.com/privacy"),
      finish(),
    ],
    searches: [
      { kind: "news", query: "Pelican Cloud data breach", results: [] },
      {
        kind: "web",
        query: "Pelican Cloud data breach",
        results: [
          result(
            OLD,
            "Pelican Cloud disclosed a breach",
            "In 2019 Pelican Cloud disclosed that attackers copied 5 million customer records. The company says the weakness was fixed the same month.",
            "2026-10-08",
          ),
        ],
      },
      { kind: "news", query: "Pelican Cloud lawsuit", results: [] },
    ],
    pages: [
      {
        url: "https://pelicancloud.com/trust",
        page: page(
          "https://pelicancloud.com/trust",
          "Trust",
          "Pelican Cloud is certified to ISO 27001.",
        ),
      },
      {
        url: "https://pelicancloud.com/privacy",
        page: page(
          "https://pelicancloud.com/privacy",
          "Privacy",
          "We do not use stored files to train models.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description: "Attackers copied 5 million customer records from Pelican Cloud.",
          impact_description: "Our stored files could have been exposed at the vendor.",
          likelihood: "Unlikely",
          risk_severity: "Major",
          action_plan: "Ask the vendor for its incident history.",
          confidence: "low",
          rationale:
            "The only source is old, so a new effect is unlikely, though the exposure was large.",
          evidence: [{ source_id: "S1", quote: "attackers copied 5 million customer records" }],
        },
      ],
      category_notes: [],
    },
  },
  // The breach is from 2019, outside the 24-month window: a person would not want it.
  expected: { findings: [] },
  targets: { maxDatedWebResults: 0, maxMislabelled: 0 },
  gaps: {},
};
