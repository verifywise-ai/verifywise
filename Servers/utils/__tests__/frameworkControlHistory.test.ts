import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../auditLedger.utils", () => ({
  appendToAuditLedger: jest.fn(async () => undefined),
}));

import { sequelize } from "../../database/db";
import { GENERIC_FORMATTERS } from "../../config/changeHistory.config";
import { recordUpdateChanges, writtenValues } from "../changeHistory.base.utils";

const mockQuery = sequelize.query as jest.MockedFunction<any>;

describe("formatters accept the values clients send (issue #4977 review)", () => {
  it("reads multipart boolean strings by meaning, not truthiness", async () => {
    await expect(GENERIC_FORMATTERS.boolean("false")).resolves.toBe("No");
    await expect(GENERIC_FORMATTERS.boolean("true")).resolves.toBe("Yes");
    await expect(GENERIC_FORMATTERS.boolean(false)).resolves.toBe("No");
    await expect(GENERIC_FORMATTERS.boolean(null)).resolves.toBe("-");
  });

  it("formats a long date string as the same day as the stored date", async () => {
    await expect(GENERIC_FORMATTERS.date("Wed, 28 Oct 2026 04:00:00 GMT")).resolves.toBe(
      "2026-10-28",
    );
    await expect(GENERIC_FORMATTERS.date("2026-10-28")).resolves.toBe("2026-10-28");
    await expect(GENERIC_FORMATTERS.date("2026-10-28T00:00:00.000Z")).resolves.toBe("2026-10-28");
  });
});

describe("writtenValues", () => {
  it("reads the updated keys back from the RETURNING row", () => {
    const row = { id: 3, is_applicable: false, due_date: "2026-10-28", status: "Done" };
    expect(
      writtenValues(row, {
        is_applicable: "false",
        due_date: "Wed, 28 Oct 2026",
        organizationId: 1,
      }),
    ).toEqual({ is_applicable: false, due_date: "2026-10-28" });
  });

  it("unwraps a sequelize instance", () => {
    const instance = { get: () => ({ status: "Done" }) };
    expect(writtenValues(instance, { status: "Done" })).toEqual({ status: "Done" });
  });
});

describe("recordUpdateChanges never fails the caller's transaction", () => {
  beforeEach(() => mockQuery.mockReset());

  it("rolls a failed history write back to its savepoint and swallows the error", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith("INSERT")) throw new Error('relation "x" does not exist');
      return [[], 0];
    });
    const tx = { id: "tx", afterCommit: jest.fn() } as any;

    await expect(
      recordUpdateChanges("subcontrol_eu", 4, { status: "Waiting" }, { status: "Done" }, 7, 1, tx),
    ).resolves.toBeUndefined();

    const statements = mockQuery.mock.calls.map(([sql]: [string]) => sql);
    const savepoint = statements.find((sql: string) => /^SAVEPOINT history_write_\d+$/.test(sql));
    expect(savepoint).toBeDefined();
    const name = savepoint!.replace("SAVEPOINT ", "");
    expect(statements).toContain(`ROLLBACK TO SAVEPOINT ${name}`);
    expect(statements).toContain(`RELEASE SAVEPOINT ${name}`);
  });

  it("releases the savepoint after a successful write", async () => {
    mockQuery.mockResolvedValue([[], 0]);
    const tx = { id: "tx", afterCommit: jest.fn() } as any;

    await recordUpdateChanges(
      "subcontrol_eu",
      4,
      { status: "Waiting" },
      { status: "Done" },
      7,
      1,
      tx,
    );

    const statements = mockQuery.mock.calls.map(([sql]: [string]) => sql);
    expect(statements.some((sql: string) => sql.startsWith("INSERT"))).toBe(true);
    expect(statements.some((sql: string) => sql.startsWith("ROLLBACK"))).toBe(false);
    expect(
      statements.some((sql: string) => /^RELEASE SAVEPOINT history_write_\d+$/.test(sql)),
    ).toBe(true);
  });
});
