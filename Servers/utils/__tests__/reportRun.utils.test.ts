jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
import { sequelize } from "../../database/db";
import { createRunQuery, updateRunStatusQuery, listRunsQuery } from "../reportRun.utils";
const q = sequelize.query as jest.Mock;

describe("reportRun.utils", () => {
  beforeEach(() => q.mockReset());
  it("exports updateRunStatusQuery", () => {
    expect(typeof updateRunStatusQuery).toBe("function");
  });
  it("createRunQuery inserts with org + status queued", async () => {
    q.mockResolvedValueOnce([{ id: 1, status: "queued" }]);
    const r = await createRunQuery({ organization_id: 7, scheduled_report_id: 3, triggered_by: "scheduler", scheduled_for: new Date() } as any);
    expect(r.status).toBe("queued");
    expect(q.mock.calls[0][1].replacements.organization_id).toBe(7);
  });
  it("listRunsQuery filters by org", async () => {
    q.mockResolvedValueOnce([]);
    await listRunsQuery(7, {});
    expect(q.mock.calls[0][1].replacements.organization_id).toBe(7);
  });
});
