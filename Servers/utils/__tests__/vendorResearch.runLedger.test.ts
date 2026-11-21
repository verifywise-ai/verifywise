/**
 * The ledger of the daily research run cap (RV10-CB-1): the statement that starts a run also writes
 * it to vendor_research_run_ledger and drops a bounded number of the organization's old ledger rows,
 * and the count of the cap adds the ledger rows whose run no longer exists. The statements are
 * checked as text here, with the database mocked; tests/integration/vendorResearch.dailyCapLedger
 * .test.ts runs them on a real one.
 */
jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from "../../database/db";
import {
  LEDGER_PRUNE_BATCH,
  LEDGER_RETENTION_DAYS,
  countRunsSinceQuery,
  markRunRunningQuery,
} from "../vendorResearch.utils";

const query = sequelize.query as unknown as jest.Mock;

function sent(call = 0): { sql: string; options: Record<string, unknown> } {
  const [sql, options] = query.mock.calls[call] as [string, Record<string, unknown>];
  return { sql: sql.replace(/\s+/g, " ").trim(), options };
}

beforeEach(() => {
  query.mockReset();
});

describe("markRunRunningQuery and the ledger", () => {
  it("writes the started run to the ledger in the statement that starts it, with the run's created_at", async () => {
    query.mockResolvedValueOnce([{ id: 7 }]);

    await expect(markRunRunningQuery(3, 7)).resolves.toBe(true);

    expect(query).toHaveBeenCalledTimes(1);
    const { sql, options } = sent();
    expect(sql).toContain(
      "UPDATE vendor_research_runs SET status = 'running', started_at = NOW() WHERE organization_id = :organizationId AND id = :runId AND status = 'queued'",
    );
    expect(sql).toContain("RETURNING id, organization_id, created_at");
    expect(sql).toContain(
      "INSERT INTO vendor_research_run_ledger (organization_id, run_id, created_at) SELECT organization_id, id, created_at FROM started ON CONFLICT (run_id) DO NOTHING",
    );
    expect(sql).toMatch(/SELECT id FROM started$/);
    expect(options.replacements).toEqual({ organizationId: 3, runId: 7 });
  });

  it("drops only the organization's old ledger rows, a bounded number, and only when the run started", async () => {
    query.mockResolvedValueOnce([]);

    await expect(markRunRunningQuery(3, 7)).resolves.toBe(false);

    const { sql } = sent();
    expect(sql).toContain(
      `DELETE FROM vendor_research_run_ledger WHERE id IN ( SELECT id FROM vendor_research_run_ledger WHERE organization_id = :organizationId AND created_at < NOW() - (${LEDGER_RETENTION_DAYS} * INTERVAL '1 day') AND EXISTS (SELECT 1 FROM started) LIMIT ${LEDGER_PRUNE_BATCH} )`,
    );
    expect(LEDGER_RETENTION_DAYS).toBeGreaterThanOrEqual(2);
    expect(LEDGER_PRUNE_BATCH).toBeGreaterThan(1);
  });
});

describe("countRunsSinceQuery and the ledger", () => {
  it("adds the ledger rows of the organization whose run no longer exists to the runs that count", async () => {
    query.mockResolvedValueOnce([{ count: 4 }]);
    const since = new Date("2026-11-11T10:00:00Z");

    await expect(countRunsSinceQuery(3, since)).resolves.toBe(4);

    const { sql, options } = sent();
    // The runs that exist count as before.
    expect(sql).toContain(
      "SELECT COUNT(*) FROM vendor_research_runs WHERE organization_id = :organizationId AND created_at >= :since AND NOT (",
    );
    // A ledger row counts only when its run is gone, so a run never counts twice.
    expect(sql).toContain(
      "SELECT COUNT(*) FROM vendor_research_run_ledger l WHERE l.organization_id = :organizationId AND l.created_at >= :since AND NOT EXISTS (SELECT 1 FROM vendor_research_runs r WHERE r.id = l.run_id)",
    );
    expect(options.replacements).toEqual({ organizationId: 3, since });
  });
});
