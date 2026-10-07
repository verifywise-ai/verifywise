import { describe, it, expect, afterEach } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { server } from "../../../test/mocks/server";
import { http, HttpResponse } from "msw/http";

import CustomAxios from "../customAxios";
import { biasAuditService } from "../biasAuditService";

/**
 * Swaps the transport for one that records the request as axios would send
 * it, after transformRequest. MSW cannot carry multipart bodies under jsdom,
 * so the body is checked here instead.
 */
const captureRequests = (responseData: unknown) => {
  const sent: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    sent.push(config);
    return { data: responseData, status: 200, statusText: "OK", headers: {}, config };
  };
  CustomAxios.defaults.adapter = adapter;
  return sent;
};

describe("biasAuditService", () => {
  const defaultAdapter = CustomAxios.defaults.adapter;
  afterEach(() => {
    CustomAxios.defaults.adapter = defaultAdapter;
  });

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

  it("runAudit returns the audit id and status", async () => {
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

  it("parseHeaders returns the column headers", async () => {
    server.use(
      http.post("/api/deepeval/bias-audits/parse-headers", () =>
        HttpResponse.json({ headers: ["name", "age", "hired"] }),
      ),
    );
    const file = new File(["csv"], "data.csv");
    const result = await biasAuditService.parseHeaders(file);
    expect(result).toEqual(["name", "age", "hired"]);
  });

  // The instance defaults to a JSON Content-Type. Without a multipart header,
  // axios turns FormData into JSON and the file arrives as {} (EvalServer 422).
  it("runAudit sends the dataset as multipart form data, not JSON", async () => {
    const sent = captureRequests({ auditId: "a1", status: "running" });
    const file = new File(["csv"], "data.csv");
    const config = { presetId: "p1", orgId: "org1", outcomeColumn: "hired", columnMapping: {} };

    await biasAuditService.runAudit(file, config as any);

    expect(sent).toHaveLength(1);
    const body = sent[0].data as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("dataset")).toBeInstanceOf(File);
    expect(body.get("org_id")).toBe("org1");
    expect(JSON.parse(body.get("config_json") as string).presetId).toBe("p1");
  });

  it("parseHeaders sends the dataset as multipart form data, not JSON", async () => {
    const sent = captureRequests({ headers: ["name"] });

    await biasAuditService.parseHeaders(new File(["csv"], "data.csv"));

    expect(sent).toHaveLength(1);
    const body = sent[0].data as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("dataset")).toBeInstanceOf(File);
  });
});
