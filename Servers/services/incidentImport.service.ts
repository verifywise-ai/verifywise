/**
 * Creates an incident on behalf of an integration (Jira incidents import),
 * without the HTTP controller: the insert, change history recorded as the
 * system, and — after the caller's transaction commits — the incident
 * response workflow for Very serious incidents. `incident_added`
 * automations are enqueued after commit by createNewIncidentQuery itself.
 */
import { Transaction } from "sequelize";
import { AIIncidentManagementModel } from "../domain.layer/models/incidentManagement/incidemtManagement.model";
import { isCriticalIncidentSeverity } from "../domain.layer/enums/ai-incident-management.enum";
import { createNewIncidentQuery } from "../utils/incidentManagement.utils";
import { recordEntityCreation } from "../utils/changeHistory.base.utils";
import * as workflowTriggers from "./workflows/triggers";
import logger from "../utils/logger/fileLogger";

export interface ImportedIncidentInput {
  projectId: number;
  aiProject: string;
  type: string;
  severity: string;
  status: string;
  reporter: string;
  description: string;
  occurredAt: Date;
}

export async function createIncidentForImport(
  organizationId: number,
  input: ImportedIncidentInput,
  transaction: Transaction,
): Promise<AIIncidentManagementModel> {
  const now = new Date();
  const fields = {
    ai_project: input.aiProject,
    project_id: input.projectId,
    model_inventory_id: null,
    assignee_id: null,
    type: input.type,
    severity: input.severity,
    status: input.status,
    occurred_date: input.occurredAt,
    date_detected: input.occurredAt,
    reporter: input.reporter,
    approval_status: "Pending",
    categories_of_harm: [],
    description: input.description,
    archived: false,
    created_at: now,
    updated_at: now,
  };
  const created = await createNewIncidentQuery(
    new AIIncidentManagementModel(fields as any),
    organizationId,
    transaction,
  );
  await recordEntityCreation(
    "incident",
    created.id!,
    null,
    organizationId,
    fields,
    transaction,
    true,
  );

  if (isCriticalIncidentSeverity(input.severity)) {
    transaction.afterCommit(() => {
      workflowTriggers
        .triggerIncidentResponse(organizationId, created.id!, input.severity)
        .catch((err) => logger.error(`[incident] incident_response trigger failed: ${err}`));
    });
  }
  return created;
}
