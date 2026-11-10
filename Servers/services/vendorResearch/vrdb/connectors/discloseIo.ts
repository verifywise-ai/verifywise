/**
 * The disclose.io program list (spec D2.0, Q49): the community-maintained list of organisations that
 * publish a vulnerability disclosure policy, as the repository disclose/diodb keeps it. It is a
 * register of contributors' claims and the context of a risk, never a finding: anyone can propose a
 * row by pull request, nobody at the organisation has checked it, and a missing row says nothing.
 *
 * ONE FILE, READ WHOLE. `program-list.json` is one JSON array of flat objects, which the project's
 * own CI keeps sorted by `program_name` (code point order) and unique by it. The file is the list
 * only when it is an array of at least 1,500 rows whose names, the raw strings of `program_name`,
 * follow one another in strictly increasing code point order: a file that is cut, merged, sorted
 * another way or not the list at all breaks the rule. (The order is by code point, as `jq` sorts,
 * and not by UTF-16 unit as `compareText` does: the two differ for a name that has a character
 * beyond the BMP next to one of the last 8,192 characters of it.) A file of more than 20,000 rows is
 * not read in part: it fails as too large, before any other check.
 *
 * WHAT IS NOT READ. A row is a program of a policy. Three kinds of row are not used: the row whose
 * link the project's CI found dead (`policy_url_status` is `dead`, in any case); the row of a policy
 * address that 50 rows or more share (the two scope entries of the list, each shared by some 270
 * rows, are 22 % of it: their rows name the vendors' own country domains and the customers' and
 * users' own sites, which are not programs of the organisations they name); and the row that has no
 * text for `program_name` or `policy_url`, or whose name or address does not fit (a clean line of 80
 * and of 2,048 characters at most: `lineWithin`, which never gives a cut line), which is counted as
 * one that could not be read (the factory measures it). A name that is cut would be an id, a key and
 * a title with the marker of the cut in them, and an address that is cut a host that may end inside
 * the host, so neither is ever read in part. The address of a row is the policy address as a line,
 * so that the same address written with a blank or a hidden character in it is one address; the
 * rows that share it are counted over the whole file, dead and unreadable rows included (a row
 * whose address does not fit has none). The two cells that are only compared with a word
 * (`policy_url_status`, and the two words below) are cut by `lineOf`, which is sound: a cut line is
 * none of the words.
 *
 * THE PROJECTION. Of a row only four cells are ever read: the name (`program_name`), the policy
 * address (`policy_url`), and the two words `safe_harbor` and `offers_bounty`, each mapped to the
 * words the project uses (`full`, `partial` or `none`; `yes`, `no` or `partial`) when the cell, as a
 * lower-case line, is exactly one of them, and to "not stated" otherwise. Of the policy address only
 * the HOST is kept: it is shown and keyed, and the record links to the repository and never to an
 * address that a contributor wrote. Everything else is never read: `contact_email` (1,289 values,
 * 220 of them not role mailboxes, so personal data is possible) and `contact_url`, `pgp_key`,
 * `hiring`, `hall_of_fame`, `securitytxt_url`, `preferred_languages`, `disclosure_timeline_days`,
 * `launch_date` (74 values, in at least six shapes), `offers_swag` (a boolean on some rows and a
 * string on the others) and `public_disclosure`. The body of a snapshot holds the organisations that
 * the rows make and nothing else, so no excluded value can reach a record or the store.
 *
 * ONE RECORD PER ORGANISATION AND POLICY HOST. The kept rows are grouped by the compact form of the
 * short name (`compactName` of `shortName` of the cleaned `program_name`) and the host of the policy
 * address (none when the address gives no host): "Example Sec" and "ExampleSec" on one host are one
 * record with two programs, while "Ex-Ample" and "Example" on two hosts are two records, so that a
 * match by website never shows another organisation's name (and a host is a key of one record only,
 * see THE KEYS). The id is `<compact name>@<host>` (`@none` without a host); a key of more than 200
 * characters (a long name on a long host) gives the id its first 183 characters, a tilde and the
 * first 16 hex digits of the SHA-256 of the whole key, so that two organisations whose keys differ
 * only after the cut never share an id (the store keeps the first of two records of one id and the
 * sync would count the other as skipped; no key of today's file is that long: the longest id is 70).
 * The display name is the first program of the group in the order of the file; up to three programs
 * are kept, in that order.
 *
 * THE HOST. It is the host of the first part of the policy address, the part before the first blank,
 * comma or semicolon (`hostsOf`: a scheme or none, lower case, without `www.` and a trailing dot;
 * only that part is read, so that a hostile address of thousands of parts costs one parse and not one
 * for each), and a host only when it is a name of two labels or more with the characters of a host,
 * at most 253, and a last label that is not all digits: an address of the Internet protocol, a name
 * of one label, a mailbox and text that is no address give none. The scheme is not asked, as the
 * address is read with `new URL`; whatever the address holds before the host (a user
 * name, a password) is never read.
 *
 * THE KEYS. The names of the programs of the record are the weak keys (`name:`; a name of fewer than
 * four letters and digits gives none: 48 of the 2,433 today). The strong key is the host, a
 * `domain:` key, and only when the address of the row is used by that row alone in the whole file,
 * the host is an apex domain (two labels, or three whose last two are a country suffix of
 * COMPOUND_SUFFIXES; a country suffix itself, `gov.uk`, is no apex), it is no host where many have
 * pages (`isSharedHost`) and it is not under a bug bounty or document platform (PLATFORMS: a policy
 * that sits on HackerOne is HackerOne's, not the organisation's). A subdomain, a country suffix, a
 * shared host, a platform and an address that two rows or more use give no key. The record is keyed
 * when any row of its group is, whether or not that row is one
 * of the three shown. A host is keyed only when ONE record carries it: when two organisations or
 * more would carry the same `domain:` key, none of them does (13 hosts and 30 of the 1,035 records
 * that would be keyed today), so that a vendor matched by its domain never gets a record that names
 * another program; each keeps its name keys, and a group that has no other key is then no record.
 * The hosts are counted once every row is grouped, so no order of the groups decides it. A group
 * with no key of either kind is no record: it cannot match a vendor, and it is no row that could
 * not be read, so the sync does not count it (27 today).
 *
 * Natural persons: the list names organisations and products. All 184 names that a name-shape rule
 * flags were labelled (none is a person), and so was a sample of 30 that it does not (none). The
 * only names of individuals are the 183 program names that are a customer's or user's
 * own subdomain on a hosting platform, and every one of them is a row of the two scope entries,
 * which are never read. No person rule is applied; a person's mailbox, the other source of
 * personal data, is in the cell that is never read.
 *
 * Which programs of a group are kept, and which is shown first, is decided by the order of the file,
 * which the check of the order has made one order, and the body of a snapshot is sorted by id: the
 * same list gives the same body however the file is written.
 */
