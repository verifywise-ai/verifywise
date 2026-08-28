import { HierarchyEdge, validateTwoLevel } from "../hierarchy";

const edge = (childRiskId: number, parentRiskId: number): HierarchyEdge => ({
  childRiskId,
  parentRiskId,
});

describe("validateTwoLevel", () => {
  it("allows an edge into an empty set", () => {
    expect(validateTwoLevel(edge(1, 2), [])).toBeNull();
  });

  it("allows an edge when the confirmed edges touch neither risk", () => {
    expect(validateTwoLevel(edge(1, 2), [edge(3, 4)])).toBeNull();
  });

  it("rejects a second parent for a risk that already has one", () => {
    expect(validateTwoLevel(edge(1, 2), [edge(1, 9)])).toBe("child_already_has_parent");
  });

  it("rejects a parent that is already someone else's child", () => {
    expect(validateTwoLevel(edge(1, 2), [edge(2, 9)])).toBe("parent_is_a_child");
  });

  it("rejects making a risk a child when it already has children", () => {
    expect(validateTwoLevel(edge(1, 2), [edge(9, 1)])).toBe("child_has_children");
  });

  it("returns child_already_has_parent when rules 1 and 2 both apply", () => {
    // Order is load-bearing: without a fixed order the message would depend on
    // row ordering from the database.
    expect(validateTwoLevel(edge(1, 2), [edge(1, 8), edge(2, 9)])).toBe(
      "child_already_has_parent",
    );
  });

  it("allows a second child under the same parent (fan-out is unlimited)", () => {
    expect(validateTwoLevel(edge(1, 5), [edge(2, 5)])).toBeNull();
  });

  it("rejects the reciprocal edge, which the old two-cycle check handled", () => {
    // A(1) -> B(2) confirmed; proposing B(2) -> A(1). The proposed parent is
    // risk 1, and risk 1 is already a child — rule 2 fires.
    expect(validateTwoLevel(edge(2, 1), [edge(1, 2)])).toBe("parent_is_a_child");
  });

  it("rejects a grandchild, which nothing checked before", () => {
    // A -> B confirmed; proposing C -> A would make A both parent and child.
    expect(validateTwoLevel(edge(3, 1), [edge(1, 2)])).toBe("parent_is_a_child");
  });

  it("does not treat an identical existing edge as a violation", () => {
    // On POST this is a duplicate, and createUserRiskLinkQuery's ON CONFLICT
    // gives it a truer message ("These risks are already linked"). Reporting
    // child_already_has_parent here would name, as the blocker, the very parent
    // the user just tried to add.
    expect(validateTwoLevel(edge(1, 2), [edge(1, 2)])).toBeNull();
  });

  it("still rejects when an identical edge sits alongside a real violation", () => {
    expect(validateTwoLevel(edge(1, 2), [edge(1, 2), edge(2, 9)])).toBe("parent_is_a_child");
  });
});
