/**
 * The /v1 virtual key proxy must hand the gateway the request the client sent:
 * - the /v1 prefix, which Express strips because the router is mounted at /v1
 * - the JSON body, which the app-wide express.json() parser has already read
 *   from the stream, so it has to be written to the proxied request again
 *
 * http-proxy-middleware is ESM-only and mapped to a stub under Jest, so these
 * tests check the options the route passes to it.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { gzipSync } from "zlib";

const proxyOptions: any[] = [];
const fixRequestBody = jest.fn();
jest.mock("http-proxy-middleware", () => ({
  createProxyMiddleware: (options: any) => {
    proxyOptions.push(options);
    return (_req: unknown, _res: unknown, next: () => void) => next();
  },
  fixRequestBody: (...args: unknown[]) => fixRequestBody(...args),
}));

import virtualKeyProxyRoutes from "../virtualKeyProxy.route";

beforeEach(() => {
  proxyOptions.length = 0;
  fixRequestBody.mockClear();
});

describe("/v1 virtual key proxy forwarding", () => {
  it("puts back the /v1 prefix Express strips from the mounted path", () => {
    virtualKeyProxyRoutes();
    const { pathRewrite } = proxyOptions[0];

    expect(pathRewrite("/chat/completions")).toBe("/v1/chat/completions");
    expect(pathRewrite("/models?limit=5")).toBe("/v1/models?limit=5");
    expect(pathRewrite("/")).toBe("/v1/");
  });

  it("re-sends the body the JSON parser already consumed", () => {
    virtualKeyProxyRoutes();
    const proxyReq = { setHeader: jest.fn() };
    const req = { body: { model: "customer-faq-assistant", messages: [] } };

    proxyOptions[0].on.proxyReq(proxyReq, req, {});

    expect(fixRequestBody).toHaveBeenCalledWith(proxyReq, req);
  });
});

describe("/v1 virtual key proxy body handling", () => {
  // The app-wide JSON parser skips /v1, so the route caps the size itself and
  // forwards the exact bytes it received.
  const appWithRoute = () => {
    const app = express();
    app.use("/v1", virtualKeyProxyRoutes());
    return app;
  };

  it("rejects a body over 10 MB with the gateway's error shape", async () => {
    const res = await request(appWithRoute())
      .post("/v1/chat/completions")
      .set("Content-Type", "application/json")
      .send("x".repeat(10 * 1024 * 1024 + 1));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ detail: "Request body is larger than 10 MB" });
  });

  it("writes a raw body to the proxied request unchanged", () => {
    virtualKeyProxyRoutes();
    const raw = Buffer.from('{"model":"faq","seed":12345678901234567890}');
    const proxyReq = { setHeader: jest.fn(), removeHeader: jest.fn(), write: jest.fn() };

    proxyOptions[0].on.proxyReq(proxyReq, { body: raw }, {});

    expect(proxyReq.setHeader).toHaveBeenCalledWith("Content-Length", raw.length);
    expect(proxyReq.write).toHaveBeenCalledWith(raw);
    expect(fixRequestBody).not.toHaveBeenCalled();
  });

  it("drops the client's framing and encoding headers, which no longer fit the body", () => {
    // Sending Transfer-Encoding: chunked next to Content-Length is rejected by
    // strict HTTP parsers; the body is also decompressed by then
    virtualKeyProxyRoutes();
    const proxyReq = { setHeader: jest.fn(), removeHeader: jest.fn(), write: jest.fn() };

    proxyOptions[0].on.proxyReq(proxyReq, { body: Buffer.from("{}") }, {});

    expect(proxyReq.removeHeader).toHaveBeenCalledWith("Transfer-Encoding");
    expect(proxyReq.removeHeader).toHaveBeenCalledWith("Content-Encoding");
  });

  it("decompresses a gzip body before forwarding it", async () => {
    // The stubbed proxy calls next(), so this handler sees what would be sent
    const app = appWithRoute();
    app.use((req, res) => {
      res.json({ forwarded: (req.body as Buffer).toString("utf8") });
    });
    const json = '{"model":"faq","messages":[]}';

    const res = await request(app)
      .post("/v1/chat/completions")
      // supertest re-serializes a Buffer sent as application/json; the route
      // reads every content type the same way
      .set("Content-Type", "application/octet-stream")
      .set("Content-Encoding", "gzip")
      .send(gzipSync(json));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ forwarded: json });
  });

  it("drops Expect once the body is read, so the proxy writes the body", async () => {
    const app = appWithRoute();
    app.use((req, res) => {
      res.json({ expect: req.headers.expect ?? null });
    });

    const res = await request(app)
      .post("/v1/chat/completions")
      .set("Content-Type", "application/octet-stream")
      .set("Expect", "100-continue")
      .send(Buffer.from("{}"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ expect: null });
  });

  it("names the problem when the body's encoding is not supported", async () => {
    const res = await request(appWithRoute())
      .post("/v1/chat/completions")
      .set("Content-Type", "application/octet-stream")
      .set("Content-Encoding", "compress")
      .send(Buffer.from("x"));

    expect(res.status).toBe(415);
    expect(res.body).toEqual({ detail: "Unsupported Content-Encoding; use gzip, deflate or br" });
  });
});

describe("/v1 virtual key proxy errors", () => {
  const fakeRes = (headersSent: boolean) => ({
    headersSent,
    writeHead: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
  });

  it("answers 502 in the gateway's error shape when the gateway cannot be reached", () => {
    virtualKeyProxyRoutes();
    const res = fakeRes(false);

    proxyOptions[0].on.error(new Error("connect ECONNREFUSED"), { url: "/chat/completions" }, res);

    expect(res.writeHead).toHaveBeenCalledWith(502, { "Content-Type": "application/json" });
    expect(JSON.parse(res.end.mock.calls[0][0] as string)).toEqual({
      detail: "AI Gateway proxy error",
    });
  });

  it("cuts a response that already started streaming, so the client sees it was not complete", () => {
    virtualKeyProxyRoutes();
    const res = fakeRes(true);

    proxyOptions[0].on.error(new Error("socket hang up"), { url: "/chat/completions" }, res);

    expect(res.writeHead).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
    expect(res.destroy).toHaveBeenCalled();
  });
});