import { createHash } from "crypto";
import { shortName } from "../../identity";
import { compactName } from "../../records/match";
import { joinSentences, sentence } from "../../records/sentence";
import { isSharedHost } from "../../sharedHosts";
import { cutAtCodePoint } from "../../text";
import { domainKey, hostsOf } from "../keys";
import type { ParsedRecord } from "../types";
import { isObject, lineOf, lineWithin } from "./kit/clean";
import { type Fetched, type ReadResult, createFileConnector } from "./kit/fileConnector";
import { readJsonArray } from "./kit/json";
import { RECORD_ID_MAX, RECORD_SUMMARY_MAX, recordOf } from "./kit/record";
import { summaryWithClosing } from "./kit/summary";
import { textOf } from "./kit/text";
import type { Connector } from "./types";

/** What the text of a record begins with, and what the analysis prompt names it by. */
export const DISCLOSE_IO_RECORD_MARK = "disclose.io program list";

const DATA_URL = "https://raw.githubusercontent.com/disclose/diodb/master/program-list.json";
/** The repository's own page: a record's address is this and the key of its organisation. */
const DOCUMENTATION_URL = "https://github.com/disclose/diodb";
/** The file is 1.2 MB today; it is cut at seven times that. */
const MAX_BYTES = 8 * 1024 * 1024;
/** 2,433 rows today. A longer list is not read in part. */
const MAX_ROWS = 20_000;
/** A file with fewer rows is not the list. */
const MIN_ROWS = 1500;
/** An address that this many rows share is a scope that names other people's sites, not a program. */
const UMBRELLA_ROWS = 50;

