import { Request, Response } from "express";
import {
  validateCreateModelInventoryV1,
  validateCreateModelRiskV1,
  validateModelIdParam,
  validateUpdateModelInventoryV1,
  validateUpdateModelRiskV1,
} from "../modelInventory.validator";

async function run(chain: unknown[], body: Record<string, unknown>, params = {}) {
  const req = { body, params, query: {}, headers: {}, cookies: {} } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  const next = jest.fn();
  for (const mw of chain as ((r: Request, s: Response, n: () => void) => unknown)[]) {
    await mw(req, res, next);
    if ((res.status as jest.Mock).mock.calls.length) break;
  }
  const payload = (res.json as jest.Mock).mock.calls[0]?.[0];
  const fields: string[] = (payload?.data?.errors ?? []).map((e: { field: string }) => e.field);
  return { status: (res.status as jest.Mock).mock.calls[0]?.[0], fields: fields.sort() };
}

const model = { provider: "Acme", model: "M", version: "1" };

describe("validateModelIdParam (M-L1)", () => {
  it.each(["abc", "0", "-1", "1x", "99999999999"])("refuses id %p", async (id) => {
    expect((await run(validateModelIdParam, {}, { id })).status).toBe(400);
  });
  it("accepts a positive integer", async () => {
    expect((await run(validateModelIdParam, {}, { id: "12" })).status).toBeUndefined();
  });
});

describe("v1 model create (M-M7)", () => {
  it("requires provider, model and version", async () => {
    const r = await run(validateCreateModelInventoryV1, {});
    expect(r.status).toBe(400);
    expect(r.fields).toEqual(["model", "provider", "version"]);
  });

  it("refuses blank required text", async () => {
    expect((await run(validateCreateModelInventoryV1, { ...model, model: "  " })).fields).toEqual([
      "model",
    ]);
  });

  it("refuses bad enums, dates and ids", async () => {
    const r = await run(validateCreateModelInventoryV1, {
      ...model,
      status: "Deployed",
      type: "Neural",
      status_date: "soon",
      approver: [5],
      projects: [1, "x"],
    });
    expect(r.fields).toEqual(["approver", "projects[1]", "status", "status_date", "type"]);
  });

  it("accepts the form's body", async () => {
    const r = await run(validateCreateModelInventoryV1, {
      ...model,
      provider_model: "",
      approver: "",
      status: "Pending",
      status_date: "2026-11-18",
      type: null,
      external_key: "",
      capabilities: ["Vision"],
      security_assessment: false,
      security_assessment_data: [],
      projects: [],
      frameworks: [3],
    });
    expect(r.status).toBeUndefined();
  });
});

describe("v1 model update", () => {
  it("requires nothing but checks what is sent", async () => {
    expect((await run(validateUpdateModelInventoryV1, {}, { id: "1" })).status).toBeUndefined();
    expect(
      (await run(validateUpdateModelInventoryV1, { version: "", status: "" }, { id: "1" })).fields,
    ).toEqual(["status", "version"]);
  });
});

describe("v1 model risk", () => {
  const risk = {
    risk_name: "Drift",
    risk_category: "Performance",
    risk_level: "High",
    owner: "7",
    target_date: "2027-01-31",
  };

  it("requires the form's fields (M-M10)", async () => {
    const r = await run(validateCreateModelRiskV1, { risk_name: "Drift" });
    expect(r.fields).toEqual(["owner", "risk_category", "risk_level", "target_date"]);
  });

  it("accepts only the required fields, and the form's empty model", async () => {
    expect((await run(validateCreateModelRiskV1, risk)).status).toBeUndefined();
    expect(
      (await run(validateCreateModelRiskV1, { ...risk, model_id: "" })).status,
    ).toBeUndefined();
  });

  it("refuses bad values on update", async () => {
    const r = await run(
      validateUpdateModelRiskV1,
      { risk_level: "Huge", owner: [7], target_date: "later" },
      { id: "3" },
    );
    expect(r.fields).toEqual(["owner", "risk_level", "target_date"]);
  });

  it("accepts an update without an owner", async () => {
    expect(
      (await run(validateUpdateModelRiskV1, { risk_name: "x" }, { id: "3" })).status,
    ).toBeUndefined();
  });
});
