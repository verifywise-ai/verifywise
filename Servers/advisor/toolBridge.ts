import { tool } from "ai";
import type { ToolSet } from "ai";
import { z, ZodTypeAny } from "zod";
import logger from "../utils/logger/fileLogger";

/**
 * Make a tool's return value safe for the AI SDK's JSON message schema.
 *
 * The AI SDK serializes a tool result into a tool-result message and validates
 * it against `modelMessageSchema` on the next step of the streamText tool loop.
 * Its `jsonValueSchema` treats object values as optional (an `undefined` value
 * is allowed) but requires every ARRAY element to be a valid JSON value —
 * `undefined` is not one. So an output like `rows.map(r => cond ? {...} :
 * undefined)` (or any array with a hole) fails validation and throws
 * "Invalid prompt: The messages do not match the ModelMessage[] schema."
 * mid-stream, which reaches the user as "Something went wrong while generating
 * a response".
 *
 * The SDK's own coercion only handles a *top-level* `undefined` (→ `null`); it
 * does not recurse. We sanitize recursively here, at the single point every
 * bridged tool result passes through:
 *   - top-level `undefined`  → `null`
 *   - `undefined` array elements → `null` (preserve position/length)
 *   - `undefined` object values  → dropped (schema-valid and cleaner)
 *   - functions / non-JSON values in arrays → `null` (defensive)
 * All other values pass through unchanged.
 *
 * Exported for unit testing.
 */
export function sanitizeToolOutput(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") {
    // Primitives that JSON can represent pass through; a bare function or
    // symbol at the top level becomes null so it can't break serialization.
    return typeof value === "function" || typeof value === "symbol" ? null : value;
  }
  if (Array.isArray(value)) {
    // Array elements must each be valid — map undefined/holes to null.
    return value.map((el) => {
      const sanitized = sanitizeToolOutput(el);
      return sanitized === undefined ? null : sanitized;
    });
  }
  // Plain object: drop keys whose value sanitizes away to undefined.
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (val === undefined) continue;
    out[key] = sanitizeToolOutput(val);
  }
  return out;
}

/**
 * Convert a JSON Schema type definition to a Zod schema.
 * Handles the subset of JSON Schema used in our OpenAI-format tool definitions.
 *
 * NOTE: We intentionally do NOT use z.enum() for string fields. LLMs (especially
 * GPT-4o-mini) tend to auto-fill enum-typed fields with the first value, even when
 * marked optional. Instead, we include the valid values in the description so the
 * LLM uses them when relevant but doesn't default-fill them.
 */
function jsonSchemaToZod(schema: Record<string, unknown>): ZodTypeAny {
  const type = schema.type as string;

  if (type === "string") {
    let base = z.string();
    let description = (schema.description as string) || "";
    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      // Merge enum values into description instead of using z.enum
      const enumHint = `Valid values: ${(schema.enum as string[]).join(", ")}. Only include if user explicitly asks.`;
      description = description ? `${description} ${enumHint}` : enumHint;
    }
    if (description) {
      base = base.describe(description);
    }
    return base;
  }

  if (type === "number" || type === "integer") {
    let base = z.number();
    if (schema.description) {
      base = base.describe(schema.description as string);
    }
    return base;
  }

  if (type === "boolean") {
    let base = z.boolean();
    if (schema.description) {
      base = base.describe(schema.description as string);
    }
    return base;
  }

  if (type === "array") {
    const items = schema.items as Record<string, unknown> | undefined;
    if (items) {
      return z.array(jsonSchemaToZod(items));
    }
    return z.array(z.unknown());
  }

  if (type === "object") {
    const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
    const required = (schema.required as string[]) || [];

    if (!properties || Object.keys(properties).length === 0) {
      return z.object({});
    }

    const shape: Record<string, ZodTypeAny> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
      let zodProp = jsonSchemaToZod(propSchema);
      if (propSchema.description) {
        zodProp = zodProp.describe(propSchema.description as string);
      }
      if (!required.includes(key)) {
        zodProp = zodProp.optional();
      }
      shape[key] = zodProp;
    }

    return z.object(shape);
  }

  // Fallback for unknown types
  return z.unknown();
}