/** The first sentence of every record: the list, the operator's host and what kind of list it is. */
const FIRST_SENTENCE = `${DISCLOSE_IO_RECORD_MARK} (github.com/disclose), a register or status list.`;
/** The last sentence of every record. It is never cut and never left out. */
const CLOSING_SENTENCE =
  "Entries are submitted by contributors and are not verified by the organisation or by " +
  "disclose.io; a missing entry says nothing. Attributed as CC BY 4.0 (disclose.io diodb); " +
  "adapted by VerifyWise.";

/**
 * The most characters of a program's name, as a clean line: a longer name is no name and its row is
 * unreadable (it is never cut). The real file's longest is 72.
 */
const NAME_MAX = 80;
/**
 * The most characters of a policy address, as a clean line: a longer address is none and its row is
 * unreadable (it is never read in part). The real file's longest is 161.
 */
const ADDRESS_MAX = 2048;
/** The most characters of the status and of the two words; the longest word is "partial". */
const WORD_MAX = 40;
/** The most programs that a record keeps. */
const PROGRAMS_KEPT = 3;
/** The longest host of a website. */
const HOST_MAX = 253;
/** The hex digits of the hash that ends the id of a key that is too long. */
const ID_HASH_DIGITS = 16;
/** The characters of such a key that its id keeps: with the tilde and the hash, RECORD_ID_MAX in all. */
const ID_KEPT = RECORD_ID_MAX - 1 - ID_HASH_DIGITS;

const DOMAIN_PREFIX = "domain:";
const DEAD = "dead";
const NOT_STATED = "not stated";

/** The words of `safe_harbor` and of `offers_bounty` that the project uses; any other is not stated. */
const SAFE_HARBOR_WORDS = ["full", "partial", "none"] as const;
const BOUNTY_WORDS = ["yes", "no", "partial"] as const;
export type DiscloseSafeHarbor = (typeof SAFE_HARBOR_WORDS)[number] | typeof NOT_STATED;
export type DiscloseBounty = (typeof BOUNTY_WORDS)[number] | typeof NOT_STATED;

/** The country suffixes of two labels under which the apex of a host has three. */
const COMPOUND_SUFFIXES: ReadonlySet<string> = new Set([
  "co.uk",
  "org.uk",
  "gov.uk",
  "ac.uk",
  "com.au",
  "net.au",
  "gov.au",
  "co.nz",
  "co.jp",
  "co.in",
  "com.br",
  "com.sg",
  "co.za",
  "com.mx",
  "com.cn",
  "co.il",
  "com.tr",
  "co.kr",
  "com.tw",
  "com.hk",
]);

/**
 * The platforms of bug bounty programs and of documents. A policy on one of them is the platform's
 * page, and the host says nothing of who wrote it: a key on `hackerone.com` would match the vendor
 * of that name to the programs of 98 other companies. They are not in the list of shared hosts
 * (sharedHosts.ts), which is about hosts of users' pages, so the list keeps them out itself.
 */
const PLATFORMS: readonly string[] = [
  "bugcrowd.com",
  "hackerone.com",
  "federacy.com",
  "openbugbounty.org",
  "yeswehack.com",
  "intigriti.com",
  "cobalt.io",
  "firebounty.com",
  "zerocopter.com",
  "bountyfactory.io",
  "responsibledisclosure.com",
  "notion.so",
  "docs.google.com",
  "drive.google.com",
];

/** A program as a record shows it. */
export interface DiscloseProgram {
  /** The program's name as a line of at most 80 characters. */
  name: string;
  safeHarbor: DiscloseSafeHarbor;
  bounty: DiscloseBounty;
}

