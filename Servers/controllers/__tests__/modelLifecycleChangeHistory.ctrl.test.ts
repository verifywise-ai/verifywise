import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../utils/statusCode.utils", () => ({
  STATUS_CODE: new Proxy({}, { get: () => (data: unknown) => data }),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../utils/i18n.utils", () => ({ translateError: jest.fn() }));

import { getModelLifecycleChangeHistoryById } from "../modelLifecycleChangeHistory.ctrl";
import { sequelize } from "../../database/db";

const mockQuery = sequelize.query as jest.Mock;

function createRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("getModelLifecycleChangeHistoryById (issue #4977)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  it("rejects a non-numeric id with 400 without querying", async () => {
    const req: any = { params: { id: "xyz" }, query: {}, organizationId: 1, t: (s: string) => s };
    const res = createRes();

    await getModelLifecycleChangeHistoryById(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("maps bespoke rows onto the generic history shape, tenant-scoped", async () => {
    mockQuery
      .mockResolvedValueOnce([{ total: 2 }]) // COUNT
      .mockResolvedValueOnce([
        {
          id: 11,
          item_id: 5,
          change_type: "updated",
          changed_by: 3,
          old_value: { value_text: "No" },
          new_value: { value_text: "Yes" },
          created_at: "2026-10-28T10:00:00Z",
          user_name: "Ada",
          user_surname: "Lovelace",
          user_email: null,
          item_name: "Risk assessment sign-off",
        },
        {
          id: 12,
          item_id: 6,
          change_type: "created",
          changed_by: null,
          old_value: null,
          new_value: { value_json: { level: 2 } },
          created_at: "2026-10-28T09:00:00Z",
          user_name: null,
          user_surname: null,
          user_email: null,
          item_name: null,
        },
      ]);

    const req: any = { params: { id: "10" }, query: {}, organizationId: 1, t: (s: string) => s };
    const res = createRes();

    await getModelLifecycleChangeHistoryById(req, res);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    for (const call of mockQuery.mock.calls) {
      expect(call[1].replacements.organizationId).toBe(1);
      expect(call[1].replacements.modelId).toBe(10);
    }

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.total).toBe(2);
    expect(body.hasMore).toBe(false);
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        id: 11,
        action: "updated",
        field_name: "Risk assessment sign-off",
        old_value: "No",
        new_value: "Yes",
        changed_by_user_id: 3,
        user_name: "Ada",
        user_surname: "Lovelace",
      }),
    );
    expect(body.data[1]).toEqual(
      expect.objectContaining({
        id: 12,
        action: "created",
        field_name: "Lifecycle item #6",
        old_value: undefined,
        new_value: JSON.stringify({ level: 2 }),
        changed_by_user_id: null,
      }),
    );
  });
});
