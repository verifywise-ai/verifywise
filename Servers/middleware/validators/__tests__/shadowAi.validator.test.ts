import { Request, Response } from "express";
import {
  validateCreateSyslogConfig,
  validateStartGovernance,
  validateUpdateSyslogConfig,
} from "../shadowAi.validator";

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
  return { status: (res.status as jest.Mock).mock.calls[0]?.[0], next };
}

describe("syslog config validators", () => {
  it("accepts create without a sender IP", async () => {
    expect(
      (await run(validateCreateSyslogConfig, { parser_type: "squid" })).status,
    ).toBeUndefined();
  });

  it("accepts IPv4, IPv6 and mapped addresses", async () => {
    for (const ip of ["10.0.0.5", "2001:db8::1", "::ffff:10.0.0.9", " 10.0.0.5 "]) {
      const r = await run(validateCreateSyslogConfig, {
        parser_type: "squid",
        source_identifier: ip,
      });
      expect(r.status).toBeUndefined();
    }
  });

  it("rejects a hostname on create with 400", async () => {
    const r = await run(validateCreateSyslogConfig, {
      parser_type: "squid",
      source_identifier: "proxy-01.corp.com",
    });
    expect(r.status).toBe(400);
  });

  it("rejects a hostname or a non-string on update with 400", async () => {
    for (const v of ["proxy-01.corp.com", 5]) {
      const r = await run(validateUpdateSyslogConfig, { source_identifier: v }, { id: "1" });
      expect(r.status).toBe(400);
    }
  });

  it("lets update clear the sender IP and leave it out", async () => {
    for (const body of [
      { source_identifier: "" },
      { source_identifier: null },
      { is_active: false },
    ]) {
      expect((await run(validateUpdateSyslogConfig, body, { id: "1" })).status).toBeUndefined();
    }
  });
});

describe("validateStartGovernance risk_assessment", () => {
  const base = {
    model_inventory: { provider: "OpenAI", model: "GPT-4" },
    governance_owner_id: 2,
  };
  const status = async (risk_assessment: unknown) =>
    (await run(validateStartGovernance, { ...base, risk_assessment }, { id: "1" })).status;

  it("accepts a valid assessment, an empty one and none", async () => {
    expect(await status({ data_sensitivity: "High", description: "x" })).toBeUndefined();
    expect(await status({ data_sensitivity: "", description: "x" })).toBeUndefined();
    expect(await status({ description: "" })).toBeUndefined();
    expect(await status(undefined)).toBeUndefined();
  });

  it("rejects an unknown sensitivity, a non-string or too long description", async () => {
    expect(await status({ data_sensitivity: "high" })).toBe(400);
    expect(await status({ data_sensitivity: ["High", "Low"] })).toBe(400);
    expect(await status({ data_sensitivity: [] })).toBe(400);
    expect(await status({ description: 123 })).toBe(400);
    expect(await status({ description: "x".repeat(5001) })).toBe(400);
    expect(await status(["High"])).toBe(400);
  });
});