/** What a snapshot holds of an organisation: the row of the list. */
export interface DiscloseOrganisation {
  /**
   * `<compact name>@<host>`, `@none` without a host; of a key longer than 200 characters its first
   * 183, a tilde and 16 hex digits of the SHA-256 of the whole key (200 in all).
   */
  id: string;
  /** The name of the first program of the organisation in the order of the file. */
  display: string;
  /** The host of the policy address, bare, or an empty text when the address gives none. */
  host: string;
  /**
   * Whether the host is a `domain:` key: some row of the organisation qualifies for it, and no
   * other organisation does (a host is keyed only when one record carries it).
   */
  keyed: boolean;
  /** The programs that the record shows: three at most, in the order of the file. */
  programs: DiscloseProgram[];
}

/**
 * The order of two names by code point, which is the order that `jq` and so the project's CI sort
 * by. A UTF-16 unit that is half of a character beyond the BMP stands for a code point above every
 * unit of the BMP, whereas its own value is below U+E000 to U+FFFF.
 */
function compareCodePoints(a: string, b: string): number {
  const shortest = Math.min(a.length, b.length);
  for (let at = 0; at < shortest; at += 1) {
    const x = a.charCodeAt(at);
    const y = b.charCodeAt(at);
    if (x === y) continue;
    const xIsHalf = x >= 0xd800 && x <= 0xdfff;
    const yIsHalf = y >= 0xd800 && y <= 0xdfff;
    return xIsHalf === yIsHalf ? x - y : xIsHalf ? 1 : -1;
  }
  return a.length - b.length;
}

/**
 * Whether the raw names of the rows follow one another in strictly increasing order, which is how
 * the project's CI leaves them (and so also that none is there twice). A row that is no object or
 * has no text for a name has no place in the order and is passed over.
 */
function inOrder(items: readonly unknown[]): boolean {
  let previous: string | null = null;
  for (const item of items) {
    if (!isObject(item) || typeof item.program_name !== "string") continue;
    const name = item.program_name;
    if (previous !== null && compareCodePoints(previous, name) >= 0) return false;
    previous = name;
  }
  return true;
}

/** The label of a host: letters, digits, hyphens and underscores, up to 63, none at either end. */
const HOST_LABEL = "[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?";
/** A host of a website: two labels or more. */
const HOST = new RegExp(`^(?:${HOST_LABEL}\\.)+${HOST_LABEL}$`);
/** A label of digits only: the last label of an address of the Internet protocol, and of no name. */
const NUMERIC_LABEL = /^[0-9]+$/;
/** What separates the parts of an address that names several, as `hostsOf` reads them. */
const PART_BREAK = /[\s,;]+/;

/**
 * The host of a policy address, bare and in lower case; none for an address that holds no host. Only
 * the first part of the address is read (up to the first blank, comma or semicolon): `hostsOf` parses
 * every part, and a hostile address is as long as ADDRESS_MAX allows.
 */
function hostOf(address: string): string {
  const [first] = hostsOf(address.split(PART_BREAK, 1)[0]);
  if (first === undefined) return "";
  const host = domainKey(first).slice(DOMAIN_PREFIX.length);
  if (host.length > HOST_MAX || !HOST.test(host)) return "";
  return NUMERIC_LABEL.test(host.slice(host.lastIndexOf(".") + 1)) ? "" : host;
}

/**
 * Two labels, or three whose last two are a country suffix. A country suffix is no apex of anyone,
 * so a host that is one of COMPOUND_SUFFIXES itself (`gov.uk`, `com.au`) is none.
 */
function isApex(host: string): boolean {
  if (COMPOUND_SUFFIXES.has(host)) return false;
  const labels = host.split(".");
  return (
    labels.length <= 2 || (labels.length === 3 && COMPOUND_SUFFIXES.has(labels.slice(1).join(".")))
  );
}

const isPlatform = (host: string): boolean =>
  PLATFORMS.some((platform) => host === platform || host.endsWith(`.${platform}`));

/** Whether a host is one that the organisation itself may be taken to own (see the comment of this file). */
const isOwnHost = (host: string): boolean =>
  host !== "" && isApex(host) && !isSharedHost(host) && !isPlatform(host);

