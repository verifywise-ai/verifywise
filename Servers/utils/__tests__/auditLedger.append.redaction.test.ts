import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const txn = { commit: jest.fn(), rollback: jest.fn() };

jest.mock("../../database/db", () => ({
  sequelize: {
    query: (...args: unknown[]) => mockQuery(...args),
    transaction: async () => txn,
  },
}));
jest.mock("../featureSettings.utils", () => ({
  getFeatureSettingsQuery: async () => ({ audit_ledger_enabled: true }),
}));
jest.mock("../auditLedgerRetention.utils", () => ({ getLatestLedgerCheckpoint: jest.fn() }));

import { appendToAuditLedger, computeEntryHash, GENESIS_HASH } from "../auditLedger.utils";

// Not every caller goes through logEvent (custom field and retention audits
// append directly), so the ledger redacts descriptions itself, before the
// hash is computed.
describe("appendToAuditLedger redaction", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes("INSERT INTO audit_ledger")) {
        return [[{ id: 11, occurred_at: "2026-10-17T00:00:00.000Z" }], 1];
      }
      return [];
    });
  });

  it("stores and hashes the redacted description and keeps field values", async () => {
    await appendToAuditLedger({
      organizationId: 3,
      entryType: "change_history",
      userId: 5,
      fieldName: "note",
      oldValue: "token=abc",
      newValue: "b",
      description: "Custom field changed: password=hunter2",
    });

    const insert = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO audit_ledger"),
    ) as [string, { replacements: Record<string, unknown> }];
    expect(insert[1].replacements.description).toBe("Custom field changed: password=[REDACTED]");
    expect(insert[1].replacements.old_value).toBe("token=abc");

    const update = mockQuery.mock.calls.find(([sql]) => String(sql).includes("UPDATE")) as [
      string,
      { replacements: Record<string, unknown> },
    ];
    const expectedHash = computeEntryHash({
      id: 11,
      entry_type: "change_history",
      user_id: 5,
      occurred_at: "2026-10-17T00:00:00.000Z",
      event_type: null,
      entity_type: null,
      entity_id: null,
      action: null,
      field_name: "note",
      old_value: "token=abc",
      new_value: "b",
      description: "Custom field changed: password=[REDACTED]",
      prev_hash: GENESIS_HASH,
    });
    expect(update[1].replacements.realHash).toBe(expectedHash);
  });
});
