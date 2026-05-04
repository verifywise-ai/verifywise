import {
  CustomException,
  ValidationException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  BusinessLogicException,
  DatabaseException,
  ExternalServiceException,
  ConfigurationException,
  isCustomException,
  createCustomException,
  ExceptionFactory,
} from "../exceptions/custom.exception";

describe("CustomException", () => {
  it("should create with default values", () => {
    const ex = new CustomException("test error");
    expect(ex.message).toBe("test error");
    expect(ex.code).toBe("CUSTOM_EXCEPTION");
    expect(ex.statusCode).toBe(500);
    expect(ex.metadata).toEqual({});
    expect(ex.timestamp).toBeInstanceOf(Date);
    expect(ex.cause).toBeUndefined();
    expect(ex.name).toBe("CustomException");
  });

  it("should create with custom options", () => {
    const cause = new Error("root cause");
    const timestamp = new Date("2024-01-01");
    const ex = new CustomException("test", {
      code: "TEST_CODE",
      statusCode: 418,
      metadata: { key: "value" },
      cause,
      timestamp,
    });
    expect(ex.code).toBe("TEST_CODE");
    expect(ex.statusCode).toBe(418);
    expect(ex.metadata).toEqual({ key: "value" });
    expect(ex.cause).toBe(cause);
    expect(ex.timestamp).toBe(timestamp);
  });

  describe("getFormattedMessage", () => {
    it("should return just the message for default code", () => {
      const ex = new CustomException("test error");
      expect(ex.getFormattedMessage()).toBe("test error");
    });

    it("should include code when not default", () => {
      const ex = new CustomException("test error", { code: "MY_CODE" });
      expect(ex.getFormattedMessage()).toContain("[MY_CODE]");
    });

    it("should include metadata when present", () => {
      const ex = new CustomException("test", { code: "MY_CODE", metadata: { foo: "bar" } });
      const formatted = ex.getFormattedMessage();
      expect(formatted).toContain("Metadata:");
      expect(formatted).toContain("foo");
    });
  });

  describe("toJSON", () => {
    it("should serialize to plain object", () => {
      const cause = new Error("root");
      const ex = new CustomException("test", {
        code: "TEST",
        statusCode: 400,
        metadata: { field: "name" },
        cause,
      });
      const json = ex.toJSON() as any;
      expect(json.name).toBe("CustomException");
      expect(json.message).toBe("test");
      expect(json.code).toBe("TEST");
      expect(json.statusCode).toBe(400);
      expect(json.metadata).toEqual({ field: "name" });
      expect(json.timestamp).toBeDefined();
      expect(json.cause).toBe("root");
    });

    it("should handle missing cause", () => {
      const ex = new CustomException("test");
      const json = ex.toJSON() as any;
      expect(json.cause).toBeUndefined();
    });
  });

  describe("withMetadata", () => {
    it("should return new exception with merged metadata", () => {
      const ex = new CustomException("test", { metadata: { a: 1 } });
      const newEx = ex.withMetadata({ b: 2 });
      expect(newEx).not.toBe(ex);
      expect(newEx.metadata).toEqual({ a: 1, b: 2 });
      expect(newEx.message).toBe("test");
    });

    it("should preserve original metadata", () => {
      const ex = new CustomException("test", { metadata: { a: 1 } });
      ex.withMetadata({ b: 2 });
      expect(ex.metadata).toEqual({ a: 1 });
    });
  });
});

describe("ValidationException", () => {
  it("should set correct code and status", () => {
    const ex = new ValidationException("Invalid input", "email", "bad@");
    expect(ex.code).toBe("VALIDATION_ERROR");
    expect(ex.statusCode).toBe(400);
    expect(ex.metadata.field).toBe("email");
    expect(ex.metadata.value).toBe("bad@");
  });

  it("should handle optional parameters", () => {
    const ex = new ValidationException("Invalid");
    expect(ex.metadata.field).toBeUndefined();
    expect(ex.metadata.value).toBeUndefined();
  });

  it("should merge additional metadata (options.metadata overrides field/value)", () => {
    const ex = new ValidationException("Invalid", "name", "x", { metadata: { extra: true } });
    expect(ex.metadata.extra).toBe(true);
    // options.metadata spread overrides the field/value set earlier in the constructor
  });
});

describe("NotFoundException", () => {
  it("should set correct code and status", () => {
    const ex = new NotFoundException("Not found", "User", 42);
    expect(ex.code).toBe("NOT_FOUND");
    expect(ex.statusCode).toBe(404);
    expect(ex.metadata.resource).toBe("User");
    expect(ex.metadata.identifier).toBe(42);
  });
});

describe("UnauthorizedException", () => {
  it("should set correct code and status with default message", () => {
    const ex = new UnauthorizedException();
    expect(ex.code).toBe("UNAUTHORIZED");
    expect(ex.statusCode).toBe(401);
    expect(ex.message).toBe("Unauthorized access");
  });

  it("should accept custom message", () => {
    const ex = new UnauthorizedException("Token expired");
    expect(ex.message).toBe("Token expired");
  });
});

