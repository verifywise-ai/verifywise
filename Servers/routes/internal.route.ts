/**
 * Internal API routes — receives callbacks from Python services (AIGateway).
 *
 * These routes are NOT exposed to the browser. They are called by the
 * AIGateway FastAPI service using the shared internal API key.
 */

import { Router, Request, Response } from "express";
import logger from "../utils/logger/fileLogger";
import {
  notifyConfigChange,
  notifyBudgetWarning,
  notifyBudgetExhausted,
  notifyGuardrailSpike,
  notifyVirtualKeyBudgetExhausted,
} from "../services/aiGateway/aiGatewayNotifications";

const router = Router();

const INTERNAL_KEY = process.env.AI_GATEWAY_INTERNAL_KEY || "";

/**
 * Verify the request comes from an authorized internal service.
 */
function verifyInternalKey(req: Request, res: Response, next: () => void): void {
  const key = req.headers["x-internal-key"] as string;
  if (!INTERNAL_KEY || key !== INTERNAL_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use(verifyInternalKey);

/**
 * POST /api/internal/ai-gateway/notify
 *
 * Dispatches notifications from the AIGateway service using the existing
 * Express notification + email infrastructure.
 */
router.post("/ai-gateway/notify", async (req: Request, res: Response) => {
  try {
    const { type, organization_id } = req.body;

    if (!type || !organization_id) {
      return res.status(400).json({ error: "type and organization_id required" });
    }

    switch (type) {
      case "config_change":
        await notifyConfigChange(
          organization_id,
          req.body.changed_by_user_id,
          req.body.event
        );
        break;

      case "budget_warning":
        await notifyBudgetWarning(organization_id, req.body.budget);
        break;

      case "budget_exhausted":
        await notifyBudgetExhausted(organization_id, req.body.budget);
        break;

      case "guardrail_spike":
        await notifyGuardrailSpike(organization_id, req.body.stats);
        break;

      case "virtual_key_budget_exhausted":
        await notifyVirtualKeyBudgetExhausted(
          organization_id,
          req.body.key_name,
          req.body.spend,
          req.body.limit
        );
        break;

      default:
        return res.status(400).json({ error: `Unknown notification type: ${type}` });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error("Internal notification dispatch error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
