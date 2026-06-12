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
