import { describe, it, expect, jest } from "@jest/globals";

jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../../../domain.layer/models/modelInventoryHistory/modelInventoryHistory.model", () => ({
  ModelInventoryHistoryModel: {},
}));

import { isSnapshotParameter } from "../modelInventoryHistory.utils";

describe("isSnapshotParameter", () => {
  it.each(["status", "security_assessment", "version", "type", "created_at"])("accepts %s", (p) => {
    expect(isSnapshotParameter(p)).toBe(true);
  });

  // name and owner are not model_inventories columns: they used to reach SQL
  // and come back as a 500.
  it.each(["name", "owner", "organization_id; DROP TABLE x", "", 5, null, undefined, ["status"]])(
    "refuses %p",
    (p) => {
      expect(isSnapshotParameter(p as any)).toBe(false);
    },
  );
});
