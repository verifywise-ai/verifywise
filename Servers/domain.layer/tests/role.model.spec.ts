import { ValidationException } from "../exceptions/custom.exception";

jest.mock("sequelize-typescript", () => ({
  __esModule: true,
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    static isInitialized = true;
    constructor(_data?: any) {}
    static init() {}
  },
}));

import { RoleModel } from "../models/role/role.model";

describe("RoleModel", () => {
  expect.assertions(4);
  const validRoleData = {
    name: "Admin",
    description: "Administrator role with full access",
  };

  it("should create a new role with valid data", async () => {
    const role = await RoleModel.createRole(validRoleData.name, validRoleData.description);
    expect(role).toBeInstanceOf(RoleModel);
    expect(role.name).toBe(validRoleData.name);
    expect(role.description).toBe(validRoleData.description);
    expect(role.created_at).toBeDefined();
  });

  it("should throw an error if name is missing", async () => {
    expect.assertions(2);
    try {
      await RoleModel.createRole("", validRoleData.description);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationException);
      expect((error as ValidationException).message).toBe("Role name is required");
    }
  });

  it("should throw an error if description is missing", async () => {
    expect.assertions(2);
    try {
      await RoleModel.createRole(validRoleData.name, "");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationException);
      expect((error as ValidationException).message).toBe("Role description is required");
    }
  });
});
