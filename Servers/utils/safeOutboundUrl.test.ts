import { describe, it, expect } from "@jest/globals";
import {
  assertSafeOutboundUrl,
  composeSafeOutboundUrl,
  UnsafeOutboundUrlError,
} from "./safeOutboundUrl";

describe("assertSafeOutboundUrl", () => {
  it("accepts a normal https URL and preserves the path", () => {
    expect(assertSafeOutboundUrl("https://mlflow.example.com")).toBe("https://mlflow.example.com");
    expect(assertSafeOutboundUrl("https://mlflow.example.com/api/v1")).toBe(
      "https://mlflow.example.com/api/v1",
    );
  });

  it("accepts http:// too — many internal on-prem deployments use it", () => {
    expect(assertSafeOutboundUrl("http://mlflow.internal:5000")).toBe(
      "http://mlflow.internal:5000",
    );
  });

  it("preserves query strings and fragments verbatim", () => {
    expect(
      assertSafeOutboundUrl("https://api.example.com/deployments?api-version=v1&limit=1"),
    ).toBe("https://api.example.com/deployments?api-version=v1&limit=1");
    expect(assertSafeOutboundUrl("https://api.example.com/x#frag")).toBe(
      "https://api.example.com/x#frag",
    );
  });

  it("trims trailing slashes with a bounded quantifier (ReDoS-safe)", () => {
    expect(assertSafeOutboundUrl("https://mlflow.example.com/")).toBe("https://mlflow.example.com");
    // Even a pathological input finishes quickly and normalizes.
    const bomb = "https://mlflow.example.com" + "/".repeat(1000);
    const start = Date.now();
    const out = assertSafeOutboundUrl(bomb);
    const elapsed = Date.now() - start;
    expect(out.startsWith("https://mlflow.example.com")).toBe(true);
    expect(elapsed).toBeLessThan(200); // orders of magnitude below any polynomial-blowup threshold
  });

  it("rejects non-http(s) protocols", () => {
    for (const bad of [
      "file:///etc/passwd",
      "gopher://x.example.com",
      "ftp://x.example.com",
      "javascript:alert(1)",
      "data:text/plain;base64,SGVsbG8=",
      "jar:http://x.example.com!/foo",
      "dict://x.example.com",
    ]) {
      expect(() => assertSafeOutboundUrl(bad)).toThrow(UnsafeOutboundUrlError);
    }
  });

  it("rejects cloud metadata endpoints", () => {
    // AWS/GCP IMDS
    expect(() => assertSafeOutboundUrl("http://169.254.169.254/latest/meta-data/")).toThrow(
      UnsafeOutboundUrlError,
    );
    // IPv6 metadata (AWS)
    expect(() => assertSafeOutboundUrl("http://[fd00:ec2::254]/latest")).toThrow(
      UnsafeOutboundUrlError,
    );
  });

  it("rejects kernel-wildcard hosts", () => {
    expect(() => assertSafeOutboundUrl("http://0.0.0.0/")).toThrow(UnsafeOutboundUrlError);
    expect(() => assertSafeOutboundUrl("http://[::]/")).toThrow(UnsafeOutboundUrlError);
  });

  it("rejects URLs embedding credentials", () => {
    expect(() => assertSafeOutboundUrl("https://user:pass@x.example.com/")).toThrow(
      UnsafeOutboundUrlError,
    );
    expect(() => assertSafeOutboundUrl("https://user@x.example.com/")).toThrow(
      UnsafeOutboundUrlError,
    );
  });

  it("rejects unparseable / empty input", () => {
    expect(() => assertSafeOutboundUrl("")).toThrow(UnsafeOutboundUrlError);
    expect(() => assertSafeOutboundUrl("not a url")).toThrow(UnsafeOutboundUrlError);
    // @ts-expect-error – validating runtime input
    expect(() => assertSafeOutboundUrl(null)).toThrow(UnsafeOutboundUrlError);
  });

  it("allows private-network IPs — on-prem deployments legitimately need them", () => {
    // These are intentionally NOT blocked because a VerifyWise install
    // often needs to reach an internal MLflow/JIRA server on RFC1918
    // space. If policy changes, this test locks the current stance.
    expect(assertSafeOutboundUrl("http://10.0.0.5:5000")).toBe("http://10.0.0.5:5000");
    expect(assertSafeOutboundUrl("http://192.168.1.10")).toBe("http://192.168.1.10");
    expect(assertSafeOutboundUrl("http://172.16.0.1")).toBe("http://172.16.0.1");
    expect(assertSafeOutboundUrl("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });
});

describe("composeSafeOutboundUrl", () => {
  it("appends a path to a validated base", () => {
    expect(
      composeSafeOutboundUrl("https://mlflow.example.com", "/api/2.0/mlflow/experiments/search"),
    ).toBe("https://mlflow.example.com/api/2.0/mlflow/experiments/search");
  });

  it("prepends a leading slash if the caller omitted it", () => {
    expect(
      composeSafeOutboundUrl("https://mlflow.example.com", "api/2.0/mlflow/experiments/search"),
    ).toBe("https://mlflow.example.com/api/2.0/mlflow/experiments/search");
  });

  it("propagates UnsafeOutboundUrlError from the base check", () => {
    expect(() => composeSafeOutboundUrl("http://169.254.169.254", "/latest/meta-data/")).toThrow(
      UnsafeOutboundUrlError,
    );
  });
});
