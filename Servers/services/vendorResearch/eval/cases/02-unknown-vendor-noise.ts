import type { EvalCase } from "../types";
import { NOW, finish, noFindings, read, result, search } from "./builders";

/**
 * A vendor the search engine does not know. The news has nothing, and the web feed answers with
 * pages about other things: the model is not fooled, but every one of those pages goes into the
 * evidence pack and into the prompt of the analysis.
 */
export const UNKNOWN_VENDOR_NOISE: EvalCase = {
  id: "unknown-vendor-noise",
  title: "A vendor the search engine does not know",
  reproduces:
    "Two runs for NimbusAI Cloud: 8 searches, 45 sources, none about the vendor, no finding.",
  vendor: {
    name: "NimbusAI Cloud",
    website: "nimbusai-cloud.com",
    provides: "Hosted machine learning platform",
  },
  now: NOW,
  recording: {
    steps: [
      search("security_incidents", "NimbusAI Cloud data breach", "news"),
      search("security_incidents", "NimbusAI Cloud security incident", "web"),
      search("legal_regulatory", "NimbusAI Cloud lawsuit", "news"),
      search("legal_regulatory", "NimbusAI Cloud fine regulator", "web"),
      read("certifications", "https://nimbusai-cloud.com/trust"),
      read("ai_specific", "https://nimbusai-cloud.com/privacy"),
      finish(),
    ],
    searches: [
      { kind: "news", query: "NimbusAI Cloud data breach", results: [] },
      {
        kind: "web",
        query: "NimbusAI Cloud security incident",
        results: [
          result(
            "https://answers.example-qa.com/onedrive-share-folder",
            "How do I share a OneDrive folder with a colleague?",
            "I want to share a folder with a colleague but the cloud sync keeps failing after the last update. Has anyone seen a security warning about it?",
            "2026-10-08",
          ),
          result(
            "https://compare.cloudprices.net/storage",
            "Cloud storage prices compared in 2026",
            "We compare the monthly price of the largest cloud storage services, with a table of free tiers and incident histories.",
            "2026-10-08",
          ),
          result(
            "https://forum.homelab.org/thread/ai-cloud-credits",
            "Which AI cloud has the best credits for students?",
            "Students ask which machine learning platform in the cloud gives the best credits, and whether any of them had an incident recently.",
            "2026-10-07",
          ),
        ],
      },
      { kind: "news", query: "NimbusAI Cloud lawsuit", results: [] },
      {
        kind: "web",
        query: "NimbusAI Cloud fine regulator",
        results: [
          result(
            "https://www.gardenblog.org/cloud-gardening",
            "Cloud gardening: how to read the sky",
            "A regulator of the weather is a cloud. Learn how a fine mist of cloud helps your garden in the autumn.",
            "2026-10-06",
          ),
          result(
            "https://answers.example-qa.com/ai-fine-tuning-cost",
            "What does fine-tuning an AI model cost?",
            "A regulator-style answer on how much fine-tuning costs on a cloud platform of your choice.",
            "2026-10-05",
          ),
        ],
      },
    ],
    pages: [
      { url: "https://nimbusai-cloud.com/trust", failure: "unreachable" },
      { url: "https://nimbusai-cloud.com/privacy", failure: "unreachable" },
    ],
    // Never asked for: no result names the vendor, so nothing reaches the evidence pack and the
    // analysis is not called.
    analysis: noFindings(),
  },
  expected: { findings: [] },
  targets: { maxKept: 0, maxIrrelevantSources: 0, maxDuplicateSources: 0, maxMislabelled: 0 },
  gaps: {},
};
