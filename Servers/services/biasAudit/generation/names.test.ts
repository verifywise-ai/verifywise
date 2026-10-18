import { LL144_RACE, LL144_SEX } from "./allocation";
import { NAME_METHOD, nameFor } from "./names";
import { findForbidden } from "../stance/vocabulary";

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

describe("NAME_METHOD", () => {
  it("states the method in plain words the stance can print", () => {
    expect(NAME_METHOD).toMatch(/name/i);
    expect(findForbidden(NAME_METHOD)).toEqual([]);
  });
});
