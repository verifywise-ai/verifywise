import { LL144_RACE, LL144_SEX } from "./allocation";
import { NAME_METHOD, nameFor } from "./names";
import { findForbidden } from "../stance/vocabulary";
import { findDemographicTerms } from "./demographicTerms";

const ids = (n: number) => [...Array(n)].map((_, i) => `C${String(i + 1).padStart(4, "0")}`);

describe("nameFor", () => {
  it("returns a first name and surname for every cell", () => {
    for (const sex of LL144_SEX)
      for (const raceEthnicity of LL144_RACE) {
        expect(nameFor({ sex, raceEthnicity }, "C0001", 7)).toMatch(/^\S+ \S+/);
      }
  });

  it("is deterministic for a candidate and seed, and varies across candidates", () => {
    const d = { sex: "Female", raceEthnicity: "White" };
    expect(nameFor(d, "C0001", 7)).toBe(nameFor(d, "C0001", 7));
    const names = new Set(
      ["C0001", "C0002", "C0003", "C0004", "C0005", "C0006"].map((id) => nameFor(d, id, 7)),
    );
    expect(names.size).toBeGreaterThan(1);
  });

  it("throws on a cell outside the LL 144 categories", () => {
    expect(() => nameFor({ sex: "X", raceEthnicity: "White" }, "C0001", 7)).toThrow();
    expect(() => nameFor({ sex: "Male", raceEthnicity: "Other" }, "C0001", 7)).toThrow();
  });

  it("gives every cell at least 20 distinct full names over a corpus", () => {
    for (const sex of LL144_SEX)
      for (const raceEthnicity of LL144_RACE) {
        const names = new Set(ids(400).map((id) => nameFor({ sex, raceEthnicity }, id, 11)));
        expect(names.size).toBeGreaterThanOrEqual(20);
      }
  });
});

/** First names and surnames a cell produces over many candidates. */
function namesOf(sex: string, raceEthnicity: string, n = 3000) {
  const first = new Set<string>();
  const last = new Set<string>();
  for (const id of ids(n)) {
    const [f, l] = nameFor({ sex, raceEthnicity }, id, 5).split(" ");
    first.add(f);
    last.add(l);
  }
  return { first, last };
}

describe("name lists", () => {
  // Ruling: given names commonly used for both sexes carry no sex signal.
  const AMBIGUOUS = [
    "Wei",
    "Li",
    "Jin",
    "Yan",
    "Ming",
    "Yu",
    "Min",
    "Yi",
    "Kyung",
    "Jung",
    "Hui",
    "Wai",
    "Tam",
    "Xiao",
    "Anh",
    "Dung",
    "Linh",
    "Hoa",
    "Phuong",
    "Keola",
    "Fetu",
  ];

  it("hold no sex-ambiguous first name in any cell", () => {
    for (const sex of LL144_SEX)
      for (const raceEthnicity of LL144_RACE) {
        const { first } = namesOf(sex, raceEthnicity);
        expect(AMBIGUOUS.filter((n) => first.has(n))).toEqual([]);
      }
  });

  it("give Native American or Alaska Native first names that belong to no other group's list", () => {
    for (const sex of LL144_SEX) {
      const naan = namesOf(sex, "Native American or Alaska Native").first;
      for (const other of LL144_RACE.filter(
        (r) => r !== "Native American or Alaska Native" && r !== "Two or more races",
      )) {
        const theirs = namesOf(sex, other).first;
        expect([...naan].filter((n) => theirs.has(n))).toEqual([]);
      }
    }
  });

  it("never trip the demographic-term matcher", () => {
    for (const sex of LL144_SEX)
      for (const raceEthnicity of LL144_RACE) {
        const { first, last } = namesOf(sex, raceEthnicity);
        expect([...first, ...last].filter((n) => findDemographicTerms(n).length > 0)).toEqual([]);
      }
  });
});

describe("NAME_METHOD", () => {
  it("says the surname carries the signal where the first name cannot", () => {
    expect(NAME_METHOD).toMatch(/surname carries the race\/ethnicity signal/);
  });

  it("states the method in plain words the stance can print", () => {
    expect(NAME_METHOD).toMatch(/name/i);
    expect(findForbidden(NAME_METHOD)).toEqual([]);
  });
});
