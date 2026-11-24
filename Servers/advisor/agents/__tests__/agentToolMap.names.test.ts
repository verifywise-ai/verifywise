import { describe, expect, it } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { AGENT_TOOL_MAP } from "../agentToolMap";

/**
 * Every tool an agent claims must be a real Advisor tool: the router keeps
 * only claimed tools when an agent matches, so a misspelt or renamed name
 * silently hides the real tool from that domain.
 *
 * The real names are every tool definition in advisor/tools plus the AI
 * action write tools (the definition.ts file of each advisor/aiActions action), the same sources advisor.ctrl.ts
 * builds the catalogue from.
 */

const ADVISOR_DIR = path.join(__dirname, "../..");

function toolName(value: unknown): string | undefined {
  const name = (value as { function?: { name?: unknown } })?.function?.name;
  return typeof name === "string" ? name : undefined;
}

function namesExportedBy(file: string, names: Set<string>): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const exported = require(file) as Record<string, unknown>;
  for (const value of Object.values(exported)) {
    for (const tool of Array.isArray(value) ? value : [value]) {
      const name = toolName(tool);
      if (name) names.add(name);
    }
  }
}

function realToolNames(): Set<string> {
  const names = new Set<string>();
  const toolsDir = path.join(ADVISOR_DIR, "tools");
  for (const file of fs.readdirSync(toolsDir).filter((f) => /Tools\.ts$/.test(f))) {
    namesExportedBy(path.join(toolsDir, file), names);
  }
  // Each AI action keeps its tool definition in aiActions/<action>/definition.ts.
  // Read those directly: the registry also imports the filers, which pull in
  // the database module.
  const actionsDir = path.join(ADVISOR_DIR, "aiActions");
  for (const entry of fs.readdirSync(actionsDir, { withFileTypes: true })) {
    const definition = path.join(actionsDir, entry.name, "definition.ts");
    if (entry.isDirectory() && fs.existsSync(definition)) namesExportedBy(definition, names);
  }
  return names;
}

describe("AGENT_TOOL_MAP tool names", () => {
  const real = realToolNames();

  it("reads the real catalogue", () => {
    expect(real.size).toBeGreaterThan(200);
  });

  it.each(AGENT_TOOL_MAP.map((agent) => [agent.name, agent.tools] as const))(
    "%s names only real tools",
    (_agentName, tools) => {
      expect(tools.filter((tool) => !real.has(tool))).toEqual([]);
    },
  );

  it.each(AGENT_TOOL_MAP.map((agent) => [agent.name, agent.tools] as const))(
    "%s claims each tool once",
    (_agentName, tools) => {
      expect(tools.filter((tool, i) => tools.indexOf(tool) !== i)).toEqual([]);
    },
  );
});
