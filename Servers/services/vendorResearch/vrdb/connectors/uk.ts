/**
 * The UK Sanctions List of the Foreign, Commonwealth and Development Office (spec D2.3): since 28
 * January 2026 the only source of UK sanctions designations, published as one XML file at a static
 * address under the Open Government Licence v3.0. Its paths are those of the XSD 4.33.3 (see the
 * fixture's header comment), with no namespace.
 *
 * Only entities are read; individuals and ships are skipped, and a designation of any other kind,
 * or of none, is one error, since it would otherwise be skipped unseen and the next sync would take
 * its entity off the copy. Each name of an entity is a name key (a weak match), the host of each of
 * its websites a domain key (a strong one, against the vendor's verified domain; an e-mail address
 * typed into the field names a mailbox and gives none, keys.ts `hostsOf`), and each business
 * registration number a `regno:` or `lei:` key (keys.ts `identifierKeysOf`: strong beside the name,
 * or alone for an LEI, Q1). A designation the UN made carries its UN reference number, which is in
 * the text and the identifiers and is never a key, since it names the UN's entry and not the
 * vendor: the UN list itself is not copied (Q6). The list has no page per designation, so a record
 * cites the list's page with its unique id (`?uid=`, Ruling 13 of the M1 plan).
 */
import { joinSentences, sentence } from "../../records/sentence";
import { isSharedHost } from "../../sharedHosts";
import { cleanText } from "../../text";
import { domainKey, hostsOf, identifierKeysOf, nameKeysOf } from "../keys";
import { vrdbSourceOf } from "../sources";
import type { ParsedRecord } from "../types";
import { type XmlElement, childText, childTexts, scanElements } from "../xmlScan";
import { type Connector, bodyText, dayOf } from "./types";

export const UK_LIST_URL = "https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.xml";
/** What the text of a record begins with, and what the analysis prompt names it by. */
export const UK_RECORD_MARK = "UK Sanctions List";
/** The XML file was 22 MB on 2026-10-29. */
const UK_MAX_BYTES = 64 * 1024 * 1024;
const UK_TYPES = ["application/xml", "text/xml", "application/octet-stream"];
const UK_TOTAL_TIMEOUT_MS = 300_000;
const UK_ROOT = "Designations";
const MAX_SHOWN_ALIASES = 6;

const LIST_PAGE = vrdbSourceOf("uk_sanctions").documentationUrl;

/** A name of a designation: its parts Name1 to Name6, of which an entity's is Name6. */
const nameOf = (name: XmlElement): string =>
  ["Name1", "Name2", "Name3", "Name4", "Name5", "Name6"]
    .map((part) => childText(name, [part]))
    .filter((part): part is string => part !== null)
    .join(" ");

/** How an other name is shown: the format guide's types are "Alias" and "Primary Name Variation". */
const aliasKindOf = (type: string): string => {
  const lower = type.toLowerCase();
  return lower.includes("variation") ? "variation" : "alias";
};

