import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../database/db", () => ({ sequelize: { query: jest.fn() } }));
// The caller's role resolution has its own test (userPermission.utils.test.ts);
// here only the tools' use of it is under test.
jest.mock("../../../utils/userPermission.utils", () => ({ userHasPermission: jest.fn() }));

import { availableAuditLedgerTools } from "../../functions/auditLedgerFunctions";
import { sequelize } from "../../../database/db";
import { userHasPermission } from "../../../utils/userPermission.utils";

const mockQuery = sequelize.query as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockHasPermission = userHasPermission as unknown as jest.Mock<
  (organizationId: number, userId: number | undefined, key: string) => Promise<boolean>
>;

const ORG = 7;
const REFUSAL = "You do not have permission to read the audit ledger";
// User 5 holds auditLedger.super in org 7; user 6 (an Editor) does not.
const HOLDERS = new Set([5]);

const ledgerRow = {
  id: 1,
  entry_type: "event_log",
  user_id: 5,
  occurred_at: "2026-10-17T00:00:00.000Z",
  event_type: "Update",
  entity_type: "risk",
  entity_id: 3,
  action: "update",
  field_name: null,
  old_value: null,
  new_value: null,
  description: "Updated risk",
};

const tools: Array<[string, Record<string, unknown>, string]> = [
  ["fetch_event_logs", {}, "event_logs"],
  ["get_audit_trail_for_entity", { entity_type: "risk", entity_id: 3 }, "audit_entries"],
];

// REST GET /audit-ledger requires auditLedger.super; the advisor tools that
// read the same table must apply the same check to the calling user.
describe("audit ledger advisor tools apply auditLedger.super", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([ledgerRow]);
    mockHasPermission.mockImplementation(
      async (org, userId, key) =>
        org === ORG && userId !== undefined && HOLDERS.has(userId) && key === "auditLedger.super",
    );
  });

  describe.each(tools)("%s", (name, params, rowsKey) => {
    const run = (userId?: number) => availableAuditLedgerTools[name](params, ORG, userId);

    it("refuses without a calling user and does not query the ledger", async () => {
      await expect(run(undefined)).resolves.toEqual({ error: REFUSAL });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("refuses a user without auditLedger.super and does not query the ledger", async () => {
      await expect(run(6)).resolves.toEqual({ error: REFUSAL });
      expect(mockHasPermission).toHaveBeenCalledWith(ORG, 6, "auditLedger.super");
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("returns ledger rows to a user holding auditLedger.super", async () => {
      const result = (await run(5)) as Record<string, unknown>;
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(result[rowsKey]).toHaveLength(1);
    });

    // Old ledger rows can hold raw error text and cannot be rewritten (the
    // chain is hashed), so the tools redact what they hand to the model.
    it("redacts secrets in the descriptions it returns", async () => {
      mockQuery.mockResolvedValue([{ ...ledgerRow, description: "failed: password=hunter2" }]);
      const result = (await run(5)) as Record<string, Array<{ description: string }>>;
      expect(result[rowsKey][0].description).toBe("failed: password=[REDACTED]");
    });
  });
});
