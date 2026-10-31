/**
 * The EU consolidated list of financial sanctions (FSF) of the European Commission (spec D2.4). The
 * list's file carries a fixed token in its address (Q2), so the connector reads that address from
 * the operator's RSS feed at every sync, keeps it in a local variable only, and follows it only on
 * the operator's host and the path of the XML 1.1 file. Nothing it hands back holds an address.
 *
 * Only enterprises (classification code E) are read; persons (P) are skipped, and so is an entry
 * delisted on or before the day the file was generated. Each `wholeName` is a name key (a weak
 * match), and each identification number a `lei:` or `regno:` key (keys.ts `identifierKeysOf`:
 * strong alone for an LEI, beside the name for another number, Q1).
 * The list has no page per entry, so a record cites the dataset's page with its logical id
 * (`?logicalId=`, Ruling 13 of the M1 plan). The XSD 1.1 could not be read, so the paths are
 * UNVERIFIED (see the fixture's header comment): the root is checked, so a wrong guess fails the
 * sync instead of mirroring nothing.
 */
import { FetchError } from "../../../webResearch/guardedFetch";
import { joinSentences, sentence } from "../../records/sentence";
import { cleanText } from "../../text";
import { identifierKeysOf, nameKeysOf } from "../keys";
import { vrdbSourceOf } from "../sources";
import type { ParsedRecord } from "../types";
import { type XmlElement, childText, scanElements } from "../xmlScan";
import { BodyTooLargeError, type Connector, FeedWithoutFileError, bodyText, dayOf } from "./types";

export const EU_FEED_URL = "https://webgate.ec.europa.eu/fsd/fsf/public/rss";
/** What the text of a record begins with, and what the analysis prompt names it by. */
export const EU_RECORD_MARK = "EU consolidated list of financial sanctions";
const FILE_HOST = "webgate.ec.europa.eu";
const FILE_PATH = "/files/xmlFullSanctionsList_1_1/";
const FEED_LIMITS = {
  maxBytes: 1024 * 1024,
  allowedContentTypes: ["application/rss+xml", "application/xml", "text/xml"],
  totalTimeoutMs: 30_000,
};
/** The XML 1.1 file was 26 MB on 2026-10-30. */
const FILE_LIMITS = {
  maxBytes: 64 * 1024 * 1024,
  allowedContentTypes: ["application/xml", "text/xml", "application/octet-stream"],
  totalTimeoutMs: 300_000,
};
const EU_ROOT = "export";
const MAX_SHOWN_ALIASES = 6;

const DATASET_PAGE = vrdbSourceOf("eu_fsf").documentationUrl;

/** Whether an address is the operator's XML 1.1 file: https, its host and port, its path. */
function isFileAddress(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return (
      url.protocol === "https:" &&
      url.hostname === FILE_HOST &&
      url.port === "" &&
      url.pathname.includes(FILE_PATH)
    );
  } catch {
    return false;
  }
}

/** The address of the XML 1.1 file in the feed: an item's link, else its enclosure; null for none. */
function fileAddressOf(feed: string): string | null {
  let found: string | null = null;
  scanElements(feed, "item", (item) => {
    if (found !== null) return;
    const candidates = [
      childText(item, ["link"]),
      ...item.children
        .filter((child) => child.name === "enclosure")
        .map((child) => child.attributes.url ?? null),
    ];
    found = candidates.find((candidate) => candidate && isFileAddress(candidate))?.trim() ?? null;
  });
  return found;
}

const unique = (values: readonly string[]): string[] => [
  ...new Set(values.map((value) => value.trim()).filter((value) => value !== "")),
];

const attributesOf = (entity: XmlElement, child: string, attribute: string): string[] =>
  entity.children
    .filter((element) => element.name === child)
    .map((element) => element.attributes[attribute] ?? "");

