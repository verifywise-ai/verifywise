/**
 * Creates the downstream entity (ModelInventory / Project) when an admin
 * approves an intake submission. Extracted from the controller so the
 * MODEL vs USE_CASE switch lives in one place.
 */

import { Transaction } from "sequelize";
import { createNewModelInventoryQuery } from "../../utils/modelInventory.utils";
import { createNewProjectQuery } from "../../utils/project.utils";
import { ModelInventoryModel } from "../../domain.layer/models/modelInventory/modelInventory.model";
import { IntakeEntityType } from "../../domain.layer/enums/intake-entity-type.enum";
import { ModelInventoryStatus } from "../../domain.layer/enums/model-inventory-status.enum";
import { ProjectStatus } from "../../domain.layer/enums/project-status.enum";
import { mapToAiRiskClassification } from "../../utils/intakeForm/intakeFormValidation.utils";

export class UnsupportedEntityTypeError extends Error {
  constructor(public readonly entityType: string) {
    super(`Unsupported entity type: ${entityType}`);
    this.name = "UnsupportedEntityTypeError";
  }
}

/**
 * Create the underlying domain entity (Model or Project) from approved
 * submission data. Returns the created entity's id.
 */
export async function createEntityFromSubmission(
  entityType: IntakeEntityType,
  entityData: Record<string, unknown>,
  userId: number,
  organizationId: number,
  transaction: Transaction,
): Promise<number> {
  if (entityType === IntakeEntityType.MODEL) {
    const model = ModelInventoryModel.createNewModelInventory({
      provider: (entityData.provider as string) || "",
      model: (entityData.name as string) || (entityData.model as string) || "",
      version: (entityData.modelVersion as string) || (entityData.version as string) || "",
      approver: entityData.approver ? Number(entityData.approver) : undefined,
      capabilities:
        (entityData.capabilities as string) || (entityData.intendedUse as string) || "",
      security_assessment: (entityData.security_assessment as boolean) || false,
      reference_link: (entityData.reference_link as string) || "",
      biases: (entityData.biases as string) || "",
      limitations: (entityData.limitations as string) || "",
      hosting_provider:
        (entityData.hosting_provider as string) || (entityData.modelType as string) || "",
      status: ModelInventoryStatus.PENDING,
    });

    const createdModel = await createNewModelInventoryQuery(
      model,
      organizationId,
      [],
      [],
      transaction,
    );
    return createdModel.id!;
  }

  if (entityType === IntakeEntityType.USE_CASE) {
    const createdProject = await createNewProjectQuery(
      {
        project_title: (entityData.project_title as string) || "",
        description: (entityData.description as string) || "",
        start_date: entityData.start_date
          ? new Date(entityData.start_date as string)
          : new Date(),
        goal: (entityData.goal as string) || (entityData.description as string) || "",
        owner: userId,
        ai_risk_classification: mapToAiRiskClassification(
          entityData.ai_risk_classification as string,
        ) as any,
        type_of_high_risk_role: (entityData.type_of_high_risk_role as string as any) || undefined,
        geography: entityData.geography ? Number(entityData.geography) : 1,
        status: ProjectStatus.UNDER_REVIEW,
      },
      [],
      [],
      organizationId,
      userId,
      transaction,
    );
    return createdProject.id!;
  }

  throw new UnsupportedEntityTypeError(String(entityType));
}
