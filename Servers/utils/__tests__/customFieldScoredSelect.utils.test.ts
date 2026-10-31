import { describe, it, expect } from "@jest/globals";
import {
  formatScore,
  formatScoredOption,
  MAX_SCORED_OPTIONS,
  removedOptions,
  roundScore,
  validateOptionMoves,
  validateScoredOptions,
  type IScoredOption,
} from "../customFieldScoredSelect.utils";

const ID = /^opt_[0-9a-f]{8}$/;
const existing: IScoredOption[] = [
  { id: "opt_00000001", label: "High", score: 3 },
  { id: "opt_00000002", label: "Medium", score: 2 },
  { id: "opt_00000003", label: "Low", score: 1 },
];

describe("roundScore / formatScore", () => {
  it("rounds to 2 decimals and drops -0", () => {
    expect(roundScore(0.333)).toBe(0.33);
    expect(roundScore(2.5)).toBe(2.5);
    expect(roundScore(-2)).toBe(-2);
    expect(Object.is(roundScore(-0.001), 0)).toBe(true);
  });
  it("formats without trailing zeros", () => {
    expect(formatScore(3)).toBe("3");
    expect(formatScore(0.5)).toBe("0.5");
    expect(formatScore(0.333)).toBe("0.33");
    expect(formatScoredOption({ label: "High", score: 3 })).toBe("High (3)");
  });
});

describe("validateScoredOptions", () => {
  it("assigns ids on create, trims labels, rounds scores, keeps order", () => {
    const out = validateScoredOptions(
      [
        { label: " High ", score: 3 },
        { label: "Low", score: 0.333 },
      ],
      null,
    );
    expect(out.map((o) => o.label)).toEqual(["High", "Low"]);
    expect(out.map((o) => o.score)).toEqual([3, 0.33]);
    out.forEach((o) => expect(o.id).toMatch(ID));
    expect(new Set(out.map((o) => o.id)).size).toBe(2);
  });

  it("keeps existing ids on update and assigns new ones to new rows", () => {
    const out = validateScoredOptions(
      [
        { id: "opt_00000003", label: "Minimal", score: 1 },
        { id: "opt_00000001", label: "High", score: 4 },
        { label: "Extreme", score: 5 },
      ],
      existing,
    );
    expect(out[0]).toEqual({ id: "opt_00000003", label: "Minimal", score: 1 });
    expect(out[1]).toEqual({ id: "opt_00000001", label: "High", score: 4 });
    expect(out[2].id).toMatch(ID);
    expect(["opt_00000001", "opt_00000002", "opt_00000003"]).not.toContain(out[2].id);
  });

  it("drops unknown keys on an option", () => {
    const [o] = validateScoredOptions([{ label: "A", score: 1, color: "red" }], null);
    expect(Object.keys(o).sort()).toEqual(["id", "label", "score"]);
  });

  it.each([
    ["an empty list", []],
    ["a non-array", "High"],
    [
      "too many options",
      Array.from({ length: MAX_SCORED_OPTIONS + 1 }, (_, i) => ({ label: `o${i}`, score: i })),
    ],
    ["a string option", ["High"]],
    ["a missing score", [{ label: "High" }]],
    ["a non-finite score", [{ label: "High", score: Infinity }]],
    ["a score too large to round to 2 decimals", [{ label: "High", score: 1e307 }]],
    ["a string score", [{ label: "High", score: "3" }]],
    ["an empty label", [{ label: "  ", score: 1 }]],
    [
      "labels that differ only in case",
      [
        { label: "High", score: 3 },
        { label: "high ", score: 2 },
      ],
    ],
  ])("rejects %s", (_name, input) => {
    expect(() => validateScoredOptions(input, null)).toThrow();
  });

  it("rejects ids on create (clients can't mint ids)", () => {
    expect(() =>
      validateScoredOptions([{ id: "opt_00000001", label: "High", score: 3 }], null),
    ).toThrow(/unknown option id/);
  });

  it("rejects an id from another field and a duplicated id", () => {
    expect(() =>
      validateScoredOptions([{ id: "opt_deadbeef", label: "X", score: 1 }], existing),
    ).toThrow(/unknown option id/);
    expect(() =>
      validateScoredOptions(
        [
          { id: "opt_00000001", label: "High", score: 3 },
          { id: "opt_00000001", label: "Again", score: 3 },
        ],
        existing,
      ),
    ).toThrow(/unique/);
  });
});

describe("removedOptions / validateOptionMoves", () => {
  const after: IScoredOption[] = [existing[0], existing[2]];
  const removed = removedOptions(existing, after);

  it("lists options that are no longer present", () => {
    expect(removed).toEqual([existing[1]]);
  });
  it("accepts a move from a removed option to a remaining one", () => {
    expect(validateOptionMoves({ opt_00000002: "opt_00000003" }, removed, after)).toEqual({
      opt_00000002: "opt_00000003",
    });
  });
  it("treats a missing value as no moves", () => {
    expect(validateOptionMoves(undefined, removed, after)).toEqual({});
    expect(validateOptionMoves(null, removed, after)).toEqual({});
  });
  it.each([
    ["a non-object", "opt_00000003"],
    ["a source that wasn't removed", { opt_00000001: "opt_00000003" }],
    ["a target that was removed", { opt_00000002: "opt_00000002" }],
    ["an unknown target", { opt_00000002: "opt_ffffffff" }],
  ])("rejects %s", (_name, moves) => {
    expect(() => validateOptionMoves(moves, removed, after)).toThrow();
  });
});
