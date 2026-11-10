/**
 * The shared test helper of the list kit, which the test of every connector built on the kit
 * calls. It is a helper and not a test: jest ignores this folder as a place for tests.
 *
 * - `expectWellFormedRecords` asserts what the database's columns and the prompt need of the
 *   records a connector gives, so that a connector cannot store one that a sync would then fail on,
 *   or one that the analysis prompt would read as an instruction. It is as strict as the record
 *   builder (kit/record.ts), whose output it must always pass. It collects every problem, each with
 *   the id of its record, and asserts that there is none.
 * - `expectDeterministic` asserts that a connector's download does not depend on the order of the
 *   rows of its file, which the sync's hash of the bodies would otherwise take for a new list.
 * - `fakeFetch` answers as the page guard does, from the files a test gives it, so that no test of
 *   a connector uses the network: it refuses a type that the limits do not list, cuts a body at the
 *   limit, and answers from the address as `new URL` writes it.
 */
import { isDeepStrictEqual } from "util";
import type { VrdbSourceId } from "../../../../../../domain.layer/interfaces/i.vendorResearch";
import {
  ANY_CONTENT_TYPE,
  FetchError,
  type Validators,
  mediaTypeOf,
} from "../../../../../webResearch/guardedFetch";
import { compactName } from "../../../../records/match";
import { isSharedHost } from "../../../../sharedHosts";
import { cleanText } from "../../../../text";
import type { ParsedRecord } from "../../../types";
import { dayText, instantText } from "../../kit/clean";
import type { Connector, ConnectorFetch } from "../../types";

/** The prefixes of the keys that keys.ts makes: no other is a key. */
const KEY_PREFIXES = ["name:", "domain:", "lei:", "regno:", "cik:", "kev:", "cve:", "cpe:"];

const MIN_NAME_KEY_CHARS = 4;

const LIMITS = {
  sourceId: 40,
  id: 200,
  type: 30,
  title: 200,
  summary: 1300,
  url: 2048,
  keys: 200,
  keyChars: 300,
  identifiers: 2000,
};

