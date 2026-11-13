import { describe, it, expect, beforeEach, afterAll } from "@jest/globals";
import { getPublicBaseUrl, isPublicHostname } from "../publicUrl.utils";

describe("isPublicHostname", () => {
  it.each([
    "localhost",
    "app.localhost",
    "127.0.0.1",
    "127.10.20.30",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.10",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.255",
    "224.0.0.1",
    "[::1]",
    "::1",
    "::",
    "[fc00::1]",
    "[fd12:3456::1]",
    "[fe80::1]",
    "[::ffff:127.0.0.1]",
    "[::ffff:7f00:1]",
    "[::ffff:a00:1]",
    "backend",
    "intranet",
    "host.docker.internal",
    "verifywise.local",
    "router.lan",
    "nas.home.arpa",
    "",
  ])("treats %p as not reachable from the internet", (host) => {
    expect(isPublicHostname(host)).toBe(false);
  });

  it.each([
    "vw.example.com",
    "example.com.",
    "8.8.8.8",
    "172.32.0.1",
    "100.128.0.1",
    "100.63.255.255",
    "[2001:db8::1]",
    "[2606:4700::1111]",
    "[::ffff:808:808]",
  ])("treats %p as public", (host) => {
    expect(isPublicHostname(host)).toBe(true);
  });

  it("agrees with how URL parsing normalises hosts", () => {
    expect(isPublicHostname(new URL("http://[::ffff:10.0.0.1]/").hostname)).toBe(false);
    expect(isPublicHostname(new URL("http://2130706433/").hostname)).toBe(false);
    expect(isPublicHostname(new URL("http://HOST.DOCKER.INTERNAL:3000").hostname)).toBe(false);
  });
});

describe("getPublicBaseUrl", () => {
  const saved = {
    API_PUBLIC_URL: process.env.API_PUBLIC_URL,
    FRONTEND_URL: process.env.FRONTEND_URL,
  };

  beforeEach(() => {
    delete process.env.API_PUBLIC_URL;
    delete process.env.FRONTEND_URL;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("prefers API_PUBLIC_URL and trims trailing slashes", () => {
    process.env.API_PUBLIC_URL = " https://api.example.com/ ";
    process.env.FRONTEND_URL = "https://vw.example.com";
    expect(getPublicBaseUrl({ clientApiBaseUrl: "https://other.example.com" })).toEqual({
      url: "https://api.example.com",
      source: "API_PUBLIC_URL",
    });
  });

  it("uses a public absolute client API address before FRONTEND_URL", () => {
    process.env.FRONTEND_URL = "https://vw.example.com";
    expect(getPublicBaseUrl({ clientApiBaseUrl: "https://api.example.com" })).toEqual({
      url: "https://api.example.com",
      source: "client",
    });
  });

  it("falls back to FRONTEND_URL when the client address is private, relative or invalid", () => {
    process.env.FRONTEND_URL = "https://vw.example.com/";
    for (const clientApiBaseUrl of ["http://localhost:3000", "/api", "", "ftp://example.com"]) {
      expect(getPublicBaseUrl({ clientApiBaseUrl })).toEqual({
        url: "https://vw.example.com",
        source: "FRONTEND_URL",
      });
    }
  });

  it("ignores an API_PUBLIC_URL that is not an http(s) URL", () => {
    process.env.API_PUBLIC_URL = "not a url";
    process.env.FRONTEND_URL = "https://vw.example.com";
    expect(getPublicBaseUrl()?.source).toBe("FRONTEND_URL");
  });

  it("returns a private client address only as a last resort", () => {
    expect(getPublicBaseUrl({ clientApiBaseUrl: "http://localhost:3000" })).toEqual({
      url: "http://localhost:3000",
      source: "client",
    });
  });

  it("returns null when nothing is configured, with no made-up localhost default", () => {
    expect(getPublicBaseUrl()).toBeNull();
  });
});
