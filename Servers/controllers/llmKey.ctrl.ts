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
  getLLMKeyWithKeyByIdQuery,
  getLLMProviderUrl,
  isValidLLMProvider,
  updateLLMKeyByIdQuery,
} from "../utils/llmKey.utils";
import { ILLMKey, LLMProvider } from "../domain.layer/interfaces/i.llmKey";
import { resetVulnerabilityConsentOnProviderChangeQuery } from "../utils/aiDetectionRiskScoring.utils";
import { LLMKeyToVerify, verifyLLMKey } from "../services/llmKeyVerification";

import { translateError } from "../utils/i18n.utils";
import { roleHasPermission } from "../utils/rolePermissions.utils";
import { BUILTIN_ROLE_PERMISSIONS } from "../config/rolePermissions.config";
const fileName = "llmKey.ctrl.ts";

/**
 * Only the scheme and host of a provider URL. A credential can sit in the
 * user info, query string, path or fragment, and readers without
 * llmKeys.admin only need to see which endpoint is used.
 */
const urlOrigin = (url: string | null | undefined): string | null | undefined => {
  if (!url) return url;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/**
 * A Custom provider's credentials usually sit in its headers, and sometimes
 * in its URL (user:token@, ?api-key=, a path segment), so only roles that
 * manage keys (llmKeys.admin) see them. Everyone else gets the rest of the
 * row: the Advisor, reporting and Start here only need to know a key exists
 * and which provider/model it is. Built-in providers' URLs are fixed public
 * constants and stay as they are.
 *
 * If the permission lookup fails, the built-in role matrix (no database)
 * decides, so an Admin still gets full data: the edit form would otherwise
 * load the masked values and save them back over the real ones.
 */
const hideCredentialsUnlessManager = async <
  T extends { name?: string; custom_headers?: unknown; url?: string | null },
>(
  req: Request,
  keys: T[],
): Promise<T[]> => {
  let canManage: boolean;
  try {
    canManage = await roleHasPermission(req.organizationId ?? null, req.role!, "llmKeys.admin");
  } catch (error) {
    logger.error("Could not resolve llmKeys.admin; using the built-in role matrix:", error);
    canManage = BUILTIN_ROLE_PERMISSIONS[req.role!]?.has("llmKeys.admin") ?? false;
  }
  if (canManage) return keys;
  return keys.map((key) =>
    key.name === "Custom"
      ? { ...key, custom_headers: null, url: urlOrigin(key.url) }
      : { ...key, custom_headers: null },
  );
};

/**
 * Validate that custom_headers is a plain object with string keys and string values.
 */
function isValidCustomHeaders(headers: unknown): headers is Record<string, string> {
  if (typeof headers !== "object" || headers === null || Array.isArray(headers)) return false;
  return Object.entries(headers).every(([k, v]) => typeof k === "string" && typeof v === "string");
}

export const getLLMKeyStatus = async (req: Request, res: Response) => {
  const functionName = "getLLMKeyStatus";

  logStructured("processing", `starting LLM Key status check`, functionName, fileName);
  try {
    const llmKeys = await getLLMKeysQuery(req.organizationId!);
    const providers = [...new Set(llmKeys.map((k: any) => k.name as string))];
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
      }),
    );
  } catch (error) {
    logStructured("error", `unexpected error checking LLM Key status`, functionName, fileName);
    logger.error("Error in getLLMKeyStatus:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};

export const getLLMKeys = async (req: Request, res: Response) => {
  const functionName = "getLLMKeys";

  logger.debug(`Fetching LLM Keys`);
  logStructured("processing", `starting LLM Keys fetch`, functionName, fileName);
  try {
    const llmKeys = await hideCredentialsUnlessManager(
      req,
      await getLLMKeysQuery(req.organizationId!),
    );
    logStructured("successful", `fetched ${llmKeys.length} LLM Keys`, functionName, fileName);
    logger.debug(`Fetched ${llmKeys.length} LLM Keys`);
    return res.status(200).json(STATUS_CODE[200](llmKeys));
  } catch (error) {
    logStructured("error", `unexpected error fetching LLM Keys`, functionName, fileName);
    await logEvent(
      "Error",
      `Unexpected error fetching LLM Keys: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("Error in getLLMKeys:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};

export const getLLMKey = async (req: Request, res: Response) => {
  const functionName = "getLLMKey";

  logger.debug(`Fetching LLM Keys`);
  logStructured("processing", `starting LLM Key fetch`, functionName, fileName);
  try {
    const name = req.params.name as string;
    const llmKey = await hideCredentialsUnlessManager(
      req,
      await getLLMKeyQuery(req.organizationId!, name),
    );
    logStructured("successful", `fetched LLM Key`, functionName, fileName);
    logger.debug(`Fetched LLM Key with name: ${name}`);
    return res.status(200).json(STATUS_CODE[200](llmKey));
  } catch (error) {
    logStructured("error", `unexpected error fetching LLM Key`, functionName, fileName);
    await logEvent(
      "Error",
      `Unexpected error fetching LLM Key: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("Error in getLLMKey:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};

/**
 * The v1 writes check the key with its provider before saving
 * (`services/llmKeyVerification.ts`). The legacy /api/llm-keys writes keep
 * their contract (ADR 0001) and save without a check.
 */
interface WriteOptions {
  verify: boolean;
}

/**
 * Check the key and send the refusal when it fails. Returns true when a
 * response was sent. A rejection is a 400; "could not check" is a 409 unless
 * the body says skip_verification: true, in which case the save goes on.
 */
const refuseUnverifiedKey = async (
  req: Request,
  res: Response,
  input: LLMKeyToVerify,
): Promise<boolean> => {
  const result = await verifyLLMKey(input);
  if (result.ok) return false;
  const { code } = result;
  if (code === "unreachable") {
    if (req.body?.skip_verification === true) return false;
    res.status(409).json(
      STATUS_CODE[409]({
        message: req.t!("Could not reach {provider} to check this key.", {
          provider: input.name === "Custom" ? req.t!("the endpoint") : input.name,
        }),
        code,
      }),
    );
    return true;
  }
  const message =
    code === "workspace_required"
      ? req.t!(
          "This Anthropic key is not tied to a workspace. Create the key inside a workspace in the Anthropic Console, or enter the workspace ID.",
        )
      : code === "model_unavailable"
        ? req.t!("This key cannot use {model}. Choose another model.", { model: input.model })
        : req.t!("The provider rejected this key. Check that you copied all of it.");
  res.status(400).json(STATUS_CODE[400]({ message, code }));
  return true;
};

export const createLLMKey = (req: Request, res: Response) =>
  createLLMKeyWith(req, res, { verify: false });

/** POST /api/v1/llm-keys: the key is checked with its provider first. */
export const createLLMKeyV1 = (req: Request, res: Response) =>
  createLLMKeyWith(req, res, { verify: true });

const createLLMKeyWith = async (req: Request, res: Response, { verify }: WriteOptions) => {
  const functionName = "createLLMKey";

  const { name, key, model, url: userUrl, custom_headers } = req.body;

  if (!name || typeof name !== "string" || !key || typeof key !== "string") {
    return res.status(400).json(STATUS_CODE[400](req.t!("Name and key are required")));
  }

  // Validate that name is a valid LLM provider
  if (!isValidLLMProvider(name)) {
    return res
      .status(400)
      .json(
        STATUS_CODE[400](
          req.t!("Invalid provider name. Must be one of: Anthropic, OpenAI, OpenRouter, Custom"),
        ),
      );
  }

  // For Custom provider, URL is required
  if (name === "Custom") {
    if (!userUrl || typeof userUrl !== "string") {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Endpoint URL is required for Custom provider")));
    }
  }

  // Validate custom_headers if provided
  if (custom_headers !== undefined && custom_headers !== null) {
    if (!isValidCustomHeaders(custom_headers)) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            req.t!("custom_headers must be an object with string keys and string values"),
          ),
        );
    }
  }

  // For Custom provider, use user-provided URL; otherwise auto-populate
  const url = name === "Custom" ? userUrl : getLLMProviderUrl(name as LLMProvider);

  // Checked before the transaction opens: the provider can take seconds.
  if (verify) {
    try {
      const refused = await refuseUnverifiedKey(req, res, {
        name: name as LLMProvider,
        key,
        model: typeof model === "string" ? model : "",
        url,
        custom_headers: custom_headers || null,
      });
      if (refused) {
        logStructured("error", `LLM Key for ${name} failed verification`, functionName, fileName);
        return;
      }
    } catch (error) {
      logger.error("Error verifying LLM key:", error);
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  }

  const transaction = await sequelize.transaction();
  logStructured("processing", `starting LLM Key creation for ${name}`, functionName, fileName);
  logger.debug(`Creating LLM Key: ${name}`);
  try {
    const data: ILLMKey = {
      name: name as LLMProvider,
      key,
      url,
      model,
      custom_headers: custom_headers || null,
    };
    const llmKey = await createLLMKeyQuery(data, req.organizationId!, transaction);
    logStructured("successful", `created LLM Key ${llmKey.id}`, functionName, fileName);
    logger.debug(`Created LLM Key: ${llmKey.id}`);

    await transaction.commit();
    return res.status(201).json(STATUS_CODE[201](llmKey));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof ValidationException) {
      logStructured("error", `validation failed: ${error.message}`, functionName, fileName);
      await logEvent(
        "Error",
        `Validation error during LLM Key creation: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }
    if (error instanceof UniqueConstraintError) {
      logStructured("error", `duplicate API key value`, functionName, fileName);
      await logEvent(
        "Error",
        `Duplicate API key value during LLM Key creation`,
        req.userId!,
        req.organizationId!,
      );
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            req.t!(
              "This API key is already configured. Please use a different API key or edit the existing entry.",
            ),
          ),
        );
    }
    logStructured("error", `unexpected error: ${name}`, functionName, fileName);
    await logEvent(
      "Error",
      `Unexpected error during LLM Key creation: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("Error in createLLMKey:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};

export const updateLLMKey = (req: Request, res: Response) =>
  updateLLMKeyWith(req, res, { verify: false });

/** PATCH /api/v1/llm-keys/:id: a change to the key, provider, URL, model or headers is checked first. */
export const updateLLMKeyV1 = (req: Request, res: Response) =>
  updateLLMKeyWith(req, res, { verify: true });

const updateLLMKeyWith = async (req: Request, res: Response, { verify }: WriteOptions) => {
  const functionName = "updateLLMKey";

  const { name, key, model, url: userUrl, custom_headers } = req.body;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);

  // Validate that name is a valid LLM provider if provided
  if (name && !isValidLLMProvider(name)) {
    return res
      .status(400)
      .json(
        STATUS_CODE[400](
          req.t!("Invalid provider name. Must be one of: Anthropic, OpenAI, OpenRouter, Custom"),
        ),
      );
  }

  // For Custom provider, URL is required
  if (name === "Custom" && userUrl !== undefined) {
    if (typeof userUrl !== "string" || !userUrl) {
      return res
        .status(400)
        .json(STATUS_CODE[400](req.t!("Endpoint URL is required for Custom provider")));
    }
  }

  // Validate custom_headers if provided
  if (custom_headers !== undefined && custom_headers !== null) {
    if (!isValidCustomHeaders(custom_headers)) {
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            req.t!("custom_headers must be an object with string keys and string values"),
          ),
        );
    }
  }

  // For Custom provider, use user-provided URL; otherwise auto-populate
  let url: string | undefined;
  if (name === "Custom") {
    url = userUrl;
  } else if (name) {
    url = getLLMProviderUrl(name as LLMProvider);
  }

  // A change to anything the provider sees is checked against the key as it
  // will be saved: the request's fields over the stored ones. Before the
  // transaction opens, since the provider can take seconds.
  const changesWhatProviderSees =
    name !== undefined ||
    key !== undefined ||
    userUrl !== undefined ||
    model !== undefined ||
    custom_headers !== undefined;
  if (verify && changesWhatProviderSees) {
    try {
      const stored = await getLLMKeyWithKeyByIdQuery(id, req.organizationId!);
      if (!stored) {
        logStructured("error", `LLM Key not found for update: ID ${id}`, functionName, fileName);
        return res.status(404).json(STATUS_CODE[404]({}));
      }
      const refused = await refuseUnverifiedKey(req, res, {
        name: (name || stored.name) as LLMProvider,
        key: key || stored.key,
        model: model || stored.model,
        url: url !== undefined ? url : stored.url,
        custom_headers:
          custom_headers !== undefined ? custom_headers || null : stored.custom_headers,
      });
      if (refused) {
        logStructured("error", `LLM Key ${id} failed verification`, functionName, fileName);
        return;
      }
    } catch (error) {
      logger.error("Error verifying LLM key:", error);
      return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  }

  const transaction = await sequelize.transaction();
  logStructured("processing", `starting LLM Key update for ${name}`, functionName, fileName);
  logger.debug(`Updating LLM Key: ${name}`);
  try {
    const data: Partial<ILLMKey> = {
      ...(name && { name: name as LLMProvider }),
      ...(key && { key }),
      ...(url !== undefined && { url }),
      ...(model && { model }),
      ...(custom_headers !== undefined && { custom_headers: custom_headers || null }),
    };
    // A different provider or endpoint invalidates AI Detection's consent to
    // send code through this key; compare against the stored values first.
    await resetVulnerabilityConsentOnProviderChangeQuery(
      id,
      req.organizationId!,
      { name: data.name, url: data.url },
      transaction,
    );
    const llmKey = await updateLLMKeyByIdQuery(id, data, req.organizationId!, transaction);

    if (llmKey) {
      logStructured("successful", `updated LLM Key ${id}`, functionName, fileName);
      logger.debug(`updated LLM Key: ${id}`);

      await transaction.commit();
      return res.status(200).json(STATUS_CODE[200](llmKey));
    }

    await transaction.rollback();
    logStructured("error", `LLM Key not found for update: ID ${id}`, functionName, fileName);

    return res.status(404).json(STATUS_CODE[404]({}));
  } catch (error) {
    await transaction.rollback();
    if (error instanceof ValidationException) {
      logStructured("error", `validation failed: ${error.message}`, functionName, fileName);
      await logEvent(
        "Error",
        `Validation error during LLM Key update: ${error.message}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(400).json(STATUS_CODE[400](translateError(req, error)));
    }
    if (error instanceof UniqueConstraintError) {
      logStructured("error", `duplicate API key value`, functionName, fileName);
      await logEvent(
        "Error",
        `Duplicate API key value during LLM Key update`,
        req.userId!,
        req.organizationId!,
      );
      return res
        .status(400)
        .json(
          STATUS_CODE[400](
            req.t!("This API key is already configured. Please use a different API key."),
          ),
        );
    }
    logStructured("error", `unexpected error: ${name}`, functionName, fileName);
    await logEvent(
      "Error",
      `Unexpected error during LLM Key update: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("Error in updateLLMKey:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};

export const deleteLLMKey = async (req: Request, res: Response) => {
  const functionName = "deleteLLMKey";

  const { id } = req.params;
  logger.debug(`Deleting LLM Key: ${id}`);
  logStructured("processing", `starting LLM Key deletion for ${id}`, functionName, fileName);
  try {
    const idValue = Array.isArray(id) ? id[0] : id;
    const success = await deleteLLMKeyQuery(parseInt(idValue), req.organizationId!);
    if (!success) {
      logStructured("error", `LLM Key not found: ${id}`, functionName, fileName);
      await logEvent(
        "Error",
        `LLM Key not found for deletion: ${id}`,
        req.userId!,
        req.organizationId!,
      );
      await logEvent(
        "Error",
        `LLM Key not found for deletion: ${id}`,
        req.userId!,
        req.organizationId!,
      );
      return res.status(404).json(STATUS_CODE[404]({ message: req.t!("LLM key not found") }));
    }
    logStructured("successful", `deleted LLM Key: ${id}`, functionName, fileName);
    logger.debug(`Deleted LLM Key: ${id}`);
    return res
      .status(200)
      .json(STATUS_CODE[200]({ message: req.t!("LLM Key deleted successfully") }));
  } catch (error) {
    logStructured("error", `unexpected error: ${id}`, functionName, fileName);
    await logEvent(
      "Error",
      `Unexpected error during LLM Key deletion: ${(error as Error).message}`,
      req.userId!,
      req.organizationId!,
    );
    logger.error("Error in deleteLLMKey:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
};
