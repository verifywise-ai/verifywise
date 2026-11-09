/**
 * Loads and saves a use case's RACI matrix (#5255). Every query is scoped by the
 * caller's organization. The derivation and merge rules live in raci.utils.ts.
 */
import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { RaciRole } from "../domain.layer/enums/raci.enum";
import { projectVisibilitySql } from "./projectVisibility.utils";
import { recordEntityChange } from "./changeHistory.base.utils";
import {
  buildDerivedRaci,
  effectiveRolesOf,
  mergeRaciOverrides,
  planRaciOverrides,
  type DerivedRaci,
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

export type RaciResult =
  | { status: "ok"; matrix: RaciMatrix }
  | { status: "not_found" }
  | { status: "organizational" }
  | { status: "user_not_found" };

/**
 * How a task's link reaches a use case. Tasks never store a use case id: the
 * link picker's "Use-case" option leads to one of the use case's framework
 * requirements, and that requirement is what task_entity_links records.
 */
const TASK_LINK_TARGETS = [
  { entityType: "eu_control", table: "controls_eu" },
  { entityType: "iso42001_subclause", table: "subclauses_iso" },
  { entityType: "iso42001_annexcategory", table: "annexcategories_iso" },
  { entityType: "iso27001_subclause", table: "subclauses_iso27001" },
  { entityType: "iso27001_annexcontrol", table: "annexcontrols_iso27001" },
  { entityType: "nist_subcategory", table: "nist_ai_rmf_subcategories" },
] as const;

const TASK_LINK_CONDITIONS = [
  ...TASK_LINK_TARGETS.map(
    ({ entityType, table }) => `(tel.entity_type = '${entityType}' AND tel.entity_id IN (
       SELECT e.id FROM ${table} e
         JOIN projects_frameworks pf ON pf.id = e.projects_frameworks_id
        WHERE e.organization_id = :organizationId
          AND pf.organization_id = :organizationId
          AND pf.project_id = :projectId))`,
  ),
  `(tel.entity_type = 'eu_subcontrol' AND tel.entity_id IN (
     SELECT s.id FROM subcontrols_eu s
       JOIN controls_eu c ON c.id = s.control_id
       JOIN projects_frameworks pf ON pf.id = c.projects_frameworks_id
      WHERE s.organization_id = :organizationId
        AND c.organization_id = :organizationId
        AND pf.organization_id = :organizationId
        AND pf.project_id = :projectId))`,
].join("\n OR ");

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

async function getOrganizationPeople(
  organizationId: number,
  transaction?: Transaction,
): Promise<Map<number, RaciPerson>> {
  const rows = await selectRows<RaciPerson>(
    `SELECT u.id, u.name, u.surname, u.email
       FROM users u
       JOIN organization_members om ON om.user_id = u.id
      WHERE om.organization_id = :organizationId`,
    { organizationId },
    transaction,
  );
  return new Map(rows.map((person) => [person.id, person]));
}

async function getDerivedRaci(
  project: RaciProject,
  people: Map<number, RaciPerson>,
  organizationId: number,
  transaction?: Transaction,
): Promise<DerivedRaci> {
  const scope = { organizationId, projectId: project.id };

  const members = await selectRows<{ user_id: number }>(
    `SELECT user_id FROM projects_members
      WHERE organization_id = :organizationId AND project_id = :projectId`,
    scope,
    transaction,
  );

  const approvers = project.approval_workflow_id
    ? await selectRows<{ approver_id: number }>(
        `SELECT DISTINCT asa.approver_id
           FROM approval_workflow_steps aws
           JOIN approval_step_approvers asa ON asa.workflow_step_id = aws.id
          WHERE aws.organization_id = :organizationId
            AND asa.organization_id = :organizationId
            AND aws.workflow_id = :workflowId`,
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

  return buildDerivedRaci({
    ownerId: project.owner,
    externalOwnerName: project.external_owner_name,
    memberIds: members.map((row) => row.user_id),
    approverIds: approvers.map((row) => row.approver_id),
    taskAssignees: taskAssignees.map((row) => ({ userId: row.user_id, status: row.status })),
    orgMemberIds: people.keys(),
  });
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

export async function getRaciMatrixForViewer(
  projectId: number,
  viewer: Viewer,
  organizationId: number,
): Promise<RaciResult> {
  const project = await getVisibleProject(projectId, viewer, organizationId);
  if (!project) return { status: "not_found" };
  if (project.is_organizational) return { status: "organizational" };

  const people = await getOrganizationPeople(organizationId);
  const derived = await getDerivedRaci(project, people, organizationId);
  const overrides = await getOverrides(projectId, organizationId);
  return { status: "ok", matrix: mergeRaciOverrides(derived, overrides, people) };
}

/** Make `wanted` the user's effective roles on this use case. */
export async function setUserRaciRoles(
  projectId: number,
  targetUserId: number,
  wanted: RaciRole[],
  viewer: Viewer,
  organizationId: number,
): Promise<RaciResult> {
  return sequelize.transaction(async (transaction): Promise<RaciResult> => {
    const project = await getVisibleProject(projectId, viewer, organizationId, transaction);
    if (!project) return { status: "not_found" };
    if (project.is_organizational) return { status: "organizational" };

    const people = await getOrganizationPeople(organizationId, transaction);
    const target = people.get(targetUserId);
    if (!target) return { status: "user_not_found" };

    const derived = await getDerivedRaci(project, people, organizationId, transaction);
    const before = mergeRaciOverrides(
      derived,
      await getOverrides(projectId, organizationId, transaction),
      people,
    );

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

    const oldRoles = effectiveRolesOf(before, targetUserId).join(", ");
    const newRoles = effectiveRolesOf(matrix, targetUserId).join(", ");
    if (oldRoles !== newRoles) {
      await recordEntityChange(
        "use_case",
        projectId,
        "updated",
        viewer.userId,
        organizationId,
        `RACI: ${target.name} ${target.surname}`.trim().slice(0, 255),
        oldRoles,
        newRoles,
        transaction,
      );
    }

    return { status: "ok", matrix };
  });
}
