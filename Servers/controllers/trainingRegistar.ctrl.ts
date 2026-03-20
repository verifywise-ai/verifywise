import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";

import {
  createNewTrainingRegistarQuery,
  getAllTrainingRegistarQuery,
  getTrainingRegistarByIdQuery,
  updateTrainingRegistarByIdQuery,
  deleteTrainingRegistarByIdQuery,
} from "../utils/trainingRegistar.utils";

import { TrainingRegistarModel } from "../domain.layer/models/trainingRegistar/trainingRegistar.model";
import { sequelize } from "../database/db";
import {
  logProcessing,
  logSuccess,
  logFailure,
} from "../utils/logger/logHelper";
import logger from "../utils/logger/fileLogger";
import { notifyTrainingAssigned } from "../services/inAppNotification.service";
import { getAllUsersQuery } from "../utils/user.utils";
import {
  recordEntityCreation,
  trackEntityChanges,
  recordMultipleFieldChanges,
  recordEntityDeletion,
} from "../utils/changeHistory.base.utils";

// get ALL training registry api
export async function getAllTrainingRegistar(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "starting getAllTrainingRegistar",
    functionName: "getAllTrainingRegistar",
    fileName: "trainingRegistar.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("📚 Fetching all training registrars");

  try {
    const trainingRegistars = await getAllTrainingRegistarQuery(req.organizationId!);
    if (trainingRegistars) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved ${trainingRegistars.length} training registrars`,
        functionName: "getAllTrainingRegistar",
        fileName: "trainingRegistar.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](trainingRegistars));
    }

    await logSuccess({
      eventType: "Read",
      description: "No training registrars found",
      functionName: "getAllTrainingRegistar",
      fileName: "trainingRegistar.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(204).json(STATUS_CODE[204](trainingRegistars));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve training registrars",
      functionName: "getAllTrainingRegistar",
      fileName: "trainingRegistar.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// get BY ID training registry api
export async function getTrainingRegistarById(
  req: Request,
  res: Response
): Promise<any> {
  const trainingRegistarId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  logProcessing({
    description: `starting getTrainingRegistarById for training registrar ID ${trainingRegistarId}`,
    functionName: "getTrainingRegistarById",
    fileName: "trainingRegistar.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`🔍 Looking up training registrar ID ${trainingRegistarId}`);

  try {
    const trainingRegistar = await getTrainingRegistarByIdQuery(
      trainingRegistarId,
      req.organizationId!
    );

    if (trainingRegistar) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved training registrar ID ${trainingRegistarId}`,
        functionName: "getTrainingRegistarById",
        fileName: "trainingRegistar.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](trainingRegistar));
    }

    await logSuccess({
      eventType: "Read",
      description: `Training registrar not found: ID ${trainingRegistarId}`,
      functionName: "getTrainingRegistarById",
      fileName: "trainingRegistar.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404](trainingRegistar));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve training registrar ID ${trainingRegistarId}`,
      functionName: "getTrainingRegistarById",
      fileName: "trainingRegistar.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

// create new training registar
export async function createNewTrainingRegistar(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();

  logProcessing({
    description: "starting createNewTrainingRegistar",
    functionName: "createNewTrainingRegistar",
    fileName: "trainingRegistar.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug("🛠️ Creating new training registrar");

  try {
    const newTrainingRegistar: TrainingRegistarModel = req.body;

    const createdNewTrainingRegistar = await createNewTrainingRegistarQuery(
      newTrainingRegistar,
      req.organizationId!,
      transaction
    );

    if (createdNewTrainingRegistar) {
      // Record creation in change history
      const trainingData = createdNewTrainingRegistar?.dataValues || createdNewTrainingRegistar;
      const trainingId = trainingData?.id;
      if (trainingId && req.userId) {
        // Normalize numberOfPeople to people (DB column name) for change tracking
        const normalizedData: Record<string, unknown> = {
          ...newTrainingRegistar,
          people: (newTrainingRegistar as any).numberOfPeople ?? (newTrainingRegistar as any).people,
        };
        delete (normalizedData as any).numberOfPeople;
        await recordEntityCreation(
          "training",
          trainingId,
          req.userId,
          req.organizationId!,
          normalizedData,
          transaction
        );
      }

      await transaction.commit();
      await logSuccess({
        eventType: "Create",
        description: `Successfully created training registrar: ${newTrainingRegistar.training_name}`,
        functionName: "createNewTrainingRegistar",
        fileName: "trainingRegistar.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });

      // Send training assigned notifications to org admins
      const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      try {
        const users = await getAllUsersQuery(req.organizationId!);
        const admins = users.filter((user) => user.role_id === 1);
        const creatorUser = users.find((user) => user.id === req.userId);
        const creatorName = creatorUser
          ? `${creatorUser.name} ${creatorUser.surname}`
          : "System";

        const trainingData = createdNewTrainingRegistar?.dataValues || createdNewTrainingRegistar;
        const trainingId = trainingData?.id || 0;

        for (const admin of admins) {
          await notifyTrainingAssigned(
            req.organizationId!,
            admin.id!,
            {
              id: trainingId,
              name: newTrainingRegistar.training_name,
              description: newTrainingRegistar.description,
              duration: newTrainingRegistar.duration,
            },
            creatorName,
            baseUrl,
          );
        }
      } catch (notifyError) {
        logger.error("Failed to send training assigned notification:", notifyError);
      }

      return res.status(201).json(STATUS_CODE[201](createdNewTrainingRegistar));
    }

    await transaction.rollback();
    await logFailure({
      eventType: "Create",
      description: "Failed to create training registrar",
      functionName: "createNewTrainingRegistar",
      fileName: "trainingRegistar.ctrl.ts",
      error: new Error("Creation failed"),
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(503).json(STATUS_CODE[503]({}));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Create",
      description: "Failed to create training registrar",
      functionName: "createNewTrainingRegistar",
      fileName: "trainingRegistar.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

//update a particular training registar by id
export async function updateTrainingRegistarById(
  req: Request,
  res: Response
): Promise<any> {
  const trainingRegistarId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  const transaction = await sequelize.transaction();

  logProcessing({
    description: `starting updateTrainingRegistarById for training registrar ID ${trainingRegistarId}`,
    functionName: "updateTrainingRegistarById",
    fileName: "trainingRegistar.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`✏️ Updating training registrar ID ${trainingRegistarId}`);

  try {
    // Map numberOfPeople to people for DB
    const updatedTrainingRegistar: any = {
      ...req.body,
      people: req.body.numberOfPeople,
    };
    delete updatedTrainingRegistar.numberOfPeople;

    // Get existing data for change tracking
    const existingTraining = await getTrainingRegistarByIdQuery(
      trainingRegistarId,
      req.organizationId!
    );

    const trainingRegistar = await updateTrainingRegistarByIdQuery(
      trainingRegistarId,
      updatedTrainingRegistar,
      req.organizationId!,
      transaction
    );

    if (trainingRegistar) {
      // Record changes in change history
      if (existingTraining && req.userId) {
        const changes = await trackEntityChanges(
          "training",
          existingTraining,
          updatedTrainingRegistar
        );
        if (changes.length > 0) {
          await recordMultipleFieldChanges(
            "training",
            trainingRegistarId,
            req.userId,
            req.organizationId!,
            changes,
            transaction
          );
        }
      }

      await transaction.commit();
      await logSuccess({
        eventType: "Update",
        description: `Successfully updated training registrar ID ${trainingRegistarId}`,
        functionName: "updateTrainingRegistarById",
        fileName: "trainingRegistar.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(202).json(STATUS_CODE[202](trainingRegistar));
    }

    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `Training registrar not found: ID ${trainingRegistarId}`,
      functionName: "updateTrainingRegistarById",
      fileName: "trainingRegistar.ctrl.ts",
      error: new Error("Training registrar not found"),
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Update",
      description: `Failed to update training registrar ID ${trainingRegistarId}`,
      functionName: "updateTrainingRegistarById",
      fileName: "trainingRegistar.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteTrainingRegistarById(
  req: Request,
  res: Response
): Promise<any> {
  const trainingRegistarId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const transaction = await sequelize.transaction();

  logProcessing({
    description: `starting deleteTrainingRegistarById for training registrar ID ${trainingRegistarId}`,
    functionName: "deleteTrainingRegistarById",
    fileName: "trainingRegistar.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  logger.debug(`🗑️ Deleting training registrar ID ${trainingRegistarId}`);

  try {
    const deleteTrainingRegistar = await deleteTrainingRegistarByIdQuery(
      trainingRegistarId,
      req.organizationId!,
      transaction
    );

    if (deleteTrainingRegistar) {
      // Record deletion in change history
      if (req.userId) {
        await recordEntityDeletion("training", trainingRegistarId, req.userId, req.organizationId!, transaction);
      }

      await transaction.commit();
      await logSuccess({
        eventType: "Delete",
        description: `Successfully deleted training registrar ID ${trainingRegistarId}`,
        functionName: "deleteTrainingRegistarById",
        fileName: "trainingRegistar.ctrl.ts",
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(202).json(STATUS_CODE[202](deleteTrainingRegistar));
    }

    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Training registrar not found: ID ${trainingRegistarId}`,
      functionName: "deleteTrainingRegistarById",
      fileName: "trainingRegistar.ctrl.ts",
      error: new Error("Training registrar not found"),
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete training registrar ID ${trainingRegistarId}`,
      functionName: "deleteTrainingRegistarById",
      fileName: "trainingRegistar.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
