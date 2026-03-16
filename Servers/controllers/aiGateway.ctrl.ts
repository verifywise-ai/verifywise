import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import {
  ValidationException,
} from "../domain.layer/exceptions/custom.exception";
import { recordEntityChange } from "../utils/changeHistory.base.utils";
import { notifyConfigChange } from "../services/aiGateway/aiGatewayNotifications";
import { pipeStreamWithCleanup } from "../utils/streamCleanup.utils";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Guardrail utils
import {
  getAllGuardrailsQuery,
  createGuardrailQuery,
  updateGuardrailQuery,
  deleteGuardrailQuery,
  getGuardrailSettingsQuery,
  upsertGuardrailSettingsQuery,
  getGuardrailLogsQuery,
  getGuardrailStatsQuery,
  getGuardrailStatsByTypeQuery,
  getGuardrailStatsByDayQuery,
  purgeGuardrailLogsQuery,
  getActiveGuardrailsQuery,
} from "../utils/aiGatewayGuardrail.utils";

// API Key utils
import {
  getAllApiKeysQuery,
  createApiKeyQuery,
  updateApiKeyQuery,
  deleteApiKeyQuery,
} from "../utils/aiGatewayApiKey.utils";

// Virtual Key utils
import {
  generateVirtualKey,
  getAllVirtualKeysQuery,
  createVirtualKeyQuery,
  updateVirtualKeyQuery,
  revokeVirtualKeyQuery,
  deleteVirtualKeyQuery,
} from "../utils/aiGatewayVirtualKey.utils";

// Endpoint utils
import {
  getAllEndpointsQuery,
  getEndpointByIdQuery,
  createEndpointQuery,
  updateEndpointQuery,
  deleteEndpointQuery,
} from "../utils/aiGatewayEndpoint.utils";

// Spend utils
import {
  getSpendSummaryQuery,
  getSpendByModelQuery,
  getSpendByEndpointQuery,
  getSpendByUserQuery,
  getSpendByDayQuery,
  getSpendByTagQuery,
  getSpendLogsDetailQuery,
  ISpendLogFilters,
  purgeSpendLogsQuery,
} from "../utils/aiGatewaySpendLog.utils";

// Budget utils
import {
  getBudgetQuery,
  upsertBudgetQuery,
} from "../utils/aiGatewayBudget.utils";

// Service
import {
  proxyCompletion,
  proxyStream,
  proxyEmbedding,
} from "../services/aiGateway.service";

// Prompt utils
import {
  getAllPromptsQuery,
  getPromptByIdQuery,
  createPromptQuery,
  updatePromptQuery,
  deletePromptQuery,
  createVersionQuery,
  getVersionsQuery,
  publishVersionQuery,
  resolveVariables,
} from "../utils/aiGatewayPrompt.utils";

const fileName = "aiGateway.ctrl.ts";
const ROLE_NAME_TO_ID: Record<string, number> = {
  Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4,
};
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function parseId(raw: string | string[]): number {
  const id = Number(raw);
  if (isNaN(id) || id <= 0) {
    throw new ValidationException("Invalid ID parameter");
  }
  return id;
}

// ─── API Keys ────────────────────────────────────────────────────────────────

