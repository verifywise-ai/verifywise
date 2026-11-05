/**
 * The classes of the records of the four AI-specific lists (spec D2.14 to D2.17, Q30; rulings R4
 * and R5): a record is classified by its database and never by the host of its link, and every
 * match against these lists is by name, so none is strong (D5.3 step 0: Low support with the
 * name-only note, whatever the class). The class decides only the publisher label.
 */
import {
  RECORD_SOURCE_IDS,
  type RecordSourceId,
} from "../../../../domain.layer/interfaces/i.vendorResearch";
import type { ResearchTarget } from "../../target";
import { classifyRecord, classifySource, recordMatchOf } from "../classify";

const ACME: ResearchTarget = {
  name: "Acme Analytics",
  domain: "acme-analytics.example",
  provides: "Analytics software",
};

/** The four lists, and the class of their records. */
const AI_LISTS = [
  ["aiid", "unverified"],
  ["atlas", "trusted_press"],
  ["nhtsa_sgo", "official"],
  ["fda_ai_devices", "official"],
] as const;

const AI_LIST_IDS: readonly RecordSourceId[] = AI_LISTS.map(([id]) => id);

describe("the records of the AI-specific lists", () => {
  it.each(AI_LISTS)(
    "classifies a %s record as %s by its database, with the database as the publisher",
    (id, category) => {
      expect(classifyRecord(id)).toEqual({ category, publisher: id, entry: null, reviewed: true });
    },
  );

  it.each(AI_LISTS)("takes a %s record for a weak match, whatever the vendor holds", (id) => {
    expect(recordMatchOf(id)).toBe("weak");

    // Every identifier a person can store on a vendor, and a vendor with none: the lists carry no
    // identifier, domain or vendor field, so no target strengthens a match by name (R5). The CIK
    // strengthens the SEC's records and no other database's.
    const targets: ResearchTarget[] = [
      ACME,
      { ...ACME, domain: null },
      { ...ACME, aliases: ["Acme"] },
      { ...ACME, identifiers: { secCik: "0001234567" } },
      { ...ACME, identifiers: { country: "DE", registrationNumber: "HRB 12345 B" } },
      { ...ACME, identifiers: { lei: "TEST00ACMEANALYT0100" } },
    ];
    for (const target of targets) expect(recordMatchOf(id, target)).toBe("weak");
  });

  it.each([
    ["aiid", "https://incidentdatabase.ai/cite/1797"],
    ["atlas", "https://atlas.mitre.org/studies/AML.CS0046"],
    [
      "nhtsa_sgo",
      "https://www.nhtsa.gov/laws-regulations/standing-general-order-crash-reporting?reportingEntity=acmeautonomy&automation=ads",
    ],
    [
      "fda_ai_devices",
      "https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices?company=acmemedical",
    ],
  ] as const)(
    "gives a %s record the class of the host that it links to (%s), so the two ways of classifying agree",
    (id, link) => {
      const byHost = classifySource({ url: link, onVendorSite: false }, ACME);

      expect(byHost.category).toBe(classifyRecord(id).category);
      expect(byHost.reviewed).toBe(true);
    },
  );

  it("holds a class and a match for every database id, the four lists among them", () => {
    expect(RECORD_SOURCE_IDS).toEqual(expect.arrayContaining([...AI_LIST_IDS]));
    const categories = ["official", "trusted_press", "vendor", "unverified"];

    for (const id of RECORD_SOURCE_IDS) {
      const found = classifyRecord(id);

      expect(categories).toContain(found.category);
      expect(found.publisher).toBe(found.category === "vendor" ? "vendor" : id);
      expect(["strong", "weak", null]).toContain(recordMatchOf(id));
    }
  });
});
