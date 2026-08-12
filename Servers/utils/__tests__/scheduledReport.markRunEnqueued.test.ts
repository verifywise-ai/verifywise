const query = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...a: any[]) => query(...a) },
}));

import { markRunEnqueuedQuery } from "../scheduledReport.utils";

describe("markRunEnqueuedQuery — atomic claim return value", () => {
  beforeEach(() => query.mockReset());

  // Regression: the pg driver returns [results, metadata] where the affected
  // row count is metadata.rowCount, NOT a bare number. Reading it wrong made the
  // claim always report success and defeated the compare-and-swap.
  it("returns true when the CAS matched a row (rowCount > 0)", async () => {
    query.mockResolvedValue([undefined, { rowCount: 1 }]);
    await expect(markRunEnqueuedQuery(3, new Date(), new Date(), new Date())).resolves.toBe(true);
  });

  it("returns false when the CAS matched no row (rowCount 0) — claim lost", async () => {
    query.mockResolvedValue([undefined, { rowCount: 0 }]);
    await expect(markRunEnqueuedQuery(3, new Date(), new Date(), new Date())).resolves.toBe(false);
  });

  it("handles the bare-number metadata shape (non-pg drivers)", async () => {
    query.mockResolvedValue([undefined, 1]);
    await expect(markRunEnqueuedQuery(3, new Date(), new Date(), new Date())).resolves.toBe(true);
  });

  it("adds the date_trunc CAS guard only when expectedNextRun is provided", async () => {
    query.mockResolvedValue([undefined, { rowCount: 1 }]);

    await markRunEnqueuedQuery(3, new Date(), new Date(), new Date());
    expect(query.mock.calls[0][0]).toContain("date_trunc('milliseconds', next_run_at)");

    query.mockClear();
    await markRunEnqueuedQuery(3, new Date(), new Date(), null);
    expect(query.mock.calls[0][0]).not.toContain("date_trunc");
  });
});