/** The word of a cell, as a lower-case line, when it is exactly one of the words; else "not stated". */
function wordOf<T extends string>(value: unknown, words: readonly T[]): T | typeof NOT_STATED {
  const text = lineOf(value, WORD_MAX).toLowerCase();
  return words.find((word) => word === text) ?? NOT_STATED;
}

/**
 * The id of an organisation: its key, `<compact name>@<host>`, as it is when it has 200 characters
 * or fewer. A longer key is cut, and a cut alone would give one id to two organisations whose keys
 * differ only after it, so the id is its first 183 characters, a tilde and the first 16 hex digits
 * of the SHA-256 of the WHOLE key. A tilde is in no key (the compact name is letters and digits, the
 * host letters, digits, dots, hyphens and underscores), so such an id is never one of a key that was
 * not cut. It is a function of the key alone, so no order of the rows changes it.
 */
function idOf(key: string): string {
  if (key.length <= RECORD_ID_MAX) return key;
  const digest = createHash("sha256").update(key, "utf8").digest("hex").slice(0, ID_HASH_DIGITS);
  return `${cutAtCodePoint(key, ID_KEPT)}~${digest}`;
}

/** A row of the file with the cells that are read, cleaned; null when the row cannot be read. */
interface Entry {
  name: string;
  /** The compact form of the short name: what the id is made of. */
  key: string;
  address: string;
  item: Record<string, unknown>;
}

function entryOf(item: unknown, address: string): Entry | null {
  if (!isObject(item)) return null;
  // A name that does not fit is no name: cut, it would be the id, the keys and the title.
  const name = lineWithin(item.program_name, NAME_MAX) ?? "";
  const key = name === "" ? "" : compactName(shortName(name));
  return name === "" || address === "" || key === "" ? null : { name, key, address, item };
}

/**
 * The organisations of the file. Null when the file is not the list (its shape, its size from
 * below, its order); not complete, with no row, when it is longer than the limit.
 */
function read(fetched: Fetched): ReadResult<DiscloseOrganisation> | null {
  const reading = readJsonArray(textOf(fetched, 0), MAX_ROWS);
  if (reading === null) return null;
  // A list of more rows than the limit is not read in part, and no check of it means anything.
  if (!reading.complete) return { rows: [], total: 0, unreadable: 0, complete: reading.complete };
  const { items } = reading;
  if (items.length < MIN_ROWS || !inOrder(items)) return null;

  // Who uses each address is counted over every row that has one, dead or unreadable ones too.
  const uses = new Map<string, number>();
  const entries = items.map((item) => {
    // An address that does not fit is none: its host, cut, could end inside the host.
    const address = isObject(item) ? (lineWithin(item.policy_url, ADDRESS_MAX) ?? "") : "";
    if (address !== "") uses.set(address, (uses.get(address) ?? 0) + 1);
    return entryOf(item, address);
  });

  const groups = new Map<string, DiscloseOrganisation>();
  let unreadable = 0;
  for (const entry of entries) {
    if (entry === null) {
      unreadable += 1;
      continue;
    }
    const { name, key, address, item } = entry;
    const shared = uses.get(address) ?? 0;
    // A dead link is no policy, and an address of 50 rows or more is a scope: neither is a row that failed.
    if (
      lineOf(item.policy_url_status, WORD_MAX).toLowerCase() === DEAD ||
      shared >= UMBRELLA_ROWS
    ) {
      continue;
    }
    const host = hostOf(address);
    const keyed = shared === 1 && isOwnHost(host);
    const program: DiscloseProgram = {
      name,
      safeHarbor: wordOf(item.safe_harbor, SAFE_HARBOR_WORDS),
      bounty: wordOf(item.offers_bounty, BOUNTY_WORDS),
    };
    const groupKey = `${key}@${host === "" ? "none" : host}`;
    const group = groups.get(groupKey);
    if (group === undefined) {
      groups.set(groupKey, {
        id: idOf(groupKey),
        display: name,
        host,
        keyed,
        programs: [program],
      });
    } else {
      group.keyed = group.keyed || keyed;
      if (group.programs.length < PROGRAMS_KEPT) group.programs.push(program);
    }
  }
  // A host is a key of one record only. The groups that would carry each host are counted once all
  // the rows are grouped, and when two or more would, none of them does (each keeps its name keys).
  const carriers = new Map<string, number>();
  for (const group of groups.values()) {
    if (group.keyed) carriers.set(group.host, (carriers.get(group.host) ?? 0) + 1);
  }
  for (const group of groups.values()) {
    if (group.keyed && carriers.get(group.host) !== 1) group.keyed = false;
  }

  const rows = [...groups.values()];
  return {
    rows,
    // The raw rows, and never fewer than the organisations and the rows that failed: the factory
    // refuses a body that says so. A row names one organisation at most, so the raw rows are the
    // larger today; the sum is what a reader that groups must say.
    total: Math.max(items.length, rows.length + unreadable),
    unreadable,
    complete: reading.complete,
  };
}

