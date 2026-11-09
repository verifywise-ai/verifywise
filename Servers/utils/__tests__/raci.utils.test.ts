import { describe, expect, it } from "@jest/globals";
import { RaciRole, RaciSubjectType } from "../../domain.layer/enums/raci.enum";
import {
  buildDerivedRaci,
  effectiveRolesOf,
  mergeRaciOverrides,
  planRaciOverrides,
  type DerivedRaciInput,
  type RaciOverride,
  type RaciPerson,
} from "../raci.utils";

const { RESPONSIBLE: R, ACCOUNTABLE: A, CONSULTED: C, INFORMED: I } = RaciRole;

const person = (id: number, name: string): RaciPerson => ({
  id,
  name,
  surname: "Test",
  email: `${name.toLowerCase()}@example.com`,
});

const PEOPLE = new Map([1, 2, 3, 4].map((id) => [id, person(id, `User${id}`)]));

const input = (overrides: Partial<DerivedRaciInput> = {}): DerivedRaciInput => ({
  ownerId: null,
  externalOwnerName: null,
  memberIds: [],
  approverIds: [],
  taskAssignees: [],
  orgMemberIds: PEOPLE.keys(),
  ...overrides,
});

const rolesOf = (derived: ReturnType<typeof buildDerivedRaci>, userId: number) =>
  Object.fromEntries(derived.users.get(userId) ?? []);

const merged = (derivedInput: Partial<DerivedRaciInput>, overrides: RaciOverride[] = []) =>
  mergeRaciOverrides(buildDerivedRaci(input(derivedInput)), overrides, PEOPLE);

describe("buildDerivedRaci", () => {
  it("makes the owner accountable", () => {
    expect(rolesOf(buildDerivedRaci(input({ ownerId: 1 })), 1)).toEqual({ A: ["owner"] });
  });

  it("makes members responsible", () => {
    expect(rolesOf(buildDerivedRaci(input({ memberIds: [2] })), 2)).toEqual({ R: ["member"] });
  });

  it("keeps an owner who is also a member accountable only", () => {
    const derived = buildDerivedRaci(input({ ownerId: 1, memberIds: [1] }));
    expect(rolesOf(derived, 1)).toEqual({ A: ["owner"] });
  });

  it("consults approvers and never makes them accountable", () => {
    expect(rolesOf(buildDerivedRaci(input({ approverIds: [3] })), 3)).toEqual({
      C: ["approver"],
    });
  });

  it("makes assignees of open tasks responsible", () => {
    const derived = buildDerivedRaci(
      input({
        taskAssignees: [
          { userId: 2, status: "Open" },
          { userId: 3, status: "In Progress" },
          { userId: 4, status: "Overdue" },
        ],
      }),
    );
    expect(rolesOf(derived, 2)).toEqual({ R: ["task_assignee"] });
    expect(rolesOf(derived, 3)).toEqual({ R: ["task_assignee"] });
    expect(rolesOf(derived, 4)).toEqual({ R: ["task_assignee"] });
  });

  it("ignores assignees of completed and deleted tasks", () => {
    const derived = buildDerivedRaci(
      input({
        taskAssignees: [
          { userId: 2, status: "Completed" },
          { userId: 3, status: "Deleted" },
        ],
      }),
    );
    expect(derived.users.size).toBe(0);
  });

  it("collects every source of a role and lets one person hold several roles", () => {
    const derived = buildDerivedRaci(
      input({
        ownerId: 1,
        memberIds: [2],
        approverIds: [1],
        taskAssignees: [
          { userId: 2, status: "Open" },
          { userId: 2, status: "Overdue" },
        ],
      }),
    );
    expect(rolesOf(derived, 1)).toEqual({ A: ["owner"], C: ["approver"] });
    expect(rolesOf(derived, 2)).toEqual({ R: ["member", "task_assignee"] });
  });

  it("leaves out anyone who is not a member of the organization", () => {
    const derived = buildDerivedRaci(
      input({
        ownerId: 9,
        memberIds: [9],
        approverIds: [9],
        taskAssignees: [{ userId: 9, status: "Open" }],
      }),
    );
    expect(derived.users.size).toBe(0);
  });

  it("uses the external owner only when there is no user owner", () => {
    expect(buildDerivedRaci(input({ externalOwnerName: "Ada" })).externalOwnerName).toBe("Ada");
    expect(
      buildDerivedRaci(input({ ownerId: 1, externalOwnerName: "Ada" })).externalOwnerName,
    ).toBeNull();
  });
});

