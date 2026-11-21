/**
 * Have I Been Pwned (HIBP): the public list of data breaches. `GET /api/v3/breaches?Domain=` needs
 * no key and gives the breaches of the service on one domain. The data is licensed under Creative
 * Commons Attribution 4.0: every record names Have I Been Pwned as its source, its address is on
 * haveibeenpwned.com (the page of the breach in the API, since the session keeps no fragment),
 * and so does the text the model quotes. Collections that are not a breach of the service (a spam
 * list, a malware or stealer log, a fabricated or retired entry) are left out.
 */
import { decodeEntities } from "../../webResearch/pageText";
import { cleanText } from "../text";
import { joinSentences, sentence } from "./sentence";
import { MAX_RECORDS, type SourceRecord } from "./types";

export const HIBP_MAX_BYTES = 2 * 1024 * 1024;
const MAX_DESCRIPTION_CHARS = 1200;

export const hibpUrl = (domain: string): string =>
  `https://haveibeenpwned.com/api/v3/breaches?Domain=${encodeURIComponent(domain)}`;

export interface Breach {
  name: string;
  title: string;
  domain: string;
  /** YYYY-MM-DD */
  breachDate: string;
  /** YYYY-MM-DD, the day HIBP added the breach. */
  addedDate: string;
  pwnCount: number | null;
  /** Plain text. */
  description: string;
  dataClasses: string[];
  verified: boolean;
  attribution: string;
}

/**
 * The name of a breach is the last segment of the address of its record. HIBP's names have
 * hyphens ("7-Eleven"), so a hyphen, a dot and an underscore are allowed after the first character,
 * which is a letter or a digit, so that a name is never "." or "..", which would change the path.
 */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const DAY = /^\d{4}-\d{2}-\d{2}/;
const textOf = (value: unknown): string => (typeof value === "string" ? value : "");

const LESS_THAN = 0x3c;
const GREATER_THAN = 0x3e;

/**
 * The text without anything from a `<` to the next `>` with no `<` or `>` between them. A tag that
 * removing another one puts together (`<scr<b>ipt>`) is removed too, as if the tags were removed
 * again and again until none is left, but in one pass: the `<` that are still open are kept on a
 * stack, and a `>` closes the last one. A `>` that closes no `<` is kept.
 */
function withoutTags(text: string): string {
  const kept: number[] = [];
  const open: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === LESS_THAN) {
      open.push(kept.length);
      kept.push(code);
    } else if (code === GREATER_THAN && open.length > 0) {
      kept.length = open.pop() as number;
    } else {
      kept.push(code);
    }
  }
  let result = "";
  for (let index = 0; index < kept.length; index += 8192) {
    result += String.fromCharCode(...kept.slice(index, index + 8192));
  }
  return result;
}

/** The text of a description that HIBP writes in a little HTML. */
function plainText(html: string): string {
  const text = decodeEntities(withoutTags(html.replace(/<br\s*\/?>/gi, " ")));
  return cleanText(text).replace(/\s+/g, " ").trim();
}

/** The breaches of a document that are a breach of a service and can be used. */
export function parseHibp(body: unknown): Breach[] {
  if (!Array.isArray(body)) return [];
  const breaches: Breach[] = [];
  for (const item of body) {
    if (typeof item !== "object" || item === null) continue;
    const fields = item as Record<string, unknown>;
    const name = textOf(fields.Name);
    const breachDate = textOf(fields.BreachDate).slice(0, 10);
    const addedDate = textOf(fields.AddedDate).slice(0, 10);
    if (!NAME.test(name) || !DAY.test(breachDate) || !DAY.test(addedDate)) continue;
    const notABreach = [
      "IsFabricated",
      "IsSpamList",
      "IsMalware",
      "IsStealerLog",
      "IsRetired",
    ].some((flag) => fields[flag] === true);
    if (notABreach) continue;
    breaches.push({
      name,
      title: textOf(fields.Title) || name,
      domain: textOf(fields.Domain).toLowerCase(),
      breachDate,
      addedDate,
      pwnCount:
        typeof fields.PwnCount === "number" && Number.isFinite(fields.PwnCount)
          ? fields.PwnCount
          : null,
      description: plainText(textOf(fields.Description)),
      dataClasses: Array.isArray(fields.DataClasses)
        ? fields.DataClasses.filter((item): item is string => typeof item === "string")
        : [],
      verified: fields.IsVerified === true,
      attribution: textOf(fields.Attribution),
    });
  }
  return breaches;
}

const withCommas = (count: number): string => String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function recordOf(breach: Breach): SourceRecord {
  const text = joinSentences([
    "Have I Been Pwned (haveibeenpwned.com), licensed under CC BY 4.0.",
    sentence("Breached service", `${breach.title} (${breach.domain})`),
    sentence("Breach date", breach.breachDate),
    sentence("Added to Have I Been Pwned", breach.addedDate),
    breach.pwnCount === null ? "" : sentence("Accounts affected", withCommas(breach.pwnCount)),
    sentence("Data exposed", breach.dataClasses.join(", ")),
    sentence("Verified", breach.verified ? "yes" : "no"),
    sentence("Description", breach.description.slice(0, MAX_DESCRIPTION_CHARS)),
    sentence("Provided by", breach.attribution),
  ]);
  return {
    url: `https://haveibeenpwned.com/api/v3/breach/${breach.name}`,
    title: `${breach.title}: data breach listed by Have I Been Pwned`,
    text,
    publishedAt: breach.addedDate,
  };
}

/**
 * The breaches of the service on `domain` as sources: those added since `cutoff`, the newest first,
 * at most MAX_RECORDS.hibp of them. What was left out is counted.
 */
export function hibpRecords(
  breaches: readonly Breach[],
  input: { domain: string; cutoff?: string },
): { records: SourceRecord[]; omitted: { old?: number; more?: number } } {
  const ofService = breaches.filter(
    (breach) => breach.domain.toLowerCase() === input.domain.toLowerCase(),
  );
  const recent = ofService.filter(
    (breach) => input.cutoff === undefined || breach.addedDate >= input.cutoff,
  );
  recent.sort((a, b) => b.addedDate.localeCompare(a.addedDate) || a.name.localeCompare(b.name));
  const kept = recent.slice(0, MAX_RECORDS.hibp);
  const old = ofService.length - recent.length;
  const more = recent.length - kept.length;
  return {
    records: kept.map(recordOf),
    omitted: { ...(old > 0 ? { old } : {}), ...(more > 0 ? { more } : {}) },
  };
}
