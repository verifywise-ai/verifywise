// Same mock trio as directionFilter.spec.ts: the module under test also holds
// the orchestration, which reaches the database and the AI SDK.
jest.mock("../../../utils/riskLink.utils");
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn() },
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { jsonObjectFallback } from "../direction/direction.service";

const schema = {
  type: "object",
  properties: { groups: { type: "array" } },
  required: ["groups"],
} as const;

const transform = (params: LanguageModelV3CallOptions) =>
  jsonObjectFallback.transformParams!({
    type: "generate",
    params,
    model: {} as any,
  });

describe("jsonObjectFallback", () => {
  it("drops the schema so the provider sends json_object instead of json_schema", async () => {
    const out = await transform({
      prompt: [{ role: "system", content: "You are an analyst." }],
      responseFormat: { type: "json", schema, name: "output" },
    });

    expect(out.responseFormat).toEqual({ type: "json" });
  });

  it("carries the schema into the system prompt, which the SDK does not do", async () => {
    const out = await transform({
      prompt: [
        { role: "system", content: "You are an analyst." },
        { role: "user", content: [{ type: "text", text: "these risks" }] },
      ],
      responseFormat: { type: "json", schema },
    });

    const system = out.prompt[0] as { role: "system"; content: string };
    expect(system.role).toBe("system");
    expect(system.content).toContain("You are an analyst.");
    expect(system.content).toContain(JSON.stringify(schema));
    expect(out.prompt).toHaveLength(2);
  });

  it("prepends a system message when the call has none", async () => {
    const out = await transform({
      prompt: [{ role: "user", content: [{ type: "text", text: "these risks" }] }],
      responseFormat: { type: "json", schema },
    });

    expect(out.prompt).toHaveLength(2);
    const system = out.prompt[0] as { role: "system"; content: string };
    expect(system.role).toBe("system");
    expect(system.content).toContain(JSON.stringify(schema));
  });

  it("leaves a call without a schema exactly as it was", async () => {
    const params: LanguageModelV3CallOptions = {
      prompt: [{ role: "system", content: "You are an analyst." }],
      responseFormat: { type: "text" },
    };

    await expect(transform(params)).resolves.toEqual(params);
  });
});
