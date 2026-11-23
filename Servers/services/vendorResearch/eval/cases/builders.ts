/**
 * Small helpers for writing the recordings of the cases, so that a case reads as a story: the
 * model searches, reads and finishes, the web answers, the model analyses.
 */
import type {
  RecordStatus,
  ResearchCategory,
  VrdbSourceId,
} from "../../../../domain.layer/interfaces/i.vendorResearch";
import type { FetchedPage } from "../../../webResearch/readPage";
import type { LoopStep } from "../../../webResearch/researchLoop";
import type { SearchKind, SearchResult } from "../../../webResearch/webSearch";
import type { ResearchOutput } from "../../schema";
import { VRDB_SOURCES } from "../../vrdb/sources";
import type { ParsedRecord, VrdbRow, VrdbSourceState } from "../../vrdb/types";
import type { Recording } from "../types";

/** The moment of every case, so that the lookback windows are the same for all of them. */
export const NOW = "2026-10-10T12:00:00Z";

export type ModelFinding = ResearchOutput["findings"][number];

export const result = (
  url: string,
  title: string,
  snippet: string,
  publishedAt: string | null = null,
  source: string | null = null,
): SearchResult => ({ title, url, snippet, publishedAt, source });

export const search = (
  category: ResearchCategory,
  query: string,
  kind: SearchKind,
  thought = `Search for ${query}`,
): LoopStep<ResearchCategory> => ({
  thought,
  actions: [{ action: "search", category, query, kind }],
});

export const read = (
  category: ResearchCategory,
  url: string,
  thought = "Read the page",
): LoopStep<ResearchCategory> => ({
  thought,
  actions: [{ action: "read", category, url }],
});

/** A read of a part of a long page that an earlier step read. */
export const readPart = (
  category: ResearchCategory,
  url: string,
  part: number,
  thought = "Read the next part of the page",
): LoopStep<ResearchCategory> => ({
  thought,
  actions: [{ action: "read", category, url, part }],
});

export const finish = (thought = "Every category is covered"): LoopStep<ResearchCategory> => ({
  thought,
  actions: [{ action: "finish" }],
});

export const page = (url: string, title: string, text: string): FetchedPage => ({
  url,
  title,
  publishedAt: null,
  text,
  links: [],
});

export const noFindings = (
  notes: ResearchOutput["category_notes"] = [],
): Recording["analysis"] => ({ findings: [], category_notes: notes });

/** The topics of the news searches the routine work makes for a vendor (see queries.ts). */
const NEWS_TOPICS = [
  "data breach",
  "security incident",
  "lawsuit",
  "fined",
  "FTC",
  "settlement",
  "outage",
  "layoffs",
  "bankruptcy",
  "acquisition",
];

/** The news searches of the routine work for a vendor of this name, none of which found anything. */
export const quietNews = (name: string): Recording["searches"] =>
  NEWS_TOPICS.map((topic) => ({ kind: "news" as const, query: `${name} ${topic}`, results: [] }));

/**
 * The copy of a list as the vendor risk database keeps it: the records its connector parsed, with
 * ids from `firstId` and the status the sync gave them.
 */
export const rowsOf = (
  sourceId: VrdbSourceId,
  records: readonly ParsedRecord[],
  firstId: number,
  status: RecordStatus = "active",
): VrdbRow[] =>
  records.map((record, index) => ({
    id: firstId + index,
    sourceId,
    sourceRecordId: record.sourceRecordId,
    recordType: record.recordType,
    status,
    title: record.title,
    summary: record.summary,
    url: record.url,
    matchKeys: record.matchKeys,
    publishedAt: record.publishedAt,
  }));

/**
 * Where the copy of each list stands: brought up to date an hour before NOW, unless `changes` says
 * otherwise for a list.
 */
export const copies = (
  changes: Partial<Record<VrdbSourceId, Partial<VrdbSourceState>>> = {},
): VrdbSourceState[] =>
  VRDB_SOURCES.map(({ id }) => ({
    id,
    lastSuccessAt: new Date("2026-10-10T11:00:00Z"),
    lastOutcome: "ok",
    sourceVersion: null,
    etag: null,
    lastModified: null,
    activeRecords: 0,
    ...changes[id],
  }));