/** An enterprise as read, with the day it was delisted; null when it cannot be read, an error. */
function entryOf(entity: XmlElement): { record: ParsedRecord; delisted: string | null } | null {
  const id = entity.attributes.logicalId?.trim() ?? "";
  const names = unique(attributesOf(entity, "nameAlias", "wholeName")).map(cleanText);
  if (id === "" || names.length === 0) return null;
  const programmes = unique(attributesOf(entity, "regulation", "programme"));
  const euReferenceNumber = entity.attributes.euReferenceNumber?.trim() ?? "";
  const unitedNationId = entity.attributes.unitedNationId?.trim() ?? "";
  const designated = dayOf(entity.attributes.designationDate);
  const identifications = entity.children
    .filter((element) => element.name === "identification")
    .map((element) => ({
      number: (element.attributes.number ?? "").trim(),
      type: (element.attributes.identificationTypeCode ?? "").trim(),
    }))
    .filter((identification) => identification.number !== "");
  const others = names.slice(1);
  const shown = others.slice(0, MAX_SHOWN_ALIASES);
  const rest = others.length - shown.length;
  const aliases = shown.map((name) => `"${name}"`).join(", ");

  return {
    delisted: dayOf(entity.attributes.delistingDate),
    record: {
      sourceRecordId: id,
      recordType: "sanctions_entity",
      title: `${EU_RECORD_MARK}: ${names[0]}`,
      summary: joinSentences([
        `${EU_RECORD_MARK} (European Commission).`,
        `Entry: "${names[0]}" (enterprise).`,
        aliases === "" ? "" : `Also listed as: ${aliases}${rest > 0 ? `, and ${rest} more` : ""}.`,
        sentence("Programme", programmes.join(", ")),
        sentence("EU reference number", euReferenceNumber),
        sentence("Date designated", designated ?? ""),
        sentence(
          "Identification number",
          identifications.map((identification) => identification.number).join(", "),
        ),
      ]),
      url: `${DATASET_PAGE}?logicalId=${encodeURIComponent(id)}`,
      identifiers: {
        ...(euReferenceNumber === "" ? {} : { euReferenceNumber }),
        ...(unitedNationId === "" ? {} : { unitedNationId }),
        ...(identifications.length === 0 ? {} : { identifications }),
      },
      matchKeys: [
        ...nameKeysOf(names),
        ...identifierKeysOf(identifications.map((identification) => identification.number)),
      ],
      publishedAt: designated,
      sourceUpdatedAt: null,
    },
  };
}

export const euConnector: Connector = {
  id: "eu_fsf",
  // 2: the identification numbers became keys (M2); 3: they are in the text too (M2 final
  // review), so a person and the model see what an entry matched by.
  version: 3,
  async download(fetch, validators) {
    const feed = await fetch(EU_FEED_URL, {}, FEED_LIMITS);
    // Nothing was sent to make a 304 an answer; one is not the feed.
    if (feed.notModified) throw new FetchError("unreachable");
    const address = fileAddressOf(bodyText(feed));
    if (address === null) throw new FeedWithoutFileError();
    let response;
    try {
      response = await fetch(address, validators, FILE_LIMITS);
    } catch (error) {
      // The page guard's own errors have fixed messages; another may name the address, which
      // carries the token, so it does not leave here.
      if (error instanceof FetchError || error instanceof BodyTooLargeError) throw error;
      throw new Error("The file of the EU list could not be read.");
    }
    if (response.notModified) return "unchanged";
    const body = bodyText(response);
    return {
      bodies: [body],
      etag: response.etag,
      lastModified: response.lastModified,
      bytes: response.body.length,
    };
  },
  parse(snapshot) {
    const entries: Array<{ record: ParsedRecord; delisted: string | null }> = [];
    let unreadable = 0;
    const scan = scanElements(snapshot.bodies[0] ?? "", "sanctionEntity", (entity) => {
      const code = entity.children.find((child) => child.name === "subjectType")?.attributes
        .classificationCode;
      if (code?.trim().toUpperCase() !== "E") return;
      const entry = entryOf(entity);
      if (entry === null) unreadable += 1;
      else entries.push(entry);
    });
    if (scan.root !== EU_ROOT) {
      return { records: [], errors: scan.errors + 1, sourceVersion: null, root: scan.root };
    }
    const generation = scan.rootAttributes.generationDate?.trim() || null;
    const generated = dayOf(generation);
    return {
      // An entry delisted on or before the file's day is off the list; without that day, any is.
      records: entries
        .filter(({ delisted }) => delisted === null || (generated !== null && delisted > generated))
        .map(({ record }) => record),
      errors: scan.errors + unreadable,
      sourceVersion: generation,
      root: scan.root,
    };
  },
};
