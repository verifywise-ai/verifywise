import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

/**
 * Linked model and use case ids outside the caller's organization are
 * rejected by the shared dataset utils with a ValidationException. The core
 * dataset routes and the bulk upload extension answer 400, not 500.
 */

const tx = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(async () => tx) },
}));
jest.mock("../../domain.layer/models/dataset/dataset.model", () => ({
  DatasetModel: {
    createNewDataset: jest.fn((fields: object) => fields),
    updateDataset: jest.fn((current: object, fields: object) => ({ ...current, ...fields })),
  },
}));
jest.mock("../../utils/dataset.utils", () => ({
  getDatasetByIdQuery: jest.fn(),
  createNewDatasetQuery: jest.fn(),
  updateDatasetByIdQuery: jest.fn(),
}));
jest.mock("../../utils/datasetChangeHistory.utils", () => ({
  recordDatasetCreation: jest.fn(),
  trackDatasetChanges: jest.fn().mockReturnValue([]),
  recordDatasetFieldChanges: jest.fn(),
}));
jest.mock("../../repositories/file.repository", () => ({
  uploadOrganizationFile: jest.fn(),
  createFileEntityLink: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/logger/logHelper", () => ({ logRollbackFailure: jest.fn() }));
jest.mock("../../utils/validations/datasetValidation.utils", () => ({
  validateCompleteDatasetCreation: jest.fn().mockReturnValue([]),
  validateCompleteDatasetUpdate: jest.fn().mockReturnValue([]),
  validateDatasetIdParam: jest.fn().mockReturnValue({ isValid: true }),
}));

import {
  createNewDatasetQuery,
  getDatasetByIdQuery,
  updateDatasetByIdQuery,
} from "../../utils/dataset.utils";
import { createNewDataset, updateDatasetById } from "../dataset.ctrl";
import { uploadDatasetFile } from "../../extensions/dataset-bulk-upload/datasetBulkUpload.ctrl";
import { uploadOrganizationFile } from "../../repositories/file.repository";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const outsideModel = () =>
  new ValidationException("Linked models must belong to this organization", "models", [9]);

function response() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
}

const req = (partial: Record<string, unknown>) =>
  ({
    organizationId: 1,
    userId: 7,
    t: (key: string) => key,
    params: {},
    body: {},
    ...partial,
  }) as unknown as Request;

describe("dataset links outside the organization", () => {
  beforeEach(() => jest.clearAllMocks());

  it("answers 400 on create and rolls back", async () => {
    (createNewDatasetQuery as jest.Mock).mockRejectedValueOnce(outsideModel() as never);
    const res = response();

    await createNewDataset(req({ body: { name: "Claims", models: [9] } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          message: "Linked models must belong to this organization",
          errors: [
            expect.objectContaining({
              field: "models",
              message: "Linked models must belong to this organization",
            }),
          ],
        }),
      }),
    );
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("answers 400 on update and rolls back", async () => {
    (getDatasetByIdQuery as jest.Mock).mockResolvedValueOnce({
      status_date: new Date(),
      toJSON: () => ({}),
    } as never);
    (updateDatasetByIdQuery as jest.Mock).mockRejectedValueOnce(outsideModel() as never);
    const res = response();

    await updateDatasetById(req({ params: { id: "5" }, body: { models: [9] } }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
  });

  it("answers 400 on bulk upload, stores no file and rolls back", async () => {
    (createNewDatasetQuery as jest.Mock).mockRejectedValueOnce(outsideModel() as never);
    const res = response();

    await uploadDatasetFile(
      req({
        file: { originalname: "claims.csv" },
        body: { metadata: JSON.stringify({ models: [9] }) },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: "Linked models must belong to this organization" }),
    );
    expect(uploadOrganizationFile).not.toHaveBeenCalled();
    expect(tx.rollback).toHaveBeenCalled();
  });

  it("still answers 500 on an unexpected error", async () => {
    (createNewDatasetQuery as jest.Mock).mockRejectedValueOnce(new Error("db down") as never);
    const res = response();

    await createNewDataset(req({ body: { name: "Claims" } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
