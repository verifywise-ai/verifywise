// This file's subject is pure, but it lives in a module that will also hold the
// orchestration (Task 6), which reaches the database and the AI SDK. These three
// mocks keep importing it from opening a connection. Same trio as
// services/riskLinks/tests/recompute.spec.ts.
jest.mock("../../../utils/riskLink.utils");
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn() },
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { filterProposedGroups, hierarchyPairKey } from "../direction/direction.service";
import { HierarchyGroup } from "../direction/schema";

const group = (parent: number, children: number[]): HierarchyGroup => ({
  parent_risk_id: parent,
  child_risk_ids: children,
  reason: "They are instances of the same underlying problem.",
});

const COMPONENT = [1, 2, 3, 4, 5];

describe("filterProposedGroups", () => {
  it("turns a clean group into one edge per child, child first", () => {
    expect(filterProposedGroups([group(1, [2, 3])], COMPONENT, [], new Set())).toEqual([
      { childRiskId: 2, parentRiskId: 1 },
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  // Two groups naming the SAME parent are one legal answer split across two
  // objects, which a model with two different reasons will produce. C1
  // constrains children to one parent; it says nothing about a parent
  // appearing twice, so dropping the second group would throw away half a
  // correct answer.
  it("keeps a second group that reuses the first group's parent", () => {
    expect(
      filterProposedGroups([group(1, [2]), group(1, [3])], COMPONENT, [], new Set()),
    ).toEqual([
      { childRiskId: 2, parentRiskId: 1 },
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  it("keeps two disjoint groups from the same component", () => {
    expect(
      filterProposedGroups([group(1, [2]), group(3, [4])], COMPONENT, [], new Set()),
    ).toEqual([
      { childRiskId: 2, parentRiskId: 1 },
      { childRiskId: 4, parentRiskId: 3 },
    ]);
  });

  it("accepts an empty answer", () => {
    expect(filterProposedGroups([], COMPONENT, [], new Set())).toEqual([]);
  });

  // Rule 1. A hallucinated id is the failure mode that would write a link
  // between two risks the model was never shown.
  it("drops a group naming an id outside the component", () => {
    expect(filterProposedGroups([group(1, [2, 99])], COMPONENT, [], new Set())).toEqual([]);
  });

  it("drops a group whose parent is outside the component", () => {
    expect(filterProposedGroups([group(99, [2])], COMPONENT, [], new Set())).toEqual([]);
  });

  // Rule 2.
  it("drops a group that makes a risk its own parent", () => {
    expect(filterProposedGroups([group(1, [1, 2])], COMPONENT, [], new Set())).toEqual([]);
  });

  // Rule 3. Both halves: the same id twice as a child, and the same id as a
  // child in one group and a parent in another.
  it("drops the second group when a risk is claimed as a child twice", () => {
    expect(
      filterProposedGroups([group(1, [2]), group(3, [2])], COMPONENT, [], new Set()),
    ).toEqual([{ childRiskId: 2, parentRiskId: 1 }]);
  });

  it("drops the second group when a child of the first is used as its parent", () => {
    expect(
      filterProposedGroups([group(1, [2]), group(2, [3])], COMPONENT, [], new Set()),
    ).toEqual([{ childRiskId: 2, parentRiskId: 1 }]);
  });

  it("drops the second group when a parent of the first is used as its child", () => {
    expect(
      filterProposedGroups([group(1, [2]), group(3, [1])], COMPONENT, [], new Set()),
    ).toEqual([{ childRiskId: 2, parentRiskId: 1 }]);
  });

  // Rule 4, both orderings. A dismissed A -> B blocks proposing B -> A: the
  // user rejected a hierarchy between these two risks, and offering the mirror
  // image next scan is re-asking the same question in different words.
  it("drops a pair that already has an inherits_from row", () => {
    const existing = new Set([hierarchyPairKey(2, 1)]);
    expect(filterProposedGroups([group(1, [2, 3])], COMPONENT, [], existing)).toEqual([
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  it("blocks the mirror of a pair that already has a row", () => {
    const existing = new Set([hierarchyPairKey(1, 2)]);
    expect(filterProposedGroups([group(1, [2])], COMPONENT, [], existing)).toEqual([]);
  });

  // Rule 5, against confirmed edges.
  it("drops a child that already has a confirmed parent", () => {
    const blocking = [{ childRiskId: 2, parentRiskId: 5 }];
    expect(filterProposedGroups([group(1, [2, 3])], COMPONENT, blocking, new Set())).toEqual([
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  it("drops a group whose proposed parent is already someone's child", () => {
    const blocking = [{ childRiskId: 1, parentRiskId: 5 }];
    expect(filterProposedGroups([group(1, [2])], COMPONENT, blocking, new Set())).toEqual([]);
  });

  it("drops a proposed child that already has children of its own", () => {
    const blocking = [{ childRiskId: 5, parentRiskId: 2 }];
    expect(filterProposedGroups([group(1, [2, 3])], COMPONENT, blocking, new Set())).toEqual([
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  // Rule 5 against a LIVE SUGGESTION, not a confirmed edge. This is the case
  // that closes the across-scans hole: without it a second scan can offer a
  // second parent for a child whose first suggestion is still unanswered, and
  // confirming both is impossible.
  it("drops a second candidate parent while an earlier suggestion is unanswered", () => {
    const blocking = [{ childRiskId: 2, parentRiskId: 5 }];
    expect(filterProposedGroups([group(1, [2])], COMPONENT, blocking, new Set())).toEqual([]);
  });

  // Rule 5's accumulator. Rule 3 already stops this shape from one model
  // answer; the accumulator is what makes the guarantee hold regardless.
  it("keeps the batch self-consistent as it accepts edges", () => {
    const kept = filterProposedGroups([group(1, [2]), group(4, [5])], COMPONENT, [], new Set());
    expect(kept).toHaveLength(2);
  });
});
