import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../../database/db", () => ({
  sequelize: {
    query: jest.fn<any>(),
  },
}));

jest.mock("../../inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn<any>().mockResolvedValue(undefined),
}));

import { notifyIso42001Assignment } from "../iso42001Notification.service";
import { sequelize } from "../../../database/db";
import { notifyUserAssigned } from "../../inAppNotification.service";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const mockNotify = notifyUserAssigned as jest.MockedFunction<typeof notifyUserAssigned>;

describe("notifyIso42001Assignment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = "https://app.test";
  });

  it("returns early when newUserId is falsy", async () => {
    await notifyIso42001Assignment({
      organizationId: 1,
      assignerUserId: 1,
      entityType: "ISO 42001 Subclause",
      entityId: 100,
      entityName: "Some clause",
      roleType: "Owner",
      newUserId: 0,
      oldUserId: 5,
    });

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("returns early when newUserId equals oldUserId", async () => {
    await notifyIso42001Assignment({
      organizationId: 1,
      assignerUserId: 1,
      entityType: "ISO 42001 Subclause",
      entityId: 100,
      entityName: "Some clause",
      roleType: "Owner",
      newUserId: 5,
      oldUserId: 5,
    });

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("looks up subclause parent and dispatches notification with qualified identifier", async () => {
    mockQuery.mockResolvedValueOnce([
      { name: "Alice", surname: "Tan" },
    ] as any);
    mockQuery.mockResolvedValueOnce([
      {
        clause_id: 10,
        clause_no: 4,
        clause_title: "Context of the org",
        subclause_order_no: 1,
        summary: "Some summary",
      },
    ] as any);

    await notifyIso42001Assignment({
      organizationId: 99,
      assignerUserId: 1,
      entityType: "ISO 42001 Subclause",
      entityId: 100,
      entityName: "Understanding the org",
      roleType: "Owner",
      newUserId: 7,
      oldUserId: 5,
    });

    expect(mockNotify).toHaveBeenCalledTimes(1);
    const call = mockNotify.mock.calls[0];
    expect(call[0]).toBe(99);
    expect(call[1]).toBe(7);
    const payload = call[2] as any;
    expect(payload.entityName).toBe("4.1 Understanding the org");
    expect(payload.entityUrl).toBe(
      "https://app.test/framework?framework=iso-42001&clauseId=10&subClauseId=100",
    );
    expect(call[3]).toBe("Alice Tan");
    expect((call[5] as any).frameworkName).toBe("ISO 42001");
    expect((call[5] as any).parentType).toBe("Clause");
    expect((call[5] as any).parentName).toBe("Context of the org");
  });

  it("looks up annex parent and dispatches notification with qualified identifier", async () => {
    mockQuery.mockResolvedValueOnce([{ name: "Bob", surname: "Lee" }] as any);
    mockQuery.mockResolvedValueOnce([
      {
        annex_id: 22,
        annex_no: 5,
        annex_title: "Organizational controls",
        category_sub_id: 1,
        category_description: "Some description",
      },
    ] as any);

    await notifyIso42001Assignment({
      organizationId: 1,
      assignerUserId: 1,
      entityType: "ISO 42001 Annex",
      entityId: 50,
      entityName: "Policies for AI",
      roleType: "Reviewer",
      newUserId: 9,
      oldUserId: null,
    });

    const call = mockNotify.mock.calls[0];
    const payload = call[2] as any;
    expect(payload.entityName).toBe("A.5.1 Policies for AI");
    expect(payload.entityUrl).toBe(
      "https://app.test/framework?framework=iso-42001&annexId=22&annexCategoryId=50",
    );
    expect((call[5] as any).parentType).toBe("Annex");
  });

  it("falls back to 'Someone' as assigner name if user lookup is empty", async () => {
    mockQuery.mockResolvedValueOnce([] as any);
    mockQuery.mockResolvedValueOnce([
      {
        clause_id: 1,
        clause_no: 4,
        clause_title: "Ctx",
        subclause_order_no: 1,
        summary: null,
      },
    ] as any);

    await notifyIso42001Assignment({
      organizationId: 1,
      assignerUserId: 999,
      entityType: "ISO 42001 Subclause",
      entityId: 1,
      entityName: "Foo",
      roleType: "Approver",
      newUserId: 2,
      oldUserId: null,
    });

    expect(mockNotify.mock.calls[0][3]).toBe("Someone");
  });
});
