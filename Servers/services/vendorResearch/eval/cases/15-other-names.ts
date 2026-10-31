import type { EvalCase } from "../types";
import { NOW, finish, page, result } from "./builders";

const SITE = "https://harborchat.com";
const ARTICLE = "https://www.securityledger.example/harborchat-leaked-private-messages";
const SECOND_ARTICLE = "https://www.cloudwatchdaily.example/harborchat-database-exposed";
const SITEMAP = `${SITE}/sitemap.xml`;

/**
 * A vendor that the press knows by another name (see aliases.ts). The record says "Northwind
 * Holdings, Inc."; the product that people use, and the name of every article, is "HarborChat".
 * Searched for under the recorded name alone, the feed finds nothing, and an article that says only
 * "HarborChat" would be taken for a source about someone else: it names neither the recorded name
 * nor the domain. The vendor's home page says what the site calls itself (`og:site_name` and the
 * JSON-LD of the page, here recorded as the `identity` of the page), so the code searches for the
 * vendor under that name as well, the session keeps the two articles, and the validation accepts the
 * quotes that name only the brand. "Northwind" alone, which the page gives too, is only a part of
 * the recorded name, and is left out.
 *
 * Under the credibility rule both publishers are unknown to the registry, so the label is Low (spec
 * D5.6 #4).
 *
 * If this case fails, the names of the home page no longer reach the searches, the matcher or the
 * analysis.
 */
export const OTHER_NAMES: EvalCase = {
  id: "other-names",
  title: "The press writes the brand, the record has the company",
  reproduces:
    "A source that names a vendor only by the name the press uses (Facebook for Meta Platforms) was kept out of the evidence as a source about someone else, and the searches never asked for it.",
  vendor: {
    name: "Northwind Holdings, Inc.",
    website: "harborchat.com",
    provides: "Team messaging and video calls",
  },
  now: NOW,
  gather: true,
  recording: {
    steps: [finish("The code collected the news, the articles and the vendor's pages")],
    searches: [
      { kind: "news", query: "Northwind Holdings data breach", results: [] },
      { kind: "news", query: "Northwind Holdings security incident", results: [] },
      { kind: "news", query: "Northwind Holdings lawsuit", results: [] },
      { kind: "news", query: "Northwind Holdings fined", results: [] },
      { kind: "news", query: "Northwind Holdings FTC", results: [] },
      { kind: "news", query: "Northwind Holdings settlement", results: [] },
      { kind: "news", query: "Northwind Holdings outage", results: [] },
      { kind: "news", query: "Northwind Holdings layoffs", results: [] },
      { kind: "news", query: "Northwind Holdings bankruptcy", results: [] },
      { kind: "news", query: "Northwind Holdings acquisition", results: [] },
      {
        kind: "news",
        query: "HarborChat data breach",
        results: [
          result(
            ARTICLE,
            "HarborChat leaked the private messages of 40,000 users",
            "A database that HarborChat left without a password exposed the private messages of about 40,000 users, a researcher says.",
            "2026-09-24",
            "Security Ledger",
          ),
          result(
            SECOND_ARTICLE,
            "Messaging app HarborChat confirms an exposed database",
            "HarborChat confirmed that a database holding private messages was reachable without a password from 20 to 26 September.",
            "2026-09-25",
            "Cloud Watch Daily",
          ),
        ],
      },
      { kind: "news", query: "HarborChat lawsuit", results: [] },
      { kind: "news", query: "HarborChat outage", results: [] },
      { kind: "news", query: "HarborChat layoffs", results: [] },
    ],
    pages: [
      {
        url: `${SITE}/`,
        page: {
          ...page(
            `${SITE}/`,
            "HarborChat | Team messaging",
            "HarborChat is a product of Northwind Holdings, Inc. Team messaging and video calls for companies.",
          ),
          links: [
            { text: "Trust centre", url: `${SITE}/trust` },
            { text: "Security", url: `${SITE}/security` },
            { text: "Privacy policy", url: `${SITE}/privacy` },
          ],
          identity: {
            names: ["HarborChat", "Northwind"],
            products: ["HarborChat Teams", "HarborChat Rooms"],
          },
        },
      },
      {
        url: SITEMAP,
        page: page(
          SITEMAP,
          "",
          `<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>${SITE}/pricing</loc></url><url><loc>${SITE}/legal/subprocessors</loc></url></urlset>`,
        ),
      },
      {
        url: ARTICLE,
        page: page(
          ARTICLE,
          "HarborChat leaked the private messages of 40,000 users",
          "A database that HarborChat left without a password exposed the private messages of about 40,000 users, says a security researcher. HarborChat has closed the database and says it found no sign that the messages were copied.",
        ),
      },
      {
        url: SECOND_ARTICLE,
        page: page(
          SECOND_ARTICLE,
          "Messaging app HarborChat confirms an exposed database",
          "HarborChat confirmed that a database holding private messages was reachable without a password from 20 to 26 September. The company says about 40,000 users are affected and has told them by email.",
        ),
      },
      {
        url: `${SITE}/trust`,
        page: page(
          `${SITE}/trust`,
          "Trust centre",
          "HarborChat holds a SOC 2 Type II report, renewed every year.",
        ),
      },
      {
        url: `${SITE}/security`,
        page: page(
          `${SITE}/security`,
          "Security",
          "Messages at HarborChat are encrypted in transit and at rest. We run a penetration test every year.",
        ),
      },
      {
        url: `${SITE}/privacy`,
        page: page(
          `${SITE}/privacy`,
          "Privacy policy",
          "We do not use messages to train models. Our subprocessors are listed on a page of their own.",
        ),
      },
      {
        url: `${SITE}/legal/subprocessors`,
        page: page(
          `${SITE}/legal/subprocessors`,
          "Subprocessors",
          "HarborChat uses a hosting provider and an email provider. It uses no model provider.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "A database without a password exposed the private messages of about 40,000 HarborChat users in September 2026.",
          impact_description:
            "Messages our people send through the vendor may have been readable by others during that time.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan:
            "Ask the vendor whether our users were among the 40,000 and for its incident report.",
          confidence: "medium",
          rationale:
            "Two publishers report it and the vendor has confirmed it, but nobody says whether the messages were read.",
          evidence: [
            {
              source_id: "S1",
              quote:
                "A database that HarborChat left without a password exposed the private messages of about 40,000 users",
            },
            {
              source_id: "S2",
              quote:
                "HarborChat confirmed that a database holding private messages was reachable without a password",
            },
          ],
        },
      ],
      category_notes: [
        { category: "certifications", note: "A SOC 2 Type II report is stated as current." },
        { category: "ai_specific", note: "The vendor says it uses no model provider." },
      ],
    },
  },
  expected: {
    findings: [
      { category: "security_incidents", anyOf: ["database", "40,000"], credibility: "low" },
    ],
  },
  targets: {
    minPrecision: 1,
    minRecall: 1,
    maxKept: 1,
    maxIrrelevantSources: 0,
    maxDuplicateSources: 0,
    maxBadUrls: 0,
    maxDatedWebResults: 0,
    maxSnippetOnlyFindings: 0,
    maxOverconfident: 0,
    maxMislabelled: 0,
    maxDuplicateClusters: 0,
    maxCitationsRejected: 0,
  },
  gaps: {},
};
