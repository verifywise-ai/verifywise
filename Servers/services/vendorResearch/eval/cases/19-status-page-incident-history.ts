import { hibpUrl } from "../../records/hibp";
import { KEV_URL } from "../../records/kev";
import { nvdUrl } from "../../records/nvd";
import { SEC_TICKERS_URL } from "../../records/sec";
import { parseStatusFeed, statusFeedUrl, statusRecords } from "../../records/statuspage";
import type { RecordsOutcome } from "../../records";
import type { EvalCase } from "../types";
import { NOW, finish, page } from "./builders";

const SITE = "https://larchstorage.example";
const STATUS_HOST = "status.larchstorage.example";

const vendor = { name: "Larch Storage Ltd", website: "larchstorage.example" };

/** The update of an incident as Atlassian Statuspage writes it: HTML, escaped inside the feed. */
const update = (label: string, month: string, day: string, time: string, text: string): string =>
  `&lt;p&gt;&lt;small&gt;${month} &lt;var data-var='date'&gt;${day}&lt;/var&gt;, &lt;var data-var='time'&gt;${time}&lt;/var&gt; UTC&lt;/small&gt;&lt;br&gt;&lt;strong&gt;${label}&lt;/strong&gt; - ${text}&lt;/p&gt;`;

const entry = (fields: {
  id: string;
  published: string;
  updated: string;
  title: string;
  content: string;
}): string => `<entry>
    <id>tag:${STATUS_HOST},2005:Incident/${fields.id}</id>
    <published>${fields.published}</published>
    <updated>${fields.updated}</updated>
    <link rel="alternate" type="text/html" href="https://${STATUS_HOST}/incidents/${fields.id}"/>
    <title>${fields.title}</title>
    <content type="html">${fields.content}</content>
  </entry>`;

/**
 * What the status page of the vendor held, as the feed it publishes, run through the code that
 * reads it (see records/statuspage.ts), so that the text of a record is the one a run gets. The
 * feed holds a long outage, a short delay, a planned maintenance and an incident from before the
 * lookback of the category.
 */
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xml:lang="en-US" xmlns="http://www.w3.org/2005/Atom">
  <id>tag:${STATUS_HOST},2005:/history</id>
  <link rel="alternate" type="text/html" href="https://${STATUS_HOST}"/>
  <link rel="self" type="application/atom+xml" href="https://${STATUS_HOST}/history.atom"/>
  <title>Larch Storage Status - Incident History</title>
  <updated>2026-10-08T10:00:00Z</updated>
  ${[
    entry({
      id: "r7q2m9x4k1b8",
      published: "2026-09-24T09:55:00Z",
      updated: "2026-09-24T16:40:00Z",
      title: "Object storage unavailable in the EU region",
      content: [
        update(
          "Resolved",
          "Sep",
          "24",
          "16:40",
          "Object storage in the EU region is available again. Customers could not read or write objects for 6 hours and 10 minutes.",
        ),
        update(
          "Monitoring",
          "Sep",
          "24",
          "15:20",
          "A fix has been applied and requests are succeeding. We are watching the error rate.",
        ),
        update(
          "Identified",
          "Sep",
          "24",
          "12:05",
          "A failed network change in our EU data center cut the storage nodes off from their metadata service.",
        ),
        update(
          "Investigating",
          "Sep",
          "24",
          "09:55",
          "Read and write requests to object storage in the EU region are failing.",
        ),
      ].join(""),
    }),
    entry({
      id: "d4n6v1c8p3t5",
      published: "2026-08-30T08:10:00Z",
      updated: "2026-08-30T08:50:00Z",
      title: "Delayed email notifications",
      content: [
        update(
          "Resolved",
          "Aug",
          "30",
          "08:50",
          "Email notifications are being sent again. They were delayed by 40 minutes.",
        ),
        update("Investigating", "Aug", "30", "08:10", "Email notifications are delayed."),
      ].join(""),
    }),
    entry({
      id: "m2k8w5z7h9q1",
      published: "2026-08-12T20:00:00Z",
      updated: "2026-08-12T22:00:00Z",
      title: "Control plane scheduled maintenance",
      content: [
        update("Completed", "Aug", "12", "22:00", "The scheduled maintenance has been completed."),
        update("Scheduled", "Aug", "11", "09:00", "We will upgrade the control plane."),
      ].join(""),
    }),
    entry({
      id: "b9s3f6j2y4g7",
      published: "2025-06-02T11:00:00Z",
      updated: "2025-06-02T13:00:00Z",
      title: "Upload errors",
      content: update("Resolved", "Jun", "2", "13:00", "Uploads are working again."),
    }),
  ].join("\n  ")}
