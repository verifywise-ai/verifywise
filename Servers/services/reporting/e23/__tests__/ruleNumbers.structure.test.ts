import { getStructureById } from "../../../../structures";
import { E23_RULES } from "../contradictionRules";

/**
 * The contradiction rules name their E-23 requirement by the number in its
 * title. A renumbering of the structure file must fail here, not silently turn
 * a rule into "not run" in every organization's report.
 */
describe("E-23 rule requirement numbers", () => {
  const structure = getStructureById(26);
  const titles = (structure?.seed.structure ?? []).flatMap((l1) =>
    (l1.items ?? []).flatMap((l2) => [l2.title, ...(l2.items ?? []).map((l3) => l3.title)]),
  );
  const numbers = new Set(titles.map((t) => t.trim().split(" ")[0]));

  it("gives every requirement its own number", () => {
    // The fix-it list and the glance merge pairings by requirement number.
    expect(numbers.size).toBe(titles.length);
  });

  it("loads the OSFI E-23 structure", () => {
    expect(structure?.key).toBe("osfi-e23");
    expect(titles.length).toBeGreaterThan(0);
  });

  it.each(E23_RULES.map((r) => [r.id, r.requirement]))(
    "%s targets requirement %s, which exists in the structure",
    (_id, requirement) => {
      expect(numbers.has(requirement)).toBe(true);
    },
  );

  it("each rule's description matches its requirement title", () => {
    for (const r of E23_RULES) {
      expect(titles).toContain(`${r.requirement} ${r.description}`);
    }
  });
});
