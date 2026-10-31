import { describe, it, expect, jest } from "@jest/globals";
import { ConflictException } from "../../domain.layer/exceptions/custom.exception";

const mockUpdate = jest.fn(async (..._a: any[]): Promise<any> => ({}));
jest.mock("../../utils/customField.utils", () => ({
  updateCustomFieldDefinitionQuery: (...a: any[]) => mockUpdate(...a),
}));
jest.mock("../../database/db", () => ({ sequelize: {} }));
jest.mock("../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(async () => undefined),
  logFailure: jest.fn(async () => undefined),
}));
jest.mock("../../utils/i18n.utils", () => ({
  translateError: (_r: unknown, e: Error) => e.message,
}));

import { updateCustomFieldDefinition } from "../customField.ctrl";

const res = () => {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
};
const req = { params: { id: "11" }, body: {}, userId: 3, organizationId: 7 } as any;

describe("updateCustomFieldDefinition", () => {
  it("returns the in-use details on an options_in_use conflict", async () => {
    mockUpdate.mockRejectedValueOnce(
      new ConflictException(
        "Some removed options are in use",
        "custom_field_definition",
        "options",
        {
          metadata: {
            code: "options_in_use",
            in_use: [{ id: "opt_2", label: "Medium", count: 80 }],
            entity_type: "project",
          },
        },
      ),
    );
    const r = res();
    await updateCustomFieldDefinition(req, r);
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith({
      message: "Conflict",
      data: {
        message: "Some removed options are in use",
        code: "options_in_use",
        in_use: [{ id: "opt_2", label: "Medium", count: 80 }],
        entity_type: "project",
      },
    });
  });

  it("keeps the plain message for other conflicts", async () => {
    mockUpdate.mockRejectedValueOnce(new ConflictException("Duplicate key"));
    const r = res();
    await updateCustomFieldDefinition(req, r);
    expect(r.json).toHaveBeenCalledWith({ message: "Conflict", data: "Duplicate key" });
  });

  it("passes the user id to the update", async () => {
    mockUpdate.mockResolvedValueOnce({ id: 11 });
    await updateCustomFieldDefinition(req, res());
    expect(mockUpdate).toHaveBeenLastCalledWith(11, 7, {}, 3);
  });
});
