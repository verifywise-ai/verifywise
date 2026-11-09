import express, { RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { csrfProtection } from "./middleware/csrf.middleware";

import webhookRoutes from "./routes/webhook.route";
import virtualKeyProxyRoutes from "./routes/virtualKeyProxy.route";
import v1Routes from "./routes/v1";
import { registerCoreAuthRoutes } from "./routes/legacy/coreAuth.routes";
import { registerVendorRoutes } from "./routes/legacy/vendors.routes";
import { registerProjectsRisksRoutes } from "./routes/legacy/projectsRisks.routes";
import { registerBillingMiscRoutes } from "./routes/legacy/billingMisc.routes";
import { registerFilesDataRoutes } from "./routes/legacy/filesData.routes";
import { registerFrameworksRoutes } from "./routes/legacy/frameworks.routes";
import { registerAiGovernanceRoutes } from "./routes/legacy/aiGovernance.routes";
import { registerAiPlatformRoutes } from "./routes/legacy/aiPlatform.routes";
import { registerWorkflowsRoutes } from "./routes/legacy/workflows.routes";
import { registerReportingRoutes } from "./routes/legacy/reporting.routes";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { i18nMiddleware } from "./middleware/i18n.middleware";
import {
  generalApiLimiter,
  healthCheckLimiter,
  virtualKeyProxyLimiter,
} from "./middleware/rateLimit.middleware";
import { sequelize } from "./database/db";
import redisClient from "./database/redis";
import { requestMetricsMiddleware } from "./middleware/requestMetrics.middleware";
import { getGatewayUrl } from "./utils/aiGatewayConfig";

const swaggerDoc = YAML.load("./swagger.yaml");

const DEFAULT_HOST = "localhost";

export function createApp(preRoutesMiddleware?: RequestHandler[]): express.Application {
  const app = express();
  const host = process.env.HOST || DEFAULT_HOST;

  // Trust the first reverse proxy (nginx) so req.ip, req.secure and
  // X-Forwarded-Proto are honored for rate limiting and cookie logic.
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }

        try {
          const originUrl = new URL(origin);
          const requestHost = originUrl.hostname;

          const allowedHosts = [host, "localhost", "127.0.0.1", "::1"];

          if (allowedHosts.includes(requestHost)) {
            return callback(null, true);
          }

          return callback(new Error("Not allowed by CORS"));
        } catch (error) {
          return callback(new Error("Invalid origin"));
        }
      },
      credentials: true,
      allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With", "X-CSRF-Token"],
    }),
  );
  app.use(helmet());
  app.use((req, res, next) => {
    if (req.url.includes("/api/bias_and_fairness/")) {
      return next();
    }
    if (
      req.url.includes("/api/deepeval/") &&
      !req.url.includes("/experiments") &&
      !req.url.includes("/arena/compare")
    ) {
      return next();
    }
    if (req.url.startsWith("/api/webhooks/")) {
      return next();
    }
    // The /v1 virtual key proxy forwards the raw body: the AI Gateway parses
    // and validates it, and answers bad JSON in its own error format.
    // Same match as the "/v1" mount: case-insensitive, and "/v1" itself or
    // "/v1?..." as well as "/v1/...".
    if (/^\/v1(?:[/?]|$)/i.test(req.url)) {
      return next();
    }
    express.json({ limit: "10mb" })(req, res, next);
  });
  app.use(cookieParser());
  // Double-submit-cookie CSRF protection for cookie-authenticated flows
  // (refresh-token / logout). Bearer-only API clients pass through.
  app.use(csrfProtection);

  app.use(i18nMiddleware);

  type HealthCheck = { status: "ok" | "error"; error?: string };

  // Data-store checks must answer within the readiness probe's timeout (3s).
  // The Redis client queues commands indefinitely while disconnected
  // (maxRetriesPerRequest: null), so without this a Redis outage would leave
  // every probe hanging instead of returning 503.
  const DATA_STORE_CHECK_TIMEOUT_MS = 2000;
  const withTimeout = <T>(work: Promise<T>, label: string): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} check timed out after ${DATA_STORE_CHECK_TIMEOUT_MS}ms`)),
        DATA_STORE_CHECK_TIMEOUT_MS,
      );
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
  };

  const checkDatabase = async (): Promise<HealthCheck> => {
    try {
      await withTimeout(sequelize.query("SELECT 1"), "Database");
      return { status: "ok" };
    } catch (err: unknown) {
      return { status: "error", error: (err as Error).message };
    }
  };

  const checkRedis = async (): Promise<HealthCheck> => {
    try {
      const pong = await withTimeout(redisClient.ping(), "Redis");
      return pong === "PONG"
        ? { status: "ok" }
        : { status: "error", error: `Unexpected PING response: ${pong}` };
    } catch (err: unknown) {
      return { status: "error", error: (err as Error).message };
    }
  };

  const checkAiGateway = async (): Promise<HealthCheck> => {
    try {
      // Same address every other gateway call uses (see aiGatewayConfig).
      const gwRes = await fetch(`${getGatewayUrl()}/health`, { signal: AbortSignal.timeout(5000) });
      return gwRes.ok ? { status: "ok" } : { status: "error", error: `HTTP ${gwRes.status}` };
    } catch (err: unknown) {
      return { status: "error", error: (err as Error).message };
    }
  };

  const sendChecks = (res: express.Response, checks: Record<string, HealthCheck>) => {
    const allOk = Object.values(checks).every((c) => c.status === "ok");
    res.status(allOk ? 200 : 503).json({ status: allOk ? "ok" : "degraded", checks });
  };

  // Generous rate limiter for the health endpoints. Load-balancer probes are
  // still allowed, but the endpoints are capped to prevent abuse.
  //
  // /health/live   liveness: the process is up and serving HTTP. No dependency
  //                checks, so an outage elsewhere never restarts healthy pods.
  // /health/ready  readiness: the backend's own data stores (PostgreSQL, Redis).
  // /health        full status including the AI Gateway, for monitoring.
  app.get("/health/live", healthCheckLimiter, (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/health/ready", healthCheckLimiter, async (_req, res) => {
    const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
    sendChecks(res, { database, redis });
  });

  app.get("/health", healthCheckLimiter, async (_req, res) => {
    const [database, redis, ai_gateway] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkAiGateway(),
    ]);
    sendChecks(res, { database, redis, ai_gateway });
  });

  // Track every request: metrics + access log (shipped to the central
  // observability stack when monitoring is enabled). Mounted after /health so
  // health checks aren't counted, and before all /api routes.
  app.use(requestMetricsMiddleware);

  if (preRoutesMiddleware) {
    preRoutesMiddleware.forEach((mw) => app.use(mw));
  }

  // Webhook routes are mounted before the global rate limiter because they are
  // signature-verified and have their own per-route controls.
  app.use("/api/webhooks", webhookRoutes);

  // OpenAI-compatible AI Gateway API for virtual keys. Mounted before the
  // global limiter: one customer app server sends all of its LLM traffic from
  // one IP, so it gets its own, higher per-IP ceiling. The gateway enforces
  // each key's RPM and budget.
  app.use("/v1", virtualKeyProxyLimiter, virtualKeyProxyRoutes());

  // Global API rate limiter (audit 4.5): a loose per-IP ceiling mounted
  // ahead of every route mount. Stricter per-route limiters (auth, file
  // ops, ingestion, ...) still apply on top. /health has its own generous
  // per-IP limiter above.
  app.use(generalApiLimiter);

  if (process.env.NODE_ENV !== "production") {
    app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDoc));
  }

  // Legacy API surface (ADR 0001): unversioned mounts, grouped by domain in
  // routes/legacy/. Each module lists its mounts in the exact order they had
  // in this file before the decomposition; order-sensitive mounts carry
  // explanatory comments in their module.
  registerCoreAuthRoutes(app);
  registerVendorRoutes(app);
  registerProjectsRisksRoutes(app);
  registerBillingMiscRoutes(app);
  registerFilesDataRoutes(app);
  registerFrameworksRoutes(app);
  registerAiGovernanceRoutes(app);
  registerAiPlatformRoutes(app);
  registerWorkflowsRoutes(app);
  registerReportingRoutes(app);

  // Versioned API surface (ADR 0001): all /api/v1/* routes are registered in
  // routes/v1/index.ts. No legacy mount path is a prefix of /api/v1, so
  // mounting after the legacy groups preserves route-matching behavior.
  app.use("/api/v1", v1Routes);

  return app;
}
