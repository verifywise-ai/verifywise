import { sequelize } from "../database/db";
import { Transaction } from "sequelize";
import { AIIncidentManagementModel } from "../domain.layer/models/incidentManagement/incidemtManagement.model";
import { TenantAutomationActionModel } from "../domain.layer/models/tenantAutomationAction/tenantAutomationAction.model";
import {
  buildIncidentReplacements,
  buildIncidentUpdateReplacements,
} from "./automation/incident.automation.utils";
import { replaceTemplateVariables } from "./automation/automation.utils";
import logger from "./logger/fileLogger";
import { enqueueAutomationAction } from "../services/automations/automationProducer";
import {
  assertValidIncidentDescription,
  INCIDENT_DATE_COLUMNS,
  INCIDENT_FK_COLUMNS,
  isSameIncidentValue,
} from "./validations/incidentManagementValidation.utils";

/**
 * Base SELECT for incident queries. LEFT JOINs resolve the issue #4583
 * foreign keys (model_inventory_id / project_id / assignee_id) into
 * display names for API consumers. CONCAT_WS skips NULL parts.
 */
const INCIDENT_SELECT = `
  SELECT i.*,
    CONCAT_WS(' ', mi.provider, mi.model) AS model_inventory_name,
    p.project_title AS project_title,
    CONCAT_WS(' ', u.name, u.surname) AS assignee_name
  FROM ai_incident_managements i
  LEFT JOIN model_inventories mi ON mi.id = i.model_inventory_id
  LEFT JOIN projects p ON p.id = i.project_id
  LEFT JOIN users u ON u.id = i.assignee_id`;

/** Optional server-side filters for the incident list (issue #4583). */
export interface IncidentListFilters {
  model_inventory_id?: number;
  project_id?: number;
  assignee_id?: number;
}

export const getAllIncidentsQuery = async (
  organizationId: number,
  filters?: IncidentListFilters,
) => {
  const conditions: string[] = [];
  const replacements: Record<string, unknown> = { organizationId };

  if (filters?.model_inventory_id) {
    conditions.push("i.model_inventory_id = :modelInventoryId");
    replacements.modelInventoryId = filters.model_inventory_id;
  }
  if (filters?.project_id) {
    conditions.push("i.project_id = :projectId");
    replacements.projectId = filters.project_id;
  }
  if (filters?.assignee_id) {
    conditions.push("i.assignee_id = :assigneeId");
    replacements.assigneeId = filters.assignee_id;
  }

  const extraWhere = conditions.length ? ` AND ${conditions.join(" AND ")}` : "";

  const incidents = await sequelize.query(
    `${INCIDENT_SELECT}
     WHERE i.organization_id = :organizationId${extraWhere}
     ORDER BY i.created_at DESC, i.id ASC`,
    {
      replacements,
      mapToModel: true,
      model: AIIncidentManagementModel,
    },
  );
  return incidents;
};

/**
 * Loads one incident. With `lock` (requires `transaction`) the incident row
 * is locked FOR UPDATE until the transaction ends, so a read-then-write
 * update cannot interleave with another one. Only the incident row is locked,
 * not the joined lookup rows.
 */
export const getIncidentByIdQuery = async (
  id: number,
  organizationId: number,
  options: { transaction?: Transaction; lock?: boolean } = {},
) => {
  const lockClause = options.lock && options.transaction ? " FOR UPDATE OF i" : "";
  const incidents = await sequelize.query(
    `${INCIDENT_SELECT}
     WHERE i.organization_id = :organizationId AND i.id = :id${lockClause}`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: AIIncidentManagementModel,
      transaction: options.transaction,
    },
  );
  if (!incidents.length) return null;
  return incidents[0];
};

