import { beforeEach, describe, expect, it, jest } from "@jest/globals";

let mockKeyConfigured = true;
jest.mock("../aiGatewayConfig", () => ({
  isGatewayInternalKeyConfigured: () => mockKeyConfigured,
}));

import {
  gatewayPurgeRefusalFor,
  gatewayPurgeRefusalFromRun,
} from "../aiGatewayRetention.constants";

const gatewayError = (status: number, body: unknown) => ({ status, body });

beforeEach(() => {
  mockKeyConfigured = true;
});

describe("gatewayPurgeRefusalFor", () => {
  it("trusts a 503 only when the gateway says the key is not configured", () => {
    expect(
      gatewayPurgeRefusalFor(
        gatewayError(503, {
          detail: { message: "Internal key not configured", code: "internal_key_not_configured" },
        }),
      ),
    ).toBe("internal_key_not_configured");
    expect(gatewayPurgeRefusalFor(gatewayError(503, { code: "internal_key_not_configured" }))).toBe(
      "internal_key_not_configured",
    );
  });

  it("treats a 503 without the gateway's code (proxy, load balancer) as a normal failure", () => {
    expect(gatewayPurgeRefusalFor(gatewayError(503, "Service Unavailable"))).toBeNull();
    expect(gatewayPurgeRefusalFor(gatewayError(503, { detail: "upstream down" }))).toBeNull();
    expect(gatewayPurgeRefusalFor(gatewayError(503, null))).toBeNull();
  });

  it("classifies a 401 with the gateway's code as a rejected key", () => {
    expect(
      gatewayPurgeRefusalFor(
        gatewayError(401, { detail: { message: "Invalid", code: "internal_key_rejected" } }),
      ),
    ).toBe("internal_key_rejected");
    expect(gatewayPurgeRefusalFor(gatewayError(401, { detail: "Unauthorized" }))).toBeNull();
  });

  it("calls any 401 'not configured' when this backend has no key", () => {
    mockKeyConfigured = false;
    expect(gatewayPurgeRefusalFor(gatewayError(401, "Unauthorized"))).toBe(
      "internal_key_not_configured",
    );
    // A 503 still needs the gateway's code.
    expect(gatewayPurgeRefusalFor(gatewayError(503, "Service Unavailable"))).toBeNull();
  });

  it("recognises an older gateway's exact detail strings (rolling deploy)", () => {
    expect(
      gatewayPurgeRefusalFor(gatewayError(503, { detail: "Internal key not configured" })),
    ).toBe("internal_key_not_configured");
    expect(gatewayPurgeRefusalFor(gatewayError(401, { detail: "Invalid internal key" }))).toBe(
      "internal_key_rejected",
    );
    // Only the matching status and the exact text count.
    expect(
      gatewayPurgeRefusalFor(gatewayError(503, { detail: "Invalid internal key" })),
    ).toBeNull();
    expect(
      gatewayPurgeRefusalFor(gatewayError(503, { detail: "internal key not configured" })),
    ).toBeNull();
  });

  it("ignores other statuses and non-HTTP errors", () => {
    expect(
      gatewayPurgeRefusalFor(gatewayError(500, { code: "internal_key_not_configured" })),
    ).toBeNull();
    expect(gatewayPurgeRefusalFor(new Error("ECONNREFUSED"))).toBeNull();
    expect(gatewayPurgeRefusalFor(null)).toBeNull();
  });
});

describe("gatewayPurgeRefusalFromRun", () => {
  it("reads the stored error_code", () => {
    expect(
      gatewayPurgeRefusalFromRun({ error_code: "internal_key_rejected", error: "anything" }),
    ).toBe("internal_key_rejected");
  });

  it("ignores an unknown error_code and inherited names", () => {
    expect(gatewayPurgeRefusalFromRun({ error_code: "constructor", error: "db down" })).toBeNull();
    expect(gatewayPurgeRefusalFromRun({ error_code: "something_else", error: null })).toBeNull();
  });

  it("falls back to the error text for runs recorded before error_code existed", () => {
    expect(
      gatewayPurgeRefusalFromRun({
        error_code: null,
        error: "Purge refused: internal key not configured",
      }),
    ).toBe("internal_key_not_configured");
    expect(gatewayPurgeRefusalFromRun({ error: "db down" })).toBeNull();
    expect(gatewayPurgeRefusalFromRun({})).toBeNull();
  });
});