</feed>`;

const feed = parseStatusFeed(FEED);
const status =
  feed === null
    ? { records: [], omitted: {} }
    : statusRecords(feed, { host: STATUS_HOST, cutoff: "2025-10-10", now: new Date(NOW) });
const NOW_DATE = new Date(NOW);

const records: RecordsOutcome[] = [
  { source: "kev", url: KEV_URL, outcome: "empty", records: [], omitted: {}, ms: 190 },
  {
    source: "nvd",
    url: nvdUrl("larchstorage", NOW_DATE, "2024-10-10"),
    outcome: "empty",
    records: [],
    omitted: {},
    ms: 870,
  },
  {
    source: "hibp",
    url: hibpUrl("larchstorage.example"),
    outcome: "empty",
    records: [],
    omitted: {},
    ms: 150,
  },
  { source: "sec", url: SEC_TICKERS_URL, outcome: "empty", records: [], omitted: {}, ms: 320 },
  { source: "statuspage", url: statusFeedUrl(STATUS_HOST), outcome: "ok", ...status, ms: 260 },
];

/**
 * A vendor of object storage that had a long outage in September: customers in the EU region could
 * not read or write objects for six hours. The news search has nothing: no article covers it. The
 * incident is in the history that the vendor publishes on its status page, and the code reads that
 * feed (the page offers it as the subscription feed of its incident history, and its robots.txt
 * allows it) and gives the run the newest incidents of the lookback as records, with the updates in
 * the words of the vendor. A short delay is a record too, and a planned maintenance and an incident
 * from before the lookback are not. The record is a source that was read, so the finding that cites
 * it is no finding on a snippet; it is one page of a publisher that is not credible by itself, so
 * the confidence is low.
 *
 * Under the credibility rule the label is High: the status page is the vendor's own statement of
 * its outage (rule V), and one is enough (spec D5.6 #3).
 *
 * If this case fails, the status page is no longer read or its records no longer reach the evidence,
 * a planned maintenance or an incident from before the lookback is let in, or a record is counted
 * as a snippet.
 */
export const STATUS_PAGE_INCIDENT_HISTORY: EvalCase = {
  id: "status-page-incident-history",
  title: "The status page lists a long outage and the news has nothing",
  reproduces:
    "A six-hour outage of the service was on the vendor's status page and in no news the search found, so the run reported a clean record.",
  vendor: {
    name: vendor.name,
    website: vendor.website,
    provides: "Object storage",
  },
  now: NOW,
  gather: true,
  recording: {
    steps: [finish("The code collected the news, the records and the vendor's pages")],
    searches: [
      { kind: "news", query: "Larch Storage data breach", results: [] },
      { kind: "news", query: "Larch Storage security incident", results: [] },
      { kind: "news", query: "Larch Storage lawsuit", results: [] },
      { kind: "news", query: "Larch Storage fined", results: [] },
      { kind: "news", query: "Larch Storage FTC", results: [] },
      { kind: "news", query: "Larch Storage settlement", results: [] },
      { kind: "news", query: "Larch Storage outage", results: [] },
      { kind: "news", query: "Larch Storage layoffs", results: [] },
      { kind: "news", query: "Larch Storage bankruptcy", results: [] },
      { kind: "news", query: "Larch Storage acquisition", results: [] },
    ],
    pages: [
      {
        url: `${SITE}/`,
        page: page(
          `${SITE}/`,
          "Larch Storage",
          "Larch Storage sells object storage to mid-sized companies.",
        ),
      },
    ],
    records,
    analysis: {
      findings: [
        {
          category: "availability",
          risk_description:
            "The status page of the vendor lists an outage on 24 September 2026 in which object storage in its EU region could not be read or written for more than six hours.",
          impact_description:
            "Anything of ours that reads or writes objects in the EU region was down for the time of the outage, and the vendor's own account says a failed network change caused it.",
          likelihood: "Possible",
          risk_severity: "Moderate",
          action_plan:
            "Ask the vendor for its report on the outage and the changes it made to prevent a failed network change from cutting off its storage nodes again, and check what our own systems do when storage is unavailable.",
          confidence: "low",
          rationale:
            "The vendor's own status page reports the outage and its length, but it is the only source: no news confirms it and the page does not say how many customers were affected.",
          evidence: [
            {
              source_id: "S2",
              quote: "Customers could not read or write objects for 6 hours and 10 minutes.",
            },
          ],
        },
      ],
      category_notes: [
        {
          category: "security_incidents",
          note: "The news search and the databases found no breach.",
        },
        {
          category: "legal_regulatory",
          note: "The news search found no fine or lawsuit.",
        },
      ],
    },
  },
  expected: {
    findings: [
      {
        category: "availability",
        anyOf: ["outage", "object storage", "EU region"],
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
    maxOverconfident: 0,
    maxMislabelled: 0,
    maxDuplicateClusters: 0,
    maxCitationsRejected: 0,
  },
  gaps: {},
};
