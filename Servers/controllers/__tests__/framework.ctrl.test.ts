import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { Request, Response } from "express";

jest.mock("../../utils/framework.utils", () => ({
  getAllFrameworksQuery: jest.fn(),
  getAllFrameworkByIdQuery: jest.fn(),
  addFrameworkToProjectQuery: jest.fn(),
  deleteFrameworkFromProjectQuery: jest.fn(),
}));

jest.mock("../../utils/approvalRequest.utils", () => ({
  hasPendingApprovalQuery: jest.fn(),
}));

jest.mock("../../domain.layer/models/frameworks/frameworks.model", () => ({
  FrameworkModel: {
    findByIdWithValidation: jest.fn(),
  },
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn() },
  logStructured: jest.fn(),
}));

jest.mock("../../utils/logger/dbLogger", () => ({
  logEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: {
    200: (data: any) => ({ message: "OK", data }),
    204: (data: any) => ({ message: "No Content", data }),
    400: (data: any) => ({ message: "Bad Request", data }),
    403: (data: any) => ({ message: "Forbidden", data }),
    404: (data: any) => ({ message: "Not Found", data }),
    500: (data: any) => ({ message: "Internal Server Error", data }),
  },
}));

jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn().mockResolvedValue({
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

jest.mock("../../utils/i18n.utils", () => ({
  translateError: jest.fn((_req: any, error: any) => (error as Error).message),
}));

import {
  getAllFrameworks,
  getFrameworkById,
  addFrameworkToProject,
  deleteFrameworkFromProject,
} from "../framework.ctrl";
import {
  getAllFrameworksQuery,
  getAllFrameworkByIdQuery,
  addFrameworkToProjectQuery,
  deleteFrameworkFromProjectQuery,
} from "../../utils/framework.utils";
import { hasPendingApprovalQuery } from "../../utils/approvalRequest.utils";
import { FrameworkModel } from "../../domain.layer/models/frameworks/frameworks.model";
import { sequelize } from "../../database/db";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const mockGetAll = getAllFrameworksQuery as jest.MockedFunction<typeof getAllFrameworksQuery>;
const mockGetById = getAllFrameworkByIdQuery as jest.MockedFunction<
  typeof getAllFrameworkByIdQuery
>;
const mockAdd = addFrameworkToProjectQuery as jest.MockedFunction<
  typeof addFrameworkToProjectQuery
>;
const mockDelete = deleteFrameworkFromProjectQuery as jest.MockedFunction<
  typeof deleteFrameworkFromProjectQuery
>;
const mockHasPending = hasPendingApprovalQuery as jest.MockedFunction<
  typeof hasPendingApprovalQuery
>;
const mockFrameworkModel = FrameworkModel as jest.Mocked<typeof FrameworkModel>;
const mockTransaction = sequelize.transaction as jest.MockedFunction<typeof sequelize.transaction>;

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

describe("getAllFrameworks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should return 200 with frameworks", async () => {
    const frameworks = [{ id: 1, name: "ISO" }];
    mockGetAll.mockResolvedValue(frameworks as any);
    const req = createReq();
    const res = createRes();

    await getAllFrameworks(req, res);

    expect(mockGetAll).toHaveBeenCalledWith(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "OK", data: frameworks });
  });

  it("should return 204 when no frameworks", async () => {
    mockGetAll.mockResolvedValue([]);
    const req = createReq();
    const res = createRes();

    await getAllFrameworks(req, res);

    expect(mockGetAll).toHaveBeenCalledWith(1);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.json).toHaveBeenCalledWith({ message: "No Content", data: [] });
  });

  it("should return 500 on error", async () => {
    const error = new Error("Database failure");
    mockGetAll.mockRejectedValue(error);
    const req = createReq();
    const res = createRes();

    await getAllFrameworks(req, res);

    expect(mockGetAll).toHaveBeenCalledWith(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Internal Server Error",
      data: "Database failure",
    });
  });
});

describe("getFrameworkById", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should return 200 when framework is found", async () => {
    const framework = { id: 1, name: "ISO" };
    mockGetById.mockResolvedValue(framework as any);
    const req = createReq({ params: { id: "1" } });
    const res = createRes();

    await getFrameworkById(req, res);

    expect(mockGetById).toHaveBeenCalledWith(1, 1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "OK", data: framework });
  });

  it("should return 404 when framework is not found", async () => {
    mockGetById.mockResolvedValue(null);
    const req = createReq({ params: { id: "1" } });
    const res = createRes();

    await getFrameworkById(req, res);

    expect(mockGetById).toHaveBeenCalledWith(1, 1);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Not Found", data: null });
  });

  it("should return 500 on error", async () => {
    const error = new Error("Database failure");
    mockGetById.mockRejectedValue(error);
    const req = createReq({ params: { id: "1" } });
    const res = createRes();

    await getFrameworkById(req, res);

    expect(mockGetById).toHaveBeenCalledWith(1, 1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Internal Server Error",
      data: "Database failure",
    });
  });
});