/** One program as the text shows it; the host is left out for an address that gives none. */
function programSentence(program: DiscloseProgram, host: string): string {
  const where = host === "" ? "" : `, published on ${host}`;
  return (
    `The community-maintained disclose.io list holds a vulnerability disclosure policy for ` +
    `${program.name}${where} (safe harbor: ${program.safeHarbor}; bounty: ${program.bounty}).`
  );
}

/**
 * The text of a record: the list (S1), the organisation (S2), one sentence for each program of it,
 * three at most (S3), and the closing sentence, which says what an entry is not. When the whole is
 * longer than the limit, the third and then the second program are left out; if one is still too
 * long, the sentences before the closing one are cut (with the mark of a cut) and the closing
 * sentence stays whole and last.
 */
export function discloseSummaryOf(row: DiscloseOrganisation): string {
  const opening = [FIRST_SENTENCE, sentence("Program", row.display)];
  const listed = (shown: number): string[] =>
    row.programs.slice(0, shown).map((program) => programSentence(program, row.host));
  for (let shown = row.programs.length; shown > 1; shown -= 1) {
    const whole = joinSentences([...opening, ...listed(shown), CLOSING_SENTENCE]);
    if (whole.length <= RECORD_SUMMARY_MAX) return whole;
  }
  return summaryWithClosing(
    [...opening, ...listed(Math.min(row.programs.length, 1))],
    CLOSING_SENTENCE,
    RECORD_SUMMARY_MAX,
  );
}

/**
 * The record of an organisation. A group with no name key (four letters and digits or more) and no
 * host that qualifies makes no record at all: that is no row that could not be read, and the sync
 * does not count it.
 */
function recordsOf(row: DiscloseOrganisation): ParsedRecord[] {
  const names = row.programs.map(({ name }) => name);
  const record = recordOf({
    id: row.id,
    type: "disclosure_program",
    title: `${DISCLOSE_IO_RECORD_MARK}: ${row.display}`,
    summary: discloseSummaryOf(row),
    url: `${DOCUMENTATION_URL}?program=${encodeURIComponent(row.id)}`,
    identifiers: { programs: names },
    names,
    domains: row.keyed ? [row.host] : [],
    // A state, as of the copy: the file has no date for a row.
    publishedAt: null,
    sourceUpdatedAt: null,
  });
  return record.matchKeys.length > 0 ? [record] : [];
}

export const discloseIoConnector: Connector = createFileConnector<DiscloseOrganisation>({
  id: "disclose_io",
  version: 1,
  root: "program-list.json",
  sortKey: (row) => row.id,
  files: [
    {
      url: DATA_URL,
      maxBytes: MAX_BYTES,
      // GitHub serves the file as text/plain.
      contentTypes: ["text/plain", "application/json"],
      timeoutMs: 60_000,
    },
  ],
  // The host is every repository's: the path is what pins the list to this one.
  pin: { hosts: ["raw.githubusercontent.com"], pathPrefixes: ["/disclose/diodb/"] },
  read,
  toRecords: (rows) => rows.flatMap(recordsOf),
});
