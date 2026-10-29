import fs from "node:fs";
import path from "node:path";

export interface Case {
  name: string;
  records: Record<string, unknown>[];
  config: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Expected = Record<string, any>;

let casesCache: Case[] | undefined;
let expectedCache: Expected | undefined;

function read<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf8")) as T;
}

export function allCases(): Case[] {
  casesCache ??= read<Case[]>("cases.resolved.json");
  return casesCache;
}

export function byName(name: string): Case {
  const found = allCases().find((c) => c.name === name);
  if (!found) throw new Error(`no oracle case named ${name}`);
  return found;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exp(name: string): any {
  expectedCache ??= read<Expected>("expected.json");
  if (!(name in expectedCache)) {
    throw new Error(`no oracle expectation for ${name}`);
  }
  return expectedCache[name];
}
