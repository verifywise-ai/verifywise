import { Request, Response } from "express";
import { UniqueConstraintError } from "sequelize";
import { sequelize } from "../database/db";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import { logEvent } from "../utils/logger/dbLogger";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  createLLMKeyQuery,
  deleteLLMKeyQuery,
  getLLMKeyQuery,
  getLLMKeysQuery,
  getLLMProviderUrl,
  isValidLLMProvider,
  updateLLMKeyByIdQuery,
} from "../utils/llmKey.utils";
import { ILLMKey, LLMProvider } from "../domain.layer/interfaces/i.llmKey";

const fileName = "llmKey.ctrl.ts";

/**
 * Validate that custom_headers is a plain object with string keys and string values.
 */
function isValidCustomHeaders(
  headers: unknown
): headers is Record<string, string> {
  if (typeof headers !== "object" || headers === null || Array.isArray(headers))
    return false;
  return Object.entries(headers).every(
    ([k, v]) => typeof k === "string" && typeof v === "string"
  );
}

export const getLLMKeyStatus = async (req: Request, res: Response) => {
  const functionName = "getLLMKeyStatus";

  logStructured(
    "processing",
    `starting LLM Key status check`,
    functionName,
    fileName,
  );
  try {
    const llmKeys = await getLLMKeysQuery(req.organizationId!);
    const providers = [
      ...new Set(llmKeys.map((k: any) => k.name as string)),
    ];
    logStructured(
      "successful",
      `LLM Key status: ${llmKeys.length} keys found`,
      functionName,
      fileName,
    );
    return res.status(200).json(
      STATUS_CODE[200]({
        hasKeys: llmKeys.length > 0,
        keyCount: llmKeys.length,
        providers,
      })
    );
  } catch (error) {
    logStructured(
      "error",
      `unexpected error checking LLM Key status`,
      functionName,
      fileName,
    );
    logger.error("Error in getLLMKeyStatus:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const getLLMKeys = async (req: Request, res: Response) => {
  const functionName = "getLLMKeys";

  logger.debug(`Fetching LLM Keys`);
  logStructured(
    "processing",
    `starting LLM Keys fetch`,
    functionName,
    fileName,
  );
  try {
    const llmKeys = await getLLMKeysQuery(req.organizationId!);
    logStructured(
      "successful",
      `fetched ${llmKeys.length} LLM Keys`,
      functionName,
      fileName,
    );
    logger.debug(`Fetched ${llmKeys.length} LLM Keys`);
    return res.status(200).json(STATUS_CODE[200](llmKeys));
  } catch (error) {
    logStructured(
      "error",
      `unexpected error fetching LLM Keys`,
      functionName,
      fileName,
    );
    await logEvent(
      "Error",
      `Unexpected error fetching LLM Keys: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("Error in getLLMKeys:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const getLLMKey = async (req: Request, res: Response) => {
  const functionName = "getLLMKey";

  logger.debug(`Fetching LLM Keys`);
  logStructured("processing", `starting LLM Key fetch`, functionName, fileName);
  try {
    const name = req.params.name as string;
    const llmKey = await getLLMKeyQuery(req.organizationId!, name);
    logStructured("successful", `fetched LLM Key`, functionName, fileName);
    logger.debug(`Fetched LLM Key with name: ${name}`);
    return res.status(200).json(STATUS_CODE[200](llmKey));
  } catch (error) {
    logStructured(
      "error",
      `unexpected error fetching LLM Key`,
      functionName,
      fileName,
    );
    await logEvent(
      "Error",
      `Unexpected error fetching LLM Key: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("Error in getLLMKey:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const createLLMKey = async (req: Request, res: Response) => {
  const functionName = "createLLMKey";

  const transaction = await sequelize.transaction();
  const { name, key, model, url: userUrl, custom_headers } = req.body;

  if (!name || typeof name !== "string" || !key || typeof key !== "string") {
    await transaction.rollback();
    return res.status(400).json(STATUS_CODE[400]("Name and key are required"));
  }

  // Validate that name is a valid LLM provider
  if (!isValidLLMProvider(name)) {
    await transaction.rollback();
    return res
      .status(400)
      .json(
        STATUS_CODE[400](
          "Invalid provider name. Must be one of: Anthropic, OpenAI, OpenRouter, Custom",
        ),
      );
  }

  // For Custom provider, URL is required
  if (name === "Custom") {
    if (!userUrl || typeof userUrl !== "string") {
      await transaction.rollback();
      return res
        .status(400)
        .json(STATUS_CODE[400]("Endpoint URL is required for Custom provider"));
    }
  }

  // Validate custom_headers if provided
  if (custom_headers !== undefined && custom_headers !== null) {
    if (!isValidCustomHeaders(custom_headers)) {
      await transaction.rollback();
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            "custom_headers must be an object with string keys and string values"
          )
        );
    }
  }

  logStructured(
    "processing",
    `starting LLM Key creation for ${name}`,
    functionName,
    fileName,
  );
  logger.debug(`Creating LLM Key: ${name}`);
  try {
    // For Custom provider, use user-provided URL; otherwise auto-populate
    const url =
      name === "Custom" ? userUrl : getLLMProviderUrl(name as LLMProvider);

    const data: ILLMKey = {
      name: name as LLMProvider,
      key,
      url,
      model,
      custom_headers: custom_headers || null,
    };
    const llmKey = await createLLMKeyQuery(data, req.organizationId!, transaction);
    logStructured(
      "successful",
      `created LLM Key ${llmKey.id}`,
      functionName,
      fileName,
    );
    logger.debug(`Created LLM Key: ${llmKey.id}`);

    await transaction.commit();
    return res.status(201).json(STATUS_CODE[201](llmKey));
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
        `Validation error during LLM Key creation: ${error.message}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    if (error instanceof UniqueConstraintError) {
      logStructured(
        "error",
        `duplicate API key value`,
        functionName,
        fileName,
      );
      await logEvent(
        "Error",
        `Duplicate API key value during LLM Key creation`,
        req.userId!,
        req.organizationId!
      );
      return res.status(400).json(STATUS_CODE[400](`This API key is already configured. Please use a different API key or edit the existing entry.`));
    }
    logStructured("error", `unexpected error: ${name}`, functionName, fileName);
    await logEvent(
      "Error",
      `Unexpected error during LLM Key creation: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("Error in createLLMKey:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const updateLLMKey = async (req: Request, res: Response) => {
  const functionName = "updateLLMKey";

  const transaction = await sequelize.transaction();
  const { name, key, model, url: userUrl, custom_headers } = req.body;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  // Validate that name is a valid LLM provider if provided
  if (name && !isValidLLMProvider(name)) {
    await transaction.rollback();
    return res
      .status(400)
      .json(
        STATUS_CODE[400](
          "Invalid provider name. Must be one of: Anthropic, OpenAI, OpenRouter, Custom",
        ),
      );
  }

  // For Custom provider, URL is required
  if (name === "Custom" && userUrl !== undefined) {
    if (typeof userUrl !== "string" || !userUrl) {
      await transaction.rollback();
      return res
        .status(400)
        .json(STATUS_CODE[400]("Endpoint URL is required for Custom provider"));
    }
  }

  // Validate custom_headers if provided
  if (custom_headers !== undefined && custom_headers !== null) {
    if (!isValidCustomHeaders(custom_headers)) {
      await transaction.rollback();
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            "custom_headers must be an object with string keys and string values"
          )
        );
    }
  }

  logStructured(
    "processing",
    `starting LLM Key update for ${name}`,
    functionName,
    fileName,
  );
  logger.debug(`Updating LLM Key: ${name}`);
  try {
    // For Custom provider, use user-provided URL; otherwise auto-populate
    let url: string | undefined;
    if (name === "Custom") {
      url = userUrl;
    } else if (name) {
      url = getLLMProviderUrl(name as LLMProvider);
    }

    const data: Partial<ILLMKey> = {
      ...(name && { name: name as LLMProvider }),
      ...(key && { key }),
      ...(url !== undefined && { url }),
      ...(model && { model }),
      ...(custom_headers !== undefined && { custom_headers: custom_headers || null }),
    };
    const llmKey = await updateLLMKeyByIdQuery(
      id,
      data,
      req.organizationId!,
      transaction,
    );

    if (llmKey) {
      logStructured(
        "successful",
        `updated LLM Key ${id}`,
        functionName,
        fileName,
      );
      logger.debug(`updated LLM Key: ${id}`);

      await transaction.commit();
      return res.status(200).json(STATUS_CODE[200](llmKey));
    }

    await transaction.rollback();
    logStructured(
      "error",
      `LLM Key not found for update: ID ${id}`,
      functionName,
      fileName,
    );

    return res.status(404).json(STATUS_CODE[404]({}));
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
        `Validation error during LLM Key update: ${error.message}`,
        req.userId!,
        req.organizationId!
      );
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    if (error instanceof UniqueConstraintError) {
      logStructured(
        "error",
        `duplicate API key value`,
        functionName,
        fileName,
      );
      await logEvent(
        "Error",
        `Duplicate API key value during LLM Key update`,
        req.userId!,
        req.organizationId!
      );
      return res.status(400).json(STATUS_CODE[400](`This API key is already configured. Please use a different API key.`));
    }
    logStructured("error", `unexpected error: ${name}`, functionName, fileName);
    await logEvent(
      "Error",
      `Unexpected error during LLM Key update: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("Error in updateLLMKey:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};

export const deleteLLMKey = async (req: Request, res: Response) => {
  const functionName = "deleteLLMKey";

  const { id } = req.params;
  logger.debug(`Deleting LLM Key: ${id}`);
  logStructured(
    "processing",
    `starting LLM Key deletion for ${id}`,
    functionName,
    fileName,
  );
  try {
    const idValue = Array.isArray(id) ? id[0] : id;
    const success = await deleteLLMKeyQuery(parseInt(idValue), req.organizationId!);
    if (!success) {
      logStructured(
        "error",
        `LLM Key not found: ${id}`,
        functionName,
        fileName,
      );
      await logEvent("Error", `LLM Key not found for deletion: ${id}`, req.userId!, req.organizationId!);
      return res
        .status(404)
        .json(STATUS_CODE[404]({ message: "LLM Key not found" }));
    }
    logStructured(
      "successful",
      `deleted LLM Key: ${id}`,
      functionName,
      fileName,
    );
    logger.debug(`Deleted LLM Key: ${id}`);
    return res
      .status(200)
      .json(STATUS_CODE[200]({ message: "LLM Key deleted successfully" }));
  } catch (error) {
    logStructured("error", `unexpected error: ${id}`, functionName, fileName);
    await logEvent(
      "Error",
      `Unexpected error during LLM Key deletion: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!
    );
    logger.error("Error in deleteLLMKey:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
};
