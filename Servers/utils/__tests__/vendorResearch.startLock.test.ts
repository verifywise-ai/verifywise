/**
 * The start lock of vendor research runs (`withRunStartLockQuery`) and the run queries a start makes
 * inside it, with the database mocked: the lock is taken first, in the transaction the work is
 * given, keyed by the organization, and each query sends the transaction it is handed.
 */
const mockTransaction = { id: "tx" };

// A transaction of its own when called with the work only; with `{ transaction: parent }`, a
// savepoint of that parent, as Sequelize makes one.
const mockSavepoint = { id: "savepoint" };
jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(async (...args: unknown[]) => {
      const work = args[args.length - 1] as (transaction: unknown) => Promise<unknown>;
      return work(args.length > 1 ? mockSavepoint : mockTransaction);
    }),
  },
}));

import { sequelize } from "../../database/db";
import { asyncLocalStorage } from "../context/context";
import {
  countRunsSinceQuery,
  createRunQuery,
  getActiveRunQuery,
  getLastRunCreatedAtQuery,
  withRunStartLockQuery,
} from "../vendorResearch.utils";

const query = sequelize.query as unknown as jest.Mock;

const transactionMock = sequelize.transaction as unknown as jest.Mock;

beforeEach(() => {
  transactionMock.mockClear();
  query.mockReset();
  query.mockResolvedValue([{ count: 0, created_at: null, id: 1 }]);
});

describe("withRunStartLockQuery", () => {
  it("takes the organization's advisory lock in a transaction before the work, and returns what the work returns", async () => {
    const work = jest.fn(async () => {
      expect(query).toHaveBeenCalledTimes(1);
      return "answer";
    });

    await expect(withRunStartLockQuery(3, work)).resolves.toBe("answer");

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledWith(mockTransaction);
    const [sql, options] = query.mock.calls[0];
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("vendor_research_run_start");
    expect(options).toMatchObject({
      replacements: { organizationId: 3 },
      transaction: mockTransaction,
    });
  });

  it("opens a transaction of its own outside a request, also when the request holds no transaction", async () => {
    await asyncLocalStorage.run({ organizationId: 3 }, () =>
      withRunStartLockQuery(3, async () => 1),
    );

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(transactionMock.mock.calls[0]).toHaveLength(1);
    expect(query.mock.calls[0][1]).toMatchObject({ transaction: mockTransaction });
  });

  // RLS Phase 2: the request's queries run in its transaction, which set app.current_org. A
  // transaction of its own would run without it, where the row-level policy hides every run.
  it("works in a savepoint of the request's RLS transaction, and takes the lock there", async () => {
    const requestTransaction = { id: "request" };
    const work = jest.fn(async () => "answer");

    const answer = await asyncLocalStorage.run(
      { organizationId: 3, transaction: requestTransaction as never },
      () => withRunStartLockQuery(3, work),
    );

    expect(answer).toBe("answer");
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(transactionMock.mock.calls[0][0]).toEqual({ transaction: requestTransaction });
    const [sql, options] = query.mock.calls[0];
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(options).toMatchObject({
      replacements: { organizationId: 3 },
      transaction: mockSavepoint,
    });
    expect(work).toHaveBeenCalledWith(mockSavepoint);
  });

  it("opens a transaction of its own when the request's transaction has already ended", async () => {
    // An automatic start that the request did not wait for can run after the request committed.
    const ended = { id: "request", finished: "commit" };

    await asyncLocalStorage.run({ organizationId: 3, transaction: ended as never }, () =>
      withRunStartLockQuery(3, async () => 1),
    );

    expect(transactionMock.mock.calls[0]).toHaveLength(1);
    expect(query.mock.calls[0][1]).toMatchObject({ transaction: mockTransaction });
  });

  it("lets a failure of the work through, so the transaction is rolled back", async () => {
    const failure = new Error("duplicate key");

    await expect(
      withRunStartLockQuery(3, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });
});

describe("the run queries a start makes under the lock", () => {
  const tx = mockTransaction as never;

  it.each([
    ["getActiveRunQuery", () => getActiveRunQuery(3, 7, tx)],
    ["getLastRunCreatedAtQuery", () => getLastRunCreatedAtQuery(3, 7, tx)],
    ["countRunsSinceQuery", () => countRunsSinceQuery(3, new Date(0), tx)],
    [
      "createRunQuery",
      () =>
        createRunQuery(
          { organizationId: 3, vendorId: 7, triggerType: "manual", requestedBy: 5 },
          tx,
        ),
    ],
  ])("%s sends the transaction it is given", async (_name, call) => {
    await call();

    expect(query.mock.calls[0][1]).toMatchObject({ transaction: mockTransaction });
  });

  it("send none when they are given none, as before", async () => {
    await getActiveRunQuery(3, 7);
    await countRunsSinceQuery(3, new Date(0));

    for (const [, options] of query.mock.calls) expect(options.transaction).toBeUndefined();
  });
});
