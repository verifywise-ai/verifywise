import { sequelize } from "../database/db";
import { Transaction } from "sequelize";
import { AIIncidentManagementModel } from "../domain.layer/models/incidentManagement/incidemtManagement.model";
import { TenantAutomationActionModel } from "../domain.layer/models/tenantAutomationAction/tenantAutomationAction.model";
import { buildIncidentReplacements, buildIncidentUpdateReplacements } from "./automation/incident.automation.utils";
import { replaceTemplateVariables } from "./automation/automation.utils";
import { enqueueAutomationAction } from "../services/automations/automationProducer";

export const getAllIncidentsQuery = async (organizationId: number) => {
    const incidents = await sequelize.query(
        `SELECT * FROM ai_incident_managements WHERE organization_id = :organizationId ORDER BY created_at DESC, id ASC`,
        {
            replacements: { organizationId },
            mapToModel: true,
            model: AIIncidentManagementModel,
        }
    );
    return incidents;
};

export const getIncidentByIdQuery = async (id: number, organizationId: number) => {
    const incidents = await sequelize.query(
        `SELECT * FROM ai_incident_managements WHERE organization_id = :organizationId AND id = :id`,
        {
            replacements: { organizationId, id },
            mapToModel: true,
            model: AIIncidentManagementModel,
        }
    );
    if (!incidents.length) return null;
    return incidents[0];
};

