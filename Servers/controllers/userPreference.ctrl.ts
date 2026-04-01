import { Request, Response } from "express";
import logger, { logStructured } from "../utils/logger/fileLogger";
import {
  createNewUserPreferencesQuery,
  getPreferencesByUserQuery,
  updateUserPreferencesByIdQuery,
} from "../utils/userPreference.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { sequelize } from "../database/db";
import { UserPreferencesModel } from "../domain.layer/models/userPreferences/userPreferences.model";
import { logSuccess } from "../utils/logger/logHelper";
import { logEvent } from "../utils/logger/dbLogger";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";

const fileName = "userPreference.ctrl.ts";

export async function getPreferencesByUser(req: Request, res: Response) {
  const functionName = "getPreferencesByUser";
  const userId = req.params.userId;
  logStructured(
    "processing",
    `Fetching user preferences by user id: ${userId}`,
    functionName,
    fileName,
  );
  logger.debug(`Fetching user preference with user ID: ${userId}`);

  try {
    const userPreference = await getPreferencesByUserQuery(Number(userId));
    if (userPreference) {
      logStructured(
        "successful",
        `User Preference for user ID ${userId} found`,
        functionName,
        fileName,
      );
      return res.status(200).json(STATUS_CODE[200](userPreference.toJSON()));
    }

    logStructured(
      "successful",
      `No User Preference for user ID ${userId} found`,
      functionName,
      fileName,
    );
    return res.status(200).json(STATUS_CODE[200](userPreference));
  } catch (error) {
    logStructured(
      "error",
      `Error fetching User Preference for user ID ${userId}`,
      functionName,
      fileName,
    );
    logger.error("Error in fetching user preferences:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createUserPreferences(req: Request, res: Response) {
  const functionName = "createUserPreferences";

  const transaction = await sequelize.transaction();
  const preferenceData = req.body;

  if (!preferenceData.user_id || !preferenceData.date_format) {
    logStructured(
      "error",
      "Missing required fields in request body",
      functionName,
      fileName,
    );
    return res
      .status(400)
      .json(
        STATUS_CODE[400]("Missing required fields: user_id and date_format"),
      );
  }

  if (
    typeof preferenceData.user_id !== "number" ||
    preferenceData.user_id <= 0
  ) {
    logStructured(
      "error",
      `Invalid user_id: ${preferenceData.user_id}`,
      functionName,
      fileName,
    );
    return res.status(400).json(STATUS_CODE[400]("Invalid user_id"));
  }

  logStructured(
    "processing",
    `Starting User Preferences creation`,
    functionName,
    fileName,
  );
  logger.debug(
    `Creating user preference with user ID: ${preferenceData.user_id}`,
  );

  try {
    const existingPreference = await getPreferencesByUserQuery(
      parseInt(preferenceData.user_id),
    );
    if (existingPreference) {
      await transaction.rollback();
      logStructured(
        "error",
        `User preferences already exist for user ID ${preferenceData.user_id}`,
        functionName,
        fileName,
      );
      return res
        .status(400)
        .json(STATUS_CODE[400]("User preferences already exist for this user"));
    }

    const userPreference = await UserPreferencesModel.createNewUserPreferences(
      preferenceData.user_id,
      preferenceData.date_format,
    );

    const createdData = await createNewUserPreferencesQuery(
      userPreference,
      transaction,
    );
    if (createdData) {
      await transaction.commit();

      await logSuccess({
        eventType: "Create",
        description: "Created user preferences",
        functionName,
        fileName,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      logStructured(
        "successful",
        `Created user preferences`,
        functionName,
        fileName,
      );
      await logEvent(
        "Create",
        `User Preferences created: ID ${createdData.user_id}, format: ${createdData.date_format}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(201).json(STATUS_CODE[201](createdData));
    }
    logStructured(
      "error",
      "failed to create user preferences",
      functionName,
      fileName,
    );
    await logEvent("Error", "User preferences creation failed", req.userId!, req.organizationId!);
    await transaction.rollback();
    return res
      .status(400)
      .json(STATUS_CODE[400]("Failed to create user preferences"));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation failed: ${error.message}`,
        functionName,
        fileName,
      );
      await logEvent(
        "Error",
        `Validation error during user preferences creation: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    logStructured(
      "error",
      `Error creating User Preference`,
      functionName,
      fileName,
    );
    logger.error("Error in creating user preferences:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateUserPreferences(req: Request, res: Response) {
  const functionName = "updateUserPreferences";

  const transaction = await sequelize.transaction();
  const preferenceData = req.body;
  const userId = parseInt(Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId);

  logStructured(
    "processing",
    `Starting User Preferences update`,
    functionName,
    fileName,
  );
  logger.debug(`Updating user preference with user ID: ${userId}`);

  try {
    const existingUserPreference = await getPreferencesByUserQuery(
      Number(userId),
    );
    if (!existingUserPreference) {
      logStructured(
        "successful",
        `No User Preference for user ID ${userId} found`,
        functionName,
        fileName,
      );
      await transaction.rollback();

      return res.status(404).json(STATUS_CODE[404]("Not Found"));
    }

    const userPreference = new UserPreferencesModel(existingUserPreference);
    await userPreference.updateUserPreferences({
      date_format: preferenceData.date_format,
    });

    const updatedData = await updateUserPreferencesByIdQuery(
      userId,
      userPreference,
      transaction,
    );

    if (updatedData) {
      await transaction.commit();

      await logSuccess({
        eventType: "Update",
        description: "Updated user preferences",
        functionName,
        fileName,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      logStructured(
        "successful",
        `Updated user preferences`,
        functionName,
        fileName,
      );
      await logEvent(
        "Update",
        `User Preferences Updated: ID ${updatedData.user_id}, format: ${updatedData.date_format}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(200).json(STATUS_CODE[200](updatedData));
    }
    logStructured(
      "error",
      "failed to update user preferences",
      functionName,
      fileName,
    );
    await logEvent("Error", "user preferences update failed", req.userId!, req.organizationId!);
    await transaction.rollback();
    return res
      .status(400)
      .json(STATUS_CODE[400]("Failed to update user preferences"));
  } catch (error) {
    await transaction.rollback();

    if (error instanceof ValidationException) {
      logStructured(
        "error",
        `validation failed: ${error.message}`,
        functionName,
        fileName,
      );
      await logEvent(
        "Error",
        `Validation error during user preferences update: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](error.message));
    }

    logStructured(
      "error",
      `Error updating User Preference`,
      functionName,
      fileName,
    );
    logger.error("Error in updating user preferences:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
