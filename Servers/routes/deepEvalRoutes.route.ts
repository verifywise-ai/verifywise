import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";
import authenticateJWT from "../middleware/auth.middleware";
import express, { NextFunction, Request, Response, Router } from "express";
import { LLMProvider, VALID_PROVIDERS } from "../domain.layer/models/evaluationLlmApiKey/evaluationLlmApiKey.model";
import { getDecryptedKeyForProviderQuery } from "../utils/evaluationLlmApiKey.utils";

// JSON body parser for routes that need to inspect/modify the body before proxying
const jsonParser = express.json({ limit: "50mb" });

// Headers are now set directly in the proxyReq handler to ensure they're forwarded

/**
 * Middleware to inject API keys for experiment creation and arena comparisons
 * Handles both custom scorers and standard judge LLM
 * This modifies req.body before the proxy forwards it
 */
async function injectApiKeys(req: Request, _res: Response, next: NextFunction) {
  // Only process POST requests to experiments, arena, or report endpoints
  const isExperiment = req.method === "POST" && req.url.includes("/experiments");
  const isArena = req.method === "POST" && req.url.includes("/arena/compare");
  const isReport = req.method === "POST" && req.url.includes("/reports/generate");

  if (!isExperiment && !isArena && !isReport) {
    return next();
  }

  const evaluationMode = req.body?.config?.evaluationMode || "standard";

  try {
    const body = req.body || {};
    const tenantId = req.tenantId;

    // Handle Arena comparisons - inject API keys for contestants and judge
    if (isArena) {
      // Ensure body has required fields
      if (!body || !body.contestants) {
        return next();
      }

      const apiKeys: Record<string, string> = {};

      // Get providers from contestants
      const contestants = body.contestants || [];
      for (const contestant of contestants) {
        const provider = contestant.hyperparameters?.provider?.toLowerCase();
        if (provider && VALID_PROVIDERS.includes(provider as LLMProvider) && !apiKeys[provider]) {
          try {
            const apiKey = await getDecryptedKeyForProviderQuery(tenantId!, provider as LLMProvider);
            if (apiKey) {
              apiKeys[provider] = apiKey;
            }
          } catch {
            // Skip providers without keys
          }
        }
      }

      // Get provider for judge model (default to openai if not specified)
      const judgeModel = body.judgeModel || "gpt-4o";
      let judgeProvider = "openai";
      if (judgeModel.includes("claude")) judgeProvider = "anthropic";
      else if (judgeModel.includes("gemini")) judgeProvider = "google";
      else if (judgeModel.includes("mistral") || judgeModel.includes("magistral")) judgeProvider = "mistral";
      else if (judgeModel.includes("grok")) judgeProvider = "xai";

      if (!apiKeys[judgeProvider]) {
        try {
          const apiKey = await getDecryptedKeyForProviderQuery(tenantId!, judgeProvider as LLMProvider);
          if (apiKey) {
            apiKeys[judgeProvider] = apiKey;
          }
        } catch {
          // Skip if key not found
        }
      }

      if (Object.keys(apiKeys).length > 0) {
        req.body.apiKeys = apiKeys;
      }

      return next();
    }

    // Handle report generation — inject the judge LLM's API key for AI summaries
    if (isReport) {
      const judgeProvider = (body.judgeProvider || "").toLowerCase();
      if (judgeProvider && VALID_PROVIDERS.includes(judgeProvider as LLMProvider)) {
        try {
          const apiKey = await getDecryptedKeyForProviderQuery(tenantId!, judgeProvider as LLMProvider);
          if (apiKey) {
            req.body.apiKey = apiKey;
          }
        } catch {
          // No key found — report will be generated without AI summaries
        }
      }
      return next();
    }

    // 1. Inject API keys for custom scorers (scorer or both mode)
    // Frontend sends scorerProviders: ["mistral", "openai"] - only the providers actually needed
    if (body?.config?.useCustomScorer && body?.config?.scorerProviders) {
      const requestedProviders: string[] = body.config.scorerProviders;
      const scorerApiKeys: Record<string, string> = {};

      for (const provider of requestedProviders) {
        const normalizedProvider = provider.toLowerCase();
        if (VALID_PROVIDERS.includes(normalizedProvider as LLMProvider)) {
          try {
            const apiKey = await getDecryptedKeyForProviderQuery(
              tenantId!,
              normalizedProvider as LLMProvider,
            );
            if (apiKey) {
              scorerApiKeys[normalizedProvider] = apiKey;
            }
          } catch {
            // Skip providers without keys
          }
        }
      }

      if (Object.keys(scorerApiKeys).length > 0) {
        req.body.config.scorerApiKeys = scorerApiKeys;
        console.log(`[DeepEval Proxy] Injecting API keys for scorer providers: ${Object.keys(scorerApiKeys).join(", ")}`);
      }
    }

    // 2. Inject API key for standard judge LLM (standard or both mode)
    if ((evaluationMode === "standard" || evaluationMode === "both") && body?.config?.judgeLlm) {
      const judgeProvider = body.config.judgeLlm.provider?.toLowerCase();
      const hasJudgeApiKey = body.config.judgeLlm.apiKey && body.config.judgeLlm.apiKey !== "***" && body.config.judgeLlm.apiKey !== "";

      if (judgeProvider && !hasJudgeApiKey && VALID_PROVIDERS.includes(judgeProvider as LLMProvider)) {
        const apiKey = await getDecryptedKeyForProviderQuery(
          tenantId!,
          judgeProvider as LLMProvider,
        );

        if (apiKey) {
          req.body.config.judgeLlm.apiKey = apiKey;
        }
      }
    }

    // 3. Inject API key for the model being tested (if it's a cloud provider)
    if (body?.config?.model) {
      // accessMethod tells us the provider (openai, anthropic, google, etc.)
      const modelProvider = (body.config.model.provider || body.config.model.accessMethod || "").toLowerCase();
      const hasModelApiKey = body.config.model.apiKey && body.config.model.apiKey !== "***" && body.config.model.apiKey !== "";

      if (modelProvider && !hasModelApiKey && VALID_PROVIDERS.includes(modelProvider as LLMProvider)) {
        const apiKey = await getDecryptedKeyForProviderQuery(
          tenantId!,
          modelProvider as LLMProvider,
        );

        if (apiKey) {
          req.body.config.model.apiKey = apiKey;
          // Also set provider explicitly if only accessMethod was set
          if (!body.config.model.provider) {
            req.body.config.model.provider = modelProvider;
          }
        }
      }
    }

    // 4. Inject judge provider's key into scorerApiKeys for DeepEval metrics (G-Eval, etc.)
    // Only inject the specific key needed - the judge LLM provider
    if ((evaluationMode === "standard" || evaluationMode === "both") && body?.config?.judgeLlm?.provider) {
      const judgeProvider = body.config.judgeLlm.provider.toLowerCase();

      if (VALID_PROVIDERS.includes(judgeProvider as LLMProvider)) {
        // Initialize scorerApiKeys if not already set
        if (!req.body.config.scorerApiKeys) {
          req.body.config.scorerApiKeys = {};
        }

        // Only fetch if we don't already have this provider's key
        if (!req.body.config.scorerApiKeys[judgeProvider]) {
          try {
            const apiKey = await getDecryptedKeyForProviderQuery(
              tenantId!,
              judgeProvider as LLMProvider,
            );
            if (apiKey) {
              req.body.config.scorerApiKeys[judgeProvider] = apiKey;
            }
          } catch {
            // Skip if key not found
          }
        }
      }
    }
  } catch (error) {
    console.error("[DeepEval Proxy] Error in API key injection:", error);
  }

  next();
}

