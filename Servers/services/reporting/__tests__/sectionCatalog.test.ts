import { REPORT_SECTION_CATALOG, SECTION_KEYS, kindViolations } from "../sectionCatalog";

// The 13 literals (plus frameworkRequirements, added later) VALID_SECTION_KEYS held before the catalog refactor.
// This is a behaviour pin: the refactor must not add or drop a key.
const E23_ONLY_KEYS = [
  "mrmFleet",
  "e23Contradictions",
  "e23FixItList",
  "mrmInventoryAppendix",
  "signOff",
];

const LEGACY_VALID_SECTION_KEYS = [
  "projectRisks",
  "vendorRisks",
  "modelRisks",
  "compliance",
  "assessment",
  "clausesAndAnnexes",
  "nistSubcategories",
  "frameworkRequirements",
  "vendors",
  "models",
  "trainingRegistry",
  "policyManager",
  "incidentManagement",
  "all",
];

describe("sectionCatalog", () => {
  const generalKeys = SECTION_KEYS.filter((k) => !E23_ONLY_KEYS.includes(k));

  it("holds exactly the 18 real sections (the 'all' wildcard is not a section)", () => {
    expect(SECTION_KEYS).toHaveLength(18);
    expect(SECTION_KEYS).not.toContain("all");
  });

  it("plus the wildcard reproduces the legacy VALID_SECTION_KEYS set exactly", () => {
    expect(new Set([...generalKeys, "all"])).toEqual(new Set(LEGACY_VALID_SECTION_KEYS));
  });

  it("gives every section a non-empty label and group", () => {
    for (const entry of REPORT_SECTION_CATALOG) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.group.length).toBeGreaterThan(0);
    }
  });

  it("lists frameworkRequirements under Compliance and governance", () => {
    expect(REPORT_SECTION_CATALOG).toContainEqual({
      key: "frameworkRequirements",
      label: "Framework requirements",
      group: "Compliance and governance",
    });
    expect(SECTION_KEYS).toContain("frameworkRequirements");
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
    expect(new Set(backendKeys)).toEqual(new Set(generalKeys));
  });

  it("marks the five E-23 sections as osfi_e23 only", () => {
    for (const key of E23_ONLY_KEYS) {
      const entry = REPORT_SECTION_CATALOG.find((e) => e.key === key);
      expect(entry?.kinds).toEqual(["osfi_e23"]);
    }
  });

  it("leaves frameworkRequirements available to every report", () => {
    const entry = REPORT_SECTION_CATALOG.find((e) => e.key === "frameworkRequirements");
    expect(entry?.kinds).toBeUndefined();
  });

  it("kindViolations flags kind-restricted keys on a report without that kind", () => {
    expect(kindViolations(["mrmFleet", "frameworkRequirements"], undefined)).toEqual(["mrmFleet"]);
    expect(kindViolations(["mrmFleet"], "osfi_e23")).toEqual([]);
    expect(kindViolations(["mrmFleet"], "other")).toEqual(["mrmFleet"]);
  });
});
