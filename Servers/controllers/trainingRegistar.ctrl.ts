import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";

import {
  getAllTrainingRegistarQuery,
  getTrainingRegistarByIdQuery,
} from "../utils/trainingRegistar.utils";

import { TrainingRegistarModel } from "../domain.layer/models/trainingRegistar/trainingRegistar.model";
import { logProcessing, logSuccess, logFailure } from "../utils/logger/logHelper";
import logger from "../utils/logger/fileLogger";
import { translateError } from "../utils/i18n.utils";
import {
  createTrainingRecord,
  deleteTrainingRecord,
  updateTrainingRecord,
  type TrainingRecordActor,
} from "../services/trainingRecord.service";

const actorOf = (req: Request): TrainingRecordActor => ({
  userId: req.userId,
  organizationId: req.organizationId!,
});

// get ALL training registry api
export async function getAllTrainingRegistar(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting getAllTrainingRegistar",
    functionName: "getAllTrainingRegistar",
    fileName: "trainingRegistar.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
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
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](trainingRegistars));
    }

    await logSuccess({
      eventType: "Read",
      description: "No training registrars found",
      functionName: "getAllTrainingRegistar",
      fileName: "trainingRegistar.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
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
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

// get BY ID training registry api
export async function getTrainingRegistarById(req: Request, res: Response): Promise<any> {
  const trainingRegistarId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );

  logProcessing({
    description: `starting getTrainingRegistarById for training registrar ID ${trainingRegistarId}`,
    functionName: "getTrainingRegistarById",
    fileName: "trainingRegistar.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  logger.debug(`🔍 Looking up training registrar ID ${trainingRegistarId}`);

  try {
    const trainingRegistar = await getTrainingRegistarByIdQuery(
      trainingRegistarId,
      req.organizationId!,
    );

    if (trainingRegistar) {
      await logSuccess({
        eventType: "Read",
        description: `Retrieved training registrar ID ${trainingRegistarId}`,
        functionName: "getTrainingRegistarById",
        fileName: "trainingRegistar.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(200).json(STATUS_CODE[200](trainingRegistar));
    }

    await logSuccess({
      eventType: "Read",
      description: `Training registrar not found: ID ${trainingRegistarId}`,
      functionName: "getTrainingRegistarById",
      fileName: "trainingRegistar.ctrl.ts",
      userId: req.userId!,
      organizationId: req.organizationId!,
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
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

// create new training registar
export async function createNewTrainingRegistar(req: Request, res: Response): Promise<any> {
  logProcessing({
    description: "starting createNewTrainingRegistar",
    functionName: "createNewTrainingRegistar",
    fileName: "trainingRegistar.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  logger.debug("🛠️ Creating new training registrar");

  try {
    const newTrainingRegistar: TrainingRegistarModel = req.body;

    const createdNewTrainingRegistar = await createTrainingRecord(
      newTrainingRegistar,
      actorOf(req),
    );

    if (createdNewTrainingRegistar) {
      await logSuccess({
        eventType: "Create",
        description: `Successfully created training registrar: ${newTrainingRegistar.training_name}`,
        functionName: "createNewTrainingRegistar",
        fileName: "trainingRegistar.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(201).json(STATUS_CODE[201](createdNewTrainingRegistar));
    }

    await logFailure({
      eventType: "Create",
      description: "Failed to create training registrar",
      functionName: "createNewTrainingRegistar",
      fileName: "trainingRegistar.ctrl.ts",
      error: new Error("Creation failed"),
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(503).json(STATUS_CODE[503]({}));
  } catch (error) {
    await logFailure({
      eventType: "Create",
      description: "Failed to create training registrar",
      functionName: "createNewTrainingRegistar",
      fileName: "trainingRegistar.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

//update a particular training registar by id
export async function updateTrainingRegistarById(req: Request, res: Response): Promise<any> {
  const trainingRegistarId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );

  logProcessing({
    description: `starting updateTrainingRegistarById for training registrar ID ${trainingRegistarId}`,
    functionName: "updateTrainingRegistarById",
    fileName: "trainingRegistar.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  logger.debug(`✏️ Updating training registrar ID ${trainingRegistarId}`);

  try {
    const result = await updateTrainingRecord(trainingRegistarId, req.body, actorOf(req));

    if (!result.ok && result.reason === "no_fields") {
      return res.status(400).json(STATUS_CODE[400](req.t!("No fields to update")));
    }
    if (result.ok) {
      await logSuccess({
        eventType: "Update",
        description: `Successfully updated training registrar ID ${trainingRegistarId}`,
        functionName: "updateTrainingRegistarById",
        fileName: "trainingRegistar.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      return res.status(202).json(STATUS_CODE[202](result.record));
    }

    await logFailure({
      eventType: "Update",
      description: `Training registrar not found: ID ${trainingRegistarId}`,
      functionName: "updateTrainingRegistarById",
      fileName: "trainingRegistar.ctrl.ts",
      error: new Error("Training registrar not found"),
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await logFailure({
      eventType: "Update",
      description: `Failed to update training registrar ID ${trainingRegistarId}`,
      functionName: "updateTrainingRegistarById",
      fileName: "trainingRegistar.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

export async function deleteTrainingRegistarById(req: Request, res: Response): Promise<any> {
  const trainingRegistarId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
  );
  logProcessing({
    description: `starting deleteTrainingRegistarById for training registrar ID ${trainingRegistarId}`,
    functionName: "deleteTrainingRegistarById",
    fileName: "trainingRegistar.ctrl.ts",
    userId: req.userId!,
    organizationId: req.organizationId!,
  });
  logger.debug(`🗑️ Deleting training registrar ID ${trainingRegistarId}`);

  try {
    const deleted = await deleteTrainingRecord(trainingRegistarId, actorOf(req));

    if (deleted) {
      await logSuccess({
        eventType: "Delete",
        description: `Successfully deleted training registrar ID ${trainingRegistarId}`,
        functionName: "deleteTrainingRegistarById",
        fileName: "trainingRegistar.ctrl.ts",
        userId: req.userId!,
        organizationId: req.organizationId!,
      });
      // The response body stays `true`, as before.
      return res.status(202).json(STATUS_CODE[202](true));
    }

    await logFailure({
      eventType: "Delete",
      description: `Training registrar not found: ID ${trainingRegistarId}`,
      functionName: "deleteTrainingRegistarById",
      fileName: "trainingRegistar.ctrl.ts",
      error: new Error("Training registrar not found"),
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete training registrar ID ${trainingRegistarId}`,
      functionName: "deleteTrainingRegistarById",
      fileName: "trainingRegistar.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      organizationId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}
