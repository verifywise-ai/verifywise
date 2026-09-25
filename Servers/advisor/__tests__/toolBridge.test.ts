/**
 * toolBridge — tool result sanitization.
 *
 * Regression guard for the intermittent AI Advisor failure:
 *   "Invalid prompt: The messages do not match the ModelMessage[] schema."
 *
 * Root cause: a bridged tool returned its underlying function's value raw.
 * The AI SDK serializes that value into a tool-result message and validates
 * it against `modelMessageSchema` on the next step of the streamText tool
 * loop. Its `jsonValueSchema` allows `undefined` object VALUES but rejects
 * `undefined` ARRAY ELEMENTS — so an output like
 * `rows.map(r => cond ? {...} : undefined)` (or any array hole) fails and
 * throws the schema error mid-stream, surfacing to the user as
 * "Something went wrong while generating a response".
 *
 * Note: the SDK's own coercion (`toJSONValue`) only handles a TOP-LEVEL
 * `undefined` (→ null); it does not recurse. The fix therefore sanitizes the
 * output recursively at the bridge. These tests drive the sanitized output
 * through the SDK's real message-construction path (`toJSONValue`, exactly as
 * `createToolModelOutput` does) and assert it satisfies `modelMessageSchema`.
 */

import { describe, expect, it } from "@jest/globals";
import { z } from "zod";
import { modelMessageSchema } from "ai";
import { bridgeTools, sanitizeToolOutput } from "../toolBridge";

const toolResultMessageSchema = z.array(modelMessageSchema);

/**
 * Reproduce the SDK's tool-result message construction faithfully.
 * `createToolModelOutput` wraps a non-string output as
 * `{ type: "json", value: toJSONValue(output) }`, where `toJSONValue`
 * coerces a *top-level* undefined to null but does NOT recurse.
 */
function toJSONValue(value: unknown): unknown {
  return value === undefined ? null : value;
}
function buildSdkToolMessage(rawOutput: unknown) {
  return [
    {
      role: "tool" as const,
      content: [
        {
          type: "tool-result" as const,
          toolCallId: "call-1",
          toolName: "t",
          output: { type: "json" as const, value: toJSONValue(rawOutput) as never },
        },
      ],
    },
  ];
}

/** Assert a raw tool output produces a schema-valid message via the SDK path. */
function expectSchemaValid(rawOutput: unknown) {
  const parsed = toolResultMessageSchema.safeParse(buildSdkToolMessage(rawOutput));
  expect(parsed.success).toBe(true);
}

const DEF = (name: string) => ({
  type: "function",
  function: {
    name,
    description: `test tool ${name}`,
    parameters: { type: "object", properties: {} },
  },
});

async function runTool(fnResult: unknown): Promise<unknown> {
  const name = "t";
  const tools = bridgeTools([DEF(name)], { [name]: async () => fnResult }, 1, 42);
  const bridged = tools[name] as { execute: (p: Record<string, unknown>) => Promise<unknown> };
  return bridged.execute({});
}

describe("sanitizeToolOutput", () => {
  it("coerces top-level undefined to null", () => {
    expect(sanitizeToolOutput(undefined)).toBeNull();
  });

  it("coerces undefined array elements to null (preserving length)", () => {
    expect(sanitizeToolOutput([{ id: 1 }, undefined, { id: 2 }])).toEqual([
      { id: 1 },
      null,
      { id: 2 },
    ]);
  });

  it("drops undefined object values", () => {
    expect(sanitizeToolOutput({ a: 1, b: undefined, c: "x" })).toEqual({ a: 1, c: "x" });
  });

  it("recurses into nested arrays and objects", () => {
    expect(sanitizeToolOutput({ items: [{ ok: 1 }, undefined], meta: { drop: undefined } })).toEqual(
      { items: [{ ok: 1 }, null], meta: {} },
    );
  });

  it("maps a bare function/symbol in an array to null (defensive)", () => {
    expect(sanitizeToolOutput([() => 1])).toEqual([null]);
  });

  it("leaves valid primitives, null, and clean structures unchanged", () => {
    expect(sanitizeToolOutput(null)).toBeNull();
    expect(sanitizeToolOutput(42)).toBe(42);
    expect(sanitizeToolOutput("hi")).toBe("hi");
    expect(sanitizeToolOutput([{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("output is always accepted by the SDK's modelMessageSchema", () => {
    // These raw shapes FAIL the schema via the SDK path when unsanitized;
    // after sanitization they must pass.
    for (const raw of [
      [{ id: 1 }, undefined],
      { items: [{ ok: 1 }, undefined] },
      [() => 1],
    ]) {
      expectSchemaValid(sanitizeToolOutput(raw));
    }
  });
});

describe("bridgeTools — tool result sanitization", () => {
  it("does not let an undefined-array-element result break the schema", async () => {
    // The real production trigger: a map/filter that yields an undefined hole.
    const result = await runTool([{ id: 1 }, undefined, { id: 2 }]);
    expect(result).toEqual([{ id: 1 }, null, { id: 2 }]);
    expectSchemaValid(result);
  });

  it("returns a self-describing sentinel when the function returns undefined", async () => {
    const result = await runTool(undefined);
    expect(result).toEqual({ result: null, note: "tool returned no value" });
    expectSchemaValid(result);
  });

  it("returns a self-describing sentinel when the function returns nothing (void)", async () => {
    const result = await runTool(void 0);
    expect(result).toEqual({ result: null, note: "tool returned no value" });
    expectSchemaValid(result);
  });

  it("preserves a normal object result unchanged", async () => {
    const payload = { vendors: [{ id: 1, name: "Acme" }] };
    const result = await runTool(payload);
    expect(result).toEqual(payload);
    expectSchemaValid(result);
  });

  it("preserves an array result unchanged", async () => {
    const payload = [{ id: 1 }, { id: 2 }];
    const result = await runTool(payload);
    expect(result).toEqual(payload);
    expectSchemaValid(result);
  });

  it("preserves a null result (null is schema-valid) unchanged", async () => {
    const result = await runTool(null);
    expect(result).toBeNull();
    expectSchemaValid(result);
  });
});
