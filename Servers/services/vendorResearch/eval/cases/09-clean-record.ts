import type { EvalCase } from "../types";
import { NOW, finish, noFindings, page, read, result, search } from "./builders";

/**
 * The other control: a vendor with nothing to report. The news has nothing, the web has a page
 * about the vendor that says nothing bad, and the vendor's own pages show current certificates and
 * no use of customer data for training. The right answer is no finding.
 */
export const CLEAN_RECORD: EvalCase = {
  id: "clean-record",
  title: "A vendor with a clean record",
  reproduces: "Nothing: the control. A good run keeps no finding and invents none.",
  vendor: {
    name: "Juniper Docs",
    website: "juniperdocs.com",
    provides: "Document management",
  },
  now: NOW,
  recording: {
    steps: [
      search("security_incidents", "Juniper Docs data breach", "news"),
      search("security_incidents", "Juniper Docs security", "web"),
      search("legal_regulatory", "Juniper Docs lawsuit", "news"),
      read("certifications", "https://juniperdocs.com/trust"),
      read("ai_specific", "https://juniperdocs.com/ai"),
      finish(),
    ],
    searches: [
      { kind: "news", query: "Juniper Docs data breach", results: [] },
      {
        kind: "web",
        query: "Juniper Docs security",
        results: [
          result(
            "https://www.softwarereviews.com/juniper-docs",
            "Juniper Docs reviews",
            "Juniper Docs is a document management tool that customers rate highly for search and permissions.",
          ),
        ],
      },
      { kind: "news", query: "Juniper Docs lawsuit", results: [] },
    ],
    pages: [
      {
        url: "https://juniperdocs.com/trust",
        page: page(
          "https://juniperdocs.com/trust",
          "Trust centre",
          "Juniper Docs completed its SOC 2 Type II audit in September 2026 with no exceptions. Our ISO 27001 certificate is valid until 2028.",
        ),
      },
      {
        url: "https://juniperdocs.com/ai",
        page: page(
          "https://juniperdocs.com/ai",
          "AI at Juniper Docs",
          "We do not use customer documents to train models. Our AI features run on a model provider that keeps no copy of your data.",
        ),
      },
    ],
    analysis: noFindings([
      { category: "certifications", note: "Both certificates are stated as current." },
      { category: "ai_specific", note: "The vendor says customer data is not used for training." },
    ]),
  },
  expected: { findings: [] },
  targets: {
    maxKept: 0,
    maxIrrelevantSources: 0,
    maxDuplicateSources: 0,
    maxBadUrls: 0,
    maxMislabelled: 0,
    maxCitationsRejected: 0,
  },
  gaps: {},
};
