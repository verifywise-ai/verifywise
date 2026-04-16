/**
 * Controls Hub — master_controls REST controller.
 *
 * Routes wired in `routes/masterControl.route.ts` and registered in
 * `index.ts`. Uses `req.organizationId` from auth middleware for multi-tenant
 * isolation. All mutations are wrapped in a single Sequelize transaction.
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { sequelize } from "../database/db";
import {
  logFailure,
  logProcessing,
  logSuccess,
} from "../utils/logger/logHelper";
import {
  ValidationException,
  BusinessLogicException,
  NotFoundException,
} from "../domain.layer/exceptions/custom.exception";
import { MasterControlModel } from "../domain.layer/models/masterControl/masterControl.model";
import {
  createMasterControlQuery,
  deleteMasterControlQuery,
  getAllMasterControlsQuery,
  getMasterControlByIdQuery,
  updateMasterControlQuery,
} from "../utils/masterControl.utils";

const FILE = "masterControl.ctrl.ts";

export async function getAllMasterControls(
  req: Request,
  res: Response
): Promise<any> {
  logProcessing({
    description: "starting getAllMasterControls",
    functionName: "getAllMasterControls",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    const rows = await getAllMasterControlsQuery(req.organizationId!);
    await logSuccess({
      eventType: "Read",
      description: `Retrieved ${rows.length} master controls`,
      functionName: "getAllMasterControls",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve master controls",
      functionName: "getAllMasterControls",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getMasterControlById(
  req: Request,
  res: Response
): Promise<any> {
  const id = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );
  logProcessing({
    description: `starting getMasterControlById for ID ${id}`,
    functionName: "getMasterControlById",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json(STATUS_CODE[400]("Invalid master control id"));
    }
    const row = await getMasterControlByIdQuery(id, req.organizationId!);
    if (!row) {
      await logSuccess({
        eventType: "Read",
        description: `Master control not found: ID ${id}`,
        functionName: "getMasterControlById",
        fileName: FILE,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(404).json(STATUS_CODE[404]({}));
    }
    await logSuccess({
      eventType: "Read",
      description: `Retrieved master control ID ${id}`,
      functionName: "getMasterControlById",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](row));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: `Failed to retrieve master control ID ${id}`,
      functionName: "getMasterControlById",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function createMasterControl(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const body = req.body ?? {};
  logProcessing({
    description: "starting createMasterControl",
    functionName: "createMasterControl",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    const model = await MasterControlModel.createNewMasterControl(
      body.title,
      body.description ?? null,
      body.status ?? "Waiting",
      body.risk_review ?? null,
      body.owner ?? null,
      body.reviewer ?? null,
      body.approver ?? null,
      body.due_date ?? null,
      body.implementation_details ?? null,
      false
    );
    await model.validateMasterControlData();

    const created = await createMasterControlQuery(
      model,
      req.organizationId!,
      transaction
    );

    await transaction.commit();
    await logSuccess({
      eventType: "Create",
      description: `Created master control: ${created.title} (ID ${created.id})`,
      functionName: "createMasterControl",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(201).json(STATUS_CODE[201](created));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Create",
        description: `Validation failed: ${error.message}`,
        functionName: "createMasterControl",
        fileName: FILE,
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Create",
        description: `Business logic error: ${error.message}`,
        functionName: "createMasterControl",
        fileName: FILE,
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](error.message));
    }
    await logFailure({
      eventType: "Create",
      description: "Failed to create master control",
      functionName: "createMasterControl",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function updateMasterControl(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const id = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );
  const updateData = req.body ?? {};
  logProcessing({
    description: `starting updateMasterControl for ID ${id}`,
    functionName: "updateMasterControl",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    if (!Number.isFinite(id) || id < 1) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid master control id"));
    }

    const existing = await getMasterControlByIdQuery(id, req.organizationId!);
    if (!existing) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    // Reject mutations on demo rows.
    const instance = new MasterControlModel(existing);
    instance.canBeModified();

    await instance.updateMasterControl(updateData);
    await instance.validateMasterControlData();

    const updated = await updateMasterControlQuery(
      id,
      {
        title: updateData.title,
        description: updateData.description,
        status: updateData.status,
        risk_review: updateData.risk_review,
        owner: updateData.owner,
        reviewer: updateData.reviewer,
        approver: updateData.approver,
        due_date: updateData.due_date,
        implementation_details: updateData.implementation_details,
      },
      req.organizationId!,
      transaction
    );

    await transaction.commit();
    await logSuccess({
      eventType: "Update",
      description: `Updated master control ID ${id}`,
      functionName: "updateMasterControl",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof ValidationException) {
      await logFailure({
        eventType: "Update",
        description: `Validation failed: ${error.message}`,
        functionName: "updateMasterControl",
        fileName: FILE,
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    if (error instanceof BusinessLogicException) {
      await logFailure({
        eventType: "Update",
        description: `Business logic error: ${error.message}`,
        functionName: "updateMasterControl",
        fileName: FILE,
        error: error as Error,
        userId: req.userId!,
        tenantId: req.organizationId!,
      });
      return res.status(403).json(STATUS_CODE[403](error.message));
    }
    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404](error.message));
    }
    await logFailure({
      eventType: "Update",
      description: `Failed to update master control ID ${id}`,
      functionName: "updateMasterControl",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function deleteMasterControl(
  req: Request,
  res: Response
): Promise<any> {
  const transaction = await sequelize.transaction();
  const id = parseInt(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );
  logProcessing({
    description: `starting deleteMasterControl for ID ${id}`,
    functionName: "deleteMasterControl",
    fileName: FILE,
    userId: req.userId!,
    tenantId: req.organizationId!,
  });
  try {
    if (!Number.isFinite(id) || id < 1) {
      await transaction.rollback();
      return res.status(400).json(STATUS_CODE[400]("Invalid master control id"));
    }

    const existing = await getMasterControlByIdQuery(id, req.organizationId!);
    if (!existing) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    // Reject deletes on demo rows.
    new MasterControlModel(existing).canBeModified();

    const ok = await deleteMasterControlQuery(
      id,
      req.organizationId!,
      transaction
    );
    if (!ok) {
      await transaction.rollback();
      return res.status(404).json(STATUS_CODE[404]({}));
    }

    await transaction.commit();
    await logSuccess({
      eventType: "Delete",
      description: `Deleted master control ID ${id}`,
      functionName: "deleteMasterControl",
      fileName: FILE,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(200).json(STATUS_CODE[200]({ id }));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof BusinessLogicException) {
      return res.status(403).json(STATUS_CODE[403](error.message));
    }
    await logFailure({
      eventType: "Delete",
      description: `Failed to delete master control ID ${id}`,
      functionName: "deleteMasterControl",
      fileName: FILE,
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
