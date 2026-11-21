import type { EvalCase } from "../types";
import { NOW, finish, page, result } from "./builders";

const SITE = "https://brightlinecloud.com";
const ARTICLE = "https://www.cloudwatchdaily.com/brightline-cloud-misconfigured-bucket";
const SECOND_ARTICLE = "https://www.securityledger.example/brightline-cloud-open-bucket";
const SITEMAP = `${SITE}/sitemap.xml`;

/**
 * The routine work, done by code before the model's first step (see gather.ts). A run starts the
 * same way for every vendor: the news searches, the best results of those searches read in full,
 * and the pages that the vendor's site links to or lists in its sitemap. The measured runs spent a
 * model turn of about three seconds on each of them. Here the code makes the four baseline
 * searches and the two that the model's memory gave (see hints.ts), reads the two articles that
 * they found and the four pages of the vendor's site (three that the home page links to, and one
 * that only the sitemap lists), the model is told what was collected, and its only step is to
 * finish.
 *
 * Under the credibility rule both publishers are unknown to the registry, so the label is Low (spec
 * D5.6 #4).
 *
 * If this case fails, the routine work no longer reaches the evidence, or the model is no longer
 * told about it.
 */
export const GATHERED_SOURCES: EvalCase = {
  id: "gathered-sources",
  title: "The routine work is done by code before the model's first step",
  reproduces:
    "The first model turns of every run went to the same searches and reads. Here the code does them and the model has nothing left to do but finish.",
  vendor: {
    name: "Brightline Cloud",
    website: "brightlinecloud.com",
    provides: "Cloud storage and file sharing",
  },
  now: NOW,
  gather: true,
  recording: {
    steps: [finish("The code collected the news, the article and the vendor's pages")],
    searches: [
      {
        kind: "news",
        query: "Brightline Cloud data breach",
        results: [
          result(
            ARTICLE,
            "Brightline Cloud exposed customer files through a misconfigured storage bucket",
            "Researchers found that a misconfigured storage bucket at Brightline Cloud exposed the files of about 300 customers.",
            "2026-09-18",
            "Cloud Watch Daily",
          ),
        ],
      },
      { kind: "news", query: "Brightline Cloud security incident", results: [] },
      { kind: "news", query: "Brightline Cloud lawsuit", results: [] },
      { kind: "news", query: "Brightline Cloud fined", results: [] },
      { kind: "news", query: "Brightline Cloud FTC", results: [] },
      { kind: "news", query: "Brightline Cloud settlement", results: [] },
      { kind: "news", query: "Brightline Cloud outage", results: [] },
      { kind: "news", query: "Brightline Cloud layoffs", results: [] },
      { kind: "news", query: "Brightline Cloud bankruptcy", results: [] },
      { kind: "news", query: "Brightline Cloud acquisition", results: [] },
      {
        kind: "news",
        query: "Brightline Cloud exposed bucket",
        results: [
          result(
            SECOND_ARTICLE,
            "Bucket left open at Brightline Cloud for two weeks",
            "A storage bucket that Brightline Cloud left open held the files of about 300 customers, says a security researcher.",
            "2026-09-19",
            "Security Ledger",
          ),
        ],
      },
      { kind: "news", query: "Brightline Cloud GDPR fine", results: [] },
    ],
    pages: [
      {
        url: `${SITE}/`,
        page: {
          ...page(
            `${SITE}/`,
            "Brightline Cloud",
            "Brightline Cloud stores and shares the files of teams.",
          ),
          links: [
            { text: "Trust centre", url: `${SITE}/trust` },
            { text: "Security", url: `${SITE}/security` },
            { text: "Privacy policy", url: `${SITE}/privacy` },
          ],
        },
      },
      {
        url: SITEMAP,
        page: page(
          SITEMAP,
          "",
          `<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>${SITE}/pricing</loc></url><url><loc>${SITE}/legal/subprocessors</loc></url><url><loc>${SITE}/blog/team-update</loc></url></urlset>`,
        ),
      },
      {
        url: ARTICLE,
        page: page(
          ARTICLE,
          "Brightline Cloud exposed customer files through a misconfigured storage bucket",
          "Researchers found that a misconfigured storage bucket at Brightline Cloud exposed the files of about 300 customers for two weeks. Brightline Cloud has closed the bucket and says it has found no sign that the files were copied.",
        ),
      },
      {
        url: SECOND_ARTICLE,
        page: page(
          SECOND_ARTICLE,
          "Bucket left open at Brightline Cloud for two weeks",
          "A storage bucket that Brightline Cloud left open held the files of about 300 customers, says a security researcher. The company confirmed the bucket was open from 3 to 17 September and has closed it.",
        ),
      },
      {
        url: `${SITE}/trust`,
        page: page(
          `${SITE}/trust`,
          "Trust centre",
          "Brightline Cloud holds a SOC 2 Type II report, renewed every year.",
        ),
      },
      {
        url: `${SITE}/security`,
        page: page(
          `${SITE}/security`,
          "Security",
          "Files at Brightline Cloud are encrypted at rest and in transit. We run a penetration test every year.",
        ),
      },
      {
        url: `${SITE}/privacy`,
        page: page(
          `${SITE}/privacy`,
          "Privacy policy",
          "We do not use customer files to train models. Our subprocessors are listed on a page of their own.",
        ),
      },
      {
        url: `${SITE}/legal/subprocessors`,
        page: page(
          `${SITE}/legal/subprocessors`,
          "Subprocessors",
          "Brightline Cloud uses a hosting provider and an email provider. It uses no model provider.",
        ),
      },
    ],
    hints: {
      queries: [
        { category: "security_incidents", query: "Brightline Cloud exposed bucket" },
        { category: "legal_regulatory", query: "Brightline Cloud GDPR fine" },
      ],
    },
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "A misconfigured storage bucket exposed the files of about 300 Brightline Cloud customers for two weeks in September 2026.",
          impact_description:
            "Files we store with the vendor may have been readable by others during that time.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan:
            "Ask the vendor whether our files were in the bucket and for its incident report.",
          rationale:
            "Two publishers report it and the vendor has closed the bucket, but nobody says whether the files were read.",
          evidence: [
            {
              source_id: "S1",
              quote:
                "a misconfigured storage bucket at Brightline Cloud exposed the files of about 300 customers for two weeks",
            },
            {
              source_id: "S2",
              quote:
                "A storage bucket that Brightline Cloud left open held the files of about 300 customers",
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
      {
        category: "security_incidents",
        anyOf: ["storage bucket", "300 customers"],
        credibility: "low",
      },
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
    maxMislabelled: 0,
    maxDuplicateClusters: 0,
    maxCitationsRejected: 0,
  },
  gaps: {},
};
