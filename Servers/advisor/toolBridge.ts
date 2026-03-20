import { tool } from "ai";
import type { ToolSet } from "ai";
import { z, ZodTypeAny } from "zod";
import logger from "../utils/logger/fileLogger";

/**
 * Convert a JSON Schema type definition to a Zod schema.
 * Handles the subset of JSON Schema used in our OpenAI-format tool definitions.
 */
function jsonSchemaToZod(schema: Record<string, unknown>): ZodTypeAny {
  const type = schema.type as string;

  if (type === "string") {
    let base = z.string();
    if (Array.isArray(schema.enum)) {
      return z.enum(schema.enum as [string, ...string[]]);
    }
    if (schema.description) {
      base = base.describe(schema.description as string);
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
 * @param availableTools - Record mapping tool name → async function(params, tenant)
 * @param tenant - Tenant hash injected via closure into each tool execution
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
  availableTools: Record<string, (params: Record<string, unknown>, tenant: number) => Promise<unknown>>,
  tenant: number
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
          const result = await fn(params, tenant);
          return result;
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
