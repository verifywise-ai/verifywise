jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
import { sequelize } from "../../database/db";
import { createRunQuery, updateRunStatusQuery, listRunsQuery } from "../reportRun.utils";
const q = sequelize.query as jest.Mock;

describe("reportRun.utils", () => {
  beforeEach(() => q.mockReset());
  it("exports updateRunStatusQuery", () => {
    expect(typeof updateRunStatusQuery).toBe("function");
  });
  it("createRunQuery inserts with org + status running", async () => {
    q.mockResolvedValueOnce([{ id: 1, status: "running" }]);
    const r = await createRunQuery({ organization_id: 7, scheduled_report_id: 3, triggered_by: "scheduler", scheduled_for: new Date() } as any);
    expect(r.status).toBe("running");
    expect(q.mock.calls[0][1].replacements.organization_id).toBe(7);
  });
  it("listRunsQuery filters by org", async () => {
    q.mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]);
    await listRunsQuery(7, {});
    expect(q.mock.calls[0][1].replacements.organization_id).toBe(7);
  });
  it("listRunsQuery defaults to limit 200 offset 0 and returns rows + total", async () => {
    q.mockResolvedValueOnce([{ total: 3 }]).mockResolvedValueOnce([{ id: 1 }]);
    const r = await listRunsQuery(7, {});
    expect(r).toEqual({ rows: [{ id: 1 }], total: 3 });
    expect(q.mock.calls[1][1].replacements.limit).toBe(200);
    expect(q.mock.calls[1][1].replacements.offset).toBe(0);
  });
});
