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
  notifyUserAssigned: jest.fn().mockResolvedValue(undefined),
  notifyTaskAssigned: jest.fn().mockResolvedValue(undefined),
  notifyTaskUpdated: jest.fn().mockResolvedValue(undefined),
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
    isSuperAdmin?: boolean;
  };
}

const DEFAULT_MOCK_USER = {
  userId: 1,
  role: "Admin",
  organizationId: 1,
  isSuperAdmin: false,
};

export function createTestApp(options?: TestAppOptions): Application {
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

  return createApp(preRoutesMiddleware);
}

export function testRequest(app: Application): Agent {
  return supertest.agent(app);
}
