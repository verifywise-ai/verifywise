import type { EvalCase } from "../types";
import { NOW, finish, page, read, result, search } from "./builders";

const WIRE = "https://www.financewire.com/delta-ledger-ransomware";
const REGISTER = "https://www.registerdaily.com/delta-ledger-ransomware-regulator";

/**
 * One ransomware attack, told by two articles. The model turns it into three findings in two
 * categories, each with its own wording: the attack itself, the data that may have left, and the
 * duty to tell the regulator. A person sees one event, and so does the code: the two articles are
 * dated two days apart and both report an attack (see clusters.ts), so the analysis keeps the most
 * severe finding of the event.
 *
 * If this case fails, an event is again reported as several findings.
 */
export const ONE_EVENT_THREE_FINDINGS: EvalCase = {
  id: "one-event-three-findings",
  title: "One ransomware attack, three findings",
  reproduces: "One news cluster became three findings in two categories.",
  vendor: {
    name: "Delta Ledger",
    website: "deltaledger.com",
    provides: "Accounting software for small companies",
  },
  now: NOW,
  recording: {
    steps: [
      search("security_incidents", "Delta Ledger ransomware", "news"),
      search("legal_regulatory", "Delta Ledger regulator", "news"),
      read("certifications", "https://deltaledger.com/security"),
      read("ai_specific", "https://deltaledger.com/privacy"),
      finish(),
    ],
    searches: [
      {
        kind: "news",
        query: "Delta Ledger ransomware",
        results: [
          result(
            WIRE,
            "Delta Ledger services down after ransomware attack",
            "Delta Ledger took its cloud accounting service offline for four days after a ransomware attack, and says some customer files may have been copied.",
            "2026-07-14",
            "Finance Wire",
          ),
        ],
      },
      {
        kind: "news",
        query: "Delta Ledger regulator",
        results: [
          result(
            REGISTER,
            "Delta Ledger tells regulator about ransomware attack",
            "Delta Ledger has informed the data protection authority about the ransomware attack and could face questions about how quickly it acted.",
            "2026-07-16",
            "Register Daily",
          ),
        ],
      },
    ],
    pages: [
      {
        url: "https://deltaledger.com/security",
        page: page(
          "https://deltaledger.com/security",
          "Security",
          "Delta Ledger holds an ISO 27001 certificate.",
        ),
      },
      {
        url: "https://deltaledger.com/privacy",
        page: page(
          "https://deltaledger.com/privacy",
          "Privacy",
          "We do not train models on customer data.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "Delta Ledger's cloud service was offline for four days after a ransomware attack in July 2026.",
          impact_description:
            "Our month-end bookkeeping could be blocked when the vendor loses its systems.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan: "Ask for the vendor's recovery targets and test our own offline copies.",
          confidence: "medium",
          rationale: "The outage is confirmed and could block our month-end close.",
          evidence: [
            {
              source_id: "S1",
              quote:
                "took its cloud accounting service offline for four days after a ransomware attack",
            },
          ],
        },
        {
          category: "security_incidents",
          risk_description:
            "Customer files may have been copied by the attackers who locked Delta Ledger's systems.",
          impact_description:
            "Invoices and tax records that we upload could now be in criminal hands.",
          likelihood: "Possible",
          risk_severity: "Major",
          action_plan:
            "Ask whether our uploads were among the files, and rotate shared credentials.",
          confidence: "low",
          rationale: "The incident touched customer data, so the effect is serious.",
          evidence: [{ source_id: "S1", quote: "some customer files may have been copied" }],
        },
        {
          category: "legal_regulatory",
          risk_description:
            "The data protection authority has been told and may question how quickly Delta Ledger acted.",
          impact_description:
            "A fine or an order could follow, and could end up in the vendor's prices.",
          likelihood: "Unlikely",
          risk_severity: "Minor",
          action_plan:
            "Follow the authority's decision and review the vendor's breach duties in our contract.",
          confidence: "low",
          rationale: "A fine is possible but not announced, and its effect would be small.",
          evidence: [{ source_id: "S3", quote: "could face questions about how quickly it acted" }],
        },
      ],
      category_notes: [],
    },
  },
  expected: {
    findings: [
      { category: "security_incidents", anyOf: ["ransomware", "locked"], credibility: "low" },
    ],
    clusters: [
      { id: "ransomware-july", anyOf: ["ransomware", "attackers", "data protection authority"] },
    ],
  },
  targets: { minRecall: 1, maxKept: 1, maxMislabelled: 0, maxDuplicateClusters: 0 },
  // One event is at most one finding.
  gaps: {},
};
