/**
 * Loads and saves a use case's RACI matrix (#5255). Every query is scoped by the
 * caller's organization. The derivation and merge rules live in raci.utils.ts.
 */
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { RaciRole } from "../domain.layer/enums/raci.enum";
import { projectVisibilitySql } from "./projectVisibility.utils";
import { recordEntityChange } from "./changeHistory.base.utils";
import { taskLinkReachesProjectSql } from "./taskEntityLink.utils";
import {
  applyRaciDelta,
  buildDerivedRaci,
  effectiveRolesOf,
  mergeRaciOverrides,
  planRaciOverrides,
  type DerivedRaciInput,
  type RaciMatrix,
  type RaciOverride,
  type RaciOverrideState,
  type RaciPerson,
} from "./raci.utils";

interface RaciProject {
  id: number;
  owner: number | null;
  external_owner_name: string | null;
  is_organizational: boolean;
  approval_workflow_id: number | null;
}

interface Viewer {
  userId: number;
  role: string;
}

type RaciInputs = Omit<DerivedRaciInput, "orgMemberIds">;

export type RaciResult =
  | { status: "ok"; matrix: RaciMatrix }
  | { status: "not_found" }
  | { status: "organizational" }
  | { status: "user_not_found" };

const TASK_LINK_CONDITIONS = taskLinkReachesProjectSql(":projectId");

async function selectRows<T extends object>(
  sql: string,
  replacements: Record<string, unknown>,
  transaction?: Transaction,
): Promise<T[]> {
  return sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT, transaction });
}

/** The use case if this viewer may see it; other organizations' look missing. */
async function getVisibleProject(
  projectId: number,
  viewer: Viewer,
  organizationId: number,
  transaction?: Transaction,
): Promise<RaciProject | null> {
  const visibility = projectVisibilitySql("p", viewer);
  // Writers take the row lock, so two edits of one matrix cannot interleave.
  const lock = transaction ? "FOR NO KEY UPDATE OF p" : "";
  const rows = await selectRows<RaciProject>(
    `SELECT p.id, p.owner, p.external_owner_name, p.is_organizational, p.approval_workflow_id
       FROM projects p
      WHERE p.organization_id = :organizationId AND p.id = :projectId${visibility.sql}
      ${lock}`,
    { organizationId, projectId, ...visibility.replacements },
    transaction,
  );
  return rows[0] ?? null;
}

/** Those of the given users who are members of this organization. */
async function getOrganizationPeople(
  userIds: Set<number>,
  organizationId: number,
  transaction?: Transaction,
): Promise<Map<number, RaciPerson>> {
  if (userIds.size === 0) return new Map();
  const rows = await selectRows<RaciPerson>(
    `SELECT u.id, u.name, u.surname, u.email
       FROM users u
       JOIN organization_members om ON om.user_id = u.id
      WHERE om.organization_id = :organizationId AND u.id IN (:userIds)`,
    { organizationId, userIds: [...userIds] },
    transaction,
  );
  return new Map(rows.map((person) => [person.id, person]));
}

async function getDerivationInputs(
  project: RaciProject,
  organizationId: number,
  transaction?: Transaction,
): Promise<RaciInputs> {
  const scope = { organizationId, projectId: project.id };

  const members = await selectRows<{ user_id: number }>(
    `SELECT user_id FROM projects_members
      WHERE organization_id = :organizationId AND project_id = :projectId`,
    scope,
    transaction,
  );

  // Deleting a workflow only deactivates it, so its approvers stay in the tables.
  const approvers = project.approval_workflow_id
    ? await selectRows<{ approver_id: number }>(
        `SELECT DISTINCT asa.approver_id
           FROM approval_workflows aw
           JOIN approval_workflow_steps aws ON aws.workflow_id = aw.id
           JOIN approval_step_approvers asa ON asa.workflow_step_id = aws.id
          WHERE aw.organization_id = :organizationId
            AND aws.organization_id = :organizationId
            AND asa.organization_id = :organizationId
            AND aw.id = :workflowId
            AND aw.is_active = true`,
        { organizationId, workflowId: project.approval_workflow_id },
        transaction,
      )
    : [];

  const taskAssignees = await selectRows<{ user_id: number; status: string }>(
    `SELECT DISTINCT ta.user_id, t.status
       FROM task_entity_links tel
       JOIN tasks t ON t.id = tel.task_id
       JOIN task_assignees ta ON ta.task_id = t.id
      WHERE tel.organization_id = :organizationId
        AND t.organization_id = :organizationId
        AND ta.organization_id = :organizationId
        AND (${TASK_LINK_CONDITIONS})`,
    scope,
    transaction,
  );

  return {
    ownerId: project.owner,
    externalOwnerName: project.external_owner_name,
    memberIds: members.map((row) => row.user_id),
    approverIds: approvers.map((row) => row.approver_id),
    taskAssignees: taskAssignees.map((row) => ({ userId: row.user_id, status: row.status })),
  };
}

