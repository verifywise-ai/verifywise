import {
  REPORT_SECTION_CATALOG,
  SECTION_KEYS,
} from "../sectionCatalog";

// The 13 literals VALID_SECTION_KEYS held before the catalog refactor.
// This is a behaviour pin: the refactor must not add or drop a key.
const LEGACY_VALID_SECTION_KEYS = [
  "projectRisks",
  "vendorRisks",
  "modelRisks",
  "compliance",
  "assessment",
  "clausesAndAnnexes",
  "nistSubcategories",
  "vendors",
  "models",
  "trainingRegistry",
  "policyManager",
  "incidentManagement",
  "all",
];

describe("sectionCatalog", () => {
  it("holds exactly the 12 real sections (the 'all' wildcard is not a section)", () => {
    expect(SECTION_KEYS).toHaveLength(12);
    expect(SECTION_KEYS).not.toContain("all");
  });

  it("plus the wildcard reproduces the legacy VALID_SECTION_KEYS set exactly", () => {
    expect(new Set([...SECTION_KEYS, "all"])).toEqual(
      new Set(LEGACY_VALID_SECTION_KEYS),
    );
  });

  it("gives every section a non-empty label and group", () => {
    for (const entry of REPORT_SECTION_CATALOG) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.group.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate keys", () => {
    expect(new Set(SECTION_KEYS).size).toBe(SECTION_KEYS.length);
  });

  // Guards the drift the spec calls out: the frontend's hardcoded list and the
  // backend catalog currently agree by luck. Keys are the contract; labels are
  // presentation and deliberately differ (design rules mandate sentence case).
  it("matches the frontend REPORT_SECTION_GROUPS backendKey set", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.join(
        __dirname,
        "../../../../Clients/src/presentation/components/Reporting/GenerateReport/constants.ts",
      ),
      "utf8",
    );
    const backendKeys = [...src.matchAll(/backendKey:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(backendKeys.length).toBeGreaterThan(0);
    expect(new Set(backendKeys)).toEqual(new Set(SECTION_KEYS));
  });
});