describe("mergeRaciOverrides", () => {
  it("adds assigned roles with a manual source", () => {
    const { rows } = merged({ memberIds: [2] }, [{ userId: 2, role: C, state: "assigned" }]);
    expect(rows[0].roles).toEqual([
      { role: R, sources: ["member"] },
      { role: C, sources: ["manual"] },
    ]);
  });

  it("adds a person who has only assigned roles", () => {
    const { rows } = merged({}, [{ userId: 3, role: I, state: "assigned" }]);
    expect(rows).toEqual([
      {
        subject_type: RaciSubjectType.USER,
        subject_id: 3,
        name: "User3 Test",
        email: "user3@example.com",
        roles: [{ role: I, sources: ["manual"] }],
        editable: true,
      },
    ]);
  });

  it("keeps the derived sources when an assigned role later becomes derived", () => {
    const { rows } = merged({ memberIds: [2] }, [{ userId: 2, role: R, state: "assigned" }]);
    expect(rows[0].roles).toEqual([{ role: R, sources: ["member", "manual"] }]);
  });

  it("takes removed roles away and drops a person left with none", () => {
    const { rows } = merged({ memberIds: [2], approverIds: [3] }, [
      { userId: 2, role: R, state: "removed" },
    ]);
    expect(rows.map((row) => row.subject_id)).toEqual([3]);
  });

  it("ignores a removal of a role the person does not hold", () => {
    const { rows } = merged({ memberIds: [2] }, [{ userId: 2, role: C, state: "removed" }]);
    expect(rows[0].roles).toEqual([{ role: R, sources: ["member"] }]);
  });

  it("does not change the derived roles it was given", () => {
    const derived = buildDerivedRaci(input({ memberIds: [2] }));
    mergeRaciOverrides(derived, [{ userId: 2, role: R, state: "removed" }], PEOPLE);
    expect(rolesOf(derived, 2)).toEqual({ R: ["member"] });
  });

  it("hides an override for someone no longer in the organization", () => {
    const { rows } = merged({}, [{ userId: 9, role: R, state: "assigned" }]);
    expect(rows).toEqual([]);
  });

  it("sends an external owner as a read-only row without an email", () => {
    const { rows, warnings } = merged({ externalOwnerName: "Ada Lovelace" });
    expect(rows).toEqual([
      {
        subject_type: RaciSubjectType.EXTERNAL,
        subject_id: null,
        name: "Ada Lovelace",
        email: null,
        roles: [{ role: A, sources: ["owner"] }],
        editable: false,
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("puts accountable people first, then sorts by name", () => {
    const { rows } = merged({ ownerId: 4, memberIds: [3, 2], approverIds: [1] });
    expect(rows.map((row) => row.subject_id)).toEqual([4, 1, 2, 3]);
  });

  it("warns when nobody is accountable", () => {
    expect(merged({ memberIds: [2] }).warnings).toEqual(["no_accountable"]);
  });

  it("warns when a removal leaves nobody accountable", () => {
    expect(merged({ ownerId: 1 }, [{ userId: 1, role: A, state: "removed" }]).warnings).toEqual([
      "no_accountable",
    ]);
  });

  it("warns when more than one person is accountable", () => {
    expect(merged({ ownerId: 1 }, [{ userId: 2, role: A, state: "assigned" }]).warnings).toEqual([
      "multiple_accountable",
    ]);
  });

  it("counts an external owner towards multiple accountable", () => {
    const { warnings } = merged({ externalOwnerName: "Ada" }, [
      { userId: 2, role: A, state: "assigned" },
    ]);
    expect(warnings).toEqual(["multiple_accountable"]);
  });

  it("does not warn with exactly one accountable person", () => {
    expect(merged({ ownerId: 1 }).warnings).toEqual([]);
  });
});

describe("planRaciOverrides", () => {
  it("deletes the override when a wanted role is derived", () => {
    expect(planRaciOverrides([R], new Set([R])).deletes).toContain(R);
  });

  it("assigns a wanted role that is not derived", () => {
    expect(planRaciOverrides([C], new Set()).upserts).toEqual([{ role: C, state: "assigned" }]);
  });

  it("removes a derived role that is not wanted", () => {
    expect(planRaciOverrides([], new Set([A])).upserts).toEqual([{ role: A, state: "removed" }]);
  });

  it("deletes the override when a role is neither wanted nor derived", () => {
    expect(planRaciOverrides([], new Set()).deletes).toEqual([R, A, C, I]);
  });

  it("covers all four roles every time", () => {
    const plan = planRaciOverrides([R, C], new Set([R, A]));
    expect(plan.upserts).toEqual([
      { role: A, state: "removed" },
      { role: C, state: "assigned" },
    ]);
    expect(plan.deletes).toEqual([R, I]);
  });
});

describe("effectiveRolesOf", () => {
  it("returns the roles in order, or none for someone not in the matrix", () => {
    const matrix = merged({ memberIds: [2] }, [{ userId: 2, role: I, state: "assigned" }]);
    expect(effectiveRolesOf(matrix, 2)).toEqual([R, I]);
    expect(effectiveRolesOf(matrix, 3)).toEqual([]);
  });
});
