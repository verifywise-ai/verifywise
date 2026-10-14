import fs from "node:fs";
import path from "node:path";

export interface Case {
  name: string;
  records: Record<string, unknown>[];
  config: Record<string, unknown>;
}

function read<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf8")) as T;
}

export function allCases(): Case[] {
  return read<Case[]>("cases.resolved.json");
}

export function byName(name: string): Case {
  const found = allCases().find((c) => c.name === name);
  if (!found) throw new Error(`no oracle case named ${name}`);
  return found;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exp(name: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expected = read<Record<string, any>>("expected.json");
  if (!(name in expected)) throw new Error(`no oracle expectation for ${name}`);
  return expected[name];
}
