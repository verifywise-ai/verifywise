import { Request, Response } from "express";
import { validateCreateRisk, validateUpdateRisk } from "../risks.validator";

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
  const errors: { field?: string; path?: string }[] =
    payload?.data?.errors ?? payload?.errors ?? [];
  const fields = errors.map((e) => e.field ?? e.path ?? "").sort();
  return { status: (res.status as jest.Mock).mock.calls[0]?.[0], fields };
}

const risk = { risk_name: "Model drift", risk_owner: 3 };
const MITIGATION_ENUMS_AND_DATES = [
  "mitigation_status",
  "current_risk_level",
  "deadline",
  "likelihood_mitigation",
  "risk_severity",
  "date_of_assessment",
];

// The mitigation fields are optional on create and update.
describe("project risk mitigation fields", () => {
  it("creates a risk with no mitigation field", async () => {
    expect((await run(validateCreateRisk, risk)).status).toBeUndefined();
  });

  it.each([null, ""])("takes %p as none for every mitigation enum and date", async (empty) => {
    const body = Object.fromEntries(MITIGATION_ENUMS_AND_DATES.map((f) => [f, empty]));
    expect((await run(validateCreateRisk, { ...risk, ...body })).status).toBeUndefined();
    expect((await run(validateUpdateRisk, body, { id: "4" })).status).toBeUndefined();
  });

  it.each([0, false])("refuses %p, which is not an empty value", async (value) => {
    const body = Object.fromEntries(MITIGATION_ENUMS_AND_DATES.map((f) => [f, value]));
    const created = await run(validateCreateRisk, { ...risk, ...body });
    expect(created.status).toBe(400);
    expect(created.fields).toEqual([...MITIGATION_ENUMS_AND_DATES].sort());
    expect((await run(validateUpdateRisk, body, { id: "4" })).status).toBe(400);
  });

  it("still refuses a value that is not valid", async () => {
    const r = await run(validateCreateRisk, {
      ...risk,
      mitigation_status: "Soon",
      deadline: "next week",
    });
    expect(r.status).toBe(400);
    expect(r.fields).toEqual(["deadline", "mitigation_status"]);
  });

  it("accepts valid values", async () => {
    const r = await run(validateCreateRisk, {
      ...risk,
      mitigation_status: "Not Started",
      current_risk_level: "Very Low risk",
      deadline: "2030-01-15",
      likelihood_mitigation: "Rare",
      risk_severity: "Critical",
    });
    expect(r.status).toBeUndefined();
  });
});
