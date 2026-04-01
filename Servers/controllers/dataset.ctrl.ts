import { Request, Response } from "express";
import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { DatasetModel } from "../domain.layer/models/dataset/dataset.model";
import {
  getAllDatasetsQuery,
  getDatasetByIdQuery,
  createNewDatasetQuery,
  updateDatasetByIdQuery,
  deleteDatasetByIdQuery,
  getDatasetsByModelIdQuery,
  getDatasetsByProjectIdQuery,
} from "../utils/dataset.utils";
import {
  recordDatasetCreation,
  recordDatasetDeletion,
  trackDatasetChanges,
  recordDatasetFieldChanges,
  getDatasetChangeHistory,
} from "../utils/datasetChangeHistory.utils";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { ValidationError } from "../utils/validations/validation.utils";
import {
  validateCompleteDatasetCreation,
  validateCompleteDatasetUpdate,
  validateDatasetIdParam,
} from "../utils/validations/datasetValidation.utils";

export async function getAllDatasets(req: Request, res: Response) {
  logStructured(
    "processing",
    "starting getAllDatasets",
    "getAllDatasets",
    "dataset.ctrl.ts"
  );
  logger.debug("Fetching all datasets");

  try {
    const datasets = (await getAllDatasetsQuery(
      req.organizationId!
    )) as unknown as DatasetModel[];

    if (datasets && datasets.length > 0) {
      logStructured(
        "successful",
        "datasets found",
        "getAllDatasets",
        "dataset.ctrl.ts"
      );
      return res
        .status(200)
        .json(
          STATUS_CODE[200](datasets.map((dataset) => dataset.toSafeJSON()))
        );
    }

    logStructured(
      "successful",
      "no datasets found",
      "getAllDatasets",
      "dataset.ctrl.ts"
    );
    return res.status(200).json(STATUS_CODE[200](datasets));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve datasets",
      "getAllDatasets",
      "dataset.ctrl.ts"
    );
    logger.error("Error in getAllDatasets:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getDatasetById(req: Request, res: Response) {
  const datasetId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );

  const idValidation = validateDatasetIdParam(datasetId);
  if (!idValidation.isValid) {
    logStructured(
      "error",
      `Invalid dataset ID parameter: ${req.params.id}`,
      "getDatasetById",
      "dataset.ctrl.ts"
    );
    return res.status(400).json({
      status: "error",
      message: idValidation.message || "Invalid dataset ID",
      code: idValidation.code || "INVALID_PARAMETER",
    });
  }

  logStructured(
    "processing",
    `fetching dataset by id: ${datasetId}`,
    "getDatasetById",
    "dataset.ctrl.ts"
  );
  logger.debug(`Looking up dataset with id: ${datasetId}`);

  try {
    const dataset = (await getDatasetByIdQuery(
      datasetId,
      req.organizationId!
    )) as unknown as DatasetModel;

    if (dataset) {
      logStructured(
        "successful",
        `dataset found: ${datasetId}`,
        "getDatasetById",
        "dataset.ctrl.ts"
      );
      return res.status(200).json(STATUS_CODE[200](dataset.toSafeJSON()));
    }

    logStructured(
      "successful",
      `no dataset found: ${datasetId}`,
      "getDatasetById",
      "dataset.ctrl.ts"
    );
    return res.status(204).json(STATUS_CODE[204](dataset));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve dataset",
      "getDatasetById",
      "dataset.ctrl.ts"
    );
    logger.error("Error in getDatasetById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getDatasetsByModelId(req: Request, res: Response) {
  const modelId = parseInt(
    Array.isArray(req.params.modelId)
      ? req.params.modelId[0]
      : req.params.modelId
  );

  logStructured(
    "processing",
    `fetching datasets by model id: ${modelId}`,
    "getDatasetsByModelId",
    "dataset.ctrl.ts"
  );
  logger.debug(`Looking up datasets with model id: ${modelId}`);

  try {
    const datasets = (await getDatasetsByModelIdQuery(
      modelId,
      req.organizationId!
    )) as unknown as DatasetModel[];

    logStructured(
      "successful",
      `datasets retrieved for model id: ${modelId}`,
      "getDatasetsByModelId",
      "dataset.ctrl.ts"
    );
    return res
      .status(200)
      .json(
        STATUS_CODE[200](datasets.map((dataset) => dataset.toSafeJSON()))
      );
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve datasets by model id",
      "getDatasetsByModelId",
      "dataset.ctrl.ts"
    );
    logger.error("Error in getDatasetsByModelId:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getDatasetsByProjectId(req: Request, res: Response) {
  const projectId = parseInt(
    Array.isArray(req.params.projectId)
      ? req.params.projectId[0]
      : req.params.projectId
  );

  logStructured(
    "processing",
    `fetching datasets by project id: ${projectId}`,
    "getDatasetsByProjectId",
    "dataset.ctrl.ts"
  );
  logger.debug(`Looking up datasets with project id: ${projectId}`);

  try {
    const datasets = (await getDatasetsByProjectIdQuery(
      projectId,
      req.organizationId!
    )) as unknown as DatasetModel[];

    logStructured(
      "successful",
      `datasets retrieved for project id: ${projectId}`,
      "getDatasetsByProjectId",
      "dataset.ctrl.ts"
    );
    return res
      .status(200)
      .json(
        STATUS_CODE[200](datasets.map((dataset) => dataset.toSafeJSON()))
      );
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve datasets by project id",
      "getDatasetsByProjectId",
      "dataset.ctrl.ts"
    );
    logger.error("Error in getDatasetsByProjectId:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createNewDataset(req: Request, res: Response) {
  // Validate request body
  const validationErrors = validateCompleteDatasetCreation(req.body);
  if (validationErrors.length > 0) {
    logStructured(
      "error",
      "Dataset creation validation failed",
      "createNewDataset",
      "dataset.ctrl.ts"
    );
    return res.status(400).json({
      status: "error",
      message: "Dataset creation validation failed",
      errors: validationErrors.map((err: ValidationError) => ({
        field: err.field,
        message: err.message,
        code: err.code,
      })),
    });
  }

  const {
    name,
    description,
    version,
    owner,
    type,
    function: datasetFunction,
    source,
    license,
    format,
    classification,
    contains_pii,
    pii_types,
    status,
    status_date,
    known_biases,
    bias_mitigation,
    collection_method,
    preprocessing_steps,
    documentation_data,
    is_demo,
    models,
    projects,
  } = req.body;

  logStructured(
    "processing",
    "starting createNewDataset",
    "createNewDataset",
    "dataset.ctrl.ts"
  );
  logger.debug("Creating new dataset");

  let transaction: Transaction | null = null;

  try {
    // Create new dataset instance using the static method
    const dataset = DatasetModel.createNewDataset({
      name,
      description,
      version,
      owner,
      type,
      function: datasetFunction,
      source,
      license,
      format,
      classification,
      contains_pii,
      pii_types,
      status,
      status_date: status_date || new Date(),
      known_biases,
      bias_mitigation,
      collection_method,
      preprocessing_steps,
      documentation_data,
      is_demo,
    });

    // Create transaction
    transaction = await sequelize.transaction();

    const savedDataset = await createNewDatasetQuery(
      dataset,
      req.organizationId!,
      models || [],
      projects || [],
      transaction
    );

    // Record creation in change history
    await recordDatasetCreation(
      savedDataset.id!,
      req.userId,
      req.organizationId!,
      transaction
    );

    await transaction.commit();

    logStructured(
      "successful",
      "new dataset created",
      "createNewDataset",
      "dataset.ctrl.ts"
    );
    return res.status(201).json(STATUS_CODE[201](savedDataset.toSafeJSON()));
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn("Transaction rollback failed:", rollbackError);
      }
    }

    logStructured(
      "error",
      "failed to create new dataset",
      "createNewDataset",
      "dataset.ctrl.ts"
    );
    logger.error("Error in createNewDataset:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateDatasetById(req: Request, res: Response) {
  const datasetId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );

  // Validate dataset ID
  const idValidation = validateDatasetIdParam(datasetId);
  if (!idValidation.isValid) {
    logStructured(
      "error",
      `Invalid dataset ID parameter: ${req.params.id}`,
      "updateDatasetById",
      "dataset.ctrl.ts"
    );
    return res.status(400).json({
      status: "error",
      message: idValidation.message || "Invalid dataset ID",
      code: idValidation.code || "INVALID_PARAMETER",
    });
  }

  const {
    name,
    description,
    version,
    owner,
    type,
    function: datasetFunction,
    source,
    license,
    format,
    classification,
    contains_pii,
    pii_types,
    status,
    status_date,
    known_biases,
    bias_mitigation,
    collection_method,
    preprocessing_steps,
    documentation_data,
    is_demo,
    models,
    projects,
    deleteModels,
    deleteProjects,
  } = req.body;

  logStructured(
    "processing",
    "starting updateDatasetById",
    "updateDatasetById",
    "dataset.ctrl.ts"
  );
  logger.debug("Updating dataset by id");

  let transaction: Transaction | null = null;

  try {
    // Get existing dataset
    const currentDataset = (await getDatasetByIdQuery(
      datasetId,
      req.organizationId!
    )) as unknown as DatasetModel;

    if (!currentDataset) {
      logStructured(
        "successful",
        "no dataset found",
        "updateDatasetById",
        "dataset.ctrl.ts"
      );
      return res.status(404).json(STATUS_CODE[404]("Dataset not found"));
    }

    // Validate request body with existing data for business rules
    const validationErrors = validateCompleteDatasetUpdate(
      req.body,
      currentDataset.toJSON()
    );
    if (validationErrors.length > 0) {
      logStructured(
        "error",
        "Dataset update validation failed",
        "updateDatasetById",
        "dataset.ctrl.ts"
      );
      return res.status(400).json({
        status: "error",
        message: "Dataset update validation failed",
        errors: validationErrors.map((err: ValidationError) => ({
          field: err.field,
          message: err.message,
          code: err.code,
        })),
      });
    }

    // Track changes before updating
    const changes = trackDatasetChanges(currentDataset, {
      name,
      description,
      version,
      owner,
      type,
      function: datasetFunction,
      source,
      license,
      format,
      classification,
      contains_pii,
      pii_types,
      status,
      known_biases,
      bias_mitigation,
      collection_method,
      preprocessing_steps,
      is_demo,
    });

    // Update the dataset using the static method
    const updatedDataset = DatasetModel.updateDataset(currentDataset, {
      name,
      description,
      version,
      owner,
      type,
      function: datasetFunction,
      source,
      license,
      format,
      classification,
      contains_pii,
      pii_types,
      status,
      status_date: status_date || currentDataset.status_date,
      known_biases,
      bias_mitigation,
      collection_method,
      preprocessing_steps,
      documentation_data,
      is_demo,
    });

    // Use transaction for updating
    transaction = await sequelize.transaction();

    const savedDataset = await updateDatasetByIdQuery(
      datasetId,
      updatedDataset,
      models || [],
      projects || [],
      deleteModels || false,
      deleteProjects || false,
      req.organizationId!,
      transaction
    );

    // Record changes in change history
    if (changes.length > 0) {
      await recordDatasetFieldChanges(
        datasetId,
        changes,
        req.userId,
        req.organizationId!,
        transaction
      );
    }

    await transaction.commit();

    logStructured(
      "successful",
      "dataset updated",
      "updateDatasetById",
      "dataset.ctrl.ts"
    );
    return res.status(200).json(STATUS_CODE[200](savedDataset.toSafeJSON()));
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn("Transaction rollback failed:", rollbackError);
      }
    }

    logStructured(
      "error",
      "failed to update dataset",
      "updateDatasetById",
      "dataset.ctrl.ts"
    );
    logger.error("Error in updateDatasetById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteDatasetById(req: Request, res: Response) {
  const datasetId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );

  // Validate dataset ID
  const idValidation = validateDatasetIdParam(datasetId);
  if (!idValidation.isValid) {
    logStructured(
      "error",
      `Invalid dataset ID parameter: ${req.params.id}`,
      "deleteDatasetById",
      "dataset.ctrl.ts"
    );
    return res.status(400).json({
      status: "error",
      message: idValidation.message || "Invalid dataset ID",
      code: idValidation.code || "INVALID_PARAMETER",
    });
  }

  logStructured(
    "processing",
    "starting deleteDatasetById",
    "deleteDatasetById",
    "dataset.ctrl.ts"
  );
  logger.debug("Deleting dataset by id");

  let transaction: Transaction | null = null;

  try {
    // Check if dataset exists
    const existingDataset = (await getDatasetByIdQuery(
      datasetId,
      req.organizationId!
    )) as unknown as DatasetModel;

    if (!existingDataset) {
      logStructured(
        "successful",
        "no dataset found",
        "deleteDatasetById",
        "dataset.ctrl.ts"
      );
      return res.status(404).json(STATUS_CODE[404]("Dataset not found"));
    }

    // Use transaction for deleting
    transaction = await sequelize.transaction();

    // Record deletion in change history before deleting
    await recordDatasetDeletion(
      datasetId,
      req.userId,
      req.organizationId!,
      transaction
    );

    await deleteDatasetByIdQuery(datasetId, req.organizationId!, transaction);

    await transaction.commit();

    logStructured(
      "successful",
      "dataset deleted",
      "deleteDatasetById",
      "dataset.ctrl.ts"
    );
    return res
      .status(200)
      .json(STATUS_CODE[200]("Dataset deleted successfully"));
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.warn("Transaction rollback failed:", rollbackError);
      }
    }

    logStructured(
      "error",
      "failed to delete dataset",
      "deleteDatasetById",
      "dataset.ctrl.ts"
    );
    logger.error("Error in deleteDatasetById:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getDatasetHistory(req: Request, res: Response) {
  const datasetId = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );

  // Validate dataset ID
  const idValidation = validateDatasetIdParam(datasetId);
  if (!idValidation.isValid) {
    logStructured(
      "error",
      `Invalid dataset ID parameter: ${req.params.id}`,
      "getDatasetHistory",
      "dataset.ctrl.ts"
    );
    return res.status(400).json({
      status: "error",
      message: idValidation.message || "Invalid dataset ID",
      code: idValidation.code || "INVALID_PARAMETER",
    });
  }

  logStructured(
    "processing",
    `fetching dataset history for id: ${datasetId}`,
    "getDatasetHistory",
    "dataset.ctrl.ts"
  );
  logger.debug(`Looking up dataset history with id: ${datasetId}`);

  try {
    const history = await getDatasetChangeHistory(datasetId, req.organizationId!);

    logStructured(
      "successful",
      `dataset history retrieved: ${datasetId}`,
      "getDatasetHistory",
      "dataset.ctrl.ts"
    );
    return res.status(200).json(STATUS_CODE[200](history));
  } catch (error) {
    logStructured(
      "error",
      "failed to retrieve dataset history",
      "getDatasetHistory",
      "dataset.ctrl.ts"
    );
    logger.error("Error in getDatasetHistory:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
