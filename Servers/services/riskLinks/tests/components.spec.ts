import { connectedComponents } from "../direction/components";

describe("connectedComponents", () => {
  it("returns nothing when there are no pairs", () => {
    expect(connectedComponents([])).toEqual([]);
  });

  it("merges pairs that share a risk into one component", () => {
    expect(
      connectedComponents([
        { a: 1, b: 2 },
        { a: 2, b: 3 },
      ]),
    ).toEqual([[1, 2, 3]]);
  });

  it("keeps disjoint pairs in separate components", () => {
    expect(
      connectedComponents([
        { a: 5, b: 6 },
        { a: 1, b: 2 },
      ]),
    ).toEqual([
      [1, 2],
      [5, 6],
    ]);
  });

  // The bridging pair arrives after both chains already exist, which is the
  // case a naive one-pass grouping gets wrong.
  it("merges two existing chains when a later pair bridges them", () => {
    expect(
      connectedComponents([
        { a: 1, b: 2 },
        { a: 3, b: 4 },
        { a: 2, b: 3 },
      ]),
    ).toEqual([[1, 2, 3, 4]]);
  });

  it("is unaffected by the same pair arriving twice in either order", () => {
    expect(
      connectedComponents([
        { a: 1, b: 2 },
        { a: 2, b: 1 },
      ]),
    ).toEqual([[1, 2]]);
  });

  // The queue derives a jobId from a component's smallest id, so an unstable
  // order would let one component enqueue twice under two different ids.
  it("sorts ids inside a component and components by their smallest id", () => {
    expect(
      connectedComponents([
        { a: 9, b: 7 },
        { a: 3, b: 1 },
      ]),
    ).toEqual([
      [1, 3],
      [7, 9],
    ]);
  });
});
