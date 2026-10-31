import type { EvalCase } from "../types";
import { NOW, finish, page, read, result, search } from "./builders";

const AP = "https://apnews.com/article/quillon-health-ransomware-clinics-5e8a1c";
const YAHOO =
  "https://news.yahoo.com/quillon-health-ransomware-attack-delays-clinics-141500321.html";
const MSN =
  "https://www.msn.com/en-us/health/other/quillon-health-ransomware-attack-delays-clinics/ar-AA1qx7z";
const LOCAL = "https://www.rivertownherald.example/news/quillon-health-clinic-delays";

/** The story of the news agency, as both portals show it. */
const STORY =
  "Quillon Health said a ransomware attack shut down its scheduling system for three days, and clinics that use it went back to booking patients on paper. The company said it was restoring the system from backups and had found no sign that patient records were taken.";

/**
 * Worked case 4 of the credibility rule (spec D5.7): one story of the Associated Press, read as the
 * copies that two portals show, and the report of a local site. Each copy names the story on
 * apnews.com as its canonical address, and the source registry holds the portals as republishers
 * whose copies take the credit of the address they name, so both copies count as AP: one trusted
 * publisher, however many copies. The local site is unknown to the registry and adds nothing, so
 * the label is Medium (`trusted_press_one`). The page of AP itself is never read.
 *
 * If this case fails, the canonical address of a copy no longer reaches the label, a copy counts as
 * a publisher of its own, or the copies of one story count as two publishers.
 */
export const SYNDICATED_COPIES: EvalCase = {
  id: "syndicated-copies",
  title: "Two portals show the copies of one agency story, and a local site reports it",
  reproduces:
    "Worked case 4 of the credibility rule: the copies of one agency story on several portals are one publisher, the agency, and not several.",
  vendor: {
    name: "Quillon Health",
    website: "quillonhealth.example",
    provides: "Patient scheduling software",
  },
  now: NOW,
  recording: {
    steps: [
      search("security_incidents", "Quillon Health ransomware", "news"),
      read("security_incidents", YAHOO, "Read the copy of the agency story"),
      read("security_incidents", MSN, "Read the other copy of the agency story"),
      read("security_incidents", LOCAL, "Read the local report"),
      finish(),
    ],
    searches: [
      {
        kind: "news",
        query: "Quillon Health ransomware",
        results: [
          result(
            YAHOO,
            "Ransomware attack on Quillon Health delays clinic bookings",
            "Quillon Health said a ransomware attack shut down its scheduling system for three days.",
            "2026-09-29",
            "Yahoo News",
          ),
          result(
            MSN,
            "Ransomware attack on Quillon Health delays clinic bookings",
            "Clinics that use Quillon Health went back to booking patients on paper after a ransomware attack.",
            "2026-09-29",
            "MSN",
          ),
          result(
            LOCAL,
            "Rivertown clinics turn to paper after Quillon Health attack",
            "Patients in Rivertown waited for hours after Quillon Health was hit by ransomware.",
            "2026-09-30",
            "Rivertown Herald",
          ),
        ],
      },
    ],
    pages: [
      {
        url: YAHOO,
        page: {
          ...page(
            YAHOO,
            "Ransomware attack on Quillon Health delays clinic bookings",
            `By the Associated Press. ${STORY} Follow the latest health news on Yahoo News.`,
          ),
          canonicalUrl: AP,
        },
      },
      {
        url: MSN,
        page: {
          ...page(
            MSN,
            "Ransomware attack on Quillon Health delays clinic bookings",
            `${STORY} This story was first published by the Associated Press. More from MSN Health.`,
          ),
          canonicalUrl: AP,
        },
      },
      {
        url: LOCAL,
        page: page(
          LOCAL,
          "Rivertown clinics turn to paper after Quillon Health attack",
          "Two clinics in Rivertown told the Herald that patients waited for hours on Monday after Quillon Health, the company that runs their bookings, was hit by ransomware. Staff wrote appointments by hand until the system came back.",
        ),
      },
    ],
    analysis: {
      findings: [
        {
          category: "security_incidents",
          risk_description:
            "A ransomware attack shut down the scheduling system of Quillon Health for three days in September 2026, and its clinics went back to paper bookings.",
          impact_description:
            "Our patients cannot be booked through the system while the vendor restores it, and an attack may reach the data it holds.",
          likelihood: "Possible",
          risk_severity: "Major",
          action_plan:
            "Ask the vendor for its incident report and for the plan that keeps bookings running during an outage.",
          confidence: "medium",
          rationale:
            "An agency story and a local report describe the attack, and the outage stopped bookings for days.",
          evidence: [
            {
              source_id: "S1",
              quote: "a ransomware attack shut down its scheduling system for three days",
            },
            {
              source_id: "S2",
              quote: "clinics that use it went back to booking patients on paper",
            },
            { source_id: "S3", quote: "was hit by ransomware" },
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
        anyOf: ["ransomware", "scheduling system"],
        credibility: "medium",
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