describe("addFrameworkToProject", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should return 200 when framework is added", async () => {
    const transaction = {
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    mockTransaction.mockResolvedValue(transaction as any);
    mockHasPending.mockResolvedValue(false);
    mockFrameworkModel.findByIdWithValidation.mockResolvedValue({ id: 1 } as any);
    const result = { id: 1 };
    mockAdd.mockResolvedValue(result as any);
    const req = createReq({ query: { frameworkId: "1", projectId: "2" } });
    const res = createRes();

    await addFrameworkToProject(req, res);

    expect(mockHasPending).toHaveBeenCalledWith(2, "use_case", 1);
    expect(mockFrameworkModel.findByIdWithValidation).toHaveBeenCalledWith(1);
    expect(mockAdd).toHaveBeenCalledWith(1, 2, 1, transaction);
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "OK", data: result });
  });

  it("should return 403 when pending approval exists", async () => {
    const transaction = {
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    mockTransaction.mockResolvedValue(transaction as any);
    mockHasPending.mockResolvedValue(true);
    const req = createReq({ query: { frameworkId: "1", projectId: "2" } });
    const res = createRes();

    await addFrameworkToProject(req, res);

    expect(mockHasPending).toHaveBeenCalledWith(2, "use_case", 1);
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Forbidden",
      data: "This use case has a pending approval request and cannot be modified until the approval process is complete.",
    });
  });

  it("should return 404 when framework not found", async () => {
    const transaction = {
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    mockTransaction.mockResolvedValue(transaction as any);
    mockHasPending.mockResolvedValue(false);
    mockFrameworkModel.findByIdWithValidation.mockResolvedValue(null);
    const req = createReq({ query: { frameworkId: "1", projectId: "2" } });
    const res = createRes();

    await addFrameworkToProject(req, res);

    expect(mockHasPending).toHaveBeenCalledWith(2, "use_case", 1);
    expect(mockFrameworkModel.findByIdWithValidation).toHaveBeenCalledWith(1);
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Not Found", data: "Framework not found" });
  });

  it("should return 500 on error", async () => {
    const transaction = {
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    mockTransaction.mockResolvedValue(transaction as any);
    mockHasPending.mockResolvedValue(false);
    mockFrameworkModel.findByIdWithValidation.mockResolvedValue({ id: 1 } as any);
    const error = new Error("Database failure");
    mockAdd.mockRejectedValue(error);
    const req = createReq({ query: { frameworkId: "1", projectId: "2" } });
    const res = createRes();

    await addFrameworkToProject(req, res);

    expect(mockHasPending).toHaveBeenCalledWith(2, "use_case", 1);
    expect(mockFrameworkModel.findByIdWithValidation).toHaveBeenCalledWith(1);
    expect(mockAdd).toHaveBeenCalledWith(1, 2, 1, transaction);
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Internal Server Error",
      data: "Database failure",
    });
  });
});

describe("deleteFrameworkFromProject", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should return 200 when framework is removed", async () => {
    const transaction = {
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    mockTransaction.mockResolvedValue(transaction as any);
    mockHasPending.mockResolvedValue(false);
    mockFrameworkModel.findByIdWithValidation.mockResolvedValue({ id: 1 } as any);
    const result = { id: 1 };
    mockDelete.mockResolvedValue(result as any);
    const req = createReq({ query: { frameworkId: "1", projectId: "2" } });
    const res = createRes();

    await deleteFrameworkFromProject(req, res);

    expect(mockHasPending).toHaveBeenCalledWith(2, "use_case", 1);
    expect(mockFrameworkModel.findByIdWithValidation).toHaveBeenCalledWith(1);
    expect(mockDelete).toHaveBeenCalledWith(1, 2, 1, transaction);
    expect(transaction.commit).toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: "OK", data: result });
  });

  it("should return 403 when pending approval exists", async () => {
    const transaction = {
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    mockTransaction.mockResolvedValue(transaction as any);
    mockHasPending.mockResolvedValue(true);
    const req = createReq({ query: { frameworkId: "1", projectId: "2" } });
    const res = createRes();

    await deleteFrameworkFromProject(req, res);

    expect(mockHasPending).toHaveBeenCalledWith(2, "use_case", 1);
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Forbidden",
      data: "This use case has a pending approval request and cannot be modified until the approval process is complete.",
    });
  });

  it("should return 404 when framework not found", async () => {
    const transaction = {
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    mockTransaction.mockResolvedValue(transaction as any);
    mockHasPending.mockResolvedValue(false);
    mockFrameworkModel.findByIdWithValidation.mockResolvedValue(null);
    const req = createReq({ query: { frameworkId: "1", projectId: "2" } });
    const res = createRes();

    await deleteFrameworkFromProject(req, res);

    expect(mockHasPending).toHaveBeenCalledWith(2, "use_case", 1);
    expect(mockFrameworkModel.findByIdWithValidation).toHaveBeenCalledWith(1);
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Not Found", data: "Framework not found" });
  });

  it("should return 500 on error", async () => {
    const transaction = {
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    mockTransaction.mockResolvedValue(transaction as any);
    mockHasPending.mockResolvedValue(false);
    mockFrameworkModel.findByIdWithValidation.mockResolvedValue({ id: 1 } as any);
    const error = new Error("Database failure");
    mockDelete.mockRejectedValue(error);
    const req = createReq({ query: { frameworkId: "1", projectId: "2" } });
    const res = createRes();

    await deleteFrameworkFromProject(req, res);

    expect(mockHasPending).toHaveBeenCalledWith(2, "use_case", 1);
    expect(mockFrameworkModel.findByIdWithValidation).toHaveBeenCalledWith(1);
    expect(mockDelete).toHaveBeenCalledWith(1, 2, 1, transaction);
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Internal Server Error",
      data: "Database failure",
    });
  });
});
