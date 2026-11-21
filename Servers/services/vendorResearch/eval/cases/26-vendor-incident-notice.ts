import type { EvalCase } from "../types";
import { NOW, finish, page, read, result, search } from "./builders";

const NOTICE = "https://larkhillpayroll.example/blog/security-update";

/**
 * Worked case 7 of the credibility rule (spec D5.7): the vendor reports an incident of its own on
 * its blog, and nobody else does. A vendor that admits an incident is the strongest witness of it,
 * so a page of the vendor's site cited by a finding in an event category is a statement (rule V),
 * and the label is High (`vendor_statement`), on that one page.
 *
 * If this case fails, a vendor's notice of its own incident no longer counts as its statement.
 */
export const VENDOR_INCIDENT_NOTICE: EvalCase = {
  id: "vendor-incident-notice",
  title: "The vendor reports an incident of its own on its blog",
  reproduces:
    "Worked case 7 of the credibility rule: a vendor's own notice of an incident is the best evidence of it.",
  vendor: {
    name: "Larkhill Payroll",
    website: "larkhillpayroll.example",
    provides: "Payroll software",
  },
  now: NOW,
  recording: {
    steps: [
      search("security_incidents", "Larkhill Payroll security incident", "web"),
      read("security_incidents", NOTICE, "Read the vendor's security update"),
      finish(),
    ],
    searches: [
      {
        kind: "web",
        query: "Larkhill Payroll security incident",
        results: [
          result(
            NOTICE,
            "Security update",
            "On 29 September we found that an attacker had used a stolen password to sign in to our support system.",
          ),
        ],
      },
    ],
    pages: [
      {
        url: NOTICE,
        page: page(
          NOTICE,
          "Security update",
          "Security update from Larkhill Payroll, 2 October 2026. On 29 September we found that an attacker had used a stolen password to sign in to our support system and view the payslips of employees of 85 customers. We reset every password of the support system the same day, and we have written to each customer concerned.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "An attacker used a stolen password to sign in to the support system of Larkhill Payroll and view the payslips of employees of 85 customers in September 2026.",
          impact_description:
            "The payslips of our employees may have been seen if we are one of the customers concerned.",
          likelihood: "Possible",
          risk_severity: "Major",
          action_plan:
            "Ask the vendor whether we are one of the 85 customers and how it now protects the sign-in of its support system.",
          rationale:
            "The vendor reports the incident itself, and payslips hold personal and financial data.",
          evidence: [
            {
              source_id: "S1",
              quote:
                "an attacker had used a stolen password to sign in to our support system and view the payslips of employees of 85 customers",
            },
          ],
        },
      ],
      category_notes: [],
    },
  },
  expected: {
    findings: [
      {
        category: "security_incidents",
        anyOf: ["payslips", "support system"],
        credibility: "high",
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
    maxSnippetOnlyFindings: 0,
    maxMislabelled: 0,
    maxCitationsRejected: 0,
  },
  gaps: {},
};
