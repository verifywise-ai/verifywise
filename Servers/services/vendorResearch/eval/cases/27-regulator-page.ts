import type { EvalCase } from "../types";
import { NOW, finish, page, read, result, search } from "./builders";

const NEWS = "https://www.hrtechbulletin.example/pemberton-hire-fined-over-applicant-cvs";
const ICO = "https://ico.org.uk/action-weve-taken/enforcement/pemberton-hire-ltd/";

/**
 * Worked case 8 of the credibility rule (spec D5.7): a news site that the source registry does not
 * know reports a fine of the data protection regulator, and the run reads the regulator's own
 * enforcement page as well. One official source that was read is enough, so the label is High
 * (`official_page`); the news site adds nothing to it.
 *
 * If this case fails, a page of a regulator no longer counts as official, or one official source is
 * no longer enough.
 */
export const REGULATOR_PAGE: EvalCase = {
  id: "regulator-page",
  title: "A news site reports a fine, and the regulator's own page is read",
  reproduces:
    "Worked case 8 of the credibility rule: the regulator's own record of a fine is the best evidence of it.",
  vendor: {
    name: "Pemberton Hire",
    website: "pembertonhire.example",
    provides: "Recruitment software",
  },
  now: NOW,
  recording: {
    steps: [
      search("legal_regulatory", "Pemberton Hire fine", "news"),
      search("legal_regulatory", "Pemberton Hire ICO enforcement", "web"),
      read("legal_regulatory", NEWS, "Read the report of the fine"),
      read("legal_regulatory", ICO, "Read the regulator's record of the fine"),
      finish(),
    ],
    searches: [
      {
        kind: "news",
        query: "Pemberton Hire fine",
        results: [
          result(
            NEWS,
            "Pemberton Hire fined over applicant CVs",
            "The data protection regulator has fined Pemberton Hire for keeping the CVs of unsuccessful applicants for years.",
            "2026-09-15",
            "HR Tech Bulletin",
          ),
        ],
      },
      {
        kind: "web",
        query: "Pemberton Hire ICO enforcement",
        results: [
          result(
            ICO,
            "Pemberton Hire Ltd",
            "The Information Commissioner's Office has fined Pemberton Hire Ltd for keeping the CVs of job applicants without a lawful basis.",
          ),
        ],
      },
    ],
    pages: [
      {
        url: NEWS,
        page: page(
          NEWS,
          "Pemberton Hire fined over applicant CVs",
          "The data protection regulator has fined Pemberton Hire £120,000 for keeping the CVs of unsuccessful applicants for up to seven years. Pemberton Hire said it had deleted the old CVs and would not appeal.",
        ),
      },
      {
        url: ICO,
        page: page(
          ICO,
          "Pemberton Hire Ltd",
          "Pemberton Hire Ltd. The Information Commissioner's Office has fined Pemberton Hire Ltd £120,000 for keeping the CVs of job applicants for up to seven years without a lawful basis. Date: 12 September 2026. Type: monetary penalty. Sector: employment.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "legal_regulatory",
          risk_description:
            "The Information Commissioner's Office fined Pemberton Hire £120,000 in September 2026 for keeping the CVs of job applicants for up to seven years without a lawful basis.",
          impact_description:
            "The CVs of our applicants may be kept for longer than the law allows if we recruit through the vendor.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan:
            "Ask the vendor how long it now keeps CVs, and to confirm that ours are deleted on time.",
          rationale: "The regulator's own page records the fine.",
          evidence: [
            {
              source_id: "S1",
              quote:
                "has fined Pemberton Hire £120,000 for keeping the CVs of unsuccessful applicants",
            },
            {
              source_id: "S2",
              quote:
                "fined Pemberton Hire Ltd £120,000 for keeping the CVs of job applicants for up to seven years without a lawful basis",
            },
          ],
        },
      ],
      category_notes: [],
    },
  },
  expected: {
    findings: [{ category: "legal_regulatory", anyOf: ["CVs", "120,000"], credibility: "high" }],
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
