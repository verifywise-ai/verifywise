/**
 * The RACI matrix of a use case (#5255): pure logic only, no database access.
 * The queries that load these inputs are in raciData.utils.ts.
 *
 * Roles are derived from who already works on the use case, and manual changes
 * are stored as overrides on top: effective roles = derived, plus `assigned`,
 * minus `removed`. Derived data stays live, and a removal sticks.
 */
import { RaciRole, RaciSubjectType } from "../domain.layer/enums/raci.enum";
import { TaskStatus } from "../domain.layer/enums/task-status.enum";

export const RACI_ROLES: readonly RaciRole[] = [
  RaciRole.RESPONSIBLE,
  RaciRole.ACCOUNTABLE,
  RaciRole.CONSULTED,
  RaciRole.INFORMED,
];

export type RaciSource = "owner" | "member" | "approver" | "task_assignee" | "manual";
export type RaciOverrideState = "assigned" | "removed";
export type RaciWarning = "no_accountable" | "multiple_accountable";

export interface DerivedRaciInput {
  ownerId: number | null;
  externalOwnerName: string | null;
  memberIds: number[];
  approverIds: number[];
  /** One entry per assignee per linked task, finished tasks included. */
  taskAssignees: Array<{ userId: number; status: string }>;
  /** Only these users can appear in the matrix. */
  orgMemberIds: Iterable<number>;
}

export interface DerivedRaci {
  users: Map<number, Map<RaciRole, RaciSource[]>>;
  /** Set when the use case has an external owner instead of a user. */
  externalOwnerName: string | null;
}

export interface RaciOverride {
  userId: number;
  role: RaciRole;
  state: RaciOverrideState;
}

export interface RaciPerson {
  id: number;
  name: string;
  surname: string;
  email: string;
}

export interface RaciRow {
  subject_type: RaciSubjectType;
  subject_id: number | null;
  name: string;
  email: string | null;
  roles: Array<{ role: RaciRole; sources: RaciSource[] }>;
  editable: boolean;
}

export interface RaciMatrix {
  rows: RaciRow[];
  warnings: RaciWarning[];
}

export interface RaciOverridePlan {
  upserts: Array<{ role: RaciRole; state: RaciOverrideState }>;
  deletes: RaciRole[];
}

const FINISHED_TASK_STATUSES: readonly string[] = [TaskStatus.COMPLETED, TaskStatus.DELETED];

function addRole(
  users: DerivedRaci["users"],
  userId: number,
  role: RaciRole,
  source: RaciSource,
): void {
  const roles = users.get(userId) ?? new Map<RaciRole, RaciSource[]>();
  const sources = roles.get(role) ?? [];
  if (!sources.includes(source)) sources.push(source);
  roles.set(role, sources);
  users.set(userId, roles);
}

/** The roles people hold from their existing relationship to the use case. */
export function buildDerivedRaci(input: DerivedRaciInput): DerivedRaci {
  const orgMembers = new Set(input.orgMemberIds);
  const users: DerivedRaci["users"] = new Map();
  const add = (userId: number, role: RaciRole, source: RaciSource) => {
    if (orgMembers.has(userId)) addRole(users, userId, role, source);
  };

  if (input.ownerId !== null) add(input.ownerId, RaciRole.ACCOUNTABLE, "owner");

  for (const memberId of input.memberIds) {
    if (memberId !== input.ownerId) add(memberId, RaciRole.RESPONSIBLE, "member");
  }
  for (const approverId of input.approverIds) {
    add(approverId, RaciRole.CONSULTED, "approver");
  }
  for (const { userId, status } of input.taskAssignees) {
    if (!FINISHED_TASK_STATUSES.includes(status)) {
      add(userId, RaciRole.RESPONSIBLE, "task_assignee");
    }
  }

  return {
    users,
    externalOwnerName: input.ownerId === null ? input.externalOwnerName || null : null,
  };
}

function compareRows(a: RaciRow, b: RaciRow): number {
  const accountable = (row: RaciRow) => row.roles.some((r) => r.role === RaciRole.ACCOUNTABLE);
  if (accountable(a) !== accountable(b)) return accountable(a) ? -1 : 1;
  return (
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
    (a.subject_id ?? 0) - (b.subject_id ?? 0)
  );
}

/**
 * Apply stored overrides to the derived roles. `people` holds the organization's
 * members: anyone else is left out, which is what makes a user who left the
 * organization disappear even while an override row of theirs still exists.
 */
export function mergeRaciOverrides(
  derived: DerivedRaci,
  overrides: RaciOverride[],
  people: Map<number, RaciPerson>,
): RaciMatrix {
  const effective: DerivedRaci["users"] = new Map(
    [...derived.users].map(([userId, roles]) => [
      userId,
      new Map([...roles].map(([role, sources]) => [role, [...sources]])),
    ]),
  );

  for (const { userId, role, state } of overrides) {
    if (state === "removed") {
      effective.get(userId)?.delete(role);
    } else {
      addRole(effective, userId, role, "manual");
    }
  }

  const rows: RaciRow[] = [];
  for (const [userId, roles] of effective) {
    const person = people.get(userId);
    if (!person || roles.size === 0) continue;
    rows.push({
      subject_type: RaciSubjectType.USER,
      subject_id: userId,
      name: `${person.name} ${person.surname}`.trim(),
      email: person.email,
      roles: RACI_ROLES.filter((role) => roles.has(role)).map((role) => ({
        role,
        sources: roles.get(role)!,
      })),
      editable: true,
    });
  }

  if (derived.externalOwnerName) {
    rows.push({
      subject_type: RaciSubjectType.EXTERNAL,
      subject_id: null,
      name: derived.externalOwnerName,
      email: null,
      roles: [{ role: RaciRole.ACCOUNTABLE, sources: ["owner"] }],
      editable: false,
    });
  }

  rows.sort(compareRows);

  const accountableCount = rows.filter((row) =>
    row.roles.some((r) => r.role === RaciRole.ACCOUNTABLE),
  ).length;
  const warnings: RaciWarning[] = [];
  if (accountableCount === 0) warnings.push("no_accountable");
  if (accountableCount > 1) warnings.push("multiple_accountable");

  return { rows, warnings };
}

/** Which override changes turn a person's roles into the wanted set. */
export function planRaciOverrides(
  wanted: RaciRole[],
  derivedRoles: ReadonlySet<RaciRole>,
): RaciOverridePlan {
  const plan: RaciOverridePlan = { upserts: [], deletes: [] };
  for (const role of RACI_ROLES) {
    const isWanted = wanted.includes(role);
    const isDerived = derivedRoles.has(role);
    if (isWanted === isDerived) {
      plan.deletes.push(role);
    } else {
      plan.upserts.push({ role, state: isWanted ? "assigned" : "removed" });
    }
  }
  return plan;
}

/** The roles a person should end up with after a change, in R, A, C, I order. */
export function applyRaciDelta(
  current: readonly RaciRole[],
  add: readonly RaciRole[],
  remove: readonly RaciRole[],
): RaciRole[] {
  return RACI_ROLES.filter(
    (role) => !remove.includes(role) && (current.includes(role) || add.includes(role)),
  );
}

/** A user's effective roles in the matrix, in R, A, C, I order. */
export function effectiveRolesOf(matrix: RaciMatrix, userId: number): RaciRole[] {
  const row = matrix.rows.find(
    (r) => r.subject_type === RaciSubjectType.USER && r.subject_id === userId,
  );
  return row ? row.roles.map((r) => r.role) : [];
}
