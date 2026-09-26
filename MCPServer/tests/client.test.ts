import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "../src/client";
import type { Profile } from "../src/config";

const profile: Profile = { name: "acme", url: "https://acme.verifywise.ai", token: "secret" };

function respond(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request", () => {
  it("sends the profile token as a bearer credential", async () => {
    const fetchMock = mockFetch(respond(200, { message: "OK", data: [] }));
    await request(profile, "GET", "/api/super-admin/organizations");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://acme.verifywise.ai/api/super-admin/organizations");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(init.body).toBeUndefined();
  });

  it("sends a Referer matching the profile's own origin", async () => {
    const fetchMock = mockFetch(respond(200, { message: "OK", data: [] }));
    await request({ name: "local", url: "http://localhost:3000", token: "t" }, "GET", "/api/roles");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Referer).toBe("http://localhost:3000/");
  });

  it("unwraps the { message, data } envelope", async () => {
    mockFetch(respond(201, { message: "Created", data: { organizationId: 7 } }));
    const { data } = await request<{ organizationId: number }>(profile, "POST", "/x", {});
    expect(data).toEqual({ organizationId: 7 });
  });

  it("returns the status so callers can see partial success", async () => {
    mockFetch(respond(206, { message: "Partial Content", data: { error: "smtp down" } }));
    const { status, data } = await request<{ error: string }>(profile, "POST", "/x", {});
    expect(status).toBe(206);
    expect(data.error).toBe("smtp down");
  });

  it("explains an expired or revoked token", async () => {
    mockFetch(respond(401, { message: "Unauthorized", data: { message: "revoked" } }));
    await expect(request(profile, "GET", "/x")).rejects.toThrow(
      /Authentication failed on acme .*invalid, expired, or has been revoked/,
    );
  });

  it("explains a missing super-admin grant", async () => {
    mockFetch(
      respond(403, { message: "Forbidden", data: "Access restricted to super-admin only" }),
    );
    await expect(request(profile, "GET", "/x")).rejects.toThrow(
      /Access restricted to super-admin only.*listed in super_admins/s,
    );
  });

  it("surfaces a duplicate email conflict", async () => {
    mockFetch(respond(409, { message: "Conflict", data: "User with this email already exists" }));
    await expect(request(profile, "POST", "/x", {})).rejects.toThrow(
      /Conflict on acme.*User with this email already exists/,
    );
  });

  it("surfaces the offending field on a validation failure", async () => {
    mockFetch(
      respond(400, {
        message: "Bad Request",
        data: { message: "Invalid password", field: "password" },
      }),
    );
    await expect(request(profile, "POST", "/x", {})).rejects.toThrow(
      /returned 400: Invalid password \(field: password\)/,
    );
  });

  it("names the url it could not reach", async () => {
    mockFetch(new TypeError("fetch failed"));
    await expect(request(profile, "GET", "/api/roles")).rejects.toThrow(
      /Could not reach acme at https:\/\/acme.verifywise.ai\/api\/roles: fetch failed/,
    );
  });

  it("does not choke on a non-JSON error body", async () => {
    mockFetch(new Response("<html>502</html>", { status: 502 }));
    await expect(request(profile, "GET", "/x")).rejects.toThrow(/returned 502/);
  });
});
