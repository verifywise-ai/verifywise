import { sqlLiveRunExists, sqlOwnsRunFragment, sqlRunIsLive } from "../sql";

const TOKEN = "00000000-0000-4000-8000-000000000091";

describe("sql fragments", () => {
  it("decides liveness from the heartbeat, else the start, over 15 minutes", () => {
    expect(sqlRunIsLive("r")).toBe(
      "(COALESCE(r.heartbeat_at, r.started_at) >= now() - make_interval(mins => 15))",
    );
    expect(sqlLiveRunExists(":key", ":orgId")).toContain("live.extension_key = :key");
  });

  it("proves ownership of one started row under a share lock", () => {
    const sql = sqlOwnsRunFragment({ runId: 91, orgId: 5, token: TOKEN });
    expect(sql).toContain("own.id = 91");
    expect(sql).toContain("own.organization_id = 5");
    expect(sql).toContain(`own.run_token = '${TOKEN}'`);
    expect(sql).toContain("own.status = 'started'");
    expect(sql).toContain("FOR SHARE");
  });

  it.each([
    [{ runId: 0, orgId: 5, token: TOKEN }, "own"],
    [{ runId: 91, orgId: 1.5, token: TOKEN }, "own"],
    [{ runId: 91, orgId: 5, token: "x' OR '1'='1" }, "own"],
    [{ runId: 91, orgId: 5, token: TOKEN }, "own; DROP"],
  ])("refuses unsafe input %p / %p", (run, alias) => {
    expect(() => sqlOwnsRunFragment(run, alias)).toThrow();
  });
});
