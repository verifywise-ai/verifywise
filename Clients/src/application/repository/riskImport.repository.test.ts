import { describe, it, expect, vi, beforeEach } from "vitest";

const post = vi.fn();
vi.mock("../../infrastructure/api/networkServices", () => ({
  apiServices: { post: (...args: unknown[]) => post(...args) },
}));

import { importRisks } from "./riskImport.repository";

const result = {
  success: false,
  imported: 0,
  failed: 1,
  errors: [{ row: 2, field: "likelihood", message: "Likelihood is required" }],
  importedAt: "now",
};

describe("importRisks", () => {
  beforeEach(() => post.mockReset());

  it("posts to the versioned path", async () => {
    post.mockResolvedValue({ data: { data: { ...result, success: true, errors: [] } } });
    const out = await importRisks([{ risk_name: "A" }]);
    expect(post).toHaveBeenCalledWith("/v1/risk-import/import", { csvData: [{ risk_name: "A" }] });
    expect(out?.success).toBe(true);
  });

  it("returns the row errors of a 400 instead of throwing", async () => {
    // Shaped like CustomException: an Error with the status and the response body.
    const rejected = Object.assign(new Error("Bad Request"), {
      status: 400,
      response: { data: result },
    });
    post.mockRejectedValueOnce(rejected);
    expect(await importRisks([{}])).toEqual(result);
  });

  it("rethrows a 400 without row errors and any other failure", async () => {
    const noRows = { status: 400, response: { data: { message: "No rows to import" } } };
    post.mockRejectedValueOnce(noRows);
    await expect(importRisks([])).rejects.toBe(noRows);
    const server = { status: 500, response: { data: result } };
    post.mockRejectedValueOnce(server);
    await expect(importRisks([{}])).rejects.toBe(server);
  });
});
