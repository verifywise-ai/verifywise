import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/aiApp.utils", () => ({
  getAllAiAppsQuery: jest.fn(),
  getAiAppByIdQuery: jest.fn(),
  createAiAppQuery: jest.fn(),
  updateAiAppByIdQuery: jest.fn(),
  deleteAiAppByIdQuery: jest.fn(),
  getPolicySuggestionsQuery: jest.fn(),
  promoteFromShadowAiQuery: jest.fn(),
  linkModelsToAiAppQuery: jest.fn(),
  setPoliciesForAiAppQuery: jest.fn(),
  setDataExposureForAiAppQuery: jest.fn(),
}));

jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn().mockResolvedValue(undefined),
  logFailure: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    201: (data: any) => ({ message: "Created", data }),
    204: (data: any) => ({ message: "No Content", data }),
    404: (data: any) => ({ message: "Not Found", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
  },
}));

jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: any, error: any) => (error as Error).message),
}));

jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn().mockResolvedValue({
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

import {
  getAllAiApps,
  getAiAppById,
  createAiApp,
  updateAiAppById,
  deleteAiAppById,
  getPolicySuggestions,
  promoteFromShadowAi,
} from "../aiApp.ctrl";
import {
  getAllAiAppsQuery,
  getAiAppByIdQuery,
  createAiAppQuery,
  updateAiAppByIdQuery,
  deleteAiAppByIdQuery,
  getPolicySuggestionsQuery,
  promoteFromShadowAiQuery,
} from "../../utils/aiApp.utils";

const mockGetAll = getAllAiAppsQuery as jest.MockedFunction<typeof getAllAiAppsQuery>;
const mockGetById = getAiAppByIdQuery as jest.MockedFunction<typeof getAiAppByIdQuery>;
const mockCreate = createAiAppQuery as jest.MockedFunction<typeof createAiAppQuery>;
const mockUpdate = updateAiAppByIdQuery as jest.MockedFunction<typeof updateAiAppByIdQuery>;
const mockDelete = deleteAiAppByIdQuery as jest.MockedFunction<typeof deleteAiAppByIdQuery>;
const mockSuggestions = getPolicySuggestionsQuery as jest.MockedFunction<
  typeof getPolicySuggestionsQuery
>;
const mockPromote = promoteFromShadowAiQuery as jest.MockedFunction<
  typeof promoteFromShadowAiQuery
>;

function createReq(overrides?: Partial<Request>): any {
  return {
    userId: 1,
    organizationId: 1,
    role: "Admin",
    t: (k: string) => k,
    body: {},
    params: {},
    query: {},
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("aiApp.ctrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getAllAiApps", () => {
    it("should return 200 with AI Apps list", async () => {
      const req = createReq();
      const res = createRes();
      const result = { ai_apps: [{ id: 1, name: "ChatGPT" }], total: 1 };
      mockGetAll.mockResolvedValue(result);

      await getAllAiApps(req, res);

      expect(mockGetAll).toHaveBeenCalledWith(1, expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "OK", data: result });
    });

    it("should return 500 on error", async () => {
      const req = createReq();
      const res = createRes();
      mockGetAll.mockRejectedValue(new Error("Database error"));

      await getAllAiApps(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAiAppById", () => {
    it("should return 200 with AI App detail", async () => {
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      const app = { id: 1, name: "ChatGPT", policies: [], models: [] } as any;
      mockGetById.mockResolvedValue(app);

      await getAiAppById(req, res);

      expect(mockGetById).toHaveBeenCalledWith(1, 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "OK", data: app });
    });

    it("should return 404 when AI App not found", async () => {
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      mockGetById.mockResolvedValue(null);

      await getAiAppById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("createAiApp", () => {
    it("should return 201 with created AI App", async () => {
      const req = createReq({ body: { name: "ChatGPT" } });
      const res = createRes();
      const app = { id: 1, name: "ChatGPT" } as any;
      mockCreate.mockResolvedValue(app);

      await createAiApp(req, res);

      expect(mockCreate).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: "Created", data: app });
    });

    it("should return 500 on creation error", async () => {
      const req = createReq({ body: { name: "ChatGPT" } });
      const res = createRes();
      mockCreate.mockRejectedValue(new Error("Validation error"));

      await createAiApp(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateAiAppById", () => {
    it("should return 200 with updated AI App", async () => {
      const req = createReq({ params: { id: "1" }, body: { name: "Claude" } });
      const res = createRes();
      const app = { id: 1, name: "Claude" } as any;
      mockUpdate.mockResolvedValue(app);

      await updateAiAppById(req, res);

      expect(mockUpdate).toHaveBeenCalledWith(1, { name: "Claude" }, 1, expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("deleteAiAppById", () => {
    it("should return 200 when AI App deleted", async () => {
      const req = createReq({ params: { id: "1" } });
      const res = createRes();
      mockDelete.mockResolvedValue(true);

      await deleteAiAppById(req, res);

      expect(mockDelete).toHaveBeenCalledWith(1, 1, expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should return 404 when AI App not found", async () => {
      const req = createReq({ params: { id: "99" } });
      const res = createRes();
      mockDelete.mockResolvedValue(false);

      await deleteAiAppById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("getPolicySuggestions", () => {
    it("should return 200 with suggestions", async () => {
      const req = createReq({ query: { name: "ChatGPT" } });
      const res = createRes();
      const suggestions = [{ id: 1, title: "AI Usage Policy", suggested: true }];
      mockSuggestions.mockResolvedValue(suggestions);

      await getPolicySuggestions(req, res);

      expect(mockSuggestions).toHaveBeenCalledWith("ChatGPT", 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "OK", data: suggestions });
    });
  });

  describe("promoteFromShadowAi", () => {
    it("should return 201 with promoted AI App", async () => {
      const req = createReq({ params: { shadowAiToolId: "5" } });
      const res = createRes();
      const app = { id: 2, name: "Detected Tool" } as any;
      mockPromote.mockResolvedValue(app);

      await promoteFromShadowAi(req, res);

      expect(mockPromote).toHaveBeenCalledWith(5, 1, expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: "Created", data: app });
    });
  });
});
