/**
 * Events: the sources of a run that report one and the same event, such as one ransomware attack
 * told by two outlets, the vendor's own notice and a regulator's reaction to it. The research
 * finds the sources one by one, and the analysis used to turn one event into several findings (what
 * happened, what may have been taken, who was told), each in its own words. An event is found
 * here, by code, so that the analysis is shown the sources of an event together (see prompts.ts)
 * and so that an event becomes at most one finding (see dedupe.ts).
 *
 * No model is used and no word list of a vendor: two sources report one event when
 *
 * - both have a date, the later is at most EVENT_WINDOW_DAYS after the earliest of the event (the
 *   anchor, so that a long run of weekly stories does not chain into one event), and they are of
 *   one kind of event (an intrusion, an outage, a lawsuit, an enforcement), read from the title and
 *   the start of the text, or
 * - they name the same vulnerability (a CVE id), whatever their dates.
 *
 * A source with no date can only join an event through a CVE id: an event has a date. A page of
 * the vendor's own site is read by its title alone, because a trust page that tells how to report an
 * incident is not about one. The rule is deliberately narrow: a source that fits no event stands
 * alone, and two incidents of one kind in the same three weeks are taken for one.
 */
import type { EvidenceSource } from "../../domain.layer/interfaces/i.vendorResearch";

/** The most days between the first source of an event and a later one. */
export const EVENT_WINDOW_DAYS = 21;
/** How much of the text of a source is read for its kind and its vulnerabilities. */
export const EVENT_TEXT_CHARS = 300;

const DAY_MS = 86_400_000;

export type EventKind = "intrusion" | "outage" | "lawsuit" | "enforcement";

/** The words of each kind. Whole words, in any case; "fine print" is no fine. */
const EVENT_KINDS: ReadonlyArray<{ kind: EventKind; patterns: readonly RegExp[] }> = [
  {
    kind: "intrusion",
    patterns: [
      /\b(?:ransomware|malware|phishing|extortion|stolen|stole)\b/i,
      /\b(?:data )?breach(?:ed|es)?\b/i,
      /\bhack(?:ed|ers?|ing)?\b/i,
      /\bcyber ?(?:attacks?|incidents?)\b/i,
      /\bsecurity incidents?\b/i,
      /\bleak(?:ed|s|age)?\b/i,
      /\bexposed\b/i,
      /\bcompromis(?:ed|e)\b/i,
      /\bunauthori[sz]ed access\b/i,
      /\battack(?:s|ed|ers?)?\b/i,
    ],
  },
  { kind: "outage", patterns: [/\b(?:outages?|downtime|went down|offline|disruptions?)\b/i] },
  {
    kind: "lawsuit",
    patterns: [
      /\b(?:lawsuits?|sued|sues|settle(?:d|ments?)|court|judge|plaintiffs?|litigation)\b/i,
      /\bclass actions?\b/i,
    ],
  },
  {
    kind: "enforcement",
    patterns: [
      /\bfined?\b(?!\s+print)/i,
      /\b(?:fines|penalt(?:y|ies)|investigations?|probe|enforcement|regulators?)\b/i,
    ],
  },
];

const CVE_ID = /\bCVE-\d{4}-\d{4,}\b/gi;

/** The kinds of event a text reports; the title is read whole and the content to EVENT_TEXT_CHARS. */
export function eventKindsOf(text: { title: string; content: string }): Set<EventKind> {
  const read = `${text.title} ${text.content.slice(0, EVENT_TEXT_CHARS)}`;
  return new Set(
    EVENT_KINDS.filter(({ patterns }) => patterns.some((pattern) => pattern.test(read))).map(
      ({ kind }) => kind,
    ),
  );
}

const cveIdsOf = (source: EvidenceSource): Set<string> =>
  new Set(
    `${source.title} ${source.content.slice(0, EVENT_TEXT_CHARS)}`
      .match(CVE_ID)
      ?.map((id) => id.toUpperCase()) ?? [],
  );

const timeOf = (source: EvidenceSource): number | null => {
  if (source.publishedAt === null) return null;
  const time = Date.parse(source.publishedAt);
  return Number.isNaN(time) ? null : time;
};

const sharesAny = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean =>
  [...a].some((x) => b.has(x));

/** A source of the pack with what is read from it, and its place in the pack. */
interface Entry {
  source: EvidenceSource;
  index: number;
  time: number | null;
  kinds: Set<EventKind>;
  cves: Set<string>;
}

export interface EventCluster {
  /** `E1`, `E2`, ... by the place of the first source of the event in the pack. */
  id: string;
  /** The ids of its sources (two or more), in the order of the pack. */
  sourceIds: string[];
}

/** The earliest first, then the order of the pack; the sources with no date last. */
function byDate(a: Entry, b: Entry): number {
  if (a.time === b.time) return a.index - b.index;
  if (a.time === null) return 1;
  if (b.time === null) return -1;
  return a.time - b.time;
}

/**
 * The events of a pack: the groups of two or more sources that report one event, in the order of
 * their first source. A source that fits no event is in none. The pack is not changed.
 */
export function clusterSources(pack: readonly EvidenceSource[]): EventCluster[] {
  const entries: Entry[] = pack.map((source, index) => ({
    source,
    index,
    time: timeOf(source),
    // The vendor's own pages are read by their title alone.
    kinds: eventKindsOf({
      title: source.title,
      content: source.onVendorSite ? "" : source.content,
    }),
    cves: cveIdsOf(source),
  }));

  const events: Array<{ anchor: Entry; members: Entry[] }> = [];
  for (const entry of [...entries].sort(byDate)) {
    const event = events.find(
      ({ anchor, members }) =>
        members.some((member) => sharesAny(member.cves, entry.cves)) ||
        (entry.time !== null &&
          anchor.time !== null &&
          entry.time - anchor.time <= EVENT_WINDOW_DAYS * DAY_MS &&
          sharesAny(anchor.kinds, entry.kinds)),
    );
    if (event === undefined) events.push({ anchor: entry, members: [entry] });
    else event.members.push(entry);
  }

  return events
    .filter(({ members }) => members.length > 1)
    .map(({ members }) => members.map(({ index }) => index).sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0])
    .map((indexes, position) => ({
      id: `E${position + 1}`,
      sourceIds: indexes.map((index) => pack[index].id),
    }));
}

/** The event of every source that has one, by the address of the source. */
export function eventIdsByUrl(
  clusters: readonly EventCluster[],
  pack: readonly EvidenceSource[],
): Map<string, string> {
  const eventOfSource = new Map(
    clusters.flatMap((cluster) =>
      cluster.sourceIds.map((id): [string, string] => [id, cluster.id]),
    ),
  );
  const byUrl = new Map<string, string>();
  for (const source of pack) {
    const event = eventOfSource.get(source.id);
    if (event !== undefined) byUrl.set(source.url, event);
  }
  return byUrl;
}
