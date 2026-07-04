import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SimConfig } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(HERE, "..", ".mrm-simulator.json");

export interface CacheFile {
  token?: string;
  models: Record<string, number>; // externalKey -> modelId
  lastBackfill?: string;
}

const flag = (argv: string[], name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};

const has = (argv: string[], name: string): boolean => argv.includes(name);

export const loadConfig = (argv: string[]): SimConfig => ({
  baseUrl: flag(argv, "--base-url") ?? "http://localhost:3000",
  email: process.env.VW_EMAIL ?? "gorkem.cetin@verifywise.ai",
  password: process.env.VW_PASSWORD ?? "Verifywise#1",
  allowRemote: has(argv, "--i-know-what-im-doing"),
});

export const assertSafeTarget = (cfg: SimConfig): void => {
  let hostname: string;
  try {
    hostname = new URL(cfg.baseUrl).hostname;
  } catch {
    throw new Error(`refusing to run: baseUrl is not a valid URL: ${cfg.baseUrl}`);
  }
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  if (!isLocal && !cfg.allowRemote) {
    throw new Error(
      `refusing to run against non-localhost target ${cfg.baseUrl}. ` +
        `Pass --i-know-what-im-doing to override (this sends synthetic data).`,
    );
  }
};

export const readCache = (): CacheFile => {
  if (!existsSync(CACHE_PATH)) return { models: {} };
  return JSON.parse(readFileSync(CACHE_PATH, "utf8")) as CacheFile;
};

export const writeCache = (c: CacheFile): void => {
  writeFileSync(CACHE_PATH, JSON.stringify(c, null, 2));
};
