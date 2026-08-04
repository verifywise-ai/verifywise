import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, sep } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { SimConfig } from "../types.js";
import { DashboardEvent } from "./events.js";
import { runDashboardSimulation, RunnerDeps } from "./runner.js";
import { loadConfig } from "../configLoader.js";
import { runSetup } from "../setup.js";
import { computeMetrics } from "../computeClient.js";
import { IngestClient } from "../ingestClient.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "..", "public");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

export interface DashboardServerOpts {
  cfg: SimConfig;
  startDate: Date;
  days: number;
  port: number;
}

export const startDashboardServer = async (
  opts: DashboardServerOpts,
): Promise<{ url: string; close: () => void }> => {
  const buffer: DashboardEvent[] = [];
  const clients = new Set<WebSocket>();

  const broadcast = (e: DashboardEvent) => {
    buffer.push(e);
    const data = JSON.stringify(e);
    for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
  };

  const publicReal = await realpath(PUBLIC);

  const httpServer = createServer(async (req, res) => {
    const urlPath = req.url === "/" ? "/index.html" : (req.url ?? "/index.html");
    const rawPath = decodeURIComponent(urlPath.split("?")[0]);

    // Reject traversal attempts and null bytes before touching the filesystem.
    if (
      rawPath.includes("\0") ||
      rawPath.split("/").includes("..") ||
      rawPath.split("\\").includes("..")
    ) {
      res.writeHead(403).end("forbidden");
      return;
    }

    // Resolve the real path (following symlinks) and require it to stay strictly
    // inside PUBLIC. A plain string prefix check on the un-resolved join is
    // bypassable (sibling dirs sharing the prefix, symlinks, "..").
    let filePath: string;
    try {
      filePath = await realpath(join(publicReal, rawPath));
    } catch {
      res.writeHead(404).end("not found");
      return;
    }
    if (filePath !== publicReal && !filePath.startsWith(publicReal + sep)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(filePath);
      res.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on("connection", (ws) => {
    clients.add(ws);
    // Replay buffered events so a late-joining browser sees history.
    for (const e of buffer) ws.send(JSON.stringify(e));
    ws.on("close", () => clients.delete(ws));
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    // Bind to loopback only — this dev dashboard must not be reachable from the LAN.
    httpServer.listen(opts.port, "127.0.0.1", resolve);
  });

  const deps: RunnerDeps = {
    loadConfig,
    runSetup,
    makeIngestClient: (cfg, token) => new IngestClient(cfg, token),
    computeMetrics,
  };

  // Kick off the simulation after a short delay so an auto-opened browser can connect.
  setTimeout(() => {
    void runDashboardSimulation(deps, { cfg: opts.cfg, startDate: opts.startDate, days: opts.days }, broadcast);
  }, 800);

  return {
    url: `http://localhost:${opts.port}`,
    close: () => {
      for (const ws of clients) ws.close();
      wss.close();
      httpServer.close();
    },
  };
};
