import type { EvalCase } from "../types";
import { NOW, finish, page, read, result, search } from "./builders";

const SITE = "https://kestrelledger.com";
const ARTICLE = "https://www.ledgerwire.example/kestrel-ledger-data-breach";
const SECOND_ARTICLE = "https://www.finopsdaily.example/kestrel-ledger-ransomware";
const SOC2 = `${SITE}/trust/soc2-report`;
const AI_USE = `${SITE}/legal/ai-use`;

/**
 * One loop for each category, all at the same time (see loops.ts). The routine work is done by code
 * first, as in the case of the gathered sources; then the four categories are researched by loops
 * of their own, each with its own budget, at most four turns and the sources that the code
 * collected for its category only. Here three of them have something left to do, and none of them
 * waits for another: the news loop searches again and reads the article that the search found, the
 * certifications loop follows the link of the trust page to the summary of the audit, the loop for
 * AI follows the link of the privacy page to the statement of how the vendor uses models, and the
 * loop for legal matters, which the code searched for and found nothing, finishes at its first turn.
 *
 * Under the credibility rule the breach is Low, because both of its publishers are unknown to the
 * registry (spec D5.6 #4), and the audit exception and the model provider are High, because each
 * rests on a trust or policy page of the vendor, which is the vendor's own statement (rule V, spec
 * D5.6 #3).
 *
 * If this case fails, a loop no longer gets the steps or the sources of its own category, or a
 * finding that only a loop could reach is lost.
 */
