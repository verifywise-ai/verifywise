// Mock audit-ledger fire-and-forget writes to prevent deadlocks with cleanupDatabase
jest.mock("../../utils/auditLedger.utils", () => ({
  appendToAuditLedger: jest.fn().mockResolvedValue(undefined),
}));

// Mock notification services to prevent real email/Slack/in-app notifications during tests
jest.mock("../../services/userNotification/projectNotifications", () => ({
  sendProjectCreatedNotification: jest.fn().mockResolvedValue(undefined),
  sendUserAddedToProjectNotification: jest.fn().mockResolvedValue(undefined),
  ProjectRole: {},
}));
jest.mock("../../services/slack/slackNotificationService", () => ({
  sendSlackNotification: jest.fn().mockResolvedValue({ attempted: false, delivered: false }),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  sendInAppNotification: jest.fn().mockResolvedValue(undefined),
  notifyUserAssigned: jest.fn().mockResolvedValue(undefined),
  notifyTaskAssigned: jest.fn().mockResolvedValue(undefined),
  notifyTaskUpdated: jest.fn().mockResolvedValue(undefined),
  notifyEvidenceStale: jest.fn().mockResolvedValue(undefined),
  notifyParentLevelChanged: jest.fn().mockResolvedValue(undefined),
  notifyApprovalAutoApproved: jest.fn().mockResolvedValue(undefined),
  ITaskEntityLinkForEmail: {},
}));

// Mock BullMQ queues/workers so integration tests do not require a running Redis server
jest.mock("bullmq", () => {
  class MockQueue {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    add = jest.fn().mockResolvedValue({ id: "mock-job-id" });
    obliterate = jest.fn().mockResolvedValue(undefined);
    close = jest.fn().mockResolvedValue(undefined);
    on = jest.fn().mockReturnThis();
    once = jest.fn().mockResolvedValue(undefined);
  }
  class MockWorker {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    on = jest.fn().mockReturnThis();
    close = jest.fn().mockResolvedValue(undefined);
    run = jest.fn().mockResolvedValue(undefined);
  }
  class MockJob {
    id: string;
    data: any;
    constructor(id: string, data: any) {
      this.id = id;
      this.data = data;
    }
  }
  return { Queue: MockQueue, Worker: MockWorker, Job: MockJob };
});

// Mock the Redis client so integration tests do not require a running Redis server.
// app.ts imports database/redis at module load, which would otherwise open a real
// ioredis connection and emit an unhandled 'error' event if Redis is down.
jest.mock("../../database/redis", () => ({
  __esModule: true,
  default: {
    ping: jest.fn().mockResolvedValue("PONG"),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
    publish: jest.fn().mockResolvedValue(1),
    lpush: jest.fn().mockResolvedValue(1),
    lrange: jest.fn().mockResolvedValue([]),
    expire: jest.fn().mockResolvedValue(1),
    hget: jest.fn().mockResolvedValue(null),
    hset: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    incr: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
    srem: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    on: jest.fn().mockReturnThis(),
    once: jest.fn().mockReturnThis(),
    quit: jest.fn().mockResolvedValue("OK"),
    close: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    duplicate: jest.fn().mockReturnThis(),
  },
  REDIS_URL: "redis://localhost:6379/0",
}));

import http from "http";
import { Application, Request, Response, NextFunction } from "express";
import supertest, { Agent } from "supertest";
import { createApp } from "../../app";
import { getTenantHash } from "../../tools/getTenantHash";

export interface TestAppOptions {
  bypassAuth?: boolean;
  mockUser?: {
    userId?: number;
    role?: string;
    organizationId?: number;
  };
}

const DEFAULT_MOCK_USER = {
  userId: 1,
  role: "Admin",
  organizationId: 1,
};

/**
 * Test servers are bound to 127.0.0.1 explicitly, never to the wildcard
 * address. supertest hardcodes its request URL as `http://127.0.0.1:<port>`
 * (see supertest/lib/test.js `serverAddress`), and on BSD/macOS a wildcard
 * bind can be granted an ephemeral port that some unrelated process already
 * holds as a 127.0.0.1-specific listener — the more specific bind then wins
 * the connection and the test's request is answered by that foreign process.
 * A loopback-specific bind cannot be handed such a port: the OS refuses it
 * with EADDRINUSE. Binding here also means supertest finds `address()`
 * already populated and never calls `listen(0)` itself.
 */
const testServers: http.Server[] = [];

afterAll(() => {
  for (const server of testServers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
});

/**
 * The Express app with the test auth bypass mounted, not listening. For tests
 * that inspect the app itself (middleware order, router stack); anything that
 * sends a request uses createTestApp, which binds it to loopback.
 */
export function createTestExpressApp(options?: TestAppOptions): Application {
  const mockUser = { ...DEFAULT_MOCK_USER, ...options?.mockUser };

  const preRoutesMiddleware: Array<(req: Request, res: Response, next: NextFunction) => void> = [];

  if (options?.bypassAuth) {
    preRoutesMiddleware.push((req, _res, next) => {
      req.userId = mockUser.userId;
      req.role = mockUser.role;
      req.organizationId = mockUser.organizationId;
      req.tenantHash = getTenantHash(mockUser.organizationId);
      req.testBypassAuth = true;
      next();
    });
  }

  return createApp(preRoutesMiddleware);
}

export async function createTestApp(options?: TestAppOptions): Promise<http.Server> {
  const server = http.createServer(createTestExpressApp(options));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  testServers.push(server);
  return server;
}

export function testRequest(app: http.Server): Agent {
  return supertest.agent(app);
}
