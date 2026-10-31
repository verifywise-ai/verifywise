import type { EvalCase } from "../types";
import { NOW, finish, noFindings, page, read } from "./builders";

/**
 * The model copies an address from its own text and takes a curly quotation mark with it. The site
 * answers with its landing page, so the read succeeds, and the entry is kept under an address
 * that nobody can open.
 */
export const BROKEN_URL: EvalCase = {
  id: "broken-url",
  title: "An address that ends in a quotation mark",
  reproduces: "platform.openai.com/%E2%80%9D got into the evidence.",
  vendor: {
    name: "Opendeck AI",
    website: "opendeck.ai",
    provides: "Presentation tools with built-in AI",
  },
  now: NOW,
  recording: {
    steps: [
      read("ai_specific", "https://platform.opendeck.ai/%E2%80%9D", "Read the developer platform"),
      read("ai_specific", "https://opendeck.ai/privacy"),
      read("certifications", "https://opendeck.ai/trust"),
      finish("Nothing else to read; the news categories have no searches left in this case"),
      finish(),
    ],
    searches: [],
    pages: [
      {
        url: "https://platform.opendeck.ai/%E2%80%9D",
        page: page(
          "https://platform.opendeck.ai/%E2%80%9D",
          "Opendeck platform",
          "Welcome to the Opendeck developer platform. Create an API key to start.",
        ),
      },
      {
        url: "https://opendeck.ai/privacy",
        page: page(
          "https://opendeck.ai/privacy",
          "Privacy",
          "Customer documents are not used to train models.",
        ),
      },
      {
        url: "https://opendeck.ai/trust",
        page: page("https://opendeck.ai/trust", "Trust", "Opendeck has an ISO 27001 certificate."),
      },
    ],
    analysis: noFindings(),
  },
  expected: { findings: [] },
  targets: { maxKept: 0, maxBadUrls: 0, maxMislabelled: 0 },
  gaps: {},
};
