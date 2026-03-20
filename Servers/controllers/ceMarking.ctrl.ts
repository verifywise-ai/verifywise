import { Request, Response } from "express";
import { sequelize } from "../database/db";
import { QueryTypes } from "sequelize";
import {
  countSubControlsEUByProjectId,
  countAnswersEUByProjectId,
} from "../utils/eu.utils";
import logger from "../utils/logger/fileLogger";
import { logEvent } from "../utils/logger/dbLogger";

// Default conformity steps - will be created for each new CE Marking record
const DEFAULT_CONFORMITY_STEPS = [
  { step_number: 1, step_name: "Confirm high risk classification" },
  { step_number: 2, step_name: "Complete EU AI Act checklist" },
  { step_number: 3, step_name: "Compile technical documentation file" },
  { step_number: 4, step_name: "Internal review and sign off" },
  { step_number: 5, step_name: "Notified body review" },
  { step_number: 6, step_name: "Sign declaration of conformity" },
  { step_number: 7, step_name: "Register in EU database" },
];

/**
 * Get CE Marking data for a project
 * Creates default record if none exists
 */
export const getCEMarking = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).userId;

    // Validate that project exists and user has access to it
    const organizationId = (req as any).organizationId;
    const projectResult = await sequelize.query(
      `SELECT id FROM projects WHERE id = :projectId AND organization_id = :organizationId`,
      {
        replacements: { projectId, organizationId },
        type: QueryTypes.SELECT,
      }
    );

    if (!projectResult || projectResult.length === 0) {
      return res
        .status(404)
        .json({ error: "Project not found or you do not have access to it" });
    }

    // Check if CE Marking record exists
    let ceMarkingResult = await sequelize.query(
      `SELECT * FROM ce_markings WHERE project_id = :projectId AND organization_id = :organizationId`,
      {
        replacements: { projectId, organizationId },
        type: QueryTypes.SELECT,
      }
    );

    let ceMarking: any = ceMarkingResult[0];

    // If no record exists, create one with defaults
    if (!ceMarking) {
      const transaction = await sequelize.transaction();
      try {
        // Create CE Marking record
        const createResult = await sequelize.query(
          `INSERT INTO ce_markings (
            project_id,
            organization_id,
            is_high_risk_ai_system,
            role_in_product,
            annex_iii_category,
            declaration_status,
            registration_status,
            created_by,
            updated_by
          ) VALUES (:projectId, :organizationId, false, 'standalone', 'annex_iii_5', 'draft', 'not_registered', :userId, :userId)
          RETURNING *`,
          {
            replacements: { projectId, organizationId, userId },
            type: QueryTypes.INSERT,
            transaction,
          }
        );

        ceMarking = (createResult as any[])[0][0];

        // Create default conformity steps
        for (const step of DEFAULT_CONFORMITY_STEPS) {
          await sequelize.query(
            `INSERT INTO ce_marking_conformity_steps (
              ce_marking_id,
              organization_id,
              step_number,
              step_name,
              status
            ) VALUES (:ceMarkingId, :organizationId, :stepNumber, :stepName, 'Not started')`,
            {
              replacements: {
                ceMarkingId: ceMarking.id,
                organizationId,
                stepNumber: step.step_number,
                stepName: step.step_name,
              },
              type: QueryTypes.INSERT,
              transaction,
            }
          );
        }

        // Log creation to audit trail
        await sequelize.query(
          `INSERT INTO ce_marking_audit_trail (
            ce_marking_id,
            organization_id,
            field_name,
            old_value,
            new_value,
            changed_by,
            change_type
          ) VALUES (:ceMarkingId, :organizationId, 'record', NULL, 'created', :userId, 'create')`,
          {
            replacements: { ceMarkingId: ceMarking.id, organizationId, userId },
            type: QueryTypes.INSERT,
            transaction,
          }
        );

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }

    // Get conformity steps
    const conformitySteps = await sequelize.query(
      `SELECT * FROM ce_marking_conformity_steps
       WHERE ce_marking_id = :ceMarkingId AND organization_id = :organizationId
       ORDER BY step_number`,
      {
        replacements: { ceMarkingId: ceMarking.id, organizationId },
        type: QueryTypes.SELECT,
      }
    );

    // Get linked policies
    const linkedPolicies = await sequelize.query(
      `SELECT policy_id FROM ce_marking_policies
       WHERE ce_marking_id = :ceMarkingId AND organization_id = :organizationId`,
      {
        replacements: { ceMarkingId: ceMarking.id, organizationId },
        type: QueryTypes.SELECT,
      }
    );

    // Get linked evidences
    const linkedEvidences = await sequelize.query(
      `SELECT file_id FROM ce_marking_evidences
       WHERE ce_marking_id = :ceMarkingId AND organization_id = :organizationId`,
      {
        replacements: { ceMarkingId: ceMarking.id, organizationId },
        type: QueryTypes.SELECT,
      }
    );

    // Get linked incidents
    const linkedIncidents = await sequelize.query(
      `SELECT incident_id FROM ce_marking_incidents
       WHERE ce_marking_id = :ceMarkingId AND organization_id = :organizationId`,
      {
        replacements: { ceMarkingId: ceMarking.id, organizationId },
        type: QueryTypes.SELECT,
      }
    );

    // Calculate completed steps count
    const completedStepsCount = (conformitySteps as any[]).filter(
      (step) => step.status === "Completed" || step.status === "Not needed"
    ).length;

    // Calculate EU AI Act controls completion
    let controlsCompleted = 0;
    let controlsTotal = 0;
    let assessmentsCompleted = 0;
    let assessmentsTotal = 0;

    try {
      // Get the EU AI Act framework ID (projects_frameworks.id) for this project
      // First, get the framework_id for "EU AI Act"
      const euAiActFrameworkResult = await sequelize.query(
        `SELECT id FROM frameworks WHERE name = 'EU AI Act'`,
        {
          type: QueryTypes.SELECT,
        }
      );

      if (euAiActFrameworkResult.length > 0) {
        const euAiActFrameworkId = (euAiActFrameworkResult[0] as any).id;

        const frameworkResult = await sequelize.query(
          `SELECT id FROM projects_frameworks
           WHERE project_id = :projectId AND framework_id = :frameworkId AND organization_id = :organizationId`,
          {
            replacements: { projectId, frameworkId: euAiActFrameworkId, organizationId },
            type: QueryTypes.SELECT,
          }
        );

        if (frameworkResult.length > 0) {
          const projectFrameworkId = (frameworkResult[0] as any).id;

          // Use the same utility functions as the Overview tab
          // Count compliance/controls (subcontrols_eu)
          const { totalSubcontrols, doneSubcontrols } =
            await countSubControlsEUByProjectId(projectFrameworkId, req.organizationId!);

          controlsTotal = parseInt(totalSubcontrols) || 0;
          controlsCompleted = parseInt(doneSubcontrols) || 0;

          // Count assessments (answers_eu)
          const { totalAssessments, answeredAssessments } =
            await countAnswersEUByProjectId(projectFrameworkId, req.organizationId!);

          assessmentsTotal = parseInt(totalAssessments) || 0;
          assessmentsCompleted = parseInt(answeredAssessments) || 0;
        }
      }
    } catch (error) {
      logger.error("Error calculating EU AI Act completion:", error);
      // Continue with zeros if calculation fails
    }

    // Format response to match frontend interface
    const response = {
      // Core data
      isHighRiskAISystem: ceMarking.is_high_risk_ai_system,
      roleInProduct: ceMarking.role_in_product,
      annexIIICategory: ceMarking.annex_iii_category,

      // EU AI Act completion
      controlsCompleted,
      controlsTotal,
      assessmentsCompleted,
      assessmentsTotal,

      // Conformity steps
      conformitySteps: (conformitySteps as any[]).map((step) => ({
        id: step.id,
        step: step.step_name,
        description: step.description,
        status: step.status,
        owner: step.owner,
        dueDate: step.due_date,
        completedDate: step.completed_date,
      })),
      completedStepsCount,
      totalStepsCount: conformitySteps.length,

      // Declaration
      declarationStatus: ceMarking.declaration_status,
      signedOn: ceMarking.signed_on,
      signatory: ceMarking.signatory,
      declarationDocument: ceMarking.declaration_document,

      // Registration
      registrationStatus: ceMarking.registration_status,
      euRegistrationId: ceMarking.eu_registration_id,
      registrationDate: ceMarking.registration_date,
      euRecordUrl: ceMarking.eu_record_url,

      // Policies and evidence
      policiesLinked: linkedPolicies.length,
      evidenceLinked: linkedEvidences.length,
      linkedPolicies: (linkedPolicies as any[]).map((p) => p.policy_id),
      linkedEvidences: (linkedEvidences as any[]).map((e) => e.file_id),

      // Incidents
      totalIncidents: linkedIncidents.length,
      aiActReportableIncidents: ceMarking.ai_act_reportable_incidents || 0,
      lastIncident: ceMarking.last_incident,
      linkedIncidents: (linkedIncidents as any[]).map((i) => i.incident_id),
    };

    return res.status(200).json(response);
  } catch (error) {
    logger.error("Error in getCEMarking:", error);
    await logEvent(
      "Error",
      `Failed to get CE Marking data: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    return res
      .status(500)
      .json({
        error: "Failed to get CE Marking data",
        details: (error as Error).message,
      });
  }
};

/**
 * Update CE Marking data for a project
 */
export const updateCEMarking = async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    const { projectId } = req.params;
    const userId = (req as any).userId;
    const updates = req.body;

    // Validate that project exists and user has access to it
    const organizationId = (req as any).organizationId;
    const projectResult = await sequelize.query(
      `SELECT id FROM projects WHERE id = :projectId AND organization_id = :organizationId`,
      {
        replacements: { projectId, organizationId },
        type: QueryTypes.SELECT,
        transaction,
      }
    );

    if (!projectResult || projectResult.length === 0) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ error: "Project not found or you do not have access to it" });
    }

    // Get existing CE Marking record
    const existingResult = await sequelize.query(
      `SELECT * FROM ce_markings WHERE project_id = :projectId AND organization_id = :organizationId`,
      {
        replacements: { projectId, organizationId },
        type: QueryTypes.SELECT,
        transaction,
      }
    );

    if (!existingResult[0]) {
      await transaction.rollback();
      return res.status(404).json({ error: "CE Marking record not found" });
    }

    const existing: any = existingResult[0];
    const auditEntries: any[] = [];

    // Build update query for main CE Marking table
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    // Map frontend fields to database columns
    const fieldMapping: Record<string, string> = {
      isHighRiskAISystem: "is_high_risk_ai_system",
      roleInProduct: "role_in_product",
      annexIIICategory: "annex_iii_category",
      controlsCompleted: "controls_completed",
      controlsTotal: "controls_total",
      assessmentsCompleted: "assessments_completed",
      assessmentsTotal: "assessments_total",
      declarationStatus: "declaration_status",
      signedOn: "signed_on",
      signatory: "signatory",
      declarationDocument: "declaration_document",
      registrationStatus: "registration_status",
      euRegistrationId: "eu_registration_id",
      registrationDate: "registration_date",
      euRecordUrl: "eu_record_url",
      policiesLinked: "policies_linked",
      evidenceLinked: "evidence_linked",
      totalIncidents: "total_incidents",
      aiActReportableIncidents: "ai_act_reportable_incidents",
      lastIncident: "last_incident",
    };

    // Process main fields
    for (const [frontendField, dbField] of Object.entries(fieldMapping)) {
      if (updates.hasOwnProperty(frontendField)) {
        const newValue = updates[frontendField];
        const oldValue = existing[dbField];

        // Track changes for audit
        if (oldValue !== newValue) {
          updateFields.push(dbField);
          updateValues.push(newValue);

          auditEntries.push({
            field: dbField,
            oldValue: oldValue?.toString() || null,
            newValue: newValue?.toString() || null,
          });
        }
      }
    }

    // Update main record if there are changes
    if (updateFields.length > 0) {
      // Build the SET clause and replacements properly
      const replacements: any = { projectId, userId };
      const setClauseParts: string[] = [];

      // Process regular fields
      updateFields.forEach((field, index) => {
        const paramName = `v${index}`;
        replacements[paramName] = updateValues[index];
        setClauseParts.push(`${field} = :${paramName}`);
      });

      // Add system fields
      setClauseParts.push("updated_at = NOW()");
      setClauseParts.push("updated_by = :userId");

      replacements.organizationId = organizationId;
      await sequelize.query(
        `UPDATE ce_markings
         SET ${setClauseParts.join(", ")}
         WHERE project_id = :projectId AND organization_id = :organizationId`,
        {
          replacements,
          type: QueryTypes.UPDATE,
          transaction,
        }
      );

      // Create audit trail entries
      for (const entry of auditEntries) {
        await sequelize.query(
          `INSERT INTO ce_marking_audit_trail (
            ce_marking_id,
            organization_id,
            field_name,
            old_value,
            new_value,
            changed_by,
            change_type
          ) VALUES (:ceMarkingId, :organizationId, :field, :oldValue, :newValue, :userId, 'update')`,
          {
            replacements: {
              ceMarkingId: existing.id,
              organizationId,
              field: entry.field,
              oldValue: entry.oldValue,
              newValue: entry.newValue,
              userId,
            },
            type: QueryTypes.INSERT,
            transaction,
          }
        );
      }
    }

    // Handle linked policies updates
    if (updates.linkedPolicies && Array.isArray(updates.linkedPolicies)) {
      // Remove existing linked policies
      await sequelize.query(
        `DELETE FROM ce_marking_policies WHERE ce_marking_id = :ceMarkingId AND organization_id = :organizationId`,
        {
          replacements: { ceMarkingId: existing.id, organizationId },
          type: QueryTypes.DELETE,
          transaction,
        }
      );

      // Add new linked policies
      for (const policyId of updates.linkedPolicies) {
        await sequelize.query(
          `INSERT INTO ce_marking_policies (ce_marking_id, organization_id, policy_id, linked_by, linked_at)
           VALUES (:ceMarkingId, :organizationId, :policyId, :userId, NOW())`,
          {
            replacements: { ceMarkingId: existing.id, organizationId, policyId, userId },
            type: QueryTypes.INSERT,
            transaction,
          }
        );
      }

      // Audit trail for policies change
      await sequelize.query(
        `INSERT INTO ce_marking_audit_trail (
          ce_marking_id, organization_id, field_name, old_value, new_value, changed_by, change_type
        ) VALUES (:ceMarkingId, :organizationId, 'linked_policies', :oldValue, :newValue, :userId, 'update')`,
        {
          replacements: {
            ceMarkingId: existing.id,
            organizationId,
            oldValue: existing.policies_linked?.toString() || "0",
            newValue: updates.linkedPolicies.length.toString(),
            userId,
          },
          type: QueryTypes.INSERT,
          transaction,
        }
      );
    }

    // Handle linked evidence updates
    if (updates.linkedEvidences && Array.isArray(updates.linkedEvidences)) {
      // Remove existing linked evidence
      await sequelize.query(
        `DELETE FROM ce_marking_evidences WHERE ce_marking_id = :ceMarkingId AND organization_id = :organizationId`,
        {
          replacements: { ceMarkingId: existing.id, organizationId },
          type: QueryTypes.DELETE,
          transaction,
        }
      );

      // Add new linked evidence
      for (const fileId of updates.linkedEvidences) {
        await sequelize.query(
          `INSERT INTO ce_marking_evidences (ce_marking_id, organization_id, file_id, linked_by, linked_at)
           VALUES (:ceMarkingId, :organizationId, :fileId, :userId, NOW())`,
          {
            replacements: { ceMarkingId: existing.id, organizationId, fileId, userId },
            type: QueryTypes.INSERT,
            transaction,
          }
        );
      }

      // Audit trail for evidence change
      await sequelize.query(
        `INSERT INTO ce_marking_audit_trail (
          ce_marking_id, organization_id, field_name, old_value, new_value, changed_by, change_type
        ) VALUES (:ceMarkingId, :organizationId, 'linked_evidence', :oldValue, :newValue, :userId, 'update')`,
        {
          replacements: {
            ceMarkingId: existing.id,
            organizationId,
            oldValue: existing.evidence_linked?.toString() || "0",
            newValue: updates.linkedEvidences.length.toString(),
            userId,
          },
          type: QueryTypes.INSERT,
          transaction,
        }
      );
    }

    // Handle linked incidents updates
    if (updates.linkedIncidents && Array.isArray(updates.linkedIncidents)) {
      // Remove existing linked incidents
      await sequelize.query(
        `DELETE FROM ce_marking_incidents WHERE ce_marking_id = :ceMarkingId AND organization_id = :organizationId`,
        {
          replacements: { ceMarkingId: existing.id, organizationId },
          type: QueryTypes.DELETE,
          transaction,
        }
      );

      // Add new linked incidents
      for (const incidentId of updates.linkedIncidents) {
        await sequelize.query(
          `INSERT INTO ce_marking_incidents (ce_marking_id, organization_id, incident_id, linked_by, linked_at)
           VALUES (:ceMarkingId, :organizationId, :incidentId, :userId, NOW())`,
          {
            replacements: { ceMarkingId: existing.id, organizationId, incidentId, userId },
            type: QueryTypes.INSERT,
            transaction,
          }
        );
      }

      // Audit trail for incidents change
      await sequelize.query(
        `INSERT INTO ce_marking_audit_trail (
          ce_marking_id, organization_id, field_name, old_value, new_value, changed_by, change_type
        ) VALUES (:ceMarkingId, :organizationId, 'linked_incidents', :oldValue, :newValue, :userId, 'update')`,
        {
          replacements: {
            ceMarkingId: existing.id,
            organizationId,
            oldValue: existing.total_incidents?.toString() || "0",
            newValue: updates.linkedIncidents.length.toString(),
            userId,
          },
          type: QueryTypes.INSERT,
          transaction,
        }
      );
    }

    // Handle conformity steps updates
    if (updates.conformitySteps && Array.isArray(updates.conformitySteps)) {
      for (const step of updates.conformitySteps) {
        if (step.id) {
          // Get existing step
          const existingStepResult = await sequelize.query(
            `SELECT * FROM ce_marking_conformity_steps WHERE id = :stepId AND organization_id = :organizationId`,
            {
              replacements: { stepId: step.id, organizationId },
              type: QueryTypes.SELECT,
              transaction,
            }
          );

          const existingStep: any = existingStepResult[0];
          if (existingStep) {
            const stepUpdates: string[] = [];
            const stepValues: any[] = [];

            // Check each field for changes
            const stepFields = [
              "description",
              "status",
              "owner",
              "dueDate",
              "completedDate",
            ];
            const stepFieldMapping: Record<string, string> = {
              description: "description",
              status: "status",
              owner: "owner",
              dueDate: "due_date",
              completedDate: "completed_date",
            };

            for (const field of stepFields) {
              if (step.hasOwnProperty(field)) {
                const dbField = stepFieldMapping[field];
                const newValue = step[field];
                const oldValue = existingStep[dbField];

                if (oldValue !== newValue) {
                  stepUpdates.push(dbField);
                  stepValues.push(newValue);

                  // Audit trail for step changes
                  await sequelize.query(
                    `INSERT INTO ce_marking_audit_trail (
                      ce_marking_id,
                      organization_id,
                      field_name,
                      old_value,
                      new_value,
                      changed_by,
                      change_type
                    ) VALUES (:ceMarkingId, :organizationId, :fieldName, :oldValue, :newValue, :userId, 'update')`,
                    {
                      replacements: {
                        ceMarkingId: existing.id,
                        organizationId,
                        fieldName: `step_${existingStep.step_number}_${dbField}`,
                        oldValue: oldValue?.toString() || null,
                        newValue: newValue?.toString() || null,
                        userId,
                      },
                      type: QueryTypes.INSERT,
                      transaction,
                    }
                  );
                }
              }
            }

            // Auto-populate completed_date when status changes to Completed
            if (
              step.status === "Completed" &&
              existingStep.status !== "Completed" &&
              !step.completedDate
            ) {
              stepUpdates.push("completed_date");
              stepValues.push(new Date().toISOString().split("T")[0]);
            }

            // Update step if there are changes
            if (stepUpdates.length > 0) {
              // Build the SET clause and replacements properly for steps
              const stepReplacements: any = { stepId: step.id };
              const stepSetClauseParts: string[] = [];

              // Process step fields
              stepUpdates.forEach((field, index) => {
                const paramName = `sv${index}`;
                stepReplacements[paramName] = stepValues[index];
                stepSetClauseParts.push(`${field} = :${paramName}`);
              });

              // Add updated_at field
              stepSetClauseParts.push("updated_at = NOW()");

              stepReplacements.organizationId = organizationId;
              await sequelize.query(
                `UPDATE ce_marking_conformity_steps
                 SET ${stepSetClauseParts.join(", ")}
                 WHERE id = :stepId AND organization_id = :organizationId`,
                {
                  replacements: stepReplacements,
                  type: QueryTypes.UPDATE,
                  transaction,
                }
              );
            }
          }
        }
      }
    }

    // Commit transaction
    await transaction.commit();

    // Return updated data
    return await getCEMarking(req, res);
  } catch (error) {
    await transaction.rollback();
    logger.error("Error in updateCEMarking:", error);
    await logEvent(
      "Error",
      `Failed to update CE Marking data: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    return res
      .status(500)
      .json({
        error: "Failed to update CE Marking data",
        details: (error as Error).message,
      });
  }
};
