import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { organizationTools } from "../src/tools/organizations";
import { userTools } from "../src/tools/users";

const TOKEN = "super-secret-token";
let dir: string;
let configFile: string;

const ROLES = [
  { id: 1, name: "Admin" },
  { id: 3, name: "Editor" },
];

function tool(name: string) {
  const found = [...organizationTools, ...userTools].find((t) => t.name === name);
  if (!found) throw new Error(`no such tool: ${name}`);
  return found;
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify({ message: "ok", data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Routes each mocked call by path so tools that make several are testable. */
function mockApi(routes: Record<string, () => Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const match = Object.keys(routes).find((key) => url.endsWith(key));
      if (!match) throw new Error(`unexpected request: ${url}`);
      return routes[match]();
    }),
  );
  return calls;
}

function payload(calls: { init: RequestInit }[], index: number): any {
  return JSON.parse(calls[index].init.body as string);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-mcp-tools-"));
  configFile = path.join(dir, "mcp.json");
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      profiles: { acme: { url: "https://acme.verifywise.ai", token: TOKEN } },
    }),
  );
  process.argv = ["node", "server", "--config", configFile];
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("create_organization_with_admin", () => {
  it("creates the org and admin in one direct-mode call with a generated password", async () => {
    const calls = mockApi({
      "/api/roles": () => json(200, ROLES),
      "/api/super-admin/organizations-with-user": () => json(201, { organizationId: 42 }),
    });

    const output = await tool("create_organization_with_admin").handler({
      profile: "acme",
      organizationName: "Acme Corp",
      adminEmail: "admin@acme.com",
      adminFirstName: "Ada",
      adminLastName: "Lovelace",
    });

    const sent = payload(calls, 1);
    expect(sent.orgName).toBe("Acme Corp");
    expect(sent.mode).toBe("direct");
    expect(sent.user).toMatchObject({
      email: "admin@acme.com",
      name: "Ada",
      surname: "Lovelace",
      roleId: 1,
    });
    expect(sent.user.password).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/);

    const reported = JSON.parse(output.content[0].text as string);
    expect(reported.organizationId).toBe(42);
    expect(reported.password).toBe(sent.user.password);
  });

  it("never puts the api token in its output", async () => {
    mockApi({
      "/api/roles": () => json(200, ROLES),
      "/api/super-admin/organizations-with-user": () => json(201, { organizationId: 1 }),
    });

    const output = await tool("create_organization_with_admin").handler({
      profile: "acme",
      organizationName: "Acme Corp",
      adminEmail: "admin@acme.com",
      adminFirstName: "Ada",
      adminLastName: "Lovelace",
    });

    expect(output.content[0].text).not.toContain(TOKEN);
  });
});

describe("create_user", () => {
  it("resolves the role by name rather than assuming an id", async () => {
    const calls = mockApi({
      "/api/roles": () => json(200, ROLES),
      "/users": () => json(201, { id: 9, email: "e@acme.com" }),
    });

    await tool("create_user").handler({
      profile: "acme",
      organizationId: 42,
      email: "e@acme.com",
      firstName: "Grace",
      lastName: "Hopper",
      role: "editor",
    });

    expect(payload(calls, 1).roleId).toBe(3);
  });

  it("reports the available roles when the role name is unknown", async () => {
    mockApi({ "/api/roles": () => json(200, ROLES) });

    await expect(
      tool("create_user").handler({
        profile: "acme",
        organizationId: 42,
        email: "e@acme.com",
        firstName: "Grace",
        lastName: "Hopper",
        role: "Owner",
      }),
    ).rejects.toThrow(/Unknown role "Owner".*Admin, Editor/);
  });
});

describe("invite_user", () => {
  it("returns the invitation link when the email could not be sent", async () => {
    mockApi({
      "/api/roles": () => json(200, ROLES),
      "/invite": () =>
        json(206, { error: "smtp refused", link: "https://acme.verifywise.ai/i/abc" }),
    });

    const output = await tool("invite_user").handler({
      profile: "acme",
      organizationId: 42,
      email: "e@acme.com",
      firstName: "Grace",
      role: "Editor",
    });

    const reported = JSON.parse(output.content[0].text as string);
    expect(reported.emailSent).toBe(false);
    expect(reported.invitationLink).toBe("https://acme.verifywise.ai/i/abc");
  });
});

describe("list_users", () => {
  it("lists every user when no organization is given", async () => {
    const calls = mockApi({ "/api/super-admin/users": () => json(200, [{ id: 1 }]) });
    await tool("list_users").handler({ profile: "acme" });
    expect(calls[0].url).toMatch(/\/api\/super-admin\/users$/);
  });

  it("lists one organization's users when it is", async () => {
    const calls = mockApi({ "/organizations/42/users": () => json(200, []) });
    await tool("list_users").handler({ profile: "acme", organizationId: 42 });
    expect(calls[0].url).toMatch(/\/api\/super-admin\/organizations\/42\/users$/);
  });
});

describe("update_user", () => {
  it("refuses a call with nothing to change", async () => {
    await expect(tool("update_user").handler({ profile: "acme", userId: 5 })).rejects.toThrow(
      /at least one of/,
    );
  });
});

describe("delete_organization", () => {
  const organizations = [{ id: 42, name: "Acme Corp" }];

  it("deletes when the confirmation name matches", async () => {
    const calls = mockApi({
      "/api/super-admin/organizations": () => json(200, organizations),
      "/api/super-admin/organizations/42": () => json(200, { deleted: true, usersRemoved: 3 }),
    });

    const output = await tool("delete_organization").handler({
      profile: "acme",
      organizationId: 42,
      confirmOrganizationName: "Acme Corp",
    });

    expect(calls[1].init.method).toBe("DELETE");
    expect(JSON.parse(output.content[0].text as string).usersRemoved).toBe(3);
  });

  it("refuses, without deleting, when the name does not match the id", async () => {
    const calls = mockApi({
      "/api/super-admin/organizations": () => json(200, organizations),
    });

    await expect(
      tool("delete_organization").handler({
        profile: "acme",
        organizationId: 42,
        confirmOrganizationName: "Other Corp",
      }),
    ).rejects.toThrow(/is named "Acme Corp", not "Other Corp"/);

    expect(calls.every((call) => call.init.method !== "DELETE")).toBe(true);
  });

  it("refuses when the organization does not exist", async () => {
    mockApi({ "/api/super-admin/organizations": () => json(200, organizations) });

    await expect(
      tool("delete_organization").handler({
        profile: "acme",
        organizationId: 99,
        confirmOrganizationName: "Acme Corp",
      }),
    ).rejects.toThrow(/No organization with id 99/);
  });
});
