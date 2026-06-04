import { Router, Request, Response } from "express";
import logger from "../utils/logger/fileLogger";
import { rumErrorsTotal, rumWebVitals } from "../utils/metrics/registry";

const router = Router();

const VALID_VITALS = new Set(["LCP", "FID", "CLS", "INP", "TTFB"]);
const MAX_STACK_LEN = 8_000;
const MAX_MESSAGE_LEN = 2_000;

function clamp(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

router.post("/errors", (req: Request, res: Response) => {
  const body = req.body || {};
  const kind = typeof body.kind === "string" ? body.kind.slice(0, 64) : "unknown";
  const message = clamp(body.message, MAX_MESSAGE_LEN) || "";
  const stack = clamp(body.stack, MAX_STACK_LEN);
  const url = clamp(body.url, 2_000);
  const userAgent = clamp(req.headers["user-agent"], 512);
  const orgId = typeof body.org_id === "number" ? body.org_id : undefined;
  const userId = typeof body.user_id === "number" ? body.user_id : undefined;

  rumErrorsTotal.inc({ kind });

  logger.error(`[rum] ${message}`, {
    source: "frontend",
    kind,
    stack,
    url,
    user_agent: userAgent,
    org_id: orgId,
    user_id: userId,
  });

  res.status(204).end();
});

router.post("/vitals", (req: Request, res: Response) => {
  const body = req.body || {};
  const name = typeof body.name === "string" ? body.name : "";
  const valueMs = typeof body.value === "number" ? body.value : NaN;

  if (!VALID_VITALS.has(name) || !Number.isFinite(valueMs) || valueMs < 0) {
    res.status(400).json({ error: "invalid metric" });
    return;
  }

  // CLS is unitless; everything else is milliseconds. Histogram is in seconds,
  // so divide ms metrics by 1000.
  const observed = name === "CLS" ? valueMs : valueMs / 1000;
  rumWebVitals.observe({ metric: name }, observed);

  res.status(204).end();
});

export default router;
