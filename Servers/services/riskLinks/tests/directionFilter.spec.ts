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
import { CrossEntityCandidate } from "../direction/candidates";
import { HierarchyGroup } from "../direction/schema";
import { HierarchyParent } from "../../../utils/riskLink.utils";

const group = (
  parent: number,
  children: number[],
  parentEntityType: HierarchyGroup["parent_entity_type"] = "risk",
): HierarchyGroup => ({
  parent_risk_id: parent,
  parent_entity_type: parentEntityType,
  child_risk_ids: children,
  reason: "They are instances of the same underlying problem.",
});

const COMPONENT = [1, 2, 3, 4, 5];

describe("filterProposedGroups", () => {
  it("turns a clean group into one edge per child, child first", () => {
    expect(filterProposedGroups([group(1, [2, 3])], COMPONENT, [], new Set(), new Map())).toEqual([
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
      filterProposedGroups([group(1, [2]), group(1, [3])], COMPONENT, [], new Set(), new Map()),
    ).toEqual([
      { childRiskId: 2, parentRiskId: 1 },
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  it("keeps two disjoint groups from the same component", () => {
    expect(
      filterProposedGroups([group(1, [2]), group(3, [4])], COMPONENT, [], new Set(), new Map()),
    ).toEqual([
      { childRiskId: 2, parentRiskId: 1 },
      { childRiskId: 4, parentRiskId: 3 },
    ]);
  });

  it("accepts an empty answer", () => {
    expect(filterProposedGroups([], COMPONENT, [], new Set(), new Map())).toEqual([]);
  });

  // Rule 1. A hallucinated id is the failure mode that would write a link
  // between two risks the model was never shown.
  it("drops a group naming an id outside the component", () => {
    expect(filterProposedGroups([group(1, [2, 99])], COMPONENT, [], new Set(), new Map())).toEqual([]);
  });

  it("drops a group whose parent is outside the component", () => {
    expect(filterProposedGroups([group(99, [2])], COMPONENT, [], new Set(), new Map())).toEqual([]);
  });

  // Rule 2.
  it("drops a group that makes a risk its own parent", () => {
    expect(filterProposedGroups([group(1, [1, 2])], COMPONENT, [], new Set(), new Map())).toEqual([]);
  });

  // Rule 3. Both halves: the same id twice as a child, and the same id as a
  // child in one group and a parent in another.
  it("drops the second group when a risk is claimed as a child twice", () => {
    expect(
      filterProposedGroups([group(1, [2]), group(3, [2])], COMPONENT, [], new Set(), new Map()),
    ).toEqual([{ childRiskId: 2, parentRiskId: 1 }]);
  });

  it("drops the second group when a child of the first is used as its parent", () => {
    expect(
      filterProposedGroups([group(1, [2]), group(2, [3])], COMPONENT, [], new Set(), new Map()),
    ).toEqual([{ childRiskId: 2, parentRiskId: 1 }]);
  });

  it("drops the second group when a parent of the first is used as its child", () => {
    expect(
      filterProposedGroups([group(1, [2]), group(3, [1])], COMPONENT, [], new Set(), new Map()),
    ).toEqual([{ childRiskId: 2, parentRiskId: 1 }]);
  });

  // Rule 4, both orderings. A dismissed A -> B blocks proposing B -> A: the
  // user rejected a hierarchy between these two risks, and offering the mirror
  // image next scan is re-asking the same question in different words.
  it("drops a pair that already has an inherits_from row", () => {
    const existing = new Set([hierarchyPairKey(2, { id: 1, entityType: "risk" })]);
    expect(filterProposedGroups([group(1, [2, 3])], COMPONENT, [], existing, new Map())).toEqual([
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  it("blocks the mirror of a pair that already has a row", () => {
    const existing = new Set([hierarchyPairKey(1, { id: 2, entityType: "risk" })]);
    expect(filterProposedGroups([group(1, [2])], COMPONENT, [], existing, new Map())).toEqual([]);
  });

  // Rule 5, against confirmed edges.
  it("drops a child that already has a confirmed parent", () => {
    const blocking = [{ childRiskId: 2, parentRiskId: 5 }];
    expect(filterProposedGroups([group(1, [2, 3])], COMPONENT, blocking, new Set(), new Map())).toEqual([
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  it("drops a group whose proposed parent is already someone's child", () => {
    const blocking = [{ childRiskId: 1, parentRiskId: 5 }];
    expect(filterProposedGroups([group(1, [2])], COMPONENT, blocking, new Set(), new Map())).toEqual([]);
  });

  it("drops a proposed child that already has children of its own", () => {
    const blocking = [{ childRiskId: 5, parentRiskId: 2 }];
    expect(filterProposedGroups([group(1, [2, 3])], COMPONENT, blocking, new Set(), new Map())).toEqual([
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  // Rule 5 against a LIVE SUGGESTION, not a confirmed edge. This is the case
  // that closes the across-scans hole: without it a second scan can offer a
  // second parent for a child whose first suggestion is still unanswered, and
  // confirming both is impossible.
  it("drops a second candidate parent while an earlier suggestion is unanswered", () => {
    const blocking = [{ childRiskId: 2, parentRiskId: 5 }];
    expect(filterProposedGroups([group(1, [2])], COMPONENT, blocking, new Set(), new Map())).toEqual([]);
  });

  // Rule 5's accumulator. Rule 3 already stops this shape from one model
  // answer; the accumulator is what makes the guarantee hold regardless.
  it("keeps the batch self-consistent as it accepts edges", () => {
    const kept = filterProposedGroups([group(1, [2]), group(4, [5])], COMPONENT, [], new Set(), new Map());
    expect(kept).toHaveLength(2);
  });
});

const candidateMap = (
  ...entries: Array<{ parent: HierarchyParent; children: number[] }>
): Map<string, CrossEntityCandidate> =>
  new Map(
    entries.map((entry) => [
      `${entry.parent.entityType}:${entry.parent.id}`,
      {
        parent: entry.parent,
        name: "Third-party model drift",
        childRiskIds: new Set(entry.children),
        projects: ["Acme Onboarding"],
      },
    ]),
  );

const VENDOR_9: HierarchyParent = { id: 9, entityType: "vendor_risk" };

describe("filterProposedGroups cross-entity parents", () => {
  it("accepts a candidate parent and carries its entity type onto the edge", () => {
    expect(
      filterProposedGroups(
        [group(9, [2, 3], "vendor_risk")],
        COMPONENT,
        [],
        new Set(),
        candidateMap({ parent: VENDOR_9, children: [2, 3] }),
      ),
    ).toEqual([
      { childRiskId: 2, parentRiskId: 9, parentEntityType: "vendor_risk" },
      { childRiskId: 3, parentRiskId: 9, parentEntityType: "vendor_risk" },
    ]);
  });

  // The justification rule. A vendor risk that shares a project with risk 2 has
  // no relationship at all with risk 4, and a link with no justification is the
  // noise this whole design exists to avoid.
  it("drops a child the candidate shares no project with", () => {
    expect(
      filterProposedGroups(
        [group(9, [2, 4], "vendor_risk")],
        COMPONENT,
        [],
        new Set(),
        candidateMap({ parent: VENDOR_9, children: [2] }),
      ),
    ).toEqual([{ childRiskId: 2, parentRiskId: 9, parentEntityType: "vendor_risk" }]);
  });

  it("drops a cross-entity parent that is not a candidate at all", () => {
    expect(
      filterProposedGroups(
        [group(77, [2], "vendor_risk")],
        COMPONENT,
        [],
        new Set(),
        candidateMap({ parent: VENDOR_9, children: [2] }),
      ),
    ).toEqual([]);
  });

  // vendorrisks.id = 1 and risks.id = 1 are different rows. Keying
  // `usedAsParent` on the bare number would make the second group collide with
  // the first and silently vanish.
  it("does not let a vendor parent's id block the same id as a risk parent", () => {
    expect(
      filterProposedGroups(
        [group(1, [2], "vendor_risk"), group(1, [3])],
        COMPONENT,
        [],
        new Set(),
        candidateMap({ parent: { id: 1, entityType: "vendor_risk" }, children: [2] }),
      ),
    ).toEqual([
      { childRiskId: 2, parentRiskId: 1, parentEntityType: "vendor_risk" },
      { childRiskId: 3, parentRiskId: 1 },
    ]);
  });

  it("drops a pair that already has a cross-entity row in any status", () => {
    const existing = new Set([hierarchyPairKey(2, VENDOR_9)]);
    expect(
      filterProposedGroups(
        [group(9, [2], "vendor_risk")],
        COMPONENT,
        [],
        existing,
        candidateMap({ parent: VENDOR_9, children: [2] }),
      ),
    ).toEqual([]);
  });

  it("keeps a project-risk pair that only collides by number with a stored cross-entity one", () => {
    const existing = new Set([hierarchyPairKey(2, { id: 1, entityType: "vendor_risk" })]);
    expect(
      filterProposedGroups([group(1, [2])], COMPONENT, [], existing, new Map()),
    ).toEqual([{ childRiskId: 2, parentRiskId: 1 }]);
  });
});
