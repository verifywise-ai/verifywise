import type { EvalCase } from "../types";
import { NOW, finish, page, read, result, search } from "./builders";

const SECURITYWIRE = "https://www.securitywire.com/northwind-breach";
const TECHDAILY = "https://www.techdaily.com/northwind-payroll-breach";
const NOTICE = "https://northwindpayroll.com/security-notice";

/**
 * The control: a real breach that a publisher reports and the vendor confirms on its own site, and
 * a vendor whose other pages hold nothing to report. Two independent publishers, one of them
 * credible (the vendor's own word), so the agent should keep exactly one finding, with a High
 * label. If this case fails, something that works has broken.
 */
export const BREACH_TWO_PUBLISHERS: EvalCase = {
  id: "breach-two-publishers",
  title: "A breach that a publisher reports and the vendor confirms",
  reproduces: "Nothing: the control. A good run keeps one finding and trusts it.",
  vendor: {
    name: "Northwind Payroll",
    website: "northwindpayroll.com",
    provides: "Payroll and HR software",
  },
  now: NOW,
  recording: {
    steps: [
      search("security_incidents", "Northwind Payroll data breach", "news"),
      read("security_incidents", SECURITYWIRE, "Read the report of the breach"),
      read("security_incidents", NOTICE, "Read the vendor's own notice of the breach"),
      search("legal_regulatory", "Northwind Payroll lawsuit fine", "news"),
      read("certifications", "https://northwindpayroll.com/trust"),
      read("ai_specific", "https://northwindpayroll.com/privacy"),
      search("availability", "Northwind Payroll outage", "news"),
      search("financial_health", "Northwind Payroll layoffs", "news"),
      finish(),
    ],
    searches: [
      {
        kind: "news",
        query: "Northwind Payroll data breach",
        results: [
          result(
            SECURITYWIRE,
            "Northwind Payroll confirms breach of employee records",
            "Northwind Payroll said on 24 September that an attacker accessed a reporting server and copied employee records of 40 customers.",
            "2026-09-25",
            "Security Wire",
          ),
          result(
            TECHDAILY,
            "Northwind Payroll breach hits 40 customers",
            "The payroll provider Northwind Payroll told customers that names and bank details of employees may have been copied.",
            "2026-09-26",
            "Tech Daily",
          ),
        ],
      },
      { kind: "news", query: "Northwind Payroll lawsuit fine", results: [] },
      { kind: "news", query: "Northwind Payroll outage", results: [] },
      { kind: "news", query: "Northwind Payroll layoffs", results: [] },
    ],
    pages: [
      {
        url: SECURITYWIRE,
        page: page(
          SECURITYWIRE,
          "Northwind Payroll confirms breach of employee records",
          "Northwind Payroll said on 24 September that an attacker accessed a reporting server and copied employee records of 40 customers. The company has closed the server and informed the regulator.",
        ),
      },
      {
        url: NOTICE,
        page: page(
          NOTICE,
          "Security notice",
          "On 24 September we found that an unauthorised party had accessed a reporting server and copied employee records of 40 customers. We have closed the server, informed the regulator and written to every customer concerned.",
        ),
      },
      {
        url: "https://northwindpayroll.com/trust",
        page: page(
          "https://northwindpayroll.com/trust",
          "Trust centre",
          "Northwind Payroll holds a SOC 2 Type II report. Our ISO 27001 certificate is renewed every year.",
        ),
      },
      {
        url: "https://northwindpayroll.com/privacy",
        page: page(
          "https://northwindpayroll.com/privacy",
          "Privacy policy",
          "We do not use customer data to train models. Subprocessors are listed on this page.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "An attacker copied employee records of 40 customers from a Northwind Payroll reporting server in September 2026.",
          impact_description:
            "Names and bank details of our employees may have been copied if we share payroll data with the vendor.",
          likelihood: "Possible",
          risk_severity: "Major",
          action_plan:
            "Ask the vendor whether our data was on the server and for its incident report.",
          rationale:
            "The vendor confirmed that employee records were copied, which is serious for a payroll provider.",
          evidence: [
            {
              source_id: "S1",
              quote:
                "an attacker accessed a reporting server and copied employee records of 40 customers",
            },
            {
              source_id: "S3",
              quote: "copied employee records of 40 customers",
            },
          ],
        },
      ],
      category_notes: [
        { category: "certifications", note: "SOC 2 Type II and ISO 27001 are stated as current." },
        { category: "ai_specific", note: "The vendor says it does not train on customer data." },
      ],
    },
  },
  expected: {
    findings: [
      {
        category: "security_incidents",
        anyOf: ["employee records", "bank details"],
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
    maxDatedWebResults: 0,
    maxSnippetOnlyFindings: 0,
    maxMislabelled: 0,
    maxDuplicateClusters: 0,
    maxCitationsRejected: 0,
  },
  gaps: {},
};