/** The record of an entity; null for one without a unique id or a name, which is an error. */
function recordOf(designation: XmlElement): ParsedRecord | null {
  const id = childText(designation, ["UniqueID"]);
  const names = designation.children
    .filter((child) => child.name === "Names")
    .flatMap((group) => group.children.filter((child) => child.name === "Name"))
    .map((name) => ({ name: cleanText(nameOf(name)), type: childText(name, ["NameType"]) ?? "" }))
    .filter((name) => name.name !== "");
  if (id === null || names.length === 0) return null;
  const primary = names.find((name) => name.type.toLowerCase() === "primary name") ?? names[0];
  const others = names.filter(
    (name, index) =>
      name !== primary &&
      name.name !== primary.name &&
      names.findIndex((other) => other.name === name.name) === index,
  );
  const shown = others.slice(0, MAX_SHOWN_ALIASES);
  const rest = others.length - shown.length;
  const aliases = shown.map((name) => `"${name.name}" (${aliasKindOf(name.type)})`).join(", ");

  const regime = childText(designation, ["RegimeName"]) ?? "";
  // Only a designation the UN made has one; the element is absent from the others.
  const unReference = childText(designation, ["UNReferenceNumber"]) ?? "";
  const entity = ["EntityDetails", "Entity"];
  const types = childTexts(designation, [...entity, "TypeOfEntities", "TypeOfEntity"]);
  const registrations = childTexts(designation, [
    ...entity,
    "BusinessRegistrationNumbers",
    "BusinessRegistrationNumber",
  ]);
  const websites = childTexts(designation, ["Websites", "Website"]);
  const designated = dayOf(childText(designation, ["DateDesignated"]));
  // A page on a host where many have pages says nothing about who the entity is.
  const domainKeys = [
    ...new Set(
      websites
        .flatMap(hostsOf)
        .filter((host) => !isSharedHost(host))
        .map(domainKey),
    ),
  ];

  return {
    sourceRecordId: id,
    recordType: "sanctions_entity",
    title: `${UK_RECORD_MARK}: ${primary.name}`,
    summary: joinSentences([
      `${UK_RECORD_MARK} (gov.uk).`,
      `Entry: "${primary.name}" (entity).`,
      aliases === "" ? "" : `Also listed as: ${aliases}${rest > 0 ? `, and ${rest} more` : ""}.`,
      sentence("Regime", regime),
      sentence("UN reference number", unReference),
      sentence("Type of entity", types.join(", ")),
      sentence("Date designated", designated ?? ""),
      sentence("Website", websites.join(", ")),
      sentence("Business registration number", registrations.join(", ")),
    ]),
    url: `${LIST_PAGE}?uid=${encodeURIComponent(id)}`,
    identifiers: {
      ...(regime === "" ? {} : { regime }),
      ...(unReference === "" ? {} : { unReferenceNumber: unReference }),
      ...(registrations.length === 0 ? {} : { businessRegistrationNumbers: registrations }),
    },
    matchKeys: [
      ...nameKeysOf(names.map((name) => name.name)),
      ...domainKeys,
      ...identifierKeysOf(registrations),
    ],
    publishedAt: designated,
    sourceUpdatedAt: dayOf(childText(designation, ["LastUpdated"])),
  };
}

export const ukConnector: Connector = {
  id: "uk_sanctions",
  // 2: the business registration numbers became keys (M2); 3: they are in the text too (M2 final
  // review), so a person and the model see what an entry matched by; 4: an e-mail address in the
  // website field gives no domain key (keys.ts `hostsOf`), a designation whose kind is missing or is
  // none of individual, entity and ship is one error and no longer skipped unseen, and the UN
  // reference number of a designation the UN made is in the text and the identifiers (Q6), since
  // the UN list itself is not copied. Each changes what `parse` gives from the same file, and a new
  // version makes the sync parse a downloaded file again though its bytes did not change
  // (connectors/types.ts).
  version: 4,
  async download(fetch, validators) {
    const response = await fetch(UK_LIST_URL, validators, {
      maxBytes: UK_MAX_BYTES,
      allowedContentTypes: UK_TYPES,
      totalTimeoutMs: UK_TOTAL_TIMEOUT_MS,
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
    const xml = snapshot.bodies[0] ?? "";
    const records: ParsedRecord[] = [];
    let unreadable = 0;
    const scan = scanElements(xml, "Designation", (designation) => {
      const kind = childText(designation, ["IndividualEntityShip"])?.toLowerCase();
      if (kind !== "entity") {
        // The list's kinds are Individual, Entity and Ship; any other, or none, would be skipped
        // unseen, and the next sync would take its entity off the copy.
        if (kind !== "individual" && kind !== "ship") unreadable += 1;
        return;
      }
      const record = recordOf(designation);
      if (record === null) unreadable += 1;
      else records.push(record);
    });
    // A document of another root is not the list, whatever it holds.
    if (scan.root !== UK_ROOT) {
      return { records: [], errors: scan.errors + 1, sourceVersion: null, root: scan.root };
    }
    let generated: string | null = null;
    scanElements(xml, "DateGenerated", (element) => {
      generated ??= element.text.trim() || null;
    });
    return {
      records,
      errors: scan.errors + unreadable,
      sourceVersion: dayOf(generated) ?? generated,
      root: scan.root,
    };
  },
};