export const createNewIncidentQuery = async (
  incident: AIIncidentManagementModel,
  organizationId: number,
  transaction: Transaction,
) => {
  assertValidIncidentDescription(incident.description);
  const created_at = new Date();
  try {
    const result = await sequelize.query(
      `INSERT INTO ai_incident_managements (
        organization_id, ai_project, model_inventory_id, project_id, assignee_id, type,
        severity, status, occurred_date, date_detected, reporter, approval_status,
        approved_by, categories_of_harm, affected_persons_groups, description, relationship_causality,
        immediate_mitigations, planned_corrective_actions, model_system_version, interim_report, approval_date, approval_notes,
        created_at, updated_at, archived, is_demo
      ) VALUES (
        :organization_id, :ai_project, :model_inventory_id, :project_id, :assignee_id, :type,
        :severity, :status, :occurred_date, :date_detected, :reporter, :approval_status,
        :approved_by, :categories_of_harm, :affected_persons_groups, :description, :relationship_causality,
        :immediate_mitigations, :planned_corrective_actions, :model_system_version, :interim_report, :approval_date, :approval_notes,
        :created_at, :updated_at, :archived, :is_demo
      ) RETURNING *`,
      {
        replacements: {
          organization_id: organizationId,
          ai_project: incident.ai_project || "",
          model_inventory_id: incident.model_inventory_id ?? null,
          project_id: incident.project_id ?? null,
          assignee_id: incident.assignee_id ?? null,
          type: incident.type,
          severity: incident.severity,
          status: incident.status,
          occurred_date: incident.occurred_date ? incident.occurred_date : null,
          date_detected: incident.date_detected ? incident.date_detected : null,
          reporter: incident.reporter ?? null,
          approval_status: incident.approval_status ?? null,
          approved_by: incident.approved_by ?? null,
          categories_of_harm: JSON.stringify(incident.categories_of_harm || []),
          affected_persons_groups: incident.affected_persons_groups ?? null,
          description: incident.description ?? null,
          relationship_causality: incident.relationship_causality ?? null,
          immediate_mitigations: incident.immediate_mitigations ?? null,
          planned_corrective_actions: incident.planned_corrective_actions ?? null,
          model_system_version: incident.model_system_version ?? null,
          interim_report: incident.interim_report ?? false,
          approval_date: incident.approval_date ? incident.approval_date : null,
          approval_notes: incident.approval_notes ?? null,
          created_at,
          updated_at: created_at,
          archived: incident.archived || false,
          is_demo: incident.is_demo || false,
        },
        mapToModel: true,
        model: AIIncidentManagementModel,
        transaction,
      },
    );
    const createdIncident = result[0];
    const automations = (await sequelize.query(
      `SELECT
              pat.key AS trigger_key,
              paa.key AS action_key,
              a.id AS automation_id,
              aa.*
            FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'incident_added' AND a.is_active ORDER BY aa."order" ASC;`,
      { replacements: { organizationId }, transaction },
    )) as [
      (TenantAutomationActionModel & {
        trigger_key: string;
        action_key: string;
        automation_id: number;
      })[],
      number,
    ];
    if (automations[0].length > 0) {
      const automation = automations[0][0];
      if (automation["trigger_key"] === "incident_added") {
        const params = automation.params!;

        // Build replacements
        const replacements = buildIncidentReplacements({
          ...createdIncident.dataValues,
        });

        // Replace variables in subject and body
        const processedParams = {
          ...params,
          subject: replaceTemplateVariables(params.subject || "", replacements),
          body: replaceTemplateVariables(params.body || "", replacements),
          automation_id: automation.automation_id,
        };

        // After commit: a rolled-back create (an import that failed later in
        // its transaction) must not send an "incident added" email.
        transaction.afterCommit(() => {
          enqueueAutomationAction(automation.action_key, {
            ...processedParams,
            organizationId,
          }).catch((error) => logger.error(`[incident] incident_added enqueue failed: ${error}`));
        });
      } else {
        console.warn(`No matching trigger found for key: ${automation["trigger_key"]}`);
      }
    }
    return createdIncident;
  } catch (error) {
    console.error("Error creating new incident:", error);
    throw error;
  }
};

/** Columns an incident update may write. Anything else in an update is ignored. */
export const UPDATABLE_INCIDENT_COLUMNS = [
  "ai_project",
  "model_inventory_id",
  "project_id",
  "assignee_id",
  "type",
  "severity",
  "status",
  "occurred_date",
  "date_detected",
  "reporter",
  "approval_status",
  "approved_by",
  "categories_of_harm",
  "affected_persons_groups",
  "description",
  "relationship_causality",
  "immediate_mitigations",
  "planned_corrective_actions",
  "model_system_version",
  "interim_report",
  "archived",
  "approval_date",
  "approval_notes",
] as const;

export type IncidentColumn = (typeof UPDATABLE_INCIDENT_COLUMNS)[number];

