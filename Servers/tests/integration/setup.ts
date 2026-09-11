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
  sendSlackNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  sendInAppNotification: jest.fn().mockResolvedValue(undefined),
  notifyUserAssigned: jest.fn().mockResolvedValue(undefined),
  notifyTaskAssigned: jest.fn().mockResolvedValue(undefined),
  notifyTaskUpdated: jest.fn().mockResolvedValue(undefined),
  notifyEvidenceStale: jest.fn().mockResolvedValue(undefined),
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

import http from "http";
import { Request, Response, NextFunction } from "express";
import supertest, { Agent } from "supertest";
import { createApp } from "../../app";
import { getTenantHash } from "../../tools/getTenantHash";

export interface TestAppOptions {
  bypassAuth?: boolean;
  mockUser?: {
    userId?: number;
    role?: string;
    organizationId?: number;
    isSuperAdmin?: boolean;
  };
}

const DEFAULT_MOCK_USER = {
  userId: 1,
  role: "Admin",
  organizationId: 1,
  isSuperAdmin: false,
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

export async function createTestApp(options?: TestAppOptions): Promise<http.Server> {
  const mockUser = { ...DEFAULT_MOCK_USER, ...options?.mockUser };

  const preRoutesMiddleware: Array<(req: Request, res: Response, next: NextFunction) => void> = [];

  if (options?.bypassAuth) {
    preRoutesMiddleware.push((req, _res, next) => {
      req.userId = mockUser.userId;
      req.role = mockUser.role;
      req.organizationId = mockUser.organizationId;
      req.isSuperAdmin = mockUser.isSuperAdmin;
      req.tenantHash = getTenantHash(mockUser.organizationId);
      req.testBypassAuth = true;
      next();
    });
  }

  const server = http.createServer(createApp(preRoutesMiddleware));
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