/** The characters nobody sees: format characters, default-ignorable ones, the braille blank. */
const HIDDEN = /[\p{Cf}\p{Default_Ignorable_Code_Point}\u{2800}]/u;
const LONE_SURROGATE = /[\u{D800}-\u{DFFF}]/u;
/** What an address of a record must not hold: the characters that markup and a prompt are made of. */
const URL_MARKUP = /[<>"`\\^{|}]/;
const LAST_LABEL_NUMERIC = /(?:^|\.)[0-9]+$/;

const textOf = (value: unknown): string => (typeof value === "string" ? value : "");

/** The problems of one record, as short sentences; `seen` holds the ids of the records before it. */
function problemsOf(record: ParsedRecord, mark: string, seen: Set<string>): string[] {
  const problems: string[] = [];
  const id = textOf(record.sourceRecordId);
  const title = textOf(record.title);
  const summary = textOf(record.summary);
  const url = textOf(record.url);
  const type = textOf(record.recordType);

  if (id.trim() === "") problems.push("the id is empty");
  if (id.length > LIMITS.id) problems.push(`the id is longer than ${LIMITS.id}`);
  if (/\p{Cc}/u.test(id)) problems.push("the id has a control character");
  if (/\p{Cf}/u.test(id)) problems.push("the id has a hidden character");
  if (LONE_SURROGATE.test(id)) problems.push("the id has a lone surrogate");
  if (seen.has(id)) problems.push("the id is not unique");
  seen.add(id);

  if (type === "") problems.push("the type is empty");
  if (type.length > LIMITS.type) problems.push(`the type is longer than ${LIMITS.type}`);

  if (title.trim() === "") problems.push("the title is empty");
  if (title.length > LIMITS.title) problems.push(`the title is longer than ${LIMITS.title}`);
  if (/[<>]/.test(title)) problems.push("the title has < or >");
  if (/\p{Cc}/u.test(title) || HIDDEN.test(title)) {
    problems.push("the title has a control or hidden character");
  }

  if (summary.trim() === "") problems.push("the summary is empty");
  if (summary.length > LIMITS.summary) {
    problems.push(`the summary is longer than ${LIMITS.summary}`);
  }
  if (!summary.startsWith(mark)) problems.push("the summary does not begin with the mark");
  if (/\p{Cc}/u.test(summary) || cleanText(summary) !== summary) {
    problems.push("the summary has a control character or a lone surrogate");
  }
  if (HIDDEN.test(summary)) problems.push("the summary has a hidden character");
  if (/[<>]/.test(summary)) problems.push("the summary has < or >");

  if (!url.startsWith("https://")) problems.push("the url is not https");
  if (url.length > LIMITS.url) problems.push(`the url is longer than ${LIMITS.url}`);
  if (/\s/.test(url)) problems.push("the url has white space");
  if (URL_MARKUP.test(url)) {
    problems.push("the url has a character that an address does not hold");
  }
  if (/\p{Cc}/u.test(url) || /\p{Cf}/u.test(url)) {
    problems.push("the url has a control or hidden character");
  }
  // The record builder stores the address as `new URL` writes it: the evidence pack dedupes by it.
  try {
    if (new URL(url).href !== url) problems.push("the url is not in the form that URL gives");
  } catch {
    problems.push("the url does not parse");
  }

  const keys = Array.isArray(record.matchKeys) ? record.matchKeys.map(textOf) : [];
  if (keys.some((key) => !KEY_PREFIXES.some((prefix) => key.startsWith(prefix)))) {
    problems.push("a key has a prefix that keys.ts does not know");
  }
  if (
    keys.some((key) => key.startsWith("name:") && key.length - "name:".length < MIN_NAME_KEY_CHARS)
  ) {
    problems.push(`a name key has fewer than ${MIN_NAME_KEY_CHARS} characters after its prefix`);
  }
  if (keys.some((key) => key.length > LIMITS.keyChars)) {
    problems.push(`a key is longer than ${LIMITS.keyChars} characters`);
  }
  if (
    keys.some((key) => {
      if (!key.startsWith("name:")) return false;
      const name = key.slice("name:".length);
      // What the record builder makes of a name: folded as NFKC, then lower case, letters and digits.
      return compactName(name.normalize("NFKC")) !== name;
    })
  ) {
    problems.push("a name key is not compact (folded, lower case, letters and digits only)");
  }
  const hostsOfKeys = keys
    .filter((key) => key.startsWith("domain:"))
    .map((key) => key.slice("domain:".length));
  if (hostsOfKeys.some(isSharedHost)) {
    problems.push("a domain key is a host where many have pages");
  }
  if (hostsOfKeys.some((host) => LAST_LABEL_NUMERIC.test(host))) {
    problems.push("a domain key is an address of the network");
  }
  if (keys.length > LIMITS.keys) problems.push(`there are more than ${LIMITS.keys} keys`);
  if (new Set(keys).size !== keys.length) problems.push("a key is not unique");

  let json: string | undefined;
  try {
    json = JSON.stringify(record.identifiers);
  } catch {
    json = undefined;
  }
  if (json === undefined) {
    problems.push("the identifiers are not JSON-safe");
  } else {
    if (json.length > LIMITS.identifiers) {
      problems.push(`the identifiers are longer than ${LIMITS.identifiers}`);
    }
    // What JSON keeps must be what the connector gave: no undefined, no date, no function.
    if (!isDeepStrictEqual(JSON.parse(json), record.identifiers)) {
      problems.push("the identifiers are not JSON-safe");
    }
  }

  const { publishedAt, sourceUpdatedAt } = record;
  if (
    publishedAt !== null &&
    !(typeof publishedAt === "string" && dayText(publishedAt) === publishedAt)
  ) {
    problems.push("publishedAt is not null or a real day");
  }
  if (
    sourceUpdatedAt !== null &&
    !(typeof sourceUpdatedAt === "string" && instantText(sourceUpdatedAt) === sourceUpdatedAt)
  ) {
    problems.push("sourceUpdatedAt is not null or ISO 8601");
  }
  return problems;
}

/**
 * Asserts that every record holds what the columns and the prompt need, as the record builder
 * (kit/record.ts) makes it:
 *
 * - the id: unique, not empty, at most 200 characters, no control character, no format (hidden)
 *   character, no lone surrogate; a type of at most 30;
 * - the title: 1 to 200 characters, no `<` or `>`, no control character and none that nobody sees
 *   (format characters, default-ignorable ones, the braille blank);
 * - the summary: at most 1,300 characters, begins with the list's mark, no control character, lone
 *   surrogate, hidden character, `<` or `>` (the prompt's escaping is a second line of defence, not
 *   the first);
 * - the address: https, at most 2,048 characters, no white space, none of `< > " ` \ ^ { | }`, no
 *   control or hidden character, one that `new URL` parses and writes as it is given (the record
 *   builder stores it that way);
 * - the keys: of the prefixes that keys.ts knows, at most 200, none twice, each at most 300
 *   characters; name keys of four characters or more that are compact (NFKC-folded, lower case,
 *   letters and digits only); domain keys that are no host where many have pages and no numeric
 *   address;
 * - the identifiers: JSON keeps them as they are, in at most 2,000 characters;
 * - a day that exists or null, an ISO 8601 time or null.
 *
 * The source's id must fit its column (40).
 */
export function expectWellFormedRecords(
  records: readonly ParsedRecord[],
  options: { sourceId: VrdbSourceId; mark: string },
): void {
  const problems: string[] = [];
  if (options.sourceId.length > LIMITS.sourceId) {
    problems.push(`the source id is longer than ${LIMITS.sourceId}`);
  }
  const ids = new Set<string>();
  for (const record of records) {
    const label = JSON.stringify(textOf(record.sourceRecordId).slice(0, 60));
    for (const problem of problemsOf(record, options.mark, ids)) {
      problems.push(`${label}: ${problem}`);
    }
  }
  expect(problems).toEqual([]);
}

/**
 * Downloads the same fixture twice, with the rows of its file in two orders (`fixtureFor(false)`
 * and `fixtureFor(true)` give the fetch of each), and asserts that the bodies of the two snapshots
 * are the same, and that so is what `parse` makes of them.
 */
export async function expectDeterministic(
  connector: Connector,
  fixtureFor: (reversed: boolean) => ConnectorFetch,
): Promise<void> {
  const forward = await connector.download(fixtureFor(false), {});
  const reversed = await connector.download(fixtureFor(true), {});
  if (forward === "unchanged" || reversed === "unchanged") {
    throw new Error(
      "The fixture was answered as unchanged, so it cannot show whether the order of the rows decides the bodies.",
    );
  }
  expect(reversed.bodies).toEqual(forward.bodies);
  expect(connector.parse(reversed)).toEqual(connector.parse(forward));
}

/** A file that `fakeFetch` serves. */
export interface FakeFile {
  body: Buffer | string;
  /** As a server sends it, parameters included. */
  contentType: string;
  etag?: string;
  lastModified?: string;
  /** The address that answers when it is not the one asked: a redirect's end. */
  url?: string;
  /** The body was longer than the limit and was cut. */
  truncated?: boolean;
}

/** What `fakeFetch` makes: a `ConnectorFetch` that has kept its calls. */
export type FakeFetch = ConnectorFetch & {
  calls: Array<{ url: string; validators: Validators; limits: Parameters<ConnectorFetch>[2] }>;
};

/**
 * The address as `new URL` writes it, which is what the page guard gives as the address that
 * answered. An address that is no address is a mistake of the test, not a failure of a fetch.
 */
function hrefOf(address: string): string {
  try {
    return new URL(address).href;
  } catch {
    throw new Error("A file of the fake fetch has an answering address that is no address.");
  }
}

/** Whether a limit of bytes is one that a body can be cut at: a whole number of bytes, 0 or more. */
const isByteLimit = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * A `ConnectorFetch` that serves the files it is given, by address, as the page guard answers. A
 * known address gets a 200 answer as the guard gives it, or, when the validators are the file's, the
 * answer that nothing changed (the ETag decides when the file has one, else the date), which the
 * guard gives before it looks at the type. A 200 answer is read as the guard reads it: a Content-Type
 * whose media type (parameters out, in lower case) the limits do not list fails as an unsupported
 * type, unless they list the wildcard type (`ANY_CONTENT_TYPE`); a body longer than
 * `limits.maxBytes` is cut to it and `truncated` says so (the file's own `truncated` also does);
 * the body is a new buffer each time; and the address that answers is the address as `new URL`
 * writes it. The validators are the file's or null. An address that it does not know fails as an
 * unreachable file, naming nothing. A limit of bytes that is no whole number, or an answering
 * address that is no address, is a mistake of the test and an error of its own.
 */
export function fakeFetch(files: Record<string, FakeFile>): FakeFetch {
  const calls: FakeFetch["calls"] = [];
  const fetch: ConnectorFetch = async (url, validators, limits) => {
    calls.push({ url, validators, limits });
    const file = Object.prototype.hasOwnProperty.call(files, url) ? files[url] : undefined;
    if (file === undefined) throw new FetchError("unreachable");
    if (!isByteLimit(limits.maxBytes)) {
      throw new Error("The limit of bytes that the fetch was given is no whole number of bytes.");
    }
    const answering = hrefOf(file.url ?? url);
    const unchanged =
      file.etag !== undefined
        ? validators.etag === file.etag
        : file.lastModified !== undefined && validators.lastModified === file.lastModified;
    if (unchanged) return { notModified: true, url: answering };

    const allowed = limits.allowedContentTypes.map((type) => type.toLowerCase());
    if (!allowed.includes(ANY_CONTENT_TYPE) && !allowed.includes(mediaTypeOf(file.contentType))) {
      throw new FetchError("unsupported_type");
    }
    const bytes = Buffer.isBuffer(file.body) ? file.body : Buffer.from(file.body, "utf8");
    const cut = bytes.length > limits.maxBytes;
    return {
      notModified: false,
      url: answering,
      status: 200,
      contentType: file.contentType,
      // A copy: what a reader does to the buffer reaches neither the fixture nor the next answer.
      body: Buffer.from(bytes.subarray(0, limits.maxBytes)),
      truncated: cut || (file.truncated ?? false),
      etag: file.etag ?? null,
      lastModified: file.lastModified ?? null,
    };
  };
  return Object.assign(fetch, { calls });
}
