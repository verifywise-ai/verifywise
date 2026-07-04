import { describe, it, expect } from "vitest";
import { loadConfig, assertSafeTarget } from "./config";

describe("config", () => {
  it("defaults to localhost:3000", () => {
    const cfg = loadConfig([]);
    expect(cfg.baseUrl).toBe("http://localhost:3000");
  });

  it("assertSafeTarget allows localhost", () => {
    expect(() => assertSafeTarget(loadConfig([]))).not.toThrow();
  });

  it("assertSafeTarget rejects a remote host without the override flag", () => {
    const cfg = loadConfig(["--base-url", "https://app.example.com"]);
    expect(() => assertSafeTarget(cfg)).toThrow(/refusing/i);
  });

  it("allows a remote host with --i-know-what-im-doing", () => {
    const cfg = loadConfig(["--base-url", "https://app.example.com", "--i-know-what-im-doing"]);
    expect(() => assertSafeTarget(cfg)).not.toThrow();
  });

  it("assertSafeTarget rejects a localhost-prefixed subdomain", () => {
    const cfg = loadConfig(["--base-url", "http://localhost.evil.com"]);
    expect(() => assertSafeTarget(cfg)).toThrow(/refusing/i);
  });

  it("assertSafeTarget rejects the userinfo trick (localhost@evil.com)", () => {
    const cfg = loadConfig(["--base-url", "http://localhost@evil.com"]);
    expect(() => assertSafeTarget(cfg)).toThrow(/refusing/i);
  });
});
