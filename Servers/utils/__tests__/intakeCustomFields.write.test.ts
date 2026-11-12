// writeIntakeCustomFields: which exceptions count as a removed field.
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
const tx = { commit: jest.fn(), rollback: jest.fn() };
jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn<any>().mockImplementation(async () => tx) },
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const utils =
  require("../intakeCustomFields.utils") as typeof import("../intakeCustomFields.utils");
const cf = require("../customField.utils");
const {
  NotFoundException,
  ForbiddenException,
} = require("../../domain.layer/exceptions/custom.exception");
/* eslint-enable @typescript-eslint/no-require-imports */

const schema = {
  fields: [{ id: "q1", type: "text", label: "Owner", entityFieldMapping: "custom_field:owner" }],
} as any;

describe("writeIntakeCustomFields skip reasons", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(cf, "listCustomFieldDefinitionsQuery")
      .mockResolvedValue([
        { id: 9, field_key: "owner", label: "Owner", field_type: "text", options: null },
      ]);
  });

  const run = () => utils.writeIntakeCustomFields("ai_app", { q1: "x" }, schema, 5, 7, tx as any);

  it("maps a missing definition to field_removed", async () => {
    jest
      .spyOn(cf, "setCustomFieldValueQuery")
      .mockRejectedValue(
        new NotFoundException("Custom field definition not found", "custom_field_definition", 9),
      );
    const skips = await run();
    expect(skips.map((s: any) => s.reason)).toEqual(["field_removed"]);
  });

  it("maps any other not found to invalid_value", async () => {
    jest
      .spyOn(cf, "setCustomFieldValueQuery")
      .mockRejectedValue(new NotFoundException("Entity not found", "ai_app", 5));
    const skips = await run();
    expect(skips.map((s: any) => s.reason)).toEqual(["invalid_value"]);
  });

  it("maps a forbidden entity to invalid_value", async () => {
    jest
      .spyOn(cf, "setCustomFieldValueQuery")
      .mockRejectedValue(new ForbiddenException("Target entity not found", "ai_app", "5"));
    const skips = await run();
    expect(skips.map((s: any) => s.reason)).toEqual(["invalid_value"]);
  });

  it("reads nothing for an unknown entity type or a form without custom mappings", async () => {
    expect(await utils.writeIntakeCustomFields("x", { q1: "x" }, schema, 5, 7, tx as any)).toEqual(
      [],
    );
    expect(
      await utils.writeIntakeCustomFields("ai_app", {}, { fields: [] } as any, 5, 7, tx as any),
    ).toEqual([]);
    expect(cf.listCustomFieldDefinitionsQuery).not.toHaveBeenCalled();
  });
});
