import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configPath, loadProfiles, resolveProfile } from "../src/config";

let dir: string;

function writeConfig(contents: unknown | string): string {
  const file = path.join(dir, "mcp.json");
  fs.writeFileSync(file, typeof contents === "string" ? contents : JSON.stringify(contents));
  return file;
}

const VALID = {
  profiles: {
    acme: { url: "https://acme.verifywise.ai", token: "token-a" },
    staging: { url: "http://localhost:3000", token: "token-b" },
  },
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-mcp-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("configPath", () => {
  it("uses --config when given", () => {
    expect(configPath(["node", "server", "--config", "/tmp/x.json"])).toBe("/tmp/x.json");
  });

  it("falls back to ~/.verifywise/mcp.json", () => {
    expect(configPath(["node", "server"])).toBe(path.join(os.homedir(), ".verifywise", "mcp.json"));
  });

  it("rejects --config without a path", () => {
    expect(() => configPath(["node", "server", "--config"])).toThrow(/requires a file path/);
  });
});

describe("loadProfiles", () => {
  it("reads every profile", () => {
    const profiles = loadProfiles(writeConfig(VALID));
    expect([...profiles.keys()]).toEqual(["acme", "staging"]);
    expect(profiles.get("acme")).toEqual({
      name: "acme",
      url: "https://acme.verifywise.ai",
      token: "token-a",
    });
  });

  it("strips trailing slashes from the url", () => {
    const file = writeConfig({
      profiles: { acme: { url: "https://acme.verifywise.ai///", token: "t" } },
    });
    expect(loadProfiles(file).get("acme")!.url).toBe("https://acme.verifywise.ai");
  });

  it("names the expected path when the file is missing", () => {
    const missing = path.join(dir, "absent.json");
    // Plain string, not a regex: toThrow does a substring match, and the path
    // is untrusted input here (a temp dir name) that would need escaping.
    expect(() => loadProfiles(missing)).toThrow(missing);
  });

  it("reports invalid JSON", () => {
    expect(() => loadProfiles(writeConfig("{ not json"))).toThrow(/not valid JSON/);
  });

  it("rejects a file with no profiles object", () => {
    expect(() => loadProfiles(writeConfig({ deployments: {} }))).toThrow(/"profiles" object/);
  });

  it("rejects an empty profiles object", () => {
    expect(() => loadProfiles(writeConfig({ profiles: {} }))).toThrow(/no profiles/);
  });

  it("rejects a profile with no token", () => {
    const file = writeConfig({ profiles: { acme: { url: "https://a.io" } } });
    expect(() => loadProfiles(file)).toThrow(/missing a "token"/);
  });

  it("rejects a profile with no url", () => {
    const file = writeConfig({ profiles: { acme: { token: "t" } } });
    expect(() => loadProfiles(file)).toThrow(/missing a "url"/);
  });

  it("rejects a malformed url", () => {
    const file = writeConfig({ profiles: { acme: { url: "acme.verifywise.ai", token: "t" } } });
    expect(() => loadProfiles(file)).toThrow(/invalid url/);
  });

  it("rejects a non-http scheme", () => {
    const file = writeConfig({ profiles: { acme: { url: "file:///etc/passwd", token: "t" } } });
    expect(() => loadProfiles(file)).toThrow(/must use http or https/);
  });
});

describe("resolveProfile", () => {
  it("resolves a named profile", () => {
    expect(resolveProfile("staging", writeConfig(VALID)).url).toBe("http://localhost:3000");
  });

  it("lists the available profiles when the name is unknown", () => {
    expect(() => resolveProfile("nope", writeConfig(VALID))).toThrow(
      /Unknown profile "nope".*acme, staging/s,
    );
  });

  it("picks up a profile added after the first read", () => {
    const file = writeConfig(VALID);
    expect(() => resolveProfile("later", file)).toThrow(/Unknown profile/);
    fs.writeFileSync(
      file,
      JSON.stringify({
        profiles: { ...VALID.profiles, later: { url: "https://later.io", token: "t" } },
      }),
    );
    expect(resolveProfile("later", file).url).toBe("https://later.io");
  });
});
