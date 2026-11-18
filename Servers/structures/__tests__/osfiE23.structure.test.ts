import { FRAMEWORK_STRUCTURES, getStructureById, requireStructureByKey } from "../index";

const EXPECTED = [5, 7, 3, 6, 8, 3, 7, 3, 6, 6, 6, 3, 6, 7, 5, 2];

const ATTRIBUTION =
  "Based on OSFI Guideline E-23 – Model Risk Management (2027), published September 11, 2025, effective May 1, 2027. Requirements are paraphrased; see https://www.osfi-bsif.gc.ca/en/guidance/guidance-library/guideline-e-23-model-risk-management-2027 for the official text.";

describe("OSFI E-23 structure", () => {
  const fw = getStructureById(26)!;

  it("is registered with the expected identity", () => {
    expect(fw?.key).toBe("osfi-e23");
    expect(requireStructureByKey("osfi-e23")).toBe(fw);
    expect(fw.seed.name).toBe("OSFI E-23 Model Risk Management");
    expect(fw.seed.version).toBe("2027");
    expect(fw.seed.is_organizational).toBe(true);
    expect(fw.seed.hierarchy.type).toBe("two_level");
    expect(fw.tables.l3_struct).toBeUndefined();
  });

  it("has unique ids and table names across the registry", () => {
    const ids = FRAMEWORK_STRUCTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const tables = FRAMEWORK_STRUCTURES.flatMap((f) => Object.values(f.tables).filter(Boolean));
    expect(new Set(tables).size).toBe(tables.length);
  });

  it("has the expected group and item counts", () => {
    expect(fw.seed.structure.map((g) => g.items?.length)).toEqual(EXPECTED);
  });

  it("has 83 items in total", () => {
    const total = fw.seed.structure.reduce((n, g) => n + (g.items?.length ?? 0), 0);
    expect(total).toBe(83);
  });

  it("sets explicit order_no equal to the 1-based index", () => {
    fw.seed.structure.forEach((g, gi) => {
      expect(g.order_no).toBe(gi + 1);
      g.items?.forEach((it, ii) => expect(it.order_no).toBe(ii + 1));
    });
  });

  it("gives every item complete content", () => {
    for (const g of fw.seed.structure) {
      for (const it of g.items ?? []) {
        expect(it.title).toMatch(/^(\d+\.\d+\.\d+|A\.\d) /);
        expect(it.description?.length).toBeGreaterThan(0);
        expect(it.summary?.length).toBeGreaterThan(0);
        expect(it.questions!.length).toBeGreaterThanOrEqual(2);
        expect(it.questions!.length).toBeLessThanOrEqual(6);
        expect(it.evidence_examples!.length).toBeGreaterThanOrEqual(2);
        expect(it.evidence_examples!.length).toBeLessThanOrEqual(5);
      }
    }
  });

  it("ends the seed description with the attribution sentence", () => {
    expect(fw.seed.description!.endsWith(ATTRIBUTION)).toBe(true);
  });

  it("contains no product name in content", () => {
    expect(JSON.stringify(fw.seed)).not.toMatch(/verifywise/i);
  });
});
