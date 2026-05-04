import { validateId } from "../validations/id.valid";

// Mock express-validator
const mockIsInt = jest.fn().mockReturnThis();
const mockWithMessage = jest.fn().mockReturnThis();
const mockValidationResult = jest.fn();

jest.mock("express-validator", () => ({
  check: jest.fn(() => ({
    isInt: mockIsInt,
    withMessage: mockWithMessage,
  })),
  validationResult: (...args: any[]) => mockValidationResult(...args),
}));

describe("validateId", () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = { params: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  it("should return an array of middleware", () => {
    const result = validateId();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("should use default param name 'id'", () => {
    const { check } = require("express-validator");
    validateId();
    expect(check).toHaveBeenCalledWith("id");
  });

  it("should use custom param name when provided", () => {
    const { check } = require("express-validator");
    validateId("userId");
    expect(check).toHaveBeenCalledWith("userId");
  });

  it("should call isInt with min 1", () => {
    validateId();
    expect(mockIsInt).toHaveBeenCalledWith({ min: 1 });
  });

  it("should call next when validation passes", () => {
    mockValidationResult.mockReturnValue({ isEmpty: () => true, array: () => [] });
    const middleware = validateId();
    const handler = middleware[1] as any;
    handler(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it("should return 400 with errors when validation fails", () => {
    const errors = [{ msg: "id must be a positive integer" }];
    mockValidationResult.mockReturnValue({ isEmpty: () => false, array: () => errors });
    const middleware = validateId();
    const handler = middleware[1] as any;
    handler(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ errors });
    expect(mockNext).not.toHaveBeenCalled();
  });
});
