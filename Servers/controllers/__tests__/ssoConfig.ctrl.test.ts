import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/ssoConfig.utils", () => ({
  isSSOFeatureEnabled: jest.fn(),
  getSSOConfigQuery: jest.fn(),
  getFirstEnabledSSOConfigQuery: jest.fn(),
  getSSOCapableOrganizationsQuery: jest.fn(),
  saveSSOConfigQuery: jest.fn(),
  setSSOEnabledQuery: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    201: (data: any) => ({ message: "Created", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    404: (data: any) => ({ message: "Not Found", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
  },
}));

import { getSSOConfig, saveSSOConfig } from "../ssoConfig.ctrl";
import { getSSOConfigQuery, saveSSOConfigQuery } from "../../utils/ssoConfig.utils";

const mockGetConfig = getSSOConfigQuery as jest.MockedFunction<typeof getSSOConfigQuery>;
const mockSaveConfig = saveSSOConfigQuery as jest.MockedFunction<typeof saveSSOConfigQuery>;

function createReq(overrides?: Partial<Request>): Request {
  return {
    organizationId: 1,
    query: { provider: "AzureAD" },
    body: {},
    ...overrides,
  } as any;
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn<any>().mockReturnValue(res);
  res.json = jest.fn<any>().mockReturnValue(res);
  return res;
}

// getSSOConfigQuery/saveSSOConfigQuery run raw sequelize.query() under the
// hood, so at runtime they resolve to plain objects, not Sequelize model
// instances with a .toJSON() method. These POJOs are what the mocks below
// simulate (regression test for #4219).
const rawRow = {
  id: 1,
  organization_id: 1,
  provider: "AzureAD",
  is_enabled: false,
  config_data: {
    client_id: "client-1",
    client_secret: "top-secret",
    tenant_id: "tenant-1",
  },
};

describe("ssoConfig.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getSSOConfig", () => {
    it("does not crash on a plain-object row and masks the secret", async () => {
      mockGetConfig.mockResolvedValue(rawRow as any);

      const req = createReq();
      const res = createRes();

      await getSSOConfig(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "OK",
        data: {
          ...rawRow,
          config_data: { ...rawRow.config_data, client_secret: "********" },
        },
      });
    });

    it("returns 404 when no config exists", async () => {
      mockGetConfig.mockResolvedValue(undefined);

      const req = createReq();
      const res = createRes();

      await getSSOConfig(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("saveSSOConfig", () => {
    it("does not crash on a plain-object row and masks the secret", async () => {
      mockSaveConfig.mockResolvedValue(rawRow as any);

      const req = createReq({ body: rawRow.config_data });
      const res = createRes();

      await saveSSOConfig(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "Created",
        data: {
          ...rawRow,
          config_data: { ...rawRow.config_data, client_secret: "********" },
        },
      });
    });
  });
});