export const ONE_LOOP_PER_CATEGORY: EvalCase = {
  id: "one-loop-per-category",
  title: "Each category is researched by a loop of its own, all at the same time",
  reproduces:
    "One loop took its turns one after the other, 24 at most, for all the categories. Here a loop for each category takes the few turns its category needs, while the others take theirs.",
  vendor: {
    name: "Kestrel Ledger",
    website: "kestrelledger.com",
    provides: "Accounting automation",
  },
  now: NOW,
  gather: true,
  perCategory: true,
  recording: {
    steps: [],
    loops: {
      security_incidents: [
        search("security_incidents", "Kestrel Ledger ransomware", "news"),
        read("security_incidents", SECOND_ARTICLE),
        finish("Two publishers report the incident"),
      ],
      certifications: [
        read("certifications", SOC2, "The trust page links the summary of the audit"),
        finish("The audit is read"),
      ],
      ai_specific: [
        read("ai_specific", AI_USE, "The privacy policy links the statement on AI"),
        finish("The statement is read"),
      ],
    },
    searches: [
      {
        kind: "news",
        query: "Kestrel Ledger data breach",
        results: [
          result(
            ARTICLE,
            "Kestrel Ledger confirms ransomware attack on its invoice servers",
            "Kestrel Ledger said that attackers encrypted servers that hold the invoices of its customers.",
            "2026-09-22",
            "Ledgerwire",
          ),
        ],
      },
      { kind: "news", query: "Kestrel Ledger security incident", results: [] },
      { kind: "news", query: "Kestrel Ledger lawsuit", results: [] },
      { kind: "news", query: "Kestrel Ledger fined", results: [] },
      { kind: "news", query: "Kestrel Ledger FTC", results: [] },
      { kind: "news", query: "Kestrel Ledger settlement", results: [] },
      { kind: "news", query: "Kestrel Ledger outage", results: [] },
      { kind: "news", query: "Kestrel Ledger layoffs", results: [] },
      { kind: "news", query: "Kestrel Ledger bankruptcy", results: [] },
      { kind: "news", query: "Kestrel Ledger acquisition", results: [] },
      {
        kind: "news",
        query: "Kestrel Ledger ransomware",
        results: [
          result(
            SECOND_ARTICLE,
            "Ransomware group claims Kestrel Ledger invoices",
            "A ransomware group says it holds invoices of customers of Kestrel Ledger and wants to be paid.",
            "2026-09-24",
            "FinOps Daily",
          ),
        ],
      },
    ],
    pages: [
      {
        url: `${SITE}/`,
        page: {
          ...page(
            `${SITE}/`,
            "Kestrel Ledger",
            "Kestrel Ledger automates the accounting of small companies.",
          ),
          links: [
            { text: "Trust centre", url: `${SITE}/trust` },
            { text: "Security", url: `${SITE}/security` },
            { text: "Privacy policy", url: `${SITE}/privacy` },
            { text: "Terms of service", url: `${SITE}/terms` },
          ],
        },
      },
      {
        url: ARTICLE,
        page: page(
          ARTICLE,
          "Kestrel Ledger confirms ransomware attack on its invoice servers",
          "Kestrel Ledger confirmed that attackers encrypted servers that hold the invoices of its customers on 20 September. The company has restored the servers from backups and says that it is investigating whether the invoices were copied.",
        ),
      },
      {
        url: SECOND_ARTICLE,
        page: page(
          SECOND_ARTICLE,
          "Ransomware group claims Kestrel Ledger invoices",
          "A ransomware group says it holds invoices of customers of Kestrel Ledger and wants to be paid. Kestrel Ledger has not said whether the invoices were copied before the servers were encrypted.",
        ),
      },
      {
        url: `${SITE}/trust`,
        page: {
          ...page(
            `${SITE}/trust`,
            "Trust centre",
            "Kestrel Ledger is audited every year. Read the summary of our SOC 2 report.",
          ),
          links: [{ text: "SOC 2 report summary", url: SOC2 }],
        },
      },
      {
        url: `${SITE}/security`,
        page: page(
          `${SITE}/security`,
          "Security",
          "Files at Kestrel Ledger are encrypted at rest and in transit.",
        ),
      },
      {
        url: `${SITE}/privacy`,
        page: {
          ...page(
            `${SITE}/privacy`,
            "Privacy policy",
            "We process the invoices of our customers to keep their books. How we use artificial intelligence is described in our statement on AI.",
          ),
          links: [{ text: "Statement on AI", url: AI_USE }],
        },
      },
      {
        url: `${SITE}/terms`,
        page: page(
          `${SITE}/terms`,
          "Terms of service",
          "These are the terms of service of Kestrel Ledger.",
        ),
      },
      {
        url: SOC2,
        page: page(
          SOC2,
          "SOC 2 report summary",
          "The SOC 2 Type II report of Kestrel Ledger covers 1 July 2025 to 30 June 2026. The auditor noted one exception in the review of user access.",
        ),
      },
      {
        url: AI_USE,
        page: page(
          AI_USE,
          "Statement on AI",
          "Kestrel Ledger uses a third-party model provider to read invoices. Customer invoices are sent to the provider, which does not use them to train its models.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "Attackers encrypted the servers that hold the invoices of Kestrel Ledger customers on 20 September 2026, and a ransomware group claims to hold the invoices.",
          impact_description:
            "Invoices we store with the vendor may have been copied and could be published.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan:
            "Ask the vendor whether our invoices were copied and for its incident report.",
          confidence: "medium",
          rationale:
            "Two publishers report the attack and the vendor confirms it, but nobody says whether the invoices were copied.",
          evidence: [
            {
              source_id: "S1",
              quote:
                "attackers encrypted servers that hold the invoices of its customers on 20 September",
            },
            {
              source_id: "S2",
              quote: "A ransomware group says it holds invoices of customers of Kestrel Ledger",
            },
          ],
        },
        {
          category: "certifications",
          risk_description:
            "The auditor of the SOC 2 Type II report of Kestrel Ledger noted one exception in the review of user access.",
          impact_description:
            "Access to our data may not be controlled as well as the report is meant to show.",
          likelihood: "Possible",
          risk_severity: "Minor",
          action_plan: "Ask the vendor for the full report and how it closed the exception.",
          confidence: "medium",
          rationale:
            "The vendor states the exception itself, but the summary does not say what it was.",
          evidence: [
            {
              source_id: "S5",
              quote: "The auditor noted one exception in the review of user access.",
            },
          ],
        },
        {
          category: "ai_specific",
          risk_description:
            "Kestrel Ledger sends the invoices of its customers to a third-party model provider.",
          impact_description:
            "Our invoices are processed by a company that we have no contract with.",
          likelihood: "Likely",
          risk_severity: "Moderate",
          action_plan:
            "Ask the vendor who the provider is and whether our data can be kept out of it.",
          confidence: "medium",
          rationale: "The vendor states it on its own site and says the provider does not train.",
          evidence: [
            {
              source_id: "S8",
              quote: "Customer invoices are sent to the provider",
            },
          ],
        },
      ],
      category_notes: [{ category: "legal_regulatory", note: "No legal matter was found." }],
    },
  },
  expected: {
    findings: [
      { category: "security_incidents", anyOf: ["ransomware", "invoices"], credibility: "low" },
      { category: "certifications", anyOf: ["exception"], credibility: "high" },
      { category: "ai_specific", anyOf: ["model provider"], credibility: "high" },
    ],
  },
  targets: {
    minPrecision: 1,
    minRecall: 1,
    maxKept: 3,
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