/**
 * Normalises a value for writing: '' means "none" for FK and date columns,
 * and archived is never NULL (empty means not archived).
 */
const toColumnValue = (column: IncidentColumn, value: unknown): unknown => {
  if (column === "archived") return Boolean(value);
  if ((INCIDENT_FK_COLUMNS.has(column) || INCIDENT_DATE_COLUMNS.has(column)) && value === "") {
    return null;
  }
  return value ?? null;
};

/**
 * The columns of `updates` whose value differs from `stored` (the row's
 * current values), mapped to the normalised value to write. Keys that are
 * not updatable columns, and undefined values, are ignored. Both the write
 * and the change history are derived from this one diff.
 */
export const diffIncidentColumns = (
  stored: Record<string, unknown>,
  updates: Record<string, unknown>,
): Partial<Record<IncidentColumn, unknown>> => {
  const changed: Partial<Record<IncidentColumn, unknown>> = {};
  for (const column of UPDATABLE_INCIDENT_COLUMNS) {
    if (updates[column] === undefined) continue;
    if (isSameIncidentValue(column, stored[column], updates[column])) continue;
    changed[column] = toColumnValue(column, updates[column]);
  }
  return changed;
};

/**
 * Writes `changed` (from diffIncidentColumns) plus updated_at and returns
 * the re-read row. Callers lock the row first and only call this when
 * something changed (see services/incidentManagement.service.ts).
 */
export const updateIncidentByIdQuery = async (
  id: number,
  changed: Partial<Record<IncidentColumn, unknown>>,
  organizationId: number,
  transaction: Transaction,
) => {
  // Backstop for any writer: a description that reaches the write must meet
  // the length rule. The service has already validated changed descriptions
  // against the locked row (validateIncidentUpdateBusinessRules).
  if ("description" in changed) {
    assertValidIncidentDescription(changed.description);
  }
  const setClauses = ["updated_at = :updated_at"];
  const replacements: Record<string, unknown> = { organizationId, id, updated_at: new Date() };
  for (const column of UPDATABLE_INCIDENT_COLUMNS) {
    if (!(column in changed)) continue;
    const value = changed[column];
    setClauses.push(`${column} = :${column}`);
    replacements[column] =
      column === "categories_of_harm" && value !== null ? JSON.stringify(value) : value;
  }

  await sequelize.query(
    `UPDATE ai_incident_managements SET ${setClauses.join(", ")}
    WHERE organization_id = :organizationId AND id = :id`,
    { replacements, transaction },
  );

  const result = await sequelize.query(
    `${INCIDENT_SELECT}
     WHERE i.organization_id = :organizationId AND i.id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: AIIncidentManagementModel,
      transaction,
    },
  );
  return result[0];
};

/**
 * Enqueues the organization's active `incident_updated` automation for an
 * update from `oldIncident` to `newIncident`. Call it only after the update
 * has committed, so an action is never sent for a change that rolled back.
 */
export const enqueueIncidentUpdatedAutomations = async (
  organizationId: number,
  oldIncident: AIIncidentManagementModel,
  newIncident: AIIncidentManagementModel,
) => {
  const automations = (await sequelize.query(
    `SELECT
            pat.key AS trigger_key,
            paa.key AS action_key,
            a.id AS automation_id,
            aa.*
          FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'incident_updated' AND a.is_active ORDER BY aa."order" ASC;`,
    { replacements: { organizationId } },
  )) as [
    (TenantAutomationActionModel & {
      trigger_key: string;
      action_key: string;
      automation_id: number;
    })[],
    number,
  ];
  if (automations[0].length === 0) return;

  const automation = automations[0][0];
  if (automation["trigger_key"] !== "incident_updated") {
    console.warn(`No matching trigger found for key: ${automation["trigger_key"]}`);
    return;
  }
  const params = automation.params!;
  const replacements = buildIncidentUpdateReplacements(oldIncident, {
    ...newIncident.dataValues,
  });
  await enqueueAutomationAction(automation.action_key, {
    ...params,
    subject: replaceTemplateVariables(params.subject || "", replacements),
    body: replaceTemplateVariables(params.body || "", replacements),
    automation_id: automation.automation_id,
    organizationId,
  });
};

export const deleteIncidentByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction,
) => {
  try {
    // A Jira-imported incident keeps its link row, marked so the issue is
    // never imported again (the FK then nulls incident_id).
    await sequelize.query(
      `UPDATE jira_incident_links
          SET state = 'deleted_in_verifywise', state_reason = NULL, updated_at = now()
        WHERE organization_id = :organizationId AND incident_id = :id`,
      { replacements: { organizationId, id }, transaction },
    );
    const result = (await sequelize.query(
      `DELETE FROM ai_incident_managements WHERE organization_id = :organizationId AND id = :id RETURNING *`,
      {
        replacements: { organizationId, id },
        transaction,
      },
    )) as [AIIncidentManagementModel[], number];
    const deletedIncident = result[0][0];
    const automations = (await sequelize.query(
      `SELECT
              pat.key AS trigger_key,
              paa.key AS action_key,
              a.id AS automation_id,
              aa.*
            FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'incident_deleted' AND a.is_active ORDER BY aa."order" ASC;`,
      { replacements: { organizationId }, transaction },
    )) as [
      (TenantAutomationActionModel & {
        trigger_key: string;
        action_key: string;
        automation_id: number;
      })[],
      number,
    ];
    if (automations[0].length > 0) {
      const automation = automations[0][0];
      if (automation["trigger_key"] === "incident_deleted") {
        const params = automation.params!;

        // Build replacements
        const replacements = buildIncidentReplacements({
          ...deletedIncident,
        });

        // Replace variables in subject and body
        const processedParams = {
          ...params,
          subject: replaceTemplateVariables(params.subject || "", replacements),
          body: replaceTemplateVariables(params.body || "", replacements),
          automation_id: automation.automation_id,
        };

        // Enqueue with processed params
        await enqueueAutomationAction(automation.action_key, {
          ...processedParams,
          organizationId,
        });
      } else {
        console.warn(`No matching trigger found for key: ${automation["trigger_key"]}`);
      }
    }
    return deletedIncident;
  } catch (error) {
    console.error("Error deleting incident:", error);
    throw error;
  }
};

/**
 * Archive an incident by ID
 */

export const archiveIncidentByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction,
) => {
  const updated_at = new Date();
  try {
    await sequelize.query(
      `UPDATE ai_incident_managements
         SET archived = true,
             updated_at = :updated_at
         WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id, updated_at },
        transaction,
      },
    );

    const result = await sequelize.query(
      `${INCIDENT_SELECT}
       WHERE i.organization_id = :organizationId AND i.id = :id`,
      {
        replacements: { organizationId, id },
        mapToModel: true,
        model: AIIncidentManagementModel,
        transaction,
      },
    );

    return result[0];
  } catch (error) {
    console.error("Error archiving incident:", error);
    throw error;
  }
};