/**
 * Bridge existing OpenAI-format tool definitions + function implementations
 * into AI SDK `tool()` format.
 *
 * @param toolsDefinition - Array of OpenAI-format tool definitions
 * @param availableTools - Record mapping tool name → async function(params, tenant, userId?)
 * @param tenant - Organization ID injected via closure into each tool execution
 * @param userId - Optional user ID passed as a third argument to tool functions. Required by
 *                 AI *write* tools that need to attribute actions to a requester (e.g. creating
 *                 an approval request). Read-only tools may ignore this argument.
 * @returns ToolSet for AI SDK streamText()
 */
export function bridgeTools(
  toolsDefinition: Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>,
  availableTools: Record<
    string,
    (params: Record<string, unknown>, tenant: number, userId?: number) => Promise<unknown>
  >,
  tenant: number,
  userId?: number,
): ToolSet {
  const tools: ToolSet = {};

  for (const def of toolsDefinition) {
    const { name, description, parameters } = def.function;
    const fn = availableTools[name];

    if (!fn) {
      logger.warn(`[toolBridge] Tool "${name}" has definition but no implementation — skipping`);
      continue;
    }

    const zodSchema = jsonSchemaToZod(parameters);

    // All existing tool definitions use object-type top-level parameters.
    // Cast to ZodObject for AI SDK's tool() type inference; non-object schemas
    // would still work at runtime but we skip them defensively.
    if (!(zodSchema instanceof z.ZodObject)) {
      logger.warn(`[toolBridge] Tool "${name}" has non-object top-level schema — skipping`);
      continue;
    }

    tools[name] = tool({
      description,
      inputSchema: zodSchema as z.ZodObject<Record<string, ZodTypeAny>>,
      execute: async (params: Record<string, unknown>) => {
        try {
          // Strip LLM-generated default values (empty strings, zero for IDs, false for flags)
          // LLMs tend to auto-fill optional fields with type defaults which causes filtering issues.
          const cleaned: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(params)) {
            if (value === "" || value === null || value === undefined) continue;
            // Strip `archived: false` — implicit default, skip entirely
            if (key === "archived" && value === false) continue;
            // Strip `projectId: 0`, `id: 0` — invalid IDs, likely auto-fill
            if ((key === "projectId" || key === "project_id" || key.endsWith("_id")) && value === 0)
              continue;
            cleaned[key] = value;
          }

          // Inject userId for write tools that need it (confirmation flow)
          const enrichedParams = userId !== undefined ? { ...cleaned, _userId: userId } : cleaned;
          logger.info(`[toolBridge] Calling "${name}" with params: ${JSON.stringify(cleaned)}`);
          const result = await fn(enrichedParams, tenant, userId);
          const resultSize = Array.isArray(result) ? result.length : typeof result;
          logger.info(
            `[toolBridge] Tool "${name}" returned: ${resultSize} ${Array.isArray(result) ? "items" : ""}`,
          );
          // Recursively make the output safe for the AI SDK's JSON message
          // schema (see sanitizeToolOutput). This prevents an undefined —
          // top-level OR nested inside an array — from breaking the tool-loop
          // with "The messages do not match the ModelMessage[] schema." A tool
          // that resolves to nothing at all becomes a self-describing empty
          // result so the model can narrate "no data" rather than seeing a
          // bare null it can't distinguish from a genuine null datum.
          if (result === undefined) {
            logger.warn(
              `[toolBridge] Tool "${name}" returned undefined — substituting an empty result to keep the message schema valid`,
            );
            return { result: null, note: "tool returned no value" };
          }
          return sanitizeToolOutput(result);
        } catch (error) {
          logger.error(`[toolBridge] Error executing tool "${name}":`, error);
          return {
            error: error instanceof Error ? error.message : "Unknown error occurred",
          };
        }
      },
    });
  }

  return tools;
}
