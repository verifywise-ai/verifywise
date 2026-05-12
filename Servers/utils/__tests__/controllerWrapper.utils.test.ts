import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Request, Response } from "express";

// Mock dependencies
jest.mock("../logger/logHelper", () => ({
  logProcessing: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  logSuccess: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  logFailure: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock("../../domain.layer/exceptions/custom.exception", () => ({
  isCustomException: jest.fn().mockReturnValue(false),
  ValidationException: class extends Error {
    statusCode = 400;
  },
  NotFoundException: class extends Error {
    statusCode = 404;
  },
}));

import { controllerWrapper, ControllerResult } from "../controllerWrapper.utils";
import { logProcessing, logSuccess, logFailure } from "../logger/logHelper";
import { isCustomException } from "../../domain.layer/exceptions/custom.exception";

const mockLogProcessing = logProcessing as jest.MockedFunction<typeof logProcessing>;
const mockLogSuccess = logSuccess as jest.MockedFunction<typeof logSuccess>;
const mockLogFailure = logFailure as jest.MockedFunction<typeof logFailure>;
const mockIsCustomException = isCustomException as jest.MockedFunction<typeof isCustomException>;

describe("controllerWrapper.utils", () => {
  const mockReq = { userId: 1, tenantId: "abc123" } as unknown as Request;
  const mockRes = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsCustomException.mockReturnValue(false);
  });

  describe("controllerWrapper", () => {
    it("should return 200 with data and log processing and success when handler succeeds", async () => {
      const handler = jest
        .fn<(req: Request, res: Response) => Promise<ControllerResult<{ id: number }>>>()
        .mockResolvedValue({ status: 200, data: { id: 1 } });
      const wrapper = controllerWrapper(handler, {
        functionName: "getItem",
        fileName: "item.ctrl.ts",
        eventType: "Read",
        successDescription: "Item retrieved successfully",
      });

      await wrapper(mockReq, mockRes);

      expect(handler).toHaveBeenCalledWith(mockReq, mockRes);
      expect(mockLogProcessing).toHaveBeenCalledWith({
        description: "starting getItem",
        functionName: "getItem",
        fileName: "item.ctrl.ts",
        userId: 1,
        tenantId: "abc123",
      });
      expect(mockLogSuccess).toHaveBeenCalledWith({
        eventType: "Read",
        description: "Item retrieved successfully",
        functionName: "getItem",
        fileName: "item.ctrl.ts",
        userId: 1,
        tenantId: "abc123",
      });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ message: "OK", data: { id: 1 } });
    });

    it("should call dynamic successDescription function with result data when provided", async () => {
      const successDescription = jest
        .fn<(result: any) => string>()
        .mockReturnValue("Dynamic success message");
      const handler = jest
        .fn<(req: Request, res: Response) => Promise<ControllerResult<{ count: number }>>>()
        .mockResolvedValue({ status: 200, data: { count: 5 } });
      const wrapper = controllerWrapper(handler, {
        functionName: "listItems",
        fileName: "item.ctrl.ts",
        eventType: "Read",
        successDescription,
      });

      await wrapper(mockReq, mockRes);

      expect(successDescription).toHaveBeenCalledWith({ count: 5 });
      expect(mockLogSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Dynamic success message" }),
      );
    });

    it("should return custom exception status code and message when handler throws a custom exception", async () => {
      mockIsCustomException.mockReturnValue(true);
      const error = Object.assign(new Error("Not found"), { statusCode: 404 });
      const handler = jest
        .fn<(req: Request, res: Response) => Promise<ControllerResult<any>>>()
        .mockRejectedValue(error);
      const wrapper = controllerWrapper(handler, {
        functionName: "getItem",
        fileName: "item.ctrl.ts",
        eventType: "Read",
      });

      await wrapper(mockReq, mockRes);

      expect(mockLogFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "getItem failed",
          functionName: "getItem",
          fileName: "item.ctrl.ts",
          error,
          userId: 1,
          tenantId: "abc123",
        }),
      );
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ message: "Not Found", data: "Not found" });
    });

    it("should return 500 with error message when handler throws a generic error", async () => {
      const error = new Error("Something went wrong");
      const handler = jest
        .fn<(req: Request, res: Response) => Promise<ControllerResult<any>>>()
        .mockRejectedValue(error);
      const wrapper = controllerWrapper(handler, {
        functionName: "getItem",
        fileName: "item.ctrl.ts",
        eventType: "Read",
      });

      await wrapper(mockReq, mockRes);

      expect(mockLogFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "getItem failed",
          error,
        }),
      );
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: "Internal Server Error",
        error: "Something went wrong",
      });
    });

    it("should return 204 with undefined data when handler returns no content", async () => {
      const handler = jest
        .fn<(req: Request, res: Response) => Promise<ControllerResult<undefined>>>()
        .mockResolvedValue({ status: 204 });
      const wrapper = controllerWrapper(handler, {
        functionName: "deleteItem",
        fileName: "item.ctrl.ts",
        eventType: "Delete",
      });

      await wrapper(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(204);
      expect(mockRes.json).toHaveBeenCalledWith({ message: "No Content", data: undefined });
      expect(mockLogSuccess).toHaveBeenCalled();
    });

    it("should use default descriptions when options descriptions are not provided", async () => {
      const handler = jest
        .fn<(req: Request, res: Response) => Promise<ControllerResult<object>>>()
        .mockResolvedValue({ status: 200, data: {} });
      const wrapper = controllerWrapper(handler, {
        functionName: "updateItem",
        fileName: "item.ctrl.ts",
        eventType: "Update",
      });

      await wrapper(mockReq, mockRes);

      expect(mockLogProcessing).toHaveBeenCalledWith(
        expect.objectContaining({ description: "starting updateItem" }),
      );
      expect(mockLogSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ description: "updateItem completed successfully" }),
      );
    });
  });
});