function deepEvalRoutes() {
  const router = Router();

  const targetUrl =
    process.env.LLM_EVALS_URL || "http://127.0.0.1:8000";

  const proxy = createProxyMiddleware({
    target: targetUrl,
    changeOrigin: true,
    pathRewrite: { "^/": "/deepeval/" },
    on: {
      proxyReq: (proxyReq, req) => {
        // Forward custom headers to the proxy target
        const expressReq = req as Request;
        if (expressReq.tenantId) {
          proxyReq.setHeader("x-tenant-id", expressReq.tenantId);
        }
        if (expressReq.organizationId) {
          proxyReq.setHeader("x-organization-id", expressReq.organizationId.toString());
        }
        if (expressReq.userId) {
          proxyReq.setHeader("x-user-id", expressReq.userId.toString());
        }
        if (expressReq.role) {
          proxyReq.setHeader("x-role", expressReq.role);
        }

        // Fix request body - this re-streams the parsed body to the proxy target
        // Required because body-parser consumed the original stream
        fixRequestBody(proxyReq, req as Request);
      },
      error: (err, req, res) => {
        const errAny = err as any;
        console.error(
          `[DeepEval Proxy] Error for ${req.url}:`,
          errAny.message || errAny.code || errAny
        );
        if (res && "writeHead" in res) {
          (res as any).writeHead(502, { "Content-Type": "application/json" });
          (res as any).end(
            JSON.stringify({
              error: "Proxy error",
              message: errAny.message || errAny.code || "Unknown error",
            })
          );
        }
      },
    },
  });

  // All routes go through the proxy to Python eval server (including /models)
  router.use("/", authenticateJWT, jsonParser, injectApiKeys, proxy);

  return router;
}

export default deepEvalRoutes;
