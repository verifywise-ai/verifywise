/**
 * The UN Security Council Consolidated List (spec D2.5), behind Q6 (gates.ts): one XML file at a
 * static address, which the UN publishes for every sanctions regime of the Security Council and
 * serves through a redirect to a time-limited address on unsolprodfiles.blob.core.windows.net.
 * Its terms of use allow personal, non-commercial use only, so the gate stays closed unless the UN
 * gives written permission (Q6, answered on 2026-10-31). The element names were checked against
 * the real file on 2026-10-31, when this parser read its 274 entities with no error; one LISTED_ON
 * there is a day with a time zone (YYYY-MM-DD-hh:mm), which dayOf does not read, so that record
 * has no date.
 *
 * Only ENTITIES/ENTITY is read; INDIVIDUALS is skipped. Each name of an entity, its own and every
 * alias, is a name key (a weak match). The list has no page per entry that this code can name, so
 * a record cites the list's page with the entry's reference number, as the UK connector cites its
 * own (Ruling 13 of the M1 plan).
 */
import { joinSentences, sentence } from "../../records/sentence";
import { cleanText } from "../../text";
import { nameKeysOf } from "../keys";
import { vrdbSourceOf } from "../sources";
import type { ParsedRecord } from "../types";
import { type XmlElement, childText, childTexts, scanElements } from "../xmlScan";
import { type Connector, bodyText, dayOf } from "./types";

export const UN_LIST_URL = "https://scsanctions.un.org/resources/xml/en/consolidated.xml";
/** What the text of a record begins with, and what the analysis prompt names it by. */
export const UN_RECORD_MARK = "UN Security Council Consolidated List";
export const UN_MAX_BYTES = 20_971_520;
const UN_TYPES = ["application/xml", "text/xml"];
const UN_TOTAL_TIMEOUT_MS = 300_000;
const UN_ROOT = "CONSOLIDATED_LIST";
const MAX_SHOWN_ALIASES = 6;
const MAX_TEXT_CHARS = 1200;

const LIST_PAGE = vrdbSourceOf("un_sanctions").documentationUrl;

/** A field as one line of plain text. */
const plain = (text: string | null): string =>
  cleanText(text ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** The texts that are not empty, once each, in order. */
const unique = (values: readonly string[]): string[] => [
  ...new Set(values.map(plain).filter((value) => value !== "")),
];

/** The record of an entity; null for one without a reference number or a name, which is an error. */
function recordOf(entity: XmlElement): ParsedRecord | null {
  const reference = plain(childText(entity, ["REFERENCE_NUMBER"]));
  const name = plain(childText(entity, ["FIRST_NAME"]));
  if (reference === "" || name === "") return null;
  const aliases = unique(childTexts(entity, ["ENTITY_ALIAS", "ALIAS_NAME"])).filter(
    (alias) => alias !== name,
  );
  const shown = aliases.slice(0, MAX_SHOWN_ALIASES);
  const rest = aliases.length - shown.length;
  const listType = plain(childText(entity, ["UN_LIST_TYPE"]));
  const dataId = plain(childText(entity, ["DATAID"]));
  const listedOn = dayOf(childText(entity, ["LISTED_ON"]));
  const countries = unique(childTexts(entity, ["ENTITY_ADDRESS", "COUNTRY"]));
  const comments = plain(childText(entity, ["COMMENTS1"]));

  return {
    sourceRecordId: reference,
    recordType: "sanctions_entity",
    title: `${UN_RECORD_MARK}: ${name}`,
    summary: joinSentences([
      `${UN_RECORD_MARK} (un.org).`,
      `Entry: "${name}" (entity).`,
      shown.length === 0
        ? ""
        : `Also listed as: ${shown.map((alias) => `"${alias}"`).join(", ")}${rest > 0 ? `, and ${rest} more` : ""}.`,
      sentence("Reference number", reference),
      sentence("Sanctions regime", listType),
      sentence("Listed on", listedOn ?? ""),
      sentence("Address", countries.join(", ")),
      sentence("Other information", comments.slice(0, MAX_TEXT_CHARS)),
    ]),
    url: `${LIST_PAGE}?referenceNumber=${encodeURIComponent(reference)}`,
    identifiers: {
      referenceNumber: reference,
      ...(dataId === "" ? {} : { dataId }),
      ...(listType === "" ? {} : { unListType: listType }),
    },
    matchKeys: nameKeysOf([name, ...aliases]),
    publishedAt: listedOn,
    sourceUpdatedAt: null,
  };
}

export const unConnector: Connector = {
  id: "un_sanctions",
  version: 1,
  async download(fetch, validators) {
    const response = await fetch(UN_LIST_URL, validators, {
      maxBytes: UN_MAX_BYTES,
      allowedContentTypes: UN_TYPES,
      totalTimeoutMs: UN_TOTAL_TIMEOUT_MS,
    });
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
    const records: ParsedRecord[] = [];
    let unreadable = 0;
    // The entities are read as children of ENTITIES only: an element named ENTITY elsewhere, inside
    // an individual, is not one.
    const scan = scanElements(snapshot.bodies[0] ?? "", "ENTITIES", (entities) => {
      for (const entity of entities.children.filter((child) => child.name === "ENTITY")) {
        const record = recordOf(entity);
        if (record === null) unreadable += 1;
        else records.push(record);
      }
    });
    // A document of another root is not the list, whatever it holds.
    if (scan.root !== UN_ROOT) {
      return { records: [], errors: scan.errors + 1, sourceVersion: null, root: scan.root };
    }
    return {
      records,
      errors: scan.errors + unreadable,
      sourceVersion: scan.rootAttributes.dateGenerated?.trim() || null,
      root: scan.root,
    };
  },
};
