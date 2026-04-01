import { Request, Response } from "express";
import { sequelize } from "../database/db";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import { logEvent } from "../utils/logger/dbLogger";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { generateApiToken } from "../utils/jwt.utils";
import { getUserByIdQuery } from "../utils/user.utils";
import { createApiTokenQuery, deleteApiTokenQuery, getApiTokensQuery } from "../utils/tokens.utils";

export const createApiToken = async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();
  const { name, expires_in_days } = req.body;

  if (!expires_in_days) {
    return res.status(400).json(STATUS_CODE[400]("expires_in_days is required"));
  }

  const expiryDays = parseInt(expires_in_days, 10);
  logStructured('processing', `starting API token creation for ${name} with ${expiryDays} days expiry`, 'createApiToken', 'tokens.ctrl.ts');
  logger.debug(`🛠️ Creating API token: ${name} (expires in ${expiryDays} days)`);
  try {
    const user = await getUserByIdQuery(req.userId!, transaction);
    logStructured('processing', `fetched user ${user.id} for API token creation`, 'createApiToken', 'tokens.ctrl.ts');
    logger.debug(`🔍 Fetched user: ${user.id}`);

    // Generate API token with user-defined expiry
    // Note: tenantId is no longer included in the token payload.
    // The auth middleware reconstructs tenantHash from organizationId.
    const apiToken = generateApiToken({
      id: user.id!,
      email: user.email!,
      roleName: "Admin",
      organizationId: req.organizationId!,
    }, expiryDays) as string;
    logStructured('processing', `generated API token for API token creation`, 'createApiToken', 'tokens.ctrl.ts');
    logger.debug(`🔐 Generated API token for user: ${user.id}`);

    const tokenResponse = await createApiTokenQuery({
      name: name,
      token: apiToken,
      expires_at: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      created_by: req.userId!,
    }, req.organizationId!, transaction);
    logStructured('successful', `created API token ${tokenResponse.id} for user ${user.id}`, 'createApiToken', 'tokens.ctrl.ts');
    logger.debug(`✅ Created API token: ${tokenResponse.id} for user: ${user.id}`);

    await transaction.commit();
    return res.status(201).json(STATUS_CODE[201](tokenResponse));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof ValidationException) {
      logStructured('error', `validation failed: ${error.message}`, 'createApiToken', 'tokens.ctrl.ts');
      await logEvent('Error', `Validation error during API token creation: ${error.message}`, req.userId!, req.organizationId!);
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured('error', `unexpected error: ${name}`, 'createApiToken', 'tokens.ctrl.ts');
    await logEvent('Error', `Unexpected error during API token creation: ${(error as Error).message}`, req.userId!, req.organizationId!);
    logger.error('❌ Error in createApiToken:', error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export const getApiTokens = async (req: Request, res: Response) => {
  logger.debug(`🛠️ Fetching API tokens`);
  logStructured('processing', `starting API tokens fetch`, 'getApiTokens', 'tokens.ctrl.ts');
  try {
    const tokens = await getApiTokensQuery(req.organizationId!);
    logStructured('successful', `fetched ${tokens.length} API tokens`, 'getApiTokens', 'tokens.ctrl.ts');
    logger.debug(`✅ Fetched ${tokens.length} API tokens`);
    return res.status(200).json(STATUS_CODE[200](tokens));
  } catch (error) {
    logStructured('error', `unexpected error fetching API tokens`, 'getApiTokens', 'tokens.ctrl.ts');
    await logEvent('Error', `Unexpected error fetching API tokens: ${(error as Error).message}`, req.userId!, req.organizationId!);
    logger.error('❌ Error in getApiTokens:', error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export const deleteApiToken = async (req: Request, res: Response) => {
  const { id } = req.params;
  logger.debug(`🛠️ Deleting API token: ${id}`);
  logStructured('processing', `starting API token deletion for ${id}`, 'deleteApiToken', 'tokens.ctrl.ts');
  try {
    const success = await deleteApiTokenQuery(parseInt(Array.isArray(id) ? id[0] : id), req.organizationId!);
    if (!success) {
      logStructured('error', `API token not found: ${id}`, 'deleteApiToken', 'tokens.ctrl.ts');
      await logEvent('Error', `API token not found for deletion: ${id}`, req.userId!, req.organizationId!);
      return res.status(404).json(STATUS_CODE[404]({ message: "API token not found" }));
    }
    logStructured('successful', `deleted API token: ${id}`, 'deleteApiToken', 'tokens.ctrl.ts');
    logger.debug(`✅ Deleted API token: ${id}`);
    return res.status(200).json(STATUS_CODE[200]({ message: "API token deleted successfully" }));
  } catch (error) {
    logStructured('error', `unexpected error: ${id}`, 'deleteApiToken', 'tokens.ctrl.ts');
    await logEvent('Error', `Unexpected error during API token deletion: ${(error as Error).message}`, req.userId!, req.organizationId!);
    logger.error('❌ Error in deleteApiToken:', error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
