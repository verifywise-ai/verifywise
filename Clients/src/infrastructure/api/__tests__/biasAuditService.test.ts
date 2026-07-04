import { describe, it, expect } from "vitest";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw";

import { biasAuditService } from "../biasAuditService";

describe("biasAuditService", () => {
  it("listPresets fetches presets", async () => {
    server.use(
      http.get("/api/deepeval/bias-audits/presets", () =>
        HttpResponse.json({ presets: [{ id: "p1", name: "NYC LL144" }] }),
      ),
    );
    const result = await biasAuditService.listPresets();
    expect(result[0].name).toBe("NYC LL144");
  });

  it("getPreset fetches single preset", async () => {
    const result = await biasAuditService.getPreset("p1");
    expect(result.name).toBe("Gender Bias");
  });

  it("runAudit sends FormData", async () => {
    server.use(
      http.post("/api/deepeval/bias-audits/run", () =>
        HttpResponse.json({ auditId: "a1", status: "running" }),
      ),
    );
    const file = new File(["csv"], "data.csv");
    const config = { presetId: "p1", orgId: "org1", outcomeColumn: "hired", columnMapping: {} };
    const result = await biasAuditService.runAudit(file, config as any);
    expect(result.auditId).toBe("a1");
  });

  it("getStatus fetches audit status", async () => {
    const result = await biasAuditService.getStatus("a1");
    expect(result.status).toBe("completed");
  });

  it("getResults fetches audit results", async () => {
    const result = await biasAuditService.getResults("a1");
    expect(result.auditId).toBe("a1");
  });

  it("listAudits fetches with params", async () => {
    const result = await biasAuditService.listAudits({ org_id: "org1" });
    expect(result).toEqual([{ id: 1, status: "completed" }]);
  });

  it("deleteAudit removes audit", async () => {
    server.use(
      http.delete("/api/deepeval/bias-audits/:id", () =>
        HttpResponse.json({ message: "deleted", auditId: "a1" }),
      ),
    );
    const result = await biasAuditService.deleteAudit("a1");
    expect(result.message).toBe("deleted");
  });

  it("updateAuditName patches audit", async () => {
    server.use(
      http.patch("/api/deepeval/bias-audits/:id", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ auditId: "a1", systemName: body.systemName });
      }),
    );
    const result = await biasAuditService.updateAuditName("a1", "New Name");
    expect(result.systemName).toBe("New Name");
  });

  // downloadReport skipped — MSW XHR interceptor does not support responseType: "blob" in Node.js

  it("parseHeaders sends file and returns headers", async () => {
    server.use(
      http.post("/api/deepeval/bias-audits/parse-headers", () =>
        HttpResponse.json({ headers: ["name", "age", "hired"] }),
      ),
    );
    const file = new File(["csv"], "data.csv");
    const result = await biasAuditService.parseHeaders(file);
    expect(result).toEqual(["name", "age", "hired"]);
  });
});
