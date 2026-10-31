import { describe, it, expect } from "vitest";
import { withSequentialOrder, type FormField } from "../types";

const field = (id: string, order: number): FormField => ({ id, type: "text", label: id, order });

describe("withSequentialOrder", () => {
  it("sorts by order and renumbers from 0, so the canvas and the rules agree", () => {
    const result = withSequentialOrder([field("e", 2), field("c", 2), field("d", 3)]);
    expect(result.map((f) => [f.id, f.order])).toEqual([
      ["e", 0],
      ["c", 1],
      ["d", 2],
    ]);
  });

  it("returns the same field objects when order is already sequential", () => {
    const fields = [field("a", 0), field("b", 1)];
    const result = withSequentialOrder(fields);
    expect(result[0]).toBe(fields[0]);
    expect(result[1]).toBe(fields[1]);
  });
});
