import { describe, it, expect } from "vitest";
import { readersOf } from "..";
import type { LogicField } from "..";

const num = (id: string, order: number): LogicField => ({ id, type: "number", label: id, order });
const calc = (id: string, order: number, formula: string): LogicField => ({
  id,
  type: "calculated",
  label: id,
  order,
  formula,
});

describe("readersOf", () => {
  it("lists the fields that read a field directly or through others", () => {
    const fields = [num("a", 0), calc("b", 1, "{a} * 2"), calc("c", 2, "{b} + 1"), num("d", 3)];
    expect(Array.from(readersOf(fields, "a")).sort()).toEqual(["b", "c"]);
    expect(Array.from(readersOf(fields, "d"))).toEqual([]);
  });

  it("follows show/hide rules too", () => {
    const fields: LogicField[] = [
      num("a", 0),
      {
        id: "q",
        type: "text",
        label: "q",
        order: 1,
        visibility: { match: "all", conditions: [{ fieldId: "a", operator: "is_not_empty" }] },
      },
    ];
    expect(Array.from(readersOf(fields, "a"))).toEqual(["q"]);
  });

  it("stops on a loop", () => {
    const fields = [calc("x", 0, "{y} + 1"), calc("y", 1, "{x} + 1")];
    expect(Array.from(readersOf(fields, "x")).sort()).toEqual(["x", "y"]);
  });
});
