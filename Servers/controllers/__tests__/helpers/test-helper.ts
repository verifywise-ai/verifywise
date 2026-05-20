import { Request, Response, NextFunction } from "express";

export interface MockRequestOverrides {
  userId?: number;
  organizationId?: number;
  role?: string;
  tenantId?: string;
  body?: any;
  params?: any;
  query?: any;
  headers?: any;
  file?: any;
}

export function createMockReq(
  overrides: MockRequestOverrides = {},
): Partial<Request> & MockRequestOverrides {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    tenantId: "a1b2c3d4e5",
    body: {},
    params: {},
    query: {},
    headers: {},
    t: (key: string) => key,
    ...overrides,
  } as any;
}

export function createMockRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
}

export function createMockNext(): NextFunction {
  return jest.fn();
}

export const mockStatusCode = {
  200: (data: any) => ({ message: "OK", data }),
  201: (data: any) => ({ message: "Created", data }),
  202: (data: any) => ({ message: "Accepted", data }),
  204: (data: any) => ({ message: "No Content", data }),
  400: (data: any) => ({ message: "Bad Request", data }),
  401: (data: any) => ({ message: "Unauthorized", data }),
  403: (data: any) => ({ message: "Forbidden", data }),
  404: (data: any) => ({ message: "Not Found", data }),
  406: (data: any) => ({ message: "Not Acceptable", data }),
  409: (data: any) => ({ message: "Conflict", data }),
  422: (data: any) => ({ message: "Unprocessable Entity", data }),
  500: (data: any) => ({ message: "Internal Server Error", data }),
};
