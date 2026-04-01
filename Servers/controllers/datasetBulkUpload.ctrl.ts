import { Request, Response } from "express";
import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { DatasetModel } from "../domain.layer/models/dataset/dataset.model";
import { createNewDatasetQuery } from "../utils/dataset.utils";
import { recordDatasetCreation } from "../utils/datasetChangeHistory.utils";
import {
  uploadOrganizationFile,
  createFileEntityLink,
} from "../repositories/file.repository";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { logStructured } from "../utils/logger/fileLogger";

/**
 * Upload one file and create an associated dataset record.
 *
 * Called N times by the client (once per file) to enable per-file progress
 * tracking and avoid massive multipart requests.
 *
 * Request:
 *   - file: multipart file (CSV/XLSX, max 30MB)
 *   - body.metadata: JSON string with dataset metadata fields
 */
export async function uploadDatasetFile(req: Request, res: Response) {
  logStructured(
    "processing",
    "starting dataset bulk upload",
    "uploadDatasetFile",
    "datasetBulkUpload.ctrl.ts"
  );

  if (!req.file) {
    return res.status(400).json(STATUS_CODE[400]("No file provided"));
  }

  let metadata: Record<string, any>;
  try {
    metadata =
      typeof req.body.metadata === "string"
        ? JSON.parse(req.body.metadata)
        : req.body.metadata || {};
  } catch {
    return res
      .status(400)
      .json(STATUS_CODE[400]("Invalid metadata JSON in request body"));
  }

  let transaction: Transaction | null = null;

  try {
    transaction = await sequelize.transaction();

    // 1. Create dataset record
    const dataset = DatasetModel.createNewDataset({
      name: metadata.name || req.file.originalname.replace(/\.[^.]+$/, ""),
      description: metadata.description || "",
      version: metadata.version || "1.0",
      owner: metadata.owner || "",
      type: metadata.type || "Training",
      function: metadata.function || "",
      source: metadata.source || "Bulk Upload",
      license: metadata.license || "",
      format: metadata.format || "",
      classification: metadata.classification || "Internal",
      contains_pii: metadata.contains_pii || false,
      pii_types: metadata.pii_types || "",
      status: metadata.status || "Draft",
      status_date: new Date(),
      known_biases: metadata.known_biases || "",
      bias_mitigation: metadata.bias_mitigation || "",
      collection_method: metadata.collection_method || "",
      preprocessing_steps: metadata.preprocessing_steps || "",
    });

    const savedDataset = await createNewDatasetQuery(
      dataset,
      req.organizationId!,
      metadata.models || [],
      metadata.projects || [],
      transaction
    );

    // 2. Store file blob
    const fileRecord = await uploadOrganizationFile(
      req.file,
      req.userId!,
      req.organizationId!,
      req.organizationId!,
      {
        source: "dataset_bulk_upload",
        transaction,
      }
    );

    // 3. Link file → dataset
    await createFileEntityLink(
      {
        file_id: fileRecord.id,
        framework_type: "general",
        entity_type: "dataset",
        entity_id: savedDataset.id!,
        link_type: "source_data",
        created_by: req.userId,
      },
      req.organizationId!,
      transaction
    );

    // 4. Record change history
    await recordDatasetCreation(
      savedDataset.id!,
      req.userId,
      req.organizationId!,
      transaction
    );

    await transaction.commit();

    logStructured(
      "successful",
      `dataset bulk upload complete: dataset=${savedDataset.id}`,
      "uploadDatasetFile",
      "datasetBulkUpload.ctrl.ts"
    );

    return res.status(201).json(
      STATUS_CODE[201]({
        datasetId: savedDataset.id,
        fileId: fileRecord.id,
      })
    );
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
      "dataset bulk upload failed",
      "uploadDatasetFile",
      "datasetBulkUpload.ctrl.ts"
    );
    console.error("Error in uploadDatasetFile:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