describe("ForbiddenException", () => {
  it("should set correct code and status", () => {
    const ex = new ForbiddenException("No access", "Project", "delete");
    expect(ex.code).toBe("FORBIDDEN");
    expect(ex.statusCode).toBe(403);
    expect(ex.metadata.resource).toBe("Project");
    expect(ex.metadata.action).toBe("delete");
  });

  it("should use default message", () => {
    const ex = new ForbiddenException();
    expect(ex.message).toBe("Access forbidden");
  });
});

describe("ConflictException", () => {
  it("should set correct code and status", () => {
    const ex = new ConflictException("Duplicate", "User", "email");
    expect(ex.code).toBe("CONFLICT");
    expect(ex.statusCode).toBe(409);
    expect(ex.metadata.resource).toBe("User");
    expect(ex.metadata.conflictField).toBe("email");
  });
});

describe("BusinessLogicException", () => {
  it("should set correct code and status", () => {
    const ex = new BusinessLogicException("Cannot delete", "ACTIVE_PROJECT", { projectId: 1 });
    expect(ex.code).toBe("BUSINESS_LOGIC_ERROR");
    expect(ex.statusCode).toBe(422);
    expect(ex.metadata.rule).toBe("ACTIVE_PROJECT");
    expect(ex.metadata.context).toEqual({ projectId: 1 });
  });
});

describe("DatabaseException", () => {
  it("should set correct code and status", () => {
    const ex = new DatabaseException("Query failed", "INSERT", "users");
    expect(ex.code).toBe("DATABASE_ERROR");
    expect(ex.statusCode).toBe(500);
    expect(ex.metadata.operation).toBe("INSERT");
    expect(ex.metadata.table).toBe("users");
  });
});

describe("ExternalServiceException", () => {
  it("should set correct code and status", () => {
    const ex = new ExternalServiceException("Timeout", "PaymentAPI", "/charge");
    expect(ex.code).toBe("EXTERNAL_SERVICE_ERROR");
    expect(ex.statusCode).toBe(502);
    expect(ex.metadata.service).toBe("PaymentAPI");
    expect(ex.metadata.endpoint).toBe("/charge");
  });
});

describe("ConfigurationException", () => {
  it("should set correct code and status", () => {
    const ex = new ConfigurationException("Missing config", "DATABASE_URL");
    expect(ex.code).toBe("CONFIGURATION_ERROR");
    expect(ex.statusCode).toBe(500);
    expect(ex.metadata.configKey).toBe("DATABASE_URL");
  });
});

describe("isCustomException", () => {
  it("should return true for CustomException", () => {
    expect(isCustomException(new CustomException("test"))).toBe(true);
  });

  it("should return true for subclass exceptions", () => {
    expect(isCustomException(new ValidationException("test"))).toBe(true);
    expect(isCustomException(new NotFoundException("test"))).toBe(true);
  });

  it("should return false for standard Error", () => {
    expect(isCustomException(new Error("test"))).toBe(false);
  });

  it("should return false for non-error values", () => {
    expect(isCustomException(null)).toBe(false);
    expect(isCustomException("error")).toBe(false);
    expect(isCustomException(42)).toBe(false);
  });
});

describe("createCustomException", () => {
  it("should create CustomException from Error", () => {
    const original = new Error("original");
    const ex = createCustomException(original);
    expect(ex).toBeInstanceOf(CustomException);
    expect(ex.message).toBe("original");
    expect(ex.cause).toBe(original);
  });

  it("should accept additional options", () => {
    const original = new Error("original");
    const ex = createCustomException(original, { code: "WRAPPED", statusCode: 400 });
    expect(ex.code).toBe("WRAPPED");
    expect(ex.statusCode).toBe(400);
  });
});

describe("ExceptionFactory", () => {
  it("should create ValidationException", () => {
    const ex = ExceptionFactory.validation("bad input", "name", "x");
    expect(ex).toBeInstanceOf(ValidationException);
    expect(ex.metadata.field).toBe("name");
  });

  it("should create NotFoundException", () => {
    const ex = ExceptionFactory.notFound("missing", "User", 1);
    expect(ex).toBeInstanceOf(NotFoundException);
  });

  it("should create UnauthorizedException", () => {
    const ex = ExceptionFactory.unauthorized("no token");
    expect(ex).toBeInstanceOf(UnauthorizedException);
  });

  it("should create ForbiddenException", () => {
    const ex = ExceptionFactory.forbidden("denied", "Project", "delete");
    expect(ex).toBeInstanceOf(ForbiddenException);
  });

  it("should create ConflictException", () => {
    const ex = ExceptionFactory.conflict("duplicate", "User", "email");
    expect(ex).toBeInstanceOf(ConflictException);
  });

  it("should create BusinessLogicException", () => {
    const ex = ExceptionFactory.businessLogic("rule violation", "MAX_USERS");
    expect(ex).toBeInstanceOf(BusinessLogicException);
  });

  it("should create DatabaseException", () => {
    const ex = ExceptionFactory.database("query failed", "SELECT", "users");
    expect(ex).toBeInstanceOf(DatabaseException);
  });

  it("should create ExternalServiceException", () => {
    const ex = ExceptionFactory.externalService("timeout", "API", "/endpoint");
    expect(ex).toBeInstanceOf(ExternalServiceException);
  });

  it("should create ConfigurationException", () => {
    const ex = ExceptionFactory.configuration("missing", "DB_HOST");
    expect(ex).toBeInstanceOf(ConfigurationException);
  });
});