/**
 * Verify that referenced entities (issue #4583 FKs) exist and belong to the
 * caller's organization. Prevents cross-org linkage (IDOR) that a bare FK
 * constraint cannot catch. Returns the list of invalid field names.
 */
export const validateIncidentReferences = async (
  refs: {
    model_inventory_id?: unknown;
    project_id?: unknown;
    assignee_id?: unknown;
  },
  organizationId: number,
  transaction?: Transaction,
): Promise<string[]> => {
  const invalidFields: string[] = [];
  const checks: Array<{
    field: string;
    id: unknown;
    table: string;
  }> = [
    { field: "model_inventory_id", id: refs.model_inventory_id, table: "model_inventories" },
    { field: "project_id", id: refs.project_id, table: "projects" },
    { field: "assignee_id", id: refs.assignee_id, table: "users" },
  ];

  for (const check of checks) {
    // null / undefined / '' all mean "no reference": nothing to check.
    if (check.id === null || check.id === undefined || check.id === "") continue;
    // Anything that is not a positive integer id is invalid and never reaches SQL.
    const id =
      typeof check.id === "number"
        ? check.id
        : /^\d+$/.test(String(check.id).trim())
          ? Number(String(check.id).trim())
          : NaN;
    if (!Number.isSafeInteger(id) || id <= 0) {
      invalidFields.push(check.field);
      continue;
    }
    const result = (await sequelize.query(
      `SELECT id FROM ${check.table} WHERE id = :id AND organization_id = :organizationId`,
      { replacements: { id, organizationId }, transaction },
    )) as [Array<{ id: number }>, number];
    if (!result[0].length) invalidFields.push(check.field);
  }

  return invalidFields;
};
