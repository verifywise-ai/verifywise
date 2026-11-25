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
    likelihood: "Likely",
    severity: "Major",
    owner: "7",
    target_date: "2027-01-31",
  };

  it("requires the form's fields (M-M10)", async () => {
    const r = await run(validateCreateModelRiskV1, { risk_name: "Drift" });
    // Decision 10: likelihood and severity set the level, which is no longer required.
    // The target date is optional, like the other mitigation fields.
    expect(r.fields).toEqual(["likelihood", "owner", "risk_category", "severity"]);
  });

  it("creates without a target date, and still checks one that is sent", async () => {
    const { target_date: _omitted, ...withoutDate } = risk;
    expect((await run(validateCreateModelRiskV1, withoutDate)).status).toBeUndefined();
    for (const empty of [null, ""]) {
      expect(
        (await run(validateCreateModelRiskV1, { ...risk, target_date: empty })).status,
      ).toBeUndefined();
    }
    for (const notADate of ["later", 0, false]) {
      const r = await run(validateCreateModelRiskV1, { ...risk, target_date: notADate });
      expect(r.fields).toEqual(["target_date"]);
    }
  });

  it("lets an update clear the target date with null or an empty string", async () => {
    for (const cleared of [null, ""]) {
      expect(
        (await run(validateUpdateModelRiskV1, { target_date: cleared }, { id: "3" })).status,
      ).toBeUndefined();
    }
    for (const notADate of [0, false]) {
      const r = await run(validateUpdateModelRiskV1, { target_date: notADate }, { id: "3" });
      expect(r.fields).toEqual(["target_date"]);
    }
  });

  it("checks a sent level and the lists on create", async () => {
    const r = await run(validateCreateModelRiskV1, {
      ...risk,
      risk_level: "Huge",
      likelihood: "likely",
      severity: "Critical",
    });
    expect(r.fields).toEqual(["likelihood", "risk_level", "severity"]);
    expect((await run(validateCreateModelRiskV1, { ...risk, risk_level: "Low" })).status).toBe(
      undefined,
    );
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
      { risk_level: "Huge", owner: [7], target_date: "later", likelihood: "Often", severity: 3 },
      { id: "3" },
    );
    expect(r.fields).toEqual(["likelihood", "owner", "risk_level", "severity", "target_date"]);
  });

  it("lets an update clear likelihood or severity with null or an empty string", async () => {
    for (const cleared of [null, ""]) {
      expect(
        (
          await run(
            validateUpdateModelRiskV1,
            { likelihood: cleared, severity: cleared },
            { id: "3" },
          )
        ).status,
      ).toBeUndefined();
    }
  });

  it("still requires both on create (null is not a value)", async () => {
    const r = await run(validateCreateModelRiskV1, { ...risk, likelihood: null, severity: "" });
    expect(r.fields).toEqual(["likelihood", "severity"]);
  });

  it("accepts an update without an owner", async () => {
    expect(
      (await run(validateUpdateModelRiskV1, { risk_name: "x" }, { id: "3" })).status,
    ).toBeUndefined();
  });
});

describe("enum fields must be strings", () => {
  it.each([[["Approved"]], [{}], [1]])(
    "refuses model status %p on create and update",
    async (status) => {
      expect((await run(validateCreateModelInventoryV1, { ...model, status })).fields).toEqual([
        "status",
      ]);
      expect((await run(validateUpdateModelInventoryV1, { status }, { id: "1" })).fields).toEqual([
        "status",
      ]);
    },
  );

  it("refuses a model risk level sent as an array", async () => {
    expect(
      (await run(validateUpdateModelRiskV1, { risk_level: ["High"] }, { id: "1" })).fields,
    ).toEqual(["risk_level"]);
  });
});

describe("ids use the house parser", () => {
  it.each([["07"], ["0"], ["-1"], ["1e3"], [2147483648], ["+5"]])(
    "refuses approver %p on v1",
    async (approver) => {
      expect((await run(validateCreateModelInventoryV1, { ...model, approver })).fields).toEqual([
        "approver",
      ]);
    },
  );

  it.each([["07"], [2147483648]])("refuses model risk owner %p on v1", async (owner) => {
    expect((await run(validateUpdateModelRiskV1, { owner }, { id: "1" })).fields).toEqual([
      "owner",
    ]);
  });
});