export const createNewIncidentQuery = async (
    incident: AIIncidentManagementModel,
    organizationId: number,
    transaction: Transaction
) => {
    const created_at = new Date();
    try {
        const result = await sequelize.query(
            `INSERT INTO ai_incident_managements (
        organization_id, ai_project, type,
        severity, status, occurred_date, date_detected, reporter, approval_status,
        approved_by, categories_of_harm, affected_persons_groups, description, relationship_causality,
        immediate_mitigations, planned_corrective_actions, model_system_version, interim_report, approval_date, approval_notes,
        created_at, updated_at, archived
      ) VALUES (
        :organization_id, :ai_project, :type,
        :severity, :status, :occurred_date, :date_detected, :reporter, :approval_status,
        :approved_by, :categories_of_harm, :affected_persons_groups, :description, :relationship_causality,
        :immediate_mitigations, :planned_corrective_actions, :model_system_version, :interim_report, :approval_date, :approval_notes,
        :created_at, :updated_at, :archived
      ) RETURNING *`,
            {
                replacements: {
                    organization_id: organizationId,
                    ai_project: incident.ai_project || "",
                    type: incident.type,
                    severity: incident.severity,
                    status: incident.status,
                    occurred_date: incident.occurred_date
                        ? incident.occurred_date
                        : null,
                    date_detected: incident.date_detected
                        ? incident.date_detected
                        : null,
                    reporter: incident.reporter,
                    approval_status: incident.approval_status,
                    approved_by: incident.approved_by,
                    categories_of_harm: JSON.stringify(incident.categories_of_harm),
                    affected_persons_groups: incident.affected_persons_groups,
                    description: incident.description,
                    relationship_causality: incident.relationship_causality,
                    immediate_mitigations: incident.immediate_mitigations,
                    planned_corrective_actions:
                        incident.planned_corrective_actions,
                    model_system_version: incident.model_system_version,
                    interim_report: incident.interim_report,
                    approval_date: incident.approval_date
                        ? incident.approval_date
                        : null,
                    approval_notes: incident.approval_notes,
                    created_at,
                    updated_at: created_at,
                    archived: incident.archived || false,
                },
                mapToModel: true,
                model: AIIncidentManagementModel,
                transaction,
            }
        );
        const createdIncident = result[0];
        const automations = await sequelize.query(
            `SELECT
              pat.key AS trigger_key,
              paa.key AS action_key,
              a.id AS automation_id,
              aa.*
            FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'incident_added' AND a.is_active ORDER BY aa."order" ASC;`,
            { replacements: { organizationId }, transaction }
        ) as [(TenantAutomationActionModel & { trigger_key: string, action_key: string, automation_id: number })[], number];
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
                    subject: replaceTemplateVariables(params.subject || '', replacements),
                    body: replaceTemplateVariables(params.body || '', replacements),
                    automation_id: automation.automation_id,
                };

                // Enqueue with processed params
                await enqueueAutomationAction(automation.action_key, {...processedParams, organizationId});
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

export const updateIncidentByIdQuery = async (
    id: number,
    incident: AIIncidentManagementModel,
    organizationId: number,
    transaction: Transaction
) => {
    const existingIncident = await getIncidentByIdQuery(id, organizationId);
    const updated_at = new Date();
    try {
        await sequelize.query(
            `UPDATE ai_incident_managements SET
        ai_project = :ai_project,
        type = :type,
        severity = :severity,
        status = :status,
        occurred_date = :occurred_date,
        date_detected = :date_detected,
        reporter = :reporter,
        approval_status = :approval_status,
        approved_by = :approved_by,
        categories_of_harm = :categories_of_harm,
        affected_persons_groups = :affected_persons_groups,
        description = :description,
        relationship_causality = :relationship_causality,
        immediate_mitigations = :immediate_mitigations,
        planned_corrective_actions = :planned_corrective_actions,
        model_system_version = :model_system_version,
        interim_report = :interim_report,
        archived = :archived,
        updated_at = :updated_at,
        approval_date = :approval_date,
        approval_notes = :approval_notes
      WHERE organization_id = :organizationId AND id = :id`,
            {
                replacements: {
                    organizationId,
                    id,
                    ai_project: incident.ai_project,
                    type: incident.type,
                    severity: incident.severity,
                    status: incident.status,
                    occurred_date: incident.occurred_date,
                    date_detected: incident.date_detected,
                    reporter: incident.reporter,
                    approval_status: incident.approval_status,
                    approved_by: incident.approved_by,
                    categories_of_harm: JSON.stringify(incident.categories_of_harm),
                    affected_persons_groups: incident.affected_persons_groups,
                    description: incident.description,
                    relationship_causality: incident.relationship_causality,
                    immediate_mitigations: incident.immediate_mitigations,
                    planned_corrective_actions:
                        incident.planned_corrective_actions,
                    model_system_version: incident.model_system_version,
                    interim_report: incident.interim_report,
                    archived: incident.archived || false,
                    approval_date: incident.approval_date,
                    approval_notes: incident.approval_notes,
                    updated_at,
                },
                transaction,
            }
        );

        const result = await sequelize.query(
            `SELECT * FROM ai_incident_managements WHERE organization_id = :organizationId AND id = :id`,
            {
                replacements: { organizationId, id },
                mapToModel: true,
                model: AIIncidentManagementModel,
                transaction,
            }
        );
        const updatedIncident = result[0];
        const automations = await sequelize.query(
            `SELECT
              pat.key AS trigger_key,
              paa.key AS action_key,
              a.id AS automation_id,
              aa.*
            FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'incident_updated' AND a.is_active ORDER BY aa."order" ASC;`,
            { replacements: { organizationId }, transaction }
        ) as [(TenantAutomationActionModel & { trigger_key: string, action_key: string, automation_id: number })[], number];
        if (automations[0].length > 0) {
            const automation = automations[0][0];
            if (automation["trigger_key"] === "incident_updated") {
                const params = automation.params!;

                // Build replacements
                const replacements = buildIncidentUpdateReplacements(existingIncident, {
                    ...updatedIncident.dataValues,
                });

                // Replace variables in subject and body
                const processedParams = {
                    ...params,
                    subject: replaceTemplateVariables(params.subject || '', replacements),
                    body: replaceTemplateVariables(params.body || '', replacements),
                    automation_id: automation.automation_id,
                };

                // Enqueue with processed params
                await enqueueAutomationAction(automation.action_key, {...processedParams, organizationId});
            } else {
                console.warn(`No matching trigger found for key: ${automation["trigger_key"]}`);
            }
        }
        return updatedIncident;
    } catch (error) {
        console.error("Error updating incident:", error);
        throw error;
    }
};

export const deleteIncidentByIdQuery = async (
    id: number,
    organizationId: number,
    transaction: Transaction
) => {
    try {
        const result = await sequelize.query(
            `DELETE FROM ai_incident_managements WHERE organization_id = :organizationId AND id = :id RETURNING *`,
            {
                replacements: { organizationId, id },
                transaction,
            }
        ) as [(AIIncidentManagementModel)[], number];
        const deletedIncident = result[0][0];
        const automations = await sequelize.query(
            `SELECT
              pat.key AS trigger_key,
              paa.key AS action_key,
              a.id AS automation_id,
              aa.*
            FROM automation_triggers pat JOIN automations a ON a.trigger_id = pat.id AND a.organization_id = :organizationId JOIN automation_actions_data aa ON a.id = aa.automation_id AND aa.organization_id = :organizationId JOIN automation_actions paa ON aa.action_type_id = paa.id WHERE pat.key = 'incident_deleted' AND a.is_active ORDER BY aa."order" ASC;`,
            { replacements: { organizationId }, transaction }
        ) as [(TenantAutomationActionModel & { trigger_key: string, action_key: string, automation_id: number })[], number];
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
                    subject: replaceTemplateVariables(params.subject || '', replacements),
                    body: replaceTemplateVariables(params.body || '', replacements),
                    automation_id: automation.automation_id,
                };

                // Enqueue with processed params
                await enqueueAutomationAction(automation.action_key, {...processedParams, organizationId});
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
    transaction: Transaction
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
            }
        );

        const result = await sequelize.query(
            `SELECT * FROM ai_incident_managements WHERE organization_id = :organizationId AND id = :id`,
            {
                replacements: { organizationId, id },
                mapToModel: true,
                model: AIIncidentManagementModel,
                transaction,
            }
        );

        return result[0];
    } catch (error) {
        console.error("Error archiving incident:", error);
        throw error;
    }
};
