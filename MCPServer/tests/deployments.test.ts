import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deploymentTools } from "../src/tools/deployments";
import { loadProfiles } from "../src/config";

let dir: string;
let configFile: string;

const addDeployment = deploymentTools.find((t) => t.name === "add_deployment")!;

const ARGS = {
  name: "acme",
  url: "https://acme.verifywise.ai",
  token: "a-real-token",
};

function mockFetch(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify({ message: "ok", data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-mcp-deploy-"));
  configFile = path.join(dir, "mcp.json");
  process.argv = ["node", "server", "--config", configFile];
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("add_deployment", () => {
  it("verifies the token against the deployment before saving it", async () => {
    const fetchMock = mockFetch(json(200, [{ id: 1 }, { id: 2 }]));

    const output = await addDeployment.handler({ ...ARGS });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://acme.verifywise.ai/api/super-admin/organizations");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer a-real-token");

    const reported = JSON.parse(output.content[0].text as string);
    expect(reported.saved).toBe("acme");
    expect(reported.organizationsVisible).toBe(2);
    expect(loadProfiles(configFile).get("acme")!.token).toBe("a-real-token");
  });

  it("saves nothing when the token cannot use the super-admin API", async () => {
    mockFetch(json(403, "Access restricted to super-admin only"));

    await expect(addDeployment.handler({ ...ARGS })).rejects.toThrow(/super_admins/);
    expect(fs.existsSync(configFile)).toBe(false);
  });

  it("saves nothing when the deployment is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    await expect(addDeployment.handler({ ...ARGS })).rejects.toThrow(/Could not reach acme/);
    expect(fs.existsSync(configFile)).toBe(false);
  });

  it("strips a trailing slash from the url before saving", async () => {
    mockFetch(json(200, []));
    await addDeployment.handler({ ...ARGS, url: "https://acme.verifywise.ai/" });
    expect(loadProfiles(configFile).get("acme")!.url).toBe("https://acme.verifywise.ai");
  });
});

describe("profile naming", () => {
  it("derives the name from the url host when none is given", async () => {
    mockFetch(json(200, []));
    await addDeployment.handler({ url: "https://acme.verifywise.ai", token: "t" });
    expect([...loadProfiles(configFile).keys()]).toEqual(["acme"]);
  });

  it("names a localhost deployment after localhost", async () => {
    mockFetch(json(200, []));
    await addDeployment.handler({ url: "http://localhost:3000", token: "t" });
    expect([...loadProfiles(configFile).keys()]).toEqual(["localhost"]);
  });

  it("falls back to the full hostname when the short name is taken by another host", async () => {
    mockFetch(json(200, []));
    await addDeployment.handler({ url: "https://test.verifywise.ai", token: "t" });
    mockFetch(json(200, []));
    await addDeployment.handler({ url: "https://test.example.com", token: "t" });

    expect([...loadProfiles(configFile).keys()].sort()).toEqual(["test", "test.example.com"]);
  });

  it("reuses the short name when the same host is saved again", async () => {
    mockFetch(json(200, []));
    await addDeployment.handler({ url: "https://test.verifywise.ai", token: "first" });
    mockFetch(json(200, []));
    await addDeployment.handler({ url: "https://test.verifywise.ai", token: "rotated" });

    expect([...loadProfiles(configFile).keys()]).toEqual(["test"]);
    expect(loadProfiles(configFile).get("test")!.token).toBe("rotated");
  });

  it("still honours an explicit name", async () => {
    mockFetch(json(200, []));
    await addDeployment.handler({ name: "mine", url: "https://acme.verifywise.ai", token: "t" });
    expect([...loadProfiles(configFile).keys()]).toEqual(["mine"]);
  });
});
