/**
 * Virtual Key Proxy Routes — thin proxy to FastAPI AIGateway service.
 *
 * OpenAI-compatible /v1/* endpoints. No JWT required.
 * Virtual key authentication is handled by the AIGateway Python service.
 */

import { createProxyMiddleware, fixRequestBody } from "http-proxy-middleware";
import express, { NextFunction, Request, Response, Router } from "express";
import { getGatewayUrl } from "../utils/aiGatewayConfig";

const MAX_BODY = "10mb";

// app.ts skips its JSON parser for /v1 so the gateway receives the bytes the
// client sent. This keeps the size cap without parsing: the body is read as
// raw bytes and written to the gateway as is. A gzip/deflate/br body is
// decompressed first (the cap then applies to the decompressed size), because
// the gateway does not decompress request bodies.
const rawBody = express.raw({ type: () => true, limit: MAX_BODY });

function virtualKeyProxyRoutes() {
  const router = Router();

  const proxy = createProxyMiddleware({
    // The startup fallback http-proxy-middleware requires; router below wins.
    target: getGatewayUrl(),
    // Resolve the gateway URL per request, so it follows AI_GATEWAY_URL as
    // read now rather than when the router was built.
    router: () => getGatewayUrl(),
    changeOrigin: true,
    // The router is mounted at /v1, so Express hands it "/chat/completions".
    // The gateway serves these routes under /v1, so put the prefix back.
    pathRewrite: (path: string) => `/v1${path}`,
    on: {
      // The body has been read before the proxy runs, so it must be written to
      // the proxied request again or the gateway waits for a body that never
      // arrives. rawBody leaves a Buffer, sent as is. fixRequestBody covers a
      // parsed object, in case a JSON parser ever runs first.
      proxyReq: (proxyReq, req) => {
        const body = (req as Request).body;
        if (Buffer.isBuffer(body)) {
          // The body is now a complete, decompressed buffer: the client's
          // chunked framing and content encoding no longer describe it
          proxyReq.removeHeader("Transfer-Encoding");
          proxyReq.removeHeader("Content-Encoding");
          proxyReq.setHeader("Content-Length", body.byteLength);
          proxyReq.write(body);
          return;
        }
        fixRequestBody(proxyReq, req as Request);
      },
      error: (err, req, res) => {
        const errAny = err as any;
        console.error(
          `[Virtual Key Proxy] Error for ${req.url}:`,
          errAny.message || errAny.code || errAny,
        );
        if (!res || !("writeHead" in res)) return;
        // A streamed response may fail after headers or chunks went out;
        // writing a status then would throw. Destroy the connection instead
        // of ending it, so the client sees a cut-off stream, not a complete one
        if (res.headersSent) {
          res.destroy();
          return;
        }
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "AI Gateway proxy error" }));
      },
    },
  });

  router.use(rawBody);
  // The body has been read, so "Expect: 100-continue" is already answered.
  // Forwarded, it makes the proxy skip the proxyReq hook above, and the
  // gateway then waits for a body that is never written.
  router.use((req: Request, _res: Response, next: NextFunction) => {
    delete req.headers.expect;
    next();
  });
  router.use("/", proxy);
  // Body errors (too large, aborted upload) answered in the gateway's shape
  router.use(
    (err: { type?: string; status?: number }, _req: Request, res: Response, next: NextFunction) => {
      if (err?.type === "entity.too.large") {
        res.status(413).json({ detail: "Request body is larger than 10 MB" });
        return;
      }
      if (err?.type === "encoding.unsupported") {
        res.status(415).json({ detail: "Unsupported Content-Encoding; use gzip, deflate or br" });
        return;
      }
      if (err?.status && err.status >= 400 && err.status < 500) {
        res.status(err.status).json({ detail: "Invalid request body" });
        return;
      }
      next(err);
    },
  );

  return router;
}

export default virtualKeyProxyRoutes;
