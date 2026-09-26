import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configPath, loadProfiles, resolveProfile, saveProfile } from "../src/config";

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

describe("saveProfile", () => {
  const entry = { name: "acme", url: "https://acme.verifywise.ai", token: "tok" };

  it("creates the file, and its directory, owner-only", () => {
    const file = path.join(dir, "nested", "mcp.json");
    saveProfile(entry, file);

    expect(loadProfiles(file).get("acme")).toEqual({ ...entry, name: "acme" });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("keeps the deployments already in the file", () => {
    const file = writeConfig(VALID);
    saveProfile(entry, file);

    expect([...loadProfiles(file).keys()].sort()).toEqual(["acme", "staging"]);
    expect(loadProfiles(file).get("staging")!.token).toBe("token-b");
  });

  it("replaces a deployment of the same name rather than duplicating it", () => {
    const file = writeConfig(VALID);
    saveProfile({ ...entry, token: "rotated" }, file);

    expect(loadProfiles(file).size).toBe(2);
    expect(loadProfiles(file).get("acme")!.token).toBe("rotated");
  });

  it("tightens the mode of an existing world-readable file", () => {
    const file = writeConfig(VALID);
    fs.chmodSync(file, 0o644);
    saveProfile(entry, file);

    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("refuses to overwrite a file it cannot parse", () => {
    const file = writeConfig("{ broken");
    expect(() => saveProfile(entry, file)).toThrow(/left untouched/);
    expect(fs.readFileSync(file, "utf8")).toBe("{ broken");
  });

  it("rejects an empty name, an empty token and a bad url", () => {
    const file = path.join(dir, "mcp.json");
    expect(() => saveProfile({ ...entry, name: "  " }, file)).toThrow(/name is required/);
    expect(() => saveProfile({ ...entry, token: " " }, file)).toThrow(/No token given/);
    expect(() => saveProfile({ ...entry, url: "acme.verifywise.ai" }, file)).toThrow(/invalid url/);
    expect(fs.existsSync(file)).toBe(false);
  });
});