export async function getApiKeys(req: Request, res: Response) {
  const fn = "getApiKeys";
  logStructured("processing", "fetching all gateway API keys", fn, fileName);
  try {
    const keys = await getAllApiKeysQuery(req.organizationId!);
    logStructured("successful", "gateway API keys fetched", fn, fileName);
    return res.status(200).json(STATUS_CODE[200](keys));
  } catch (error) {
    logStructured("error", "failed to fetch gateway API keys", fn, fileName);
    logger.error("Error fetching gateway API keys:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function createApiKey(req: Request, res: Response) {
  const fn = "createApiKey";
  logStructured("processing", "creating gateway API key", fn, fileName);
  try {
    const { provider, key_name, api_key } = req.body;
    if (!provider || !key_name || !api_key) {
      throw new ValidationException("provider, key_name, and api_key are required");
    }

    const key = await createApiKeyQuery(req.organizationId!, { provider, key_name, api_key });
    logStructured("successful", `gateway API key created: ${key_name}`, fn, fileName);

    notifyConfigChange(req.organizationId!, Number(req.userId), {
      entityType: "API key", entityName: key_name, action: "created",
      detail: `Provider: ${provider}`,
      actionUrl: `${FRONTEND_URL}/ai-gateway/settings`, actionLabel: "View settings",
    }).catch(() => {});

    return res.status(201).json(STATUS_CODE[201](key));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to create gateway API key", fn, fileName);
    logger.error("Error creating gateway API key:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function updateApiKey(req: Request, res: Response) {
  const fn = "updateApiKey";
  logStructured("processing", "updating gateway API key", fn, fileName);
  try {
    const id = parseId(req.params.id);
    const updated = await updateApiKeyQuery(req.organizationId!, id, req.body);
    if (!updated) {
      return res.status(404).json(STATUS_CODE[404]("API key not found"));
    }
    logStructured("successful", `gateway API key updated: ${id}`, fn, fileName);
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    logStructured("error", "failed to update gateway API key", fn, fileName);
    logger.error("Error updating gateway API key:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function deleteApiKey(req: Request, res: Response) {
  const fn = "deleteApiKey";
  logStructured("processing", "deleting gateway API key", fn, fileName);
  try {
    const id = parseId(req.params.id);
    const deleted = await deleteApiKeyQuery(req.organizationId!, id);
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]("API key not found"));
    }
    logStructured("successful", `gateway API key deleted: ${id}`, fn, fileName);

    notifyConfigChange(req.organizationId!, Number(req.userId), {
      entityType: "API key", entityName: `Key #${id}`, action: "deleted",
      actionUrl: `${FRONTEND_URL}/ai-gateway/settings`, actionLabel: "View settings",
    }).catch(() => {});

    return res.status(200).json(STATUS_CODE[200]({ deleted: true }));
  } catch (error) {
    logStructured("error", "failed to delete gateway API key", fn, fileName);
    logger.error("Error deleting gateway API key:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function verifyApiKey(req: Request, res: Response) {
  const fn = "verifyApiKey";
  try {
    const { provider, apiKey } = req.body;

    if (!provider) {
      return res.status(400).json({ success: false, valid: false, message: "provider is required" });
    }
    if (!apiKey) {
      return res.status(400).json({ success: false, valid: false, message: "apiKey is required" });
    }

    // Provider verification endpoints. gemini maps to Google's API.
    const endpoints: Record<string, { url: string; headers: Record<string, string> }> = {
      openai: {
        url: "https://api.openai.com/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      anthropic: {
        url: "https://api.anthropic.com/v1/models",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      },
      gemini: {
        url: `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
        headers: {},
      },
      xai: {
        url: "https://api.x.ai/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      mistral: {
        url: "https://api.mistral.ai/v1/models",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      openrouter: {
        url: "https://openrouter.ai/api/v1/auth/key",
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    };

    const config = endpoints[provider];
    if (!config) {
      // bedrock, azure, together_ai, cohere, etc. — no simple verification endpoint
      return res.status(200).json({ success: true, valid: true, message: "Provider not configured for verification, assuming valid" });
    }

    try {
      const response = await fetch(config.url, {
        method: "GET",
        headers: { ...config.headers, "Content-Type": "application/json" },
      });

      if (response.ok) {
        return res.status(200).json({ success: true, valid: true, message: "API key verified successfully" });
      } else if (response.status === 401 || response.status === 403) {
        return res.status(200).json({ success: true, valid: false, message: "Invalid API key — authentication failed" });
      } else if (response.status === 400) {
        let errorMsg = "Invalid API key";
        try {
          const data = await response.json();
          errorMsg = data?.error?.message || data?.message || errorMsg;
        } catch { /* ignore */ }
        return res.status(200).json({ success: true, valid: false, message: errorMsg });
      } else if (response.status === 429) {
        return res.status(200).json({ success: true, valid: true, message: "Rate limited — key appears valid" });
      } else {
        return res.status(200).json({ success: true, valid: true, message: "Could not verify key, assuming valid" });
      }
    } catch {
      return res.status(200).json({ success: true, valid: true, message: "Network error during verification, assuming valid" });
    }
  } catch (error: any) {
    logStructured("error", "failed to verify gateway API key", fn, fileName);
    return res.status(500).json({ success: false, valid: false, message: "Internal server error" });
  }
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export async function getEndpoints(req: Request, res: Response) {
  const fn = "getEndpoints";
  logStructured("processing", "fetching all gateway endpoints", fn, fileName);
  try {
    const roleId = ROLE_NAME_TO_ID[(req as any).role] || undefined;
    const endpoints = await getAllEndpointsQuery(req.organizationId!, roleId);
    logStructured("successful", "gateway endpoints fetched", fn, fileName);
    return res.status(200).json(STATUS_CODE[200](endpoints));
  } catch (error) {
    logStructured("error", "failed to fetch gateway endpoints", fn, fileName);
    logger.error("Error fetching gateway endpoints:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function getEndpoint(req: Request, res: Response) {
  const fn = "getEndpoint";
  logStructured("processing", "fetching gateway endpoint", fn, fileName);
  try {
    const id = parseId(req.params.id);
    const endpoint = await getEndpointByIdQuery(req.organizationId!, id);
    if (!endpoint) {
      return res.status(404).json(STATUS_CODE[404]("Endpoint not found"));
    }
    logStructured("successful", `gateway endpoint fetched: ${id}`, fn, fileName);
    return res.status(200).json(STATUS_CODE[200](endpoint));
  } catch (error) {
    logStructured("error", "failed to fetch gateway endpoint", fn, fileName);
    logger.error("Error fetching gateway endpoint:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function createEndpoint(req: Request, res: Response) {
  const fn = "createEndpoint";
  logStructured("processing", "creating gateway endpoint", fn, fileName);
  try {
    const { slug, display_name, provider, model, api_key_id } = req.body;
    if (!slug || !display_name || !provider || !model || !api_key_id) {
      throw new ValidationException("slug, display_name, provider, model, and api_key_id are required");
    }
    if (!SLUG_PATTERN.test(slug)) {
      throw new ValidationException("slug must be lowercase alphanumeric with hyphens (e.g., prod-gpt4o)");
    }

    const endpoint = await createEndpointQuery(req.organizationId!, {
      slug,
      display_name,
      provider,
      model,
      api_key_id,
      max_tokens: req.body.max_tokens,
      temperature: req.body.temperature,
      system_prompt: req.body.system_prompt,
      rate_limit_rpm: req.body.rate_limit_rpm,
    });
    logStructured("successful", `gateway endpoint created: ${slug}`, fn, fileName);

    notifyConfigChange(req.organizationId!, Number(req.userId), {
      entityType: "Endpoint", entityName: display_name, action: "created",
      detail: `Provider: ${provider}, Model: ${model}, Slug: ${slug}`,
      actionUrl: `${FRONTEND_URL}/ai-gateway/endpoints`, actionLabel: "View endpoints",
    }).catch(() => {});

    return res.status(201).json(STATUS_CODE[201](endpoint));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to create gateway endpoint", fn, fileName);
    logger.error("Error creating gateway endpoint:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function updateEndpoint(req: Request, res: Response) {
  const fn = "updateEndpoint";
  logStructured("processing", "updating gateway endpoint", fn, fileName);
  try {
    const id = parseId(req.params.id);
    if (req.body.slug && !SLUG_PATTERN.test(req.body.slug)) {
      throw new ValidationException("slug must be lowercase alphanumeric with hyphens (e.g., prod-gpt4o)");
    }
    // Read current values for change history
    const before = await getEndpointByIdQuery(req.organizationId!, id);
    const updated = await updateEndpointQuery(req.organizationId!, id, req.body);
    if (!updated) {
      return res.status(404).json(STATUS_CODE[404]("Endpoint not found"));
    }

    // Record changes
    if (before) {
      for (const field of Object.keys(req.body)) {
        const oldVal = String((before as any)[field] ?? "");
        const newVal = String((updated as any)[field] ?? "");
        if (oldVal !== newVal) {
          await recordEntityChange("ai_gateway_endpoint", id, "updated", Number(req.userId), req.organizationId!, field, oldVal, newVal).catch(() => {});
        }
      }
    }

    logStructured("successful", `gateway endpoint updated: ${id}`, fn, fileName);

    // Notify on toggle or significant changes
    if (req.body.is_active !== undefined) {
      notifyConfigChange(req.organizationId!, Number(req.userId), {
        entityType: "Endpoint", entityName: updated.display_name || `Endpoint #${id}`,
        action: req.body.is_active ? "enabled" : "disabled",
        actionUrl: `${FRONTEND_URL}/ai-gateway/endpoints`, actionLabel: "View endpoints",
      }).catch(() => {});
    }

    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to update gateway endpoint", fn, fileName);
    logger.error("Error updating gateway endpoint:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function deleteEndpoint(req: Request, res: Response) {
  const fn = "deleteEndpoint";
  logStructured("processing", "deleting gateway endpoint", fn, fileName);
  try {
    const id = parseId(req.params.id);
    const deleted = await deleteEndpointQuery(req.organizationId!, id);
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]("Endpoint not found"));
    }
    logStructured("successful", `gateway endpoint deleted: ${id}`, fn, fileName);

    notifyConfigChange(req.organizationId!, Number(req.userId), {
      entityType: "Endpoint", entityName: `Endpoint #${id}`, action: "deleted",
      actionUrl: `${FRONTEND_URL}/ai-gateway/endpoints`, actionLabel: "View endpoints",
    }).catch(() => {});

    return res.status(200).json(STATUS_CODE[200]({ deleted: true }));
  } catch (error) {
    logStructured("error", "failed to delete gateway endpoint", fn, fileName);
    logger.error("Error deleting gateway endpoint:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

// ─── Spend ───────────────────────────────────────────────────────────────────

function getDateRange(period: string): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  switch (period) {
    case "1d":
      start.setDate(start.getDate() - 1);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    case "90d":
      start.setDate(start.getDate() - 90);
      break;
    default:
      start.setDate(start.getDate() - 7);
  }
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

export async function getSpendSummary(req: Request, res: Response) {
  const fn = "getSpendSummary";
  logStructured("processing", "fetching spend summary", fn, fileName);
  try {
    const period = (req.query.period as string) || "7d";
    const { startDate, endDate } = getDateRange(period);
    const [summary, byDay, byModel] = await Promise.all([
      getSpendSummaryQuery(req.organizationId!, startDate, endDate),
      getSpendByDayQuery(req.organizationId!, startDate, endDate, period),
      getSpendByModelQuery(req.organizationId!, startDate, endDate),
    ]);

    logStructured("successful", "spend summary fetched", fn, fileName);
    return res.status(200).json(STATUS_CODE[200]({ summary, byDay, byModel }));
  } catch (error) {
    logStructured("error", "failed to fetch spend summary", fn, fileName);
    logger.error("Error fetching spend summary:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function getSpendByEndpoint(req: Request, res: Response) {
  const fn = "getSpendByEndpoint";
  logStructured("processing", "fetching spend by endpoint", fn, fileName);
  try {
    const period = (req.query.period as string) || "7d";
    const { startDate, endDate } = getDateRange(period);
    const data = await getSpendByEndpointQuery(req.organizationId!, startDate, endDate);
    logStructured("successful", "spend by endpoint fetched", fn, fileName);
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    logStructured("error", "failed to fetch spend by endpoint", fn, fileName);
    logger.error("Error fetching spend by endpoint:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function getSpendByUser(req: Request, res: Response) {
  const fn = "getSpendByUser";
  logStructured("processing", "fetching spend by user", fn, fileName);
  try {
    const period = (req.query.period as string) || "7d";
    const { startDate, endDate } = getDateRange(period);
    const data = await getSpendByUserQuery(req.organizationId!, startDate, endDate);
    logStructured("successful", "spend by user fetched", fn, fileName);
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    logStructured("error", "failed to fetch spend by user", fn, fileName);
    logger.error("Error fetching spend by user:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function getSpendLogs(req: Request, res: Response) {
  const fn = "getSpendLogs";
  logStructured("processing", "fetching spend logs", fn, fileName);
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    // Build optional filters from query params
    const filters: Partial<ISpendLogFilters> = {};

    if (req.query.endpoint_id) {
      const eid = Number(req.query.endpoint_id);
      if (!isNaN(eid) && eid > 0) filters.endpoint_id = eid;
    }

    if (req.query.status === "success" || req.query.status === "error") {
      filters.status = req.query.status;
    }

    if (req.query.source === "playground" || req.query.source === "virtual-key") {
      filters.source = req.query.source;
    }

    if (req.query.start_date && !isNaN(Date.parse(req.query.start_date as string))) {
      filters.start_date = req.query.start_date as string;
    }

    if (req.query.end_date && !isNaN(Date.parse(req.query.end_date as string))) {
      filters.end_date = req.query.end_date as string;
    }

    if (req.query.search && typeof req.query.search === "string" && req.query.search.trim()) {
      filters.search = req.query.search.trim();
    }

    const hasFilters = Object.keys(filters).length > 0;
    const { rows, total } = await getSpendLogsDetailQuery(
      req.organizationId!,
      limit,
      offset,
      hasFilters ? filters : undefined
    );

    logStructured("successful", `spend logs fetched: ${rows.length} of ${total}`, fn, fileName);
    return res.status(200).json(STATUS_CODE[200]({ rows, total }));
  } catch (error) {
    logStructured("error", "failed to fetch spend logs", fn, fileName);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function purgeSpendLogs(req: Request, res: Response) {
  const fn = "purgeSpendLogs";
  logStructured("processing", "purging old spend logs", fn, fileName);
  try {
    const settings = await getGuardrailSettingsQuery(req.organizationId!);
    const retentionDays = (settings as any)?.log_retention_days || 90;
    const deleted = await purgeSpendLogsQuery(req.organizationId!, retentionDays);
    logStructured("successful", `purged ${deleted} spend logs`, fn, fileName);
    return res.status(200).json(STATUS_CODE[200]({ deleted_count: deleted }));
  } catch (error) {
    logStructured("error", "failed to purge spend logs", fn, fileName);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function getSpendByTag(req: Request, res: Response) {
  const fn = "getSpendByTag";
  logStructured("processing", "fetching spend by tag", fn, fileName);
  try {
    const period = (req.query.period as string) || "7d";
    const tagKey = (req.query.tag as string) || "department";
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tagKey)) {
      return res.status(400).json(STATUS_CODE[400]("Invalid tag key"));
    }
    const { startDate, endDate } = getDateRange(period);
    const data = await getSpendByTagQuery(req.organizationId!, tagKey, startDate, endDate);
    logStructured("successful", "spend by tag fetched", fn, fileName);
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    logStructured("error", "failed to fetch spend by tag", fn, fileName);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

// ─── Budget ──────────────────────────────────────────────────────────────────

export async function getBudget(req: Request, res: Response) {
  const fn = "getBudget";
  logStructured("processing", "fetching gateway budget", fn, fileName);
  try {
    const budget = await getBudgetQuery(req.organizationId!);
    logStructured("successful", "gateway budget fetched", fn, fileName);
    return res.status(200).json(STATUS_CODE[200](budget));
  } catch (error) {
    logStructured("error", "failed to fetch gateway budget", fn, fileName);
    logger.error("Error fetching gateway budget:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function upsertBudget(req: Request, res: Response) {
  const fn = "upsertBudget";
  logStructured("processing", "upserting gateway budget", fn, fileName);
  try {
    const monthly_limit_usd = Number(req.body.monthly_limit_usd);
    if (isNaN(monthly_limit_usd) || monthly_limit_usd <= 0) {
      throw new ValidationException("monthly_limit_usd must be a positive number");
    }

    const alert_threshold_pct = Number(req.body.alert_threshold_pct ?? 80);
    if (isNaN(alert_threshold_pct) || alert_threshold_pct < 0 || alert_threshold_pct > 100) {
      throw new ValidationException("alert_threshold_pct must be between 0 and 100");
    }

    const budget = await upsertBudgetQuery(req.organizationId!, {
      monthly_limit_usd,
      alert_threshold_pct,
      is_hard_limit: req.body.is_hard_limit,
    });
    logStructured("successful", "gateway budget upserted", fn, fileName);
    return res.status(200).json(STATUS_CODE[200](budget));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to upsert gateway budget", fn, fileName);
    logger.error("Error upserting gateway budget:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

// ─── Proxy ───────────────────────────────────────────────────────────────────

export async function chatCompletion(req: Request, res: Response) {
  const fn = "chatCompletion";
  logStructured("processing", "proxying chat completion", fn, fileName);
  try {
    const { endpoint_slug, messages, max_tokens, temperature, top_p, metadata } = req.body;
    if (!endpoint_slug || !messages) {
      throw new ValidationException("endpoint_slug and messages are required");
    }

    const result = await proxyCompletion(
      req.organizationId!,
      endpoint_slug,
      messages,
      { max_tokens, temperature, top_p, metadata },
      Number(req.userId)
    );

    logStructured("successful", "chat completion proxied", fn, fileName);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error: any) {
    if (error instanceof ValidationException) {
      const isGuardrailBlock = error.message.includes("blocked by guardrail");
      const status = isGuardrailBlock ? 422 : 400;
      return res.status(status).json({ message: error.message, guardrail_blocked: isGuardrailBlock });
    }
    if (error.code === "budget_exceeded" || error.code === "rate_limited") {
      return res.status(429).json({ message: error.message, code: error.code });
    }
    logStructured("error", "failed to proxy chat completion", fn, fileName);
    logger.error("Error proxying chat completion:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function chatCompletionStream(req: Request, res: Response) {
  const fn = "chatCompletionStream";
  logStructured("processing", "proxying streaming chat completion", fn, fileName);
  try {
    const { endpoint_slug, messages, max_tokens, temperature, top_p, metadata } = req.body;
    if (!endpoint_slug || !messages) {
      throw new ValidationException("endpoint_slug and messages are required");
    }

    const { stream, cleanup } = await proxyStream(
      req.organizationId!,
      endpoint_slug,
      messages,
      { max_tokens, temperature, top_p, metadata },
      Number(req.userId)
    );

    pipeStreamWithCleanup(stream, req, res, cleanup);
    return;
  } catch (error: any) {
    if (error instanceof ValidationException) {
      const isGuardrailBlock = error.message.includes("blocked by guardrail");
      const status = isGuardrailBlock ? 422 : 400;
      return res.status(status).json({ message: error.message, guardrail_blocked: isGuardrailBlock });
    }
    if (error.code === "budget_exceeded" || error.code === "rate_limited") {
      return res.status(429).json({ message: error.message, code: error.code });
    }
    logStructured("error", "failed to proxy streaming chat", fn, fileName);
    logger.error("Error proxying streaming chat:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function embeddingProxy(req: Request, res: Response) {
  const fn = "embeddingProxy";
  logStructured("processing", "proxying embedding", fn, fileName);
  try {
    const { endpoint_slug, input } = req.body;
    if (!endpoint_slug || !input) {
      throw new ValidationException("endpoint_slug and input are required");
    }

    const result = await proxyEmbedding(
      req.organizationId!,
      endpoint_slug,
      input,
      Number(req.userId)
    );

    logStructured("successful", "embedding proxied", fn, fileName);
    return res.status(200).json(STATUS_CODE[200](result));
  } catch (error: any) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to proxy embedding", fn, fileName);
    logger.error("Error proxying embedding:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

// ─── Providers ───────────────────────────────────────────────────────────────

const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL || "http://localhost:8100";
const AI_GATEWAY_KEY = process.env.AI_GATEWAY_INTERNAL_KEY || "";

export async function getProviders(_req: Request, res: Response) {
  const fn = "getProviders";
  logStructured("processing", "fetching providers from AI Gateway", fn, fileName);
  try {
    const response = await fetch(`${AI_GATEWAY_URL}/v1/models`, {
      headers: { "x-internal-key": AI_GATEWAY_KEY },
    });

    if (!response.ok) {
      logger.warn(`AI Gateway /v1/models returned ${response.status}`);
      return res.status(200).json(STATUS_CODE[200]({ providers: [] }));
    }

    const data = await response.json();
    logStructured("successful", "providers fetched", fn, fileName);
    return res.status(200).json(STATUS_CODE[200]({ providers: data.providers || [] }));
  } catch (err) {
    // AI Gateway not running — return empty list (not an error for the client)
    logger.warn("AI Gateway service unavailable:", (err as Error).message);
    return res.status(200).json(STATUS_CODE[200]({ providers: [] }));
  }
}

// ─── Guardrail Rules ─────────────────────────────────────────────────────────

export async function getGuardrails(req: Request, res: Response) {
  const fn = "getGuardrails";
  logStructured("processing", "fetching guardrail rules", fn, fileName);
  try {
    const rules = await getAllGuardrailsQuery(req.organizationId!);
    logStructured("successful", "guardrail rules fetched", fn, fileName);
    return res.status(200).json(STATUS_CODE[200](rules));
  } catch (error) {
    logStructured("error", "failed to fetch guardrail rules", fn, fileName);
    logger.error("Error fetching guardrail rules:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function createGuardrail(req: Request, res: Response) {
  const fn = "createGuardrail";
  logStructured("processing", "creating guardrail rule", fn, fileName);
  try {
    const { guardrail_type, name, config, scope, action } = req.body;
    if (!guardrail_type || !name) {
      throw new ValidationException("guardrail_type and name are required");
    }
    if (!["pii", "content_filter"].includes(guardrail_type)) {
      throw new ValidationException("guardrail_type must be 'pii' or 'content_filter'");
    }
    if (action && !["block", "mask"].includes(action)) {
      throw new ValidationException("action must be 'block' or 'mask'");
    }

    // Validate regex patterns for content filter
    if (guardrail_type === "content_filter" && config?.type === "regex" && config?.pattern) {
      try {
        new RegExp(config.pattern);
      } catch {
        throw new ValidationException("Invalid regex pattern");
      }
    }

    const rule = await createGuardrailQuery(req.organizationId!, {
      guardrail_type,
      name,
      config: config || {},
      scope,
      action,
      created_by: Number(req.userId),
    });
    logStructured("successful", `guardrail rule created: ${rule.id}`, fn, fileName);

    notifyConfigChange(req.organizationId!, Number(req.userId), {
      entityType: "Guardrail rule", entityName: name, action: "created",
      detail: `Type: ${guardrail_type}, Action: ${action || "block"}`,
      actionUrl: `${FRONTEND_URL}/ai-gateway/guardrails`, actionLabel: "View guardrails",
    }).catch(() => {});

    return res.status(201).json(STATUS_CODE[201](rule));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to create guardrail rule", fn, fileName);
    logger.error("Error creating guardrail rule:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function updateGuardrail(req: Request, res: Response) {
  const fn = "updateGuardrail";
  logStructured("processing", "updating guardrail rule", fn, fileName);
  try {
    const id = parseId(req.params.id);

    // Validate regex if updating content filter pattern
    if (req.body.config?.type === "regex" && req.body.config?.pattern) {
      try {
        new RegExp(req.body.config.pattern);
      } catch {
        throw new ValidationException("Invalid regex pattern");
      }
    }

    const updated = await updateGuardrailQuery(req.organizationId!, id, req.body);
    if (!updated) {
      return res.status(404).json(STATUS_CODE[404]("Guardrail rule not found"));
    }

    // Record change for audit trail
    for (const field of Object.keys(req.body)) {
      await recordEntityChange("ai_gateway_guardrail", id, "updated", Number(req.userId), req.organizationId!, field).catch(() => {});
    }

    logStructured("successful", `guardrail rule updated: ${id}`, fn, fileName);

    if (req.body.is_active !== undefined) {
      notifyConfigChange(req.organizationId!, Number(req.userId), {
        entityType: "Guardrail rule", entityName: updated.name || `Rule #${id}`,
        action: req.body.is_active ? "enabled" : "disabled",
        actionUrl: `${FRONTEND_URL}/ai-gateway/guardrails`, actionLabel: "View guardrails",
      }).catch(() => {});
    }

    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to update guardrail rule", fn, fileName);
    logger.error("Error updating guardrail rule:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function deleteGuardrail(req: Request, res: Response) {
  const fn = "deleteGuardrail";
  logStructured("processing", "deleting guardrail rule", fn, fileName);
  try {
    const id = parseId(req.params.id);
    const deleted = await deleteGuardrailQuery(req.organizationId!, id);
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]("Guardrail rule not found"));
    }
    logStructured("successful", `guardrail rule deleted: ${id}`, fn, fileName);

    notifyConfigChange(req.organizationId!, Number(req.userId), {
      entityType: "Guardrail rule", entityName: `Rule #${id}`, action: "deleted",
      actionUrl: `${FRONTEND_URL}/ai-gateway/guardrails`, actionLabel: "View guardrails",
    }).catch(() => {});
    return res.status(200).json(STATUS_CODE[200]({ deleted: true }));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to delete guardrail rule", fn, fileName);
    logger.error("Error deleting guardrail rule:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

// ─── Guardrail Settings ──────────────────────────────────────────────────────

export async function getGuardrailSettings(req: Request, res: Response) {
  const fn = "getGuardrailSettings";
  try {
    const settings = await getGuardrailSettingsQuery(req.organizationId!);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    logStructured("error", "failed to fetch guardrail settings", fn, fileName);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function updateGuardrailSettings(req: Request, res: Response) {
  const fn = "updateGuardrailSettings";
  try {
    const settings = await upsertGuardrailSettingsQuery(req.organizationId!, req.body);
    logStructured("successful", "guardrail settings updated", fn, fileName);
    return res.status(200).json(STATUS_CODE[200](settings));
  } catch (error) {
    logStructured("error", "failed to update guardrail settings", fn, fileName);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

// ─── Guardrail Test (proxy to FastAPI) ───────────────────────────────────────

export async function testGuardrails(req: Request, res: Response) {
  const fn = "testGuardrails";
  logStructured("processing", "testing guardrail rules", fn, fileName);
  try {
    const { text } = req.body;
    if (!text) {
      throw new ValidationException("text is required");
    }

    // Get active rules and settings
    const [rules, settings] = await Promise.all([
      getActiveGuardrailsQuery(req.organizationId!),
      getGuardrailSettingsQuery(req.organizationId!),
    ]);

    const response = await fetch(`${AI_GATEWAY_URL}/v1/guardrails/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": AI_GATEWAY_KEY,
      },
      body: JSON.stringify({
        text,
        guardrail_rules: rules,
        settings: settings || {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Guardrail test returned ${response.status}: ${errorText}`);
      return res.status(502).json({ message: "Guardrail service returned an error", statusCode: 502 });
    }

    const data = await response.json();
    logStructured("successful", "guardrail test completed", fn, fileName);
    return res.status(200).json(STATUS_CODE[200](data));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to test guardrails", fn, fileName);
    logger.error("Error testing guardrails:", error);
    return res.status(500).json(STATUS_CODE[500]("Guardrail test failed — is the AI Gateway service running?"));
  }
}

// ─── Guardrail Logs & Stats ──────────────────────────────────────────────────

export async function getGuardrailLogs(req: Request, res: Response) {
  const fn = "getGuardrailLogs";
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const logs = await getGuardrailLogsQuery(req.organizationId!, limit, offset);
    return res.status(200).json(STATUS_CODE[200](logs));
  } catch (error) {
    logStructured("error", "failed to fetch guardrail logs", fn, fileName);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function getGuardrailStats(req: Request, res: Response) {
  const fn = "getGuardrailStats";
  try {
    const period = (req.query.period as string) || "7d";
    const { startDate, endDate } = getDateRange(period);

    const [summary, byType, byDay] = await Promise.all([
      getGuardrailStatsQuery(req.organizationId!, startDate, endDate),
      getGuardrailStatsByTypeQuery(req.organizationId!, startDate, endDate),
      getGuardrailStatsByDayQuery(req.organizationId!, startDate, endDate),
    ]);

    return res.status(200).json(STATUS_CODE[200]({ summary, byType, byDay }));
  } catch (error) {
    logStructured("error", "failed to fetch guardrail stats", fn, fileName);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function purgeGuardrailLogs(req: Request, res: Response) {
  const fn = "purgeGuardrailLogs";
  try {
    const settings = await getGuardrailSettingsQuery(req.organizationId!);
    const retentionDays = settings?.log_retention_days || 90;
    const deleted = await purgeGuardrailLogsQuery(req.organizationId!, retentionDays);
    logStructured("successful", `purged ${deleted} guardrail logs`, fn, fileName);
    return res.status(200).json(STATUS_CODE[200]({ deleted_count: deleted }));
  } catch (error) {
    logStructured("error", "failed to purge guardrail logs", fn, fileName);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

// ─── Virtual Keys ─────────────────────────────────────────────────────────────

export async function getVirtualKeys(req: Request, res: Response) {
  const fn = "getVirtualKeys";
  logStructured("processing", "fetching virtual keys", fn, fileName);
  try {
    const keys = await getAllVirtualKeysQuery(req.organizationId!);
    logStructured("successful", "virtual keys fetched", fn, fileName);
    return res.status(200).json(STATUS_CODE[200](keys));
  } catch (error) {
    logStructured("error", "failed to fetch virtual keys", fn, fileName);
    logger.error("Error fetching virtual keys:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function createVirtualKey(req: Request, res: Response) {
  const fn = "createVirtualKey";
  logStructured("processing", "creating virtual key", fn, fileName);
  try {
    const { name, allowed_endpoint_ids, max_budget_usd, rate_limit_rpm, metadata, expires_at } = req.body;
    if (!name) {
      throw new ValidationException("name is required");
    }
    if (typeof name !== "string") throw new ValidationException("name must be a string");
    if (name.trim().length > 255) throw new ValidationException("name must be 255 characters or fewer");
    if (expires_at && isNaN(Date.parse(expires_at))) {
      throw new ValidationException("expires_at must be a valid date");
    }

    const { plainKey, hash, prefix } = generateVirtualKey();

    const virtualKey = await createVirtualKeyQuery(req.organizationId!, {
      key_hash: hash,
      key_prefix: prefix,
      name,
      allowed_endpoint_ids,
      max_budget_usd: max_budget_usd ? Number(max_budget_usd) : undefined,
      rate_limit_rpm: rate_limit_rpm ? Number(rate_limit_rpm) : undefined,
      metadata,
      expires_at,
      created_by: Number(req.userId),
    });

    logStructured("successful", `virtual key created: ${name}`, fn, fileName);

    notifyConfigChange(req.organizationId!, Number(req.userId), {
      entityType: "Virtual key", entityName: name, action: "created",
      actionUrl: `${FRONTEND_URL}/ai-gateway/virtual-keys`, actionLabel: "View virtual keys",
    }).catch(() => {});

    // Return the plaintext key (shown once) along with the created record
    return res.status(201).json(STATUS_CODE[201]({
      ...virtualKey,
      key: plainKey,
    }));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to create virtual key", fn, fileName);
    logger.error("Error creating virtual key:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function updateVirtualKey(req: Request, res: Response) {
  const fn = "updateVirtualKey";
  logStructured("processing", "updating virtual key", fn, fileName);
  try {
    const id = parseId(req.params.id);

    const { name, allowed_endpoint_ids, max_budget_usd, rate_limit_rpm, metadata, expires_at } = req.body;
    const data: Record<string, any> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) throw new ValidationException("name must be a non-empty string");
      data.name = name.trim();
    }
    if (allowed_endpoint_ids !== undefined) {
      if (!Array.isArray(allowed_endpoint_ids)) throw new ValidationException("allowed_endpoint_ids must be an array");
      data.allowed_endpoint_ids = allowed_endpoint_ids;
    }
    if (max_budget_usd !== undefined) {
      data.max_budget_usd = max_budget_usd === null ? null : Number(max_budget_usd);
      if (data.max_budget_usd !== null && (isNaN(data.max_budget_usd) || data.max_budget_usd < 0)) {
        throw new ValidationException("max_budget_usd must be a non-negative number or null");
      }
    }
    if (rate_limit_rpm !== undefined) {
      data.rate_limit_rpm = rate_limit_rpm === null ? null : Number(rate_limit_rpm);
      if (data.rate_limit_rpm !== null && (isNaN(data.rate_limit_rpm) || data.rate_limit_rpm < 0)) {
        throw new ValidationException("rate_limit_rpm must be a non-negative number or null");
      }
    }
    if (metadata !== undefined) data.metadata = metadata;
    if (expires_at !== undefined) {
      data.expires_at = expires_at === null ? null : expires_at;
      if (data.expires_at !== null && isNaN(Date.parse(data.expires_at))) {
        throw new ValidationException("expires_at must be a valid date or null");
      }
    }

    const updated = await updateVirtualKeyQuery(req.organizationId!, id, data);
    if (!updated) {
      return res.status(404).json(STATUS_CODE[404]("Virtual key not found"));
    }
    logStructured("successful", `virtual key updated: ${id}`, fn, fileName);
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to update virtual key", fn, fileName);
    logger.error("Error updating virtual key:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function revokeVirtualKey(req: Request, res: Response) {
  const fn = "revokeVirtualKey";
  logStructured("processing", "revoking virtual key", fn, fileName);
  try {
    const id = parseId(req.params.id);
    const revoked = await revokeVirtualKeyQuery(req.organizationId!, id);
    if (!revoked) {
      return res.status(404).json(STATUS_CODE[404]("Virtual key not found or already revoked"));
    }
    logStructured("successful", `virtual key revoked: ${id}`, fn, fileName);

    notifyConfigChange(req.organizationId!, Number(req.userId), {
      entityType: "Virtual key", entityName: `Key #${id}`, action: "disabled",
      actionUrl: `${FRONTEND_URL}/ai-gateway/virtual-keys`, actionLabel: "View virtual keys",
    }).catch(() => {});

    return res.status(200).json(STATUS_CODE[200]({ revoked: true }));
  } catch (error) {
    logStructured("error", "failed to revoke virtual key", fn, fileName);
    logger.error("Error revoking virtual key:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function deleteVirtualKey(req: Request, res: Response) {
  const fn = "deleteVirtualKey";
  logStructured("processing", "deleting virtual key", fn, fileName);
  try {
    const id = parseId(req.params.id);
    const deleted = await deleteVirtualKeyQuery(req.organizationId!, id);
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]("Virtual key not found or still active (revoke first)"));
    }
    logStructured("successful", `virtual key deleted: ${id}`, fn, fileName);

    notifyConfigChange(req.organizationId!, Number(req.userId), {
      entityType: "Virtual key", entityName: `Key #${id}`, action: "deleted",
      actionUrl: `${FRONTEND_URL}/ai-gateway/virtual-keys`, actionLabel: "View virtual keys",
    }).catch(() => {});

    return res.status(200).json(STATUS_CODE[200]({ deleted: true }));
  } catch (error) {
    logStructured("error", "failed to delete virtual key", fn, fileName);
    logger.error("Error deleting virtual key:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

export async function getPrompts(req: Request, res: Response) {
  const fn = "getPrompts";
  logStructured("processing", "fetching all gateway prompts", fn, fileName);
  try {
    const prompts = await getAllPromptsQuery(req.organizationId!);
    logStructured("successful", "gateway prompts fetched", fn, fileName);
    return res.status(200).json(STATUS_CODE[200](prompts));
  } catch (error) {
    logStructured("error", "failed to fetch gateway prompts", fn, fileName);
    logger.error("Error fetching gateway prompts:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function createPrompt(req: Request, res: Response) {
  const fn = "createPrompt";
  logStructured("processing", "creating gateway prompt", fn, fileName);
  try {
    const { slug, name, description } = req.body;
    if (!slug || !name) {
      throw new ValidationException("slug and name are required");
    }
    if (!SLUG_PATTERN.test(slug)) {
      throw new ValidationException(
        "Slug must contain only lowercase letters, numbers, and hyphens (min 2 chars)"
      );
    }

    const prompt = await createPromptQuery(req.organizationId!, {
      slug,
      name,
      description,
      created_by: Number(req.userId),
    });
    logStructured("successful", `gateway prompt created: ${name}`, fn, fileName);

    notifyConfigChange(req.organizationId!, Number(req.userId), {
      entityType: "Prompt", entityName: name, action: "created",
      actionUrl: `${FRONTEND_URL}/ai-gateway/prompts/${prompt.id}`, actionLabel: "View prompt",
    }).catch(() => {});

    return res.status(201).json(STATUS_CODE[201](prompt));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to create gateway prompt", fn, fileName);
    logger.error("Error creating gateway prompt:", error);
    if ((error as any)?.original?.constraint === "uq_ai_gateway_prompts_org_slug") {
      return res.status(409).json(STATUS_CODE[409]("A prompt with this slug already exists"));
    }
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function getPrompt(req: Request, res: Response) {
  const fn = "getPrompt";
  logStructured("processing", "fetching gateway prompt", fn, fileName);
  try {
    const id = parseId(req.params.id);
    const prompt = await getPromptByIdQuery(req.organizationId!, id);
    if (!prompt) {
      return res.status(404).json(STATUS_CODE[404]("Prompt not found"));
    }
    logStructured("successful", `gateway prompt fetched: ${id}`, fn, fileName);
    return res.status(200).json(STATUS_CODE[200](prompt));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to fetch gateway prompt", fn, fileName);
    logger.error("Error fetching gateway prompt:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function updatePrompt(req: Request, res: Response) {
  const fn = "updatePrompt";
  logStructured("processing", "updating gateway prompt", fn, fileName);
  try {
    const id = parseId(req.params.id);
    const { name, description } = req.body;
    const updated = await updatePromptQuery(req.organizationId!, id, { name, description });
    if (!updated) {
      return res.status(404).json(STATUS_CODE[404]("Prompt not found"));
    }
    logStructured("successful", `gateway prompt updated: ${id}`, fn, fileName);
    return res.status(200).json(STATUS_CODE[200](updated));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to update gateway prompt", fn, fileName);
    logger.error("Error updating gateway prompt:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function deletePrompt(req: Request, res: Response) {
  const fn = "deletePrompt";
  logStructured("processing", "deleting gateway prompt", fn, fileName);
  try {
    const id = parseId(req.params.id);
    const deleted = await deletePromptQuery(req.organizationId!, id);
    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404]("Prompt not found"));
    }
    logStructured("successful", `gateway prompt deleted: ${id}`, fn, fileName);

    notifyConfigChange(req.organizationId!, Number(req.userId), {
      entityType: "Prompt", entityName: `Prompt #${id}`, action: "deleted",
      actionUrl: `${FRONTEND_URL}/ai-gateway/prompts`, actionLabel: "View prompts",
    }).catch(() => {});

    return res.status(200).json(STATUS_CODE[200]({ deleted: true }));
  } catch (error) {
    logStructured("error", "failed to delete gateway prompt", fn, fileName);
    logger.error("Error deleting gateway prompt:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function createPromptVersion(req: Request, res: Response) {
  const fn = "createPromptVersion";
  logStructured("processing", "creating prompt version", fn, fileName);
  try {
    const promptId = parseId(req.params.id);
    const { content, model, config } = req.body;
    if (!content || !Array.isArray(content) || content.length === 0) {
      throw new ValidationException("content must be a non-empty array of messages");
    }

    // Verify prompt exists
    const prompt = await getPromptByIdQuery(req.organizationId!, promptId);
    if (!prompt) {
      return res.status(404).json(STATUS_CODE[404]("Prompt not found"));
    }

    const version = await createVersionQuery(req.organizationId!, promptId, {
      content,
      model,
      config,
      created_by: Number(req.userId),
    });
    logStructured("successful", `prompt version created: v${version.version}`, fn, fileName);
    return res.status(201).json(STATUS_CODE[201](version));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to create prompt version", fn, fileName);
    logger.error("Error creating prompt version:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function getPromptVersions(req: Request, res: Response) {
  const fn = "getPromptVersions";
  logStructured("processing", "fetching prompt versions", fn, fileName);
  try {
    const promptId = parseId(req.params.id);
    const versions = await getVersionsQuery(req.organizationId!, promptId);
    logStructured("successful", `prompt versions fetched for prompt ${promptId}`, fn, fileName);
    return res.status(200).json(STATUS_CODE[200](versions));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to fetch prompt versions", fn, fileName);
    logger.error("Error fetching prompt versions:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function publishPromptVersion(req: Request, res: Response) {
  const fn = "publishPromptVersion";
  logStructured("processing", "publishing prompt version", fn, fileName);
  try {
    const promptId = parseId(req.params.id);
    const versionNumber = Number(req.params.v);
    if (isNaN(versionNumber) || versionNumber <= 0) {
      throw new ValidationException("Invalid version number");
    }

    const published = await publishVersionQuery(
      req.organizationId!,
      promptId,
      versionNumber,
      Number(req.userId)
    );
    if (!published) {
      return res.status(404).json(STATUS_CODE[404]("Version not found"));
    }
    logStructured("successful", `prompt version published: v${versionNumber}`, fn, fileName);

    notifyConfigChange(req.organizationId!, Number(req.userId), {
      entityType: "Prompt version", entityName: `v${versionNumber}`, action: "published",
      actionUrl: `${FRONTEND_URL}/ai-gateway/prompts/${promptId}`, actionLabel: "View prompt",
    }).catch(() => {});

    return res.status(200).json(STATUS_CODE[200](published));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400](error.message));
    }
    logStructured("error", "failed to publish prompt version", fn, fileName);
    logger.error("Error publishing prompt version:", error);
    return res.status(500).json(STATUS_CODE[500]("Internal server error"));
  }
}

export async function testPrompt(req: Request, res: Response) {
  const fn = "testPrompt";
  logStructured("processing", "testing prompt", fn, fileName);
  try {
    const { content, variables, config, endpoint_slug } = req.body;
    if (!content || !Array.isArray(content) || content.length === 0) {
      throw new ValidationException("content must be a non-empty array of messages");
    }
    if (!endpoint_slug) {
      throw new ValidationException("endpoint_slug is required");
    }

    // Resolve variables in content
    const resolvedMessages = variables
      ? resolveVariables(content, variables)
      : content;

    // Use proxyStream with the selected endpoint
    const options: any = {};
    if (config?.temperature !== undefined) options.temperature = config.temperature;
    if (config?.max_tokens !== undefined) options.max_tokens = config.max_tokens;
    if (config?.top_p !== undefined) options.top_p = config.top_p;

    const { stream, cleanup } = await proxyStream(
      req.organizationId!,
      endpoint_slug,
      resolvedMessages,
      options,
      Number(req.userId)
    );

    pipeStreamWithCleanup(stream, req, res, cleanup);
    return;
  } catch (error) {
    if (error instanceof ValidationException) {
      res.status(400).json(STATUS_CODE[400](error.message));
      return;
    }
    logStructured("error", "failed to test prompt", fn, fileName);
    logger.error("Error testing prompt:", error);
    res.status(500).json(STATUS_CODE[500]((error as Error).message || "Internal server error"));
  }
}