async function getOverrides(
  projectId: number,
  organizationId: number,
  transaction?: Transaction,
): Promise<RaciOverride[]> {
  const rows = await selectRows<{
    user_id: number;
    raci_role: RaciRole;
    state: RaciOverrideState;
  }>(
    `SELECT user_id, raci_role, state FROM raci_entries
      WHERE organization_id = :organizationId AND project_id = :projectId`,
    { organizationId, projectId },
    transaction,
  );
  return rows.map((row) => ({ userId: row.user_id, role: row.raci_role, state: row.state }));
}

/** Everyone the matrix could mention, so only they are loaded. */
function collectUserIds(inputs: RaciInputs, overrides: RaciOverride[]): Set<number> {
  const ids = new Set<number>([
    ...inputs.memberIds,
    ...inputs.approverIds,
    ...inputs.taskAssignees.map((assignee) => assignee.userId),
    ...overrides.map((override) => override.userId),
  ]);
  if (inputs.ownerId !== null) ids.add(inputs.ownerId);
  return ids;
}

export async function getRaciMatrixForViewer(
  projectId: number,
  viewer: Viewer,
  organizationId: number,
): Promise<RaciResult> {
  const project = await getVisibleProject(projectId, viewer, organizationId);
  if (!project) return { status: "not_found" };
  if (project.is_organizational) return { status: "organizational" };

  const inputs = await getDerivationInputs(project, organizationId);
  const overrides = await getOverrides(projectId, organizationId);
  const people = await getOrganizationPeople(collectUserIds(inputs, overrides), organizationId);
  const derived = buildDerivedRaci({ ...inputs, orgMemberIds: people.keys() });
  return { status: "ok", matrix: mergeRaciOverrides(derived, overrides, people) };
}

/**
 * Add and remove roles from what the user holds right now. The change is applied
 * to current roles under the use case's row lock, not to what the caller last
 * saw, so a stale page cannot undo a role that appeared after it loaded.
 */
export async function changeUserRaciRoles(
  projectId: number,
  targetUserId: number,
  change: { add: RaciRole[]; remove: RaciRole[] },
  viewer: Viewer,
  organizationId: number,
): Promise<RaciResult> {
  return sequelize.transaction(async (transaction): Promise<RaciResult> => {
    const project = await getVisibleProject(projectId, viewer, organizationId, transaction);
    if (!project) return { status: "not_found" };
    if (project.is_organizational) return { status: "organizational" };

    const inputs = await getDerivationInputs(project, organizationId, transaction);
    const overridesBefore = await getOverrides(projectId, organizationId, transaction);
    const people = await getOrganizationPeople(
      collectUserIds(inputs, overridesBefore).add(targetUserId),
      organizationId,
      transaction,
    );
    const target = people.get(targetUserId);
    if (!target) return { status: "user_not_found" };

    const derived = buildDerivedRaci({ ...inputs, orgMemberIds: people.keys() });
    const before = mergeRaciOverrides(derived, overridesBefore, people);
    const oldRoles = effectiveRolesOf(before, targetUserId);
    const wanted = applyRaciDelta(oldRoles, change.add, change.remove);

    const plan = planRaciOverrides(wanted, new Set(derived.users.get(targetUserId)?.keys()));
    const scope = { organizationId, projectId, userId: targetUserId };

    if (plan.deletes.length > 0) {
      await sequelize.query(
        `DELETE FROM raci_entries
          WHERE organization_id = :organizationId AND project_id = :projectId
            AND user_id = :userId AND raci_role IN (:roles)`,
        { replacements: { ...scope, roles: plan.deletes }, transaction },
      );
    }
    for (const { role, state } of plan.upserts) {
      await sequelize.query(
        `INSERT INTO raci_entries
           (organization_id, project_id, user_id, raci_role, state, updated_by, created_at, updated_at)
         VALUES (:organizationId, :projectId, :userId, :role, :state, :updatedBy, NOW(), NOW())
         ON CONFLICT (project_id, user_id, raci_role)
         DO UPDATE SET state = EXCLUDED.state, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        { replacements: { ...scope, role, state, updatedBy: viewer.userId }, transaction },
      );
    }

    const matrix = mergeRaciOverrides(
      derived,
      await getOverrides(projectId, organizationId, transaction),
      people,
    );

    const oldValue = oldRoles.join(", ");
    const newValue = effectiveRolesOf(matrix, targetUserId).join(", ");
    if (oldValue !== newValue) {
      await recordEntityChange(
        "use_case",
        projectId,
        "updated",
        viewer.userId,
        organizationId,
        `RACI: ${target.name} ${target.surname}`.trim().slice(0, 255),
        oldValue,
        newValue,
        transaction,
      );
    }

    return { status: "ok", matrix };
  });
}
