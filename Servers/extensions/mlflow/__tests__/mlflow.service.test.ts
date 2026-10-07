jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../../services/extension/extensionService", () => ({ ExtensionService: {} }));

import http from "http";
import { AddressInfo } from "net";
import { requestTimeoutSeconds, syncModels, testConnection } from "../mlflow.service";

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

async function withServer(handler: Handler, run: (url: string) => Promise<void>) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run(url);
  } finally {
    server.closeAllConnections();
    server.close();
  }
}

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

describe("requestTimeoutSeconds", () => {
  it.each([
    [undefined, 30],
    ["", 30],
    [0, 30],
    [-5, 30],
    ["abc", 30],
    ["12", 12],
    [45, 45],
    [9999, 600],
  ])("timeout %p -> %p seconds", (timeout, expected) => {
    expect(requestTimeoutSeconds({ timeout: timeout as any })).toBe(expected);
  });
});

describe("MLflow sync and connection test", () => {
  it("aborts a request that exceeds the configured timeout", async () => {
    await withServer(
      () => {
        /* never respond */
      },
      async (url) => {
        const started = Date.now();
        const result = await testConnection({ tracking_server_url: url, timeout: 1 });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/timed out \(limit 1s per request/);
        expect(Date.now() - started).toBeLessThan(3000);
      },
    );
  });

  it("reports a failed runs request instead of claiming there are no runs", async () => {
    await withServer(
      (req, res) => {
        if (req.url?.includes("experiments/search")) {
          return json(res, 200, { experiments: [{ experiment_id: "1", name: "exp" }] });
        }
        return json(res, 403, { error_code: "PERMISSION_DENIED" });
      },
      async (url) => {
        const result = await syncModels(1, { tracking_server_url: url });
        expect(result.success).toBe(false);
        expect(result.error).toBe("Failed to fetch runs: HTTP 403");
      },
    );
  });

  it("treats a reachable server with no runs as a successful, empty sync", async () => {
    await withServer(
      (req, res) => {
        if (req.url?.includes("experiments/search")) return json(res, 200, { experiments: [] });
        return json(res, 200, {});
      },
      async (url) => {
        const result = await syncModels(1, { tracking_server_url: url });
        expect(result.success).toBe(true);
        expect(result.modelCount).toBe(0);
        expect(result.error).toBeUndefined();
      },
    );
  });

  it("includes the underlying cause of a connection failure", async () => {
    // Grab a free port, then close it so the connection is refused.
    const probe = http.createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const port = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));

    const result = await syncModels(1, {
      tracking_server_url: `http://127.0.0.1:${port}`,
      timeout: 2,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ECONNREFUSED/);
  });
});
